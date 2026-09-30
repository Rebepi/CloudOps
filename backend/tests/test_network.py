from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import models as m
from app.cloud import CloudError, Resource
from app.network import network_attributes, network_cidrs
from app.worker import run_once


def test_network_fields_remain_unknown_when_missing():
    assert network_attributes("vpc", {}) == {"is_default": None, "tenancy": None}
    assert all(value is None for value in network_attributes("subnet", {}).values())
    assert network_cidrs({}) == {}
    assert network_cidrs({"CidrBlock": "10.0.1.42/24", "Ipv6CidrBlockAssociationSet": [
        {"Ipv6CidrBlock": "2001:db8::/64", "Ipv6CidrBlockState": {"State": "associated"}}]}) == {
            "10.0.1.0/24": None, "2001:db8::/64": "associated"}


@pytest.mark.parametrize("payload", [{"CidrBlock": "not-a-network"}, {"MapPublicIpOnLaunch": "false"},
    {"AvailableIpAddressCount": -1}, {"AvailableIpAddressCount": True},
    {"CidrBlock": "2001:db8::/64"}, {"Ipv6CidrBlockAssociationSet": [{"Ipv6CidrBlock": "10.0.0.0/16"}]},
    {"CidrBlockAssociationSet": None}, {"Ipv6CidrBlockAssociationSet": [None]},
    {"CidrBlockAssociationSet": [{"CidrBlock": "10.0.0.0/16", "CidrBlockState": None}]}])
def test_malformed_network_evidence_rejected(payload):
    with pytest.raises(CloudError, match="invalid_network_payload"):
        network_attributes("subnet", payload)
        network_cidrs(payload)


def factory_for(db):
    return async_sessionmaker(bind=db.bind, class_=AsyncSession, expire_on_commit=False,
                             join_transaction_mode="create_savepoint")


class NetworkCloud:
    def __init__(self, region="us-east-1"):
        # Subnet ANTES de VPC: la referencia no debe depender del orden del SDK.
        self.resources = [Resource("vpc", region, "subnet", "subnet-same", "available", payload={
            "VpcId": "vpc-same", "CidrBlock": "10.0.1.0/24", "AvailabilityZone": f"{region}a",
            "AvailableIpAddressCount": 251, "MapPublicIpOnLaunch": False}),
            Resource("vpc", region, "vpc", "vpc-same", "available", tags={"Name": "Observed VPC"},
                     payload={"CidrBlock": "10.0.0.0/16", "IsDefault": False, "InstanceTenancy": "default"})]

    def inventory(self):
        return self.resources


async def queue(api, db, identities, connection_id):
    response = await api.post(f"/api/v1/connections/{connection_id}/sync/inventory", headers=identities["admin"])
    assert response.status_code == 202
    job_id = UUID(response.json()["id"])
    # now() es fijo en la transacción externa de este fixture; simular commits reales separados.
    await db.execute(update(m.SyncRun).where(m.SyncRun.id == job_id).values(created_at=datetime.now(timezone.utc)))
    await db.commit()
    return job_id


@pytest.mark.integration
async def test_network_relations_isolation_pagination_and_stale_snapshots(api, db, identities):
    root = f'/api/v1/projects/{identities["project"]}'
    connections = []
    for region in ("us-east-1", "us-west-2"):
        response = await api.post(f"{root}/connections", headers=identities["admin"],
                                 json={"name": "Network fixture", "region_code": region})
        assert response.status_code == 201
        connections.append(response.json()["id"])
        job = await queue(api, db, identities, connections[-1])
        assert await run_once(factory_for(db), lambda c, s: NetworkCloud(region), target_job_id=job)
    response = await api.get(f"{root}/network/resources", headers=identities["viewer"])
    assert response.status_code == 200, response.text
    items = response.json()
    assert len(items) == 4
    for connection in connections:
        vpc = next(r for r in items if r["connection_id"] == connection and r["resource_type"] == "vpc")
        subnet = next(r for r in items if r["connection_id"] == connection and r["resource_type"] == "subnet")
        assert subnet["vpc_resource_id"] == vpc["id"] and subnet["parent_observed"]
        assert subnet["map_public_ip_on_launch"] is False and subnet["available_ip_address_count"] == 251
        assert vpc["is_default"] is False and vpc["name"] == "Observed VPC"
        assert vpc["cidr_blocks"] == [{"cidr": "10.0.0.0/16", "association_state": None}]
        assert "payload" not in subnet and subnet["mode"] == "floci"
    first = await api.get(f"{root}/network/resources?limit=1&offset=0", headers=identities["viewer"])
    second = await api.get(f"{root}/network/resources?limit=1&offset=1", headers=identities["viewer"])
    assert first.json()[0]["id"] != second.json()[0]["id"]
    for endpoint in ("network/resources", "inventory-status"):
        assert (await api.get(f'/api/v1/projects/{identities["private"]}/{endpoint}',
                              headers=identities["viewer"])).status_code == 404
        assert (await api.get(f"{root}/{endpoint}")).status_code == 401

    cloud = NetworkCloud()
    cloud.resources = cloud.resources[:1]  # Referencia conocida, pero VPC no observada en este nuevo run.
    job = await queue(api, db, identities, connections[0])
    assert await run_once(factory_for(db), lambda c, s: cloud, target_job_id=job)
    items = (await api.get(f"{root}/network/resources", headers=identities["viewer"])).json()
    own = [r for r in items if r["connection_id"] == connections[0]]
    assert len(own) == 1 and not own[0]["parent_observed"] and own[0]["vpc_external_id"] == "vpc-same"
    assert len(list(await db.scalars(select(m.NetworkVpcSnapshot)))) == 2  # Historia retenida.

    cloud.resources = [Resource("vpc", "us-east-1", "subnet", "bad", "available", payload={"CidrBlock": "invalid"})]
    failed_job = await queue(api, db, identities, connections[0])
    assert await run_once(factory_for(db), lambda c, s: cloud, target_job_id=failed_job)
    summary = (await api.get(f"{root}/inventory-status", headers=identities["viewer"])).json()
    status = next(c for c in summary if c["id"] == connections[0])
    assert status["last_attempt"]["status"] == "failed"
    assert status["last_attempt"]["error_code"] == "invalid_network_payload"
    assert status["last_success"]["id"] == str(job)
    assert not list(await db.scalars(select(m.CloudResource).where(m.CloudResource.external_id == "bad")))

    cloud.resources = []
    empty_job = await queue(api, db, identities, connections[0])
    assert await run_once(factory_for(db), lambda c, s: cloud, target_job_id=empty_job)
    items = (await api.get(f"{root}/network/resources", headers=identities["viewer"])).json()
    assert not [r for r in items if r["connection_id"] == connections[0]]
    assert len(list(await db.scalars(select(m.NetworkVpcSnapshot)))) == 2


@pytest.mark.integration
async def test_empty_inventory_status_and_unknown_parent(api, db, identities):
    root = f'/api/v1/projects/{identities["project"]}'
    response = await api.post(f"{root}/connections", headers=identities["admin"], json={"name": "Unknown fixture"})
    connection_id = response.json()["id"]
    summary = (await api.get(f"{root}/inventory-status", headers=identities["viewer"])).json()
    assert summary[0]["last_success"] is None and summary[0]["last_attempt"] is None
    assert (await api.get(f"{root}/network/resources", headers=identities["viewer"])).json() == []
    cloud = NetworkCloud()
    cloud.resources = [Resource("vpc", "us-east-1", "subnet", "subnet-unknown", "available",
                                payload={"VpcId": "vpc-unobserved"})]
    job = await queue(api, db, identities, connection_id)
    assert await run_once(factory_for(db), lambda c, s: cloud, target_job_id=job)
    subnet = (await api.get(f"{root}/network/resources", headers=identities["viewer"])).json()[0]
    assert subnet["vpc_resource_id"] is not None and subnet["availability_zone"] is None
    assert subnet["vpc_external_id"] == "vpc-unobserved"
    assert subnet["cidr_blocks"] == [] and not subnet["parent_observed"]
    assert subnet["map_public_ip_on_launch"] is None
    assert str(job) == subnet["sync_run_id"] and UUID(subnet["correlation_id"])
    # La identidad referenciada no entra en el inventario ni cuenta como observación.
    inventory = (await api.get(f"{root}/resources", headers=identities["viewer"])).json()
    assert len(inventory) == 1 and inventory[0]["resource_type"] == "subnet"
    assert (await api.get(f'/api/v1/projects/{uuid4()}/inventory-status', headers=identities["admin"])).status_code == 404
