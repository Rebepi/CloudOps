"""Proyección relacional de evidencia AWS. Sin valores por defecto inventados."""
from ipaddress import ip_network

from sqlalchemy import select

from app import models as m
from app.cloud import CloudError


def network_attributes(kind: str, payload: dict):
    if not isinstance(payload, dict):
        raise CloudError("invalid_network_payload")
    def value(key, expected, limit=None):
        result = payload.get(key)
        if result is not None and (type(result) is not expected or
                (isinstance(result, str) and len(result) > limit) or
                (expected is int and result < 0)):
            raise CloudError("invalid_network_payload")
        return result

    if kind == "vpc":
        return {"is_default": value("IsDefault", bool), "tenancy": value("InstanceTenancy", str, 20)}
    return {"availability_zone": value("AvailabilityZone", str, 128),
            "available_ip_address_count": value("AvailableIpAddressCount", int),
            "map_public_ip_on_launch": value("MapPublicIpOnLaunch", bool)}


def network_cidrs(payload: dict) -> dict[str, str | None]:
    if not isinstance(payload, dict):
        raise CloudError("invalid_network_payload")
    blocks = {}

    def add(raw, family, state=None):
        if state is not None and (not isinstance(state, str) or len(state) > 30):
            raise CloudError("invalid_network_payload")
        if raw is not None:
            try:
                if not isinstance(raw, str):
                    raise ValueError
                network = ip_network(raw, strict=False)
                if network.version != family:
                    raise ValueError
                blocks[str(network)] = state
            except ValueError as exc:
                raise CloudError("invalid_network_payload") from exc

    add(payload.get("CidrBlock"), 4)
    for prefix, family in (("", 4), ("Ipv6", 6)):
        associations = payload.get(f"{prefix}CidrBlockAssociationSet", [])
        if not isinstance(associations, list):
            raise CloudError("invalid_network_payload")
        for block in associations:
            if not isinstance(block, dict):
                raise CloudError("invalid_network_payload")
            state = block.get(f"{prefix}CidrBlockState", {})
            if not isinstance(state, dict):
                raise CloudError("invalid_network_payload")
            add(block.get(f"{prefix}CidrBlock"), family, state.get("State"))
    return blocks


async def persist_network_snapshot(db, resource, snapshot, payload):
    if resource.service_code != "vpc" or resource.resource_type not in {"vpc", "subnet"}:
        return
    fields = network_attributes(resource.resource_type, payload)
    if resource.resource_type == "vpc":
        db.add(m.NetworkVpcSnapshot(snapshot_id=snapshot.id, **fields))
    else:
        parent = None
        external_id = payload.get("VpcId")
        if external_id is not None:
            if not isinstance(external_id, str) or not external_id.strip() or len(external_id) > 512:
                raise CloudError("invalid_network_payload")
            identity = await db.scalar(select(m.CloudResource).where(
                m.CloudResource.connection_id == resource.connection_id,
                m.CloudResource.region_code == resource.region_code, m.CloudResource.service_code == "vpc",
                m.CloudResource.resource_type == "vpc", m.CloudResource.external_id == external_id))
            if identity is None:
                # Identidad referenciada, NO recurso observado: no crear snapshot ni estado.
                identity = m.CloudResource(connection_id=resource.connection_id, service_code="vpc",
                    region_code=resource.region_code, resource_type="vpc", external_id=external_id)
                db.add(identity)
                await db.flush()
            parent = identity.id
        db.add(m.NetworkSubnetSnapshot(snapshot_id=snapshot.id, vpc_resource_id=parent, **fields))
    db.add_all([m.NetworkCidrBlock(snapshot_id=snapshot.id, cidr=cidr, association_state=state)
                for cidr, state in network_cidrs(payload).items()])
