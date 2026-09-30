"""Único módulo que conoce boto3. Sin operaciones de escritura ni acceso a sockets desde el navegador."""
import json
import time
from dataclasses import dataclass, field
from typing import Protocol

import boto3
from botocore.config import Config

from app.config import Settings


class CloudError(Exception):
    """Código seguro, sin mensajes externos que puedan contener secretos."""


@dataclass
class Resource:
    service: str
    region: str
    resource_type: str
    external_id: str
    status: str
    arn: str | None = None
    tags: dict[str, str] = field(default_factory=dict)
    payload: dict = field(default_factory=dict)


class CloudProvider(Protocol):
    def identity(self) -> dict: ...
    def inventory(self) -> list[Resource]: ...


class BotoCloudProvider:
    def __init__(self, settings: Settings, mode: str, account: str, region: str,
                 *, allow_root_local_smoke: bool = False):
        self.settings, self.mode, self.account, self.region = settings, mode, account, region
        self.allow_root_local_smoke = allow_root_local_smoke
        if allow_root_local_smoke and (settings.app_env != "local" or mode != "aws"):
            raise CloudError("root_exception_not_allowed")
        if mode not in {"floci", "aws"}:
            raise CloudError("invalid_provider")
        if mode == "aws" and (not settings.allow_aws or account not in settings.aws_account_allowlist
                              or region not in settings.aws_region_allowlist):
            raise CloudError("aws_not_allowed")
        if mode == "floci" and account != settings.floci_account_id:
            raise CloudError("floci_account_mismatch")
        self.session = (boto3.Session(aws_access_key_id=account, aws_secret_access_key="test",
                                     region_name=region) if mode == "floci"
                        else boto3.Session(region_name=region))

    def client(self, service: str):
        # Ignora AWS_ENDPOINT_URL y perfiles con overrides en AWS real.
        options = {"config": Config(connect_timeout=3, read_timeout=10,
                   retries={"total_max_attempts": 2, "mode": "standard"},
                   ignore_configured_endpoint_urls=True, s3={"addressing_style": "path"})}
        if self.mode == "floci":
            options["endpoint_url"] = self.settings.floci_endpoint_url
        client = self.session.client(service, **options)
        if self.mode == "aws":
            allowed = {"sts": {"GetCallerIdentity"},
                       "ec2": {"DescribeInstances", "DescribeVpcs", "DescribeSubnets"},
                       "rds": {"DescribeDBInstances"},
                       "s3": {"ListBuckets", "GetBucketLocation"}}

            def readonly_operation(model, **kwargs):
                if model.name not in allowed.get(service, set()):
                    raise CloudError("aws_operation_not_allowed")

            # Defensa de aplicación, NO una reducción de privilegios IAM de la clave.
            client.meta.events.register("before-parameter-build.*.*", readonly_operation)
        return client

    def identity(self) -> dict:
        result = self.client("sts").get_caller_identity()
        if result["Account"] != self.account:
            raise CloudError("account_mismatch")
        # La excepción sólo la pasa el CLI local de una ejecución; nunca provider_for/API.
        if (self.mode == "aws" and result["Arn"].rsplit(":", 1)[-1] == "root"
                and not self.allow_root_local_smoke):
            raise CloudError("aws_root_credentials_forbidden")
        return {key: result[key] for key in ("Account", "Arn", "UserId")}

    def inventory(self) -> list[Resource]:
        self.identity()  # Validar ANTES de leer cualquier servicio de la cuenta.
        records: list[Resource] = []
        started = time.monotonic()

        def pages(service, operation, key):
            client = self.client(service)
            paginator = client.get_paginator(operation)
            for index, page in enumerate(paginator.paginate()):
                if index >= 100 or time.monotonic() - started > 300:
                    raise CloudError("inventory_limit_exceeded")
                yield from page.get(key, [])

        def add(service, resource_type, external_id, status, raw, arn=None, region=None):
            if len(records) >= 2000 or time.monotonic() - started > 300:
                raise CloudError("inventory_limit_exceeded")
            tags = {t["Key"]: t.get("Value", "") for t in raw.get("Tags", []) if "Key" in t}
            records.append(Resource(service, region or self.region, resource_type, external_id,
                                    status, arn, tags, json.loads(json.dumps(raw, default=str))))

        for reservation in pages("ec2", "describe_instances", "Reservations"):
            for instance in reservation.get("Instances", []):
                add("ec2", "instance", instance["InstanceId"], instance["State"]["Name"], instance)
        for vpc in pages("ec2", "describe_vpcs", "Vpcs"):
            add("vpc", "vpc", vpc["VpcId"], vpc.get("State", "unknown"), vpc)
        for subnet in pages("ec2", "describe_subnets", "Subnets"):
            add("vpc", "subnet", subnet["SubnetId"], subnet.get("State", "unknown"), subnet)
        for instance in pages("rds", "describe_db_instances", "DBInstances"):
            add("rds", "db-instance", instance["DBInstanceIdentifier"],
                instance.get("DBInstanceStatus", "unknown"), instance, instance.get("DBInstanceArn"))
        s3 = self.client("s3")
        for bucket in pages("s3", "list_buckets", "Buckets"):
            if time.monotonic() - started > 300:
                raise CloudError("inventory_limit_exceeded")
            location = s3.get_bucket_location(Bucket=bucket["Name"]).get("LocationConstraint")
            location = {None: "us-east-1", "EU": "eu-west-1"}.get(location, location)
            if location == self.region:
                add("s3", "bucket", bucket["Name"], "available", bucket,
                    arn=f"arn:aws:s3:::{bucket['Name']}", region=location)
        return records


def provider_for(connection, settings: Settings) -> CloudProvider:
    return BotoCloudProvider(settings, connection.mode, connection.account_id, connection.region_code)
