from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import models as m
from app.cloud import Resource
from app.worker import claim_job, expire_abandoned, run_once

pytestmark = pytest.mark.integration


def body():
    return {"name": "Plan de prueba", "application_type": "Web", "description": "Arquitectura",
            "region_code": "us-east-1", "estimated_users": 100, "availability": "alta",
            "migration_goal": "Migrar", "budget_limit": 150, "services": ["ec2", "s3"],
            "frameworks": ["GDPR"]}


async def test_proposals_permissions_persistence_and_audit(api, db, identities):
    project = identities["project"]
    path = f"/api/v1/projects/{project}/proposals"
    assert (await api.post(path, json=body(), headers=identities["viewer"])).status_code == 403
    created = await api.post(path, json=body(), headers=identities["admin"])
    assert created.status_code == 201, created.text
    proposal = created.json()
    assert (await api.delete(f'/api/v1/proposals/{proposal["id"]}', headers=identities["viewer"])).status_code == 403
    assert (await api.put(f'/api/v1/proposals/{proposal["id"]}', json=body(), headers=identities["viewer"])).status_code == 403
    assert sorted(proposal["services"]) == ["ec2", "s3"]
    assert len(list(await db.scalars(select(m.ProposalService)))) == 2
    assert len(list(await db.scalars(select(m.ProposalFramework)))) == 1
    listed = await api.get(path, headers=identities["viewer"])
    assert listed.json()[0]["id"] == proposal["id"]
    private = f'/api/v1/projects/{identities["private"]}/proposals'
    assert (await api.get(private, headers=identities["viewer"])).status_code == 404
    changed = {**body(), "services": ["rds"], "frameworks": []}
    response = await api.put(f'/api/v1/proposals/{proposal["id"]}', headers=identities["admin"], json=changed)
    assert response.status_code == 200, response.text
    assert response.json()["services"] == ["rds"]
    assert (await api.delete(f'/api/v1/proposals/{proposal["id"]}', headers=identities["admin"])).status_code == 204
    assert not list(await db.scalars(select(m.ProposalService)))
    assert {"proposal.create", "proposal.update", "proposal.delete"} <= set(await db.scalars(select(m.AuditEvent.action)))


async def test_me_scopes_permissions_to_current_project(api, db, identities):
    viewer = (await api.get('/api/v1/auth/me', headers=identities['viewer'])).json()
    assert viewer['project_roles'][identities['project']] == 'viewer'
    assert 'proposal:write' not in viewer['project_permissions'][identities['project']]
    assert identities['private'] not in viewer['project_permissions']
    admin = (await api.get('/api/v1/auth/me', headers=identities['admin'])).json()
    assert 'proposal:write' in admin['project_permissions'][identities['project']]
    await db.execute(update(m.ProjectMember).where(m.ProjectMember.project_id == identities['private'],
        m.ProjectMember.user_id == identities['admin_id']).values(role_code='viewer'))
    await db.commit()
    mixed = (await api.get('/api/v1/auth/me', headers=identities['admin'])).json()
    assert 'proposal:write' in mixed['permissions']  # Unión informativa, no permiso universal.
    assert 'proposal:write' not in mixed['project_permissions'][identities['private']]


async def test_catalog_validation_and_duplicates(api, identities):
    path = f'/api/v1/projects/{identities["project"]}/proposals'
    assert (await api.post(path, json={**body(), "services": ["unknown"]}, headers=identities["admin"])).status_code == 422
    connection_path = f'/api/v1/projects/{identities["project"]}/connections'
    values = {"name": "FLOCI test"}
    assert (await api.post(connection_path, json=values, headers=identities["admin"])).status_code == 201
    assert (await api.post(connection_path, json=values, headers=identities["admin"])).status_code == 409


async def test_aws_blocked_and_logout_revokes_session(api, identities):
    path = f'/api/v1/projects/{identities["project"]}/connections'
    response = await api.post(path, headers=identities["admin"],
                             json={"name": "AWS test", "mode": "aws", "account_id": "123456789012"})
    assert response.status_code == 403
    assert (await api.post("/api/v1/auth/logout", headers=identities["viewer"])).status_code == 204
    assert (await api.get("/api/v1/auth/me", headers=identities["viewer"])).status_code == 401


async def test_constraints_and_append_only_audit(db, identities):
    # FK y auditoría deben ser impuestas por PostgreSQL, no sólo por Pydantic.
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(m.ProjectMember(project_id=uuid4(), user_id=identities["admin_id"], role_code="admin"))
            await db.flush()
    event = m.AuditEvent(actor_user_id=identities["admin_id"], project_id=identities["project"],
                        action="test", correlation_id=str(uuid4()))
    db.add(event)
    await db.flush()
    with pytest.raises(DBAPIError, match="append-only"):
        async with db.begin_nested():
            await db.execute(update(m.AuditEvent).where(m.AuditEvent.id == event.id).values(action="altered"))
    with pytest.raises(DBAPIError, match="append-only"):
        async with db.begin_nested():
            await db.execute(delete(m.AuditEvent).where(m.AuditEvent.id == event.id))


async def test_worker_sync_empty_inventory_and_history(api, db, identities):
    result = await api.post(f'/api/v1/projects/{identities["project"]}/connections',
                           headers=identities["admin"], json={"name": "FLOCI test"})
    assert result.status_code == 201, result.text
    connection = result.json()["id"]
    path = f"/api/v1/connections/{connection}/sync/inventory"
    first = await api.post(path, headers=identities["admin"])
    duplicate = await api.post(path, headers=identities["admin"])
    assert first.status_code == 202 and first.json()["id"] == duplicate.json()["id"]
    factory = async_sessionmaker(bind=db.bind, class_=AsyncSession, expire_on_commit=False,
                                 join_transaction_mode="create_savepoint")
    class FakeCloud:
        resources = [Resource("s3", "us-east-1", "bucket", "test-bucket", "available",
                              payload={"Name": "test-bucket"}, tags={"app": "test"})]
        def inventory(self):
            return self.resources
    fake = FakeCloud()
    assert await run_once(factory, lambda c, s: fake)
    resources = await api.get(f'/api/v1/projects/{identities["project"]}/resources', headers=identities["admin"])
    assert len(resources.json()) == 1, resources.text
    assert len(list(await db.scalars(select(m.ResourcePayload)))) == 1
    fake.resources = []
    second = await api.post(path, headers=identities["admin"])
    assert second.status_code == 202
    assert await run_once(factory, lambda c, s: fake)
    resources = await api.get(f'/api/v1/projects/{identities["project"]}/resources', headers=identities["admin"])
    assert resources.json() == []
    assert len(list(await db.scalars(select(m.ResourceSnapshot)))) == 1  # Historia conservada.


async def test_worker_failure_is_audited_without_secrets(api, db, identities):
    response = await api.post(f'/api/v1/projects/{identities["project"]}/connections',
                             headers=identities["admin"], json={"name": "Failing FLOCI"})
    connection = response.json()["id"]
    queued = await api.post(f"/api/v1/connections/{connection}/sync/inventory", headers=identities["admin"])
    factory = async_sessionmaker(bind=db.bind, class_=AsyncSession, expire_on_commit=False,
                                 join_transaction_mode="create_savepoint")

    class UnavailableCloud:
        def inventory(self):
            raise RuntimeError("external message containing sensitive information")

    assert await run_once(factory, lambda c, s: UnavailableCloud())
    job = await db.scalar(select(m.SyncRun).where(m.SyncRun.id == queued.json()["id"])
                          .execution_options(populate_existing=True))
    assert job.status == "failed" and job.error_code == "cloud_unavailable"
    assert not list(await db.scalars(select(m.ResourceSnapshot)))
    actions = list(await db.scalars(select(m.AuditEvent.action)))
    assert "sync.inventory.failed" in actions
    another = await api.post(f"/api/v1/connections/{connection}/sync/inventory", headers=identities["admin"])
    assert another.status_code == 202 and another.json()["id"] != queued.json()["id"]


async def test_worker_recovers_abandoned_job(api, db, identities):
    response = await api.post(f'/api/v1/projects/{identities["project"]}/connections',
                             headers=identities["admin"], json={"name": "Abandoned FLOCI"})
    connection = response.json()["id"]
    queued = await api.post(f"/api/v1/connections/{connection}/sync/inventory", headers=identities["admin"])
    await db.execute(update(m.SyncRun).where(m.SyncRun.id == queued.json()["id"]).values(
        status="running", started_at=datetime.now(timezone.utc) - timedelta(minutes=20)))
    await db.commit()
    factory = async_sessionmaker(bind=db.bind, class_=AsyncSession, expire_on_commit=False,
                                 join_transaction_mode="create_savepoint")
    await expire_abandoned(factory)
    job = await db.scalar(select(m.SyncRun).where(m.SyncRun.id == queued.json()["id"])
                          .execution_options(populate_existing=True))
    assert job.status == "failed" and job.error_code == "worker_interrupted"


async def test_worker_can_claim_only_target_job(db, identities):
    connections = [m.CloudConnection(project_id=identities["project"], name="Target test", mode="floci",
        account_id="000000000000", region_code=region) for region in ("us-east-1", "us-west-2")]
    db.add_all(connections)
    await db.flush()
    jobs = [m.SyncRun(connection_id=connection.id, requested_by=identities["admin_id"],
                     correlation_id=str(uuid4())) for connection in connections]
    db.add_all(jobs)
    await db.commit()
    factory = async_sessionmaker(bind=db.bind, class_=AsyncSession, expire_on_commit=False,
                                 join_transaction_mode="create_savepoint")
    assert await claim_job(factory, jobs[1].id) == jobs[1].id
    await db.refresh(jobs[0])
    await db.refresh(jobs[1])
    assert jobs[0].status == "queued" and jobs[1].status == "running"
    assert await claim_job(factory, uuid4()) is None


async def test_local_smoke_persists_inventory_and_root_authorization(api, db, identities, monkeypatch):
    from app.aws_readonly_smoke import run_smoke
    from app.config import Settings

    monkeypatch.setenv("RUN_AWS_SMOKE_TESTS", "true")
    monkeypatch.setattr("app.aws_readonly_smoke.get_settings", lambda: Settings(_env_file=None, app_env="local"))
    await db.execute(update(m.User).where(m.User.id == identities["admin_id"]).values(external_subject="mock:admin"))
    await db.commit()
    factory = async_sessionmaker(bind=db.bind, class_=AsyncSession, expire_on_commit=False,
                                 join_transaction_mode="create_savepoint")

    class FakeCloud:
        def __init__(self, settings, mode, account, region, *, allow_root_local_smoke):
            assert allow_root_local_smoke and mode == "aws"
            assert settings.aws_account_allowlist == [account]
            assert settings.aws_region_allowlist == [region]

        def inventory(self):
            return [Resource("vpc", "us-east-1", "vpc", "vpc-test", "available")]

    result = await run_smoke(identities["project"], "123456789012", "us-east-1", allow_root=True,
                             factory=factory, provider_type=FakeCloud)
    assert result["status"] == "succeeded" and result["services"] == {"vpc": 1}
    events = (await db.scalars(select(m.AuditEvent).where(m.AuditEvent.correlation_id == result["correlation_id"]))).all()
    assert {"aws.smoke.root_exception.authorized", "sync.inventory.queued", "sync.inventory.started",
            "sync.inventory.succeeded"} <= {event.action for event in events}
    resources = await api.get(f'/api/v1/projects/{identities["project"]}/resources', headers=identities["viewer"])
    assert resources.status_code == 200 and resources.json()[0]["external_id"] == "vpc-test"
