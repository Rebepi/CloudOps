import json
from uuid import uuid4

import pytest
from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.prepare_tests import ensure_database, migrate


@pytest.mark.integration
async def test_fresh_upgrade_downgrade_and_no_model_drift(db_url):
    # Base independiente, creada por esta prueba; nunca hacer downgrade de la base de negocio.
    scratch = make_url(db_url).set(database=f"cloudops_{uuid4().hex[:12]}_test").render_as_string(hide_password=False)
    await ensure_database(scratch)
    engine = create_async_engine(scratch)
    try:
        migrate(scratch, "upgrade", "head")
        migrate(scratch, "check")
        migrate(scratch, "downgrade", "base")
        migrate(scratch, "upgrade", "0001_core")
        async with engine.begin() as connection:
            await seed_legacy_network(connection)
        migrate(scratch, "upgrade", "head")
        migrate(scratch, "check")
        async with engine.connect() as connection:
            assert await connection.scalar(text("SELECT version_num FROM alembic_version")) == "0002_network"
            assert await connection.scalar(text("SELECT count(*) FROM network_vpc_snapshots")) == 1
            assert await connection.scalar(text("SELECT count(*) FROM network_subnet_snapshots")) == 2
            assert await connection.scalar(text("SELECT count(*) FROM network_cidr_blocks")) == 3
            assert await connection.scalar(text("""SELECT count(*) FROM network_subnet_snapshots n
                JOIN cloud_resources r ON r.id=n.vpc_resource_id WHERE r.external_id='vpc-legacy'""")) == 1
            assert await connection.scalar(text("""SELECT count(*) FROM network_subnet_snapshots n
                JOIN cloud_resources r ON r.id=n.vpc_resource_id WHERE r.external_id='vpc-reference-only'""")) == 1
            assert await connection.scalar(text("""SELECT count(*) FROM resource_snapshots s
                JOIN cloud_resources r ON r.id=s.resource_id WHERE r.external_id='vpc-reference-only'""")) == 0
            assert await connection.scalar(text("SELECT count(*) FROM resource_payloads")) == 3
        migrate(scratch, "downgrade", "0001_core")
        async with engine.connect() as connection:
            assert await connection.scalar(text("SELECT count(*) FROM resource_payloads")) == 3
        migrate(scratch, "upgrade", "head")
    finally:
        await engine.dispose()
        # Únicamente la base aleatoria recién creada por esta prueba.
        name = make_url(scratch).database
        admin = create_async_engine(make_url(db_url).set(database="postgres"), isolation_level="AUTOCOMMIT")
        try:
            async with admin.connect() as connection:
                await connection.execute(text(f'DROP DATABASE "{name}"'))
        finally:
            await admin.dispose()


async def seed_legacy_network(connection):
    user, workspace, project, cloud, job = [uuid4() for _ in range(5)]
    await connection.execute(text("INSERT INTO users(id,external_subject,email,display_name) VALUES(:id,'legacy','legacy@test.local','Legacy')"), {"id": user})
    await connection.execute(text("INSERT INTO workspaces(id,name,slug) VALUES(:id,'Legacy','legacy')"), {"id": workspace})
    await connection.execute(text("""INSERT INTO projects(id,workspace_id,created_by,name,slug,description)
        VALUES(:id,:workspace,:user,'Legacy','legacy','')"""), {"id": project, "workspace": workspace, "user": user})
    await connection.execute(text("""INSERT INTO cloud_connections(id,project_id,name,mode,account_id,region_code)
        VALUES(:id,:project,'Legacy','floci','000000000000','us-east-1')"""), {"id": cloud, "project": project})
    await connection.execute(text("""INSERT INTO sync_runs(id,connection_id,requested_by,sync_type,status,correlation_id,records_processed,finished_at)
        VALUES(:id,:cloud,:user,'inventory','succeeded',:correlation,3,now())"""),
        {"id": job, "cloud": cloud, "user": user, "correlation": str(uuid4())})
    for kind, external, payload in [
        ("vpc", "vpc-legacy", {"IsDefault": False, "CidrBlock": "10.0.0.0/16", "Ipv6CidrBlockAssociationSet": [
            {"Ipv6CidrBlock": "2001:db8::/64", "Ipv6CidrBlockState": {"State": "associated"}}]}),
        ("subnet", "subnet-legacy", {"VpcId": "vpc-legacy", "CidrBlock": "10.0.1.0/24", "MapPublicIpOnLaunch": False}),
        ("subnet", "subnet-reference-only", {"VpcId": "vpc-reference-only"})]:
        resource, snapshot = uuid4(), uuid4()
        await connection.execute(text("""INSERT INTO cloud_resources(id,connection_id,service_code,region_code,resource_type,external_id)
            VALUES(:id,:cloud,'vpc','us-east-1',:kind,:external)"""),
            {"id": resource, "cloud": cloud, "kind": kind, "external": external})
        await connection.execute(text("INSERT INTO resource_snapshots(id,resource_id,sync_run_id,status) VALUES(:id,:resource,:job,'available')"),
                                 {"id": snapshot, "resource": resource, "job": job})
        await connection.execute(text("INSERT INTO resource_payloads(snapshot_id,payload) VALUES(:id,CAST(:payload AS jsonb))"),
                                 {"id": snapshot, "payload": json.dumps(payload)})
