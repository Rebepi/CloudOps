"""Detalles y relaciones de red normalizados; backfill de evidencia existente.

Esta migración es autocontenida: nunca importa modelos/helper de runtime.
"""
from ipaddress import ip_network
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import CIDR

revision = "0002_network"
down_revision = "0001_core"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("network_vpc_snapshots",
        sa.Column("snapshot_id", sa.Uuid(), sa.ForeignKey("resource_snapshots.id"), primary_key=True),
        sa.Column("is_default", sa.Boolean()), sa.Column("tenancy", sa.String(20)))
    op.create_table("network_subnet_snapshots",
        sa.Column("snapshot_id", sa.Uuid(), sa.ForeignKey("resource_snapshots.id"), primary_key=True),
        sa.Column("vpc_resource_id", sa.Uuid(), sa.ForeignKey("cloud_resources.id")),
        sa.Column("availability_zone", sa.String(128)), sa.Column("available_ip_address_count", sa.Integer()),
        sa.Column("map_public_ip_on_launch", sa.Boolean()),
        sa.CheckConstraint("available_ip_address_count IS NULL OR available_ip_address_count >= 0",
                           name="ck_subnet_available_ips"))
    op.create_index("ix_network_subnet_snapshots_vpc_resource_id", "network_subnet_snapshots", ["vpc_resource_id"])
    op.create_table("network_cidr_blocks",
        sa.Column("snapshot_id", sa.Uuid(), sa.ForeignKey("resource_snapshots.id"), primary_key=True),
        sa.Column("cidr", CIDR(), primary_key=True), sa.Column("association_state", sa.String(30)))
    backfill()


def backfill():
    bind = op.get_bind()
    vpcs = sa.table("network_vpc_snapshots", sa.column("snapshot_id", sa.Uuid()),
                    sa.column("is_default", sa.Boolean()), sa.column("tenancy", sa.String(20)))
    subnets = sa.table("network_subnet_snapshots", sa.column("snapshot_id", sa.Uuid()),
        sa.column("vpc_resource_id", sa.Uuid()), sa.column("availability_zone", sa.String(128)),
        sa.column("available_ip_address_count", sa.Integer()), sa.column("map_public_ip_on_launch", sa.Boolean()))
    cidrs = sa.table("network_cidr_blocks", sa.column("snapshot_id", sa.Uuid()),
                     sa.column("cidr", CIDR()), sa.column("association_state", sa.String(30)))
    rows = bind.execute(sa.text("""SELECT s.id AS snapshot_id, r.resource_type, p.payload,
        r.connection_id, r.region_code,
        parent.id AS parent_id FROM resource_snapshots s
        JOIN cloud_resources r ON r.id=s.resource_id JOIN resource_payloads p ON p.snapshot_id=s.id
        LEFT JOIN cloud_resources parent ON parent.connection_id=r.connection_id
            AND parent.region_code=r.region_code AND parent.service_code='vpc'
            AND parent.resource_type='vpc' AND parent.external_id=p.payload->>'VpcId'
        WHERE r.service_code='vpc' AND r.resource_type IN ('vpc','subnet')""")).mappings()
    for row in rows:
        payload, snapshot = row["payload"], row["snapshot_id"]
        fields = attributes(row["resource_type"], payload)
        if row["resource_type"] == "vpc":
            bind.execute(vpcs.insert().values(snapshot_id=snapshot, **fields))
        else:
            parent = row["parent_id"]
            external = payload.get("VpcId")
            if external is not None:
                if not isinstance(external, str) or not external.strip() or len(external) > 512:
                    raise ValueError("invalid_network_payload")
                if parent is None:
                    params = {"connection": row["connection_id"], "region": row["region_code"], "external": external}
                    parent = bind.execute(sa.text("""SELECT id FROM cloud_resources WHERE connection_id=:connection
                        AND region_code=:region AND service_code='vpc' AND resource_type='vpc' AND external_id=:external"""), params).scalar()
                    if parent is None:
                        parent = uuid4()
                        bind.execute(sa.text("""INSERT INTO cloud_resources(id,connection_id,region_code,service_code,resource_type,external_id)
                            VALUES(:id,:connection,:region,'vpc','vpc',:external)"""), {**params, "id": parent})
            bind.execute(subnets.insert().values(snapshot_id=snapshot, vpc_resource_id=parent, **fields))
        for cidr, state in cidr_blocks(payload).items():
            bind.execute(cidrs.insert().values(snapshot_id=snapshot, cidr=cidr, association_state=state))


def attributes(kind, payload):
    if not isinstance(payload, dict):
        raise ValueError("invalid_network_payload")

    def value(key, expected, limit=None):
        result = payload.get(key)
        if result is not None and (type(result) is not expected or
                (isinstance(result, str) and len(result) > limit) or (expected is int and result < 0)):
            raise ValueError("invalid_network_payload")
        return result

    if kind == "vpc":
        return {"is_default": value("IsDefault", bool), "tenancy": value("InstanceTenancy", str, 20)}
    return {"availability_zone": value("AvailabilityZone", str, 128),
            "available_ip_address_count": value("AvailableIpAddressCount", int),
            "map_public_ip_on_launch": value("MapPublicIpOnLaunch", bool)}


def cidr_blocks(payload):
    if not isinstance(payload, dict):
        raise ValueError("invalid_network_payload")
    blocks = {}

    def add(raw, family, state=None):
        if state is not None and (not isinstance(state, str) or len(state) > 30):
            raise ValueError("invalid_network_payload")
        if raw is not None:
            try:
                if not isinstance(raw, str):
                    raise ValueError
                network = ip_network(raw, strict=False)
                if network.version != family:
                    raise ValueError
                blocks[str(network)] = state
            except ValueError as exc:
                raise ValueError("invalid_network_payload") from exc

    add(payload.get("CidrBlock"), 4)
    for prefix, family in (("", 4), ("Ipv6", 6)):
        associations = payload.get(f"{prefix}CidrBlockAssociationSet", [])
        if not isinstance(associations, list):
            raise ValueError("invalid_network_payload")
        for block in associations:
            if not isinstance(block, dict):
                raise ValueError("invalid_network_payload")
            state = block.get(f"{prefix}CidrBlockState", {})
            if not isinstance(state, dict):
                raise ValueError("invalid_network_payload")
            add(block.get(f"{prefix}CidrBlock"), family, state.get("State"))
    return blocks


def downgrade():
    op.drop_table("network_cidr_blocks")
    op.drop_table("network_subnet_snapshots")
    op.drop_table("network_vpc_snapshots")
