import asyncio
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from botocore.exceptions import ClientError
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from app import models as m
from app.audit import record
from app.cloud import CloudError, provider_for
from app.config import get_settings
from app.db import SessionFactory, engine
from app.network import persist_network_snapshot


async def claim_job(factory=SessionFactory, target_job_id=None):
    async with factory.begin() as db:
        query = select(m.SyncRun).where(m.SyncRun.status == "queued")
        if target_job_id is not None:
            query = query.where(m.SyncRun.id == target_job_id)
        job = await db.scalar(query.order_by(m.SyncRun.created_at, m.SyncRun.id)
                              .with_for_update(skip_locked=True).limit(1))
        if job is None:
            return None
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        connection = await db.get(m.CloudConnection, job.connection_id)
        record(db, job.requested_by, "sync.inventory.started", job.correlation_id,
               connection.project_id, job.id)
        return job.id


async def run_once(factory=SessionFactory, provider_factory=provider_for, *, target_job_id=None):
    job_id = await claim_job(factory, target_job_id)
    if job_id is None:
        return False
    try:
        async with factory() as db:
            job = await db.get(m.SyncRun, job_id)
            connection = await db.get(m.CloudConnection, job.connection_id)
            cloud = provider_factory(connection, get_settings())
            resources = await run_in_threadpool(cloud.inventory)
        async with factory.begin() as db:
            job = await db.scalar(select(m.SyncRun).where(m.SyncRun.id == job_id).with_for_update())
            if job.status != "running":
                return True
            observed = []
            # Resolver identidades antes de enlazar subnets, independientemente del orden AWS.
            for data in resources:
                resource = await db.scalar(select(m.CloudResource).where(
                    m.CloudResource.connection_id == job.connection_id,
                    m.CloudResource.service_code == data.service,
                    m.CloudResource.region_code == data.region,
                    m.CloudResource.resource_type == data.resource_type,
                    m.CloudResource.external_id == data.external_id))
                if resource is None:
                    resource = m.CloudResource(connection_id=job.connection_id, service_code=data.service,
                        region_code=data.region, resource_type=data.resource_type,
                        external_id=data.external_id, arn=data.arn)
                    db.add(resource)
                    await db.flush()
                observed.append((data, resource))
            for data, resource in observed:
                snapshot = m.ResourceSnapshot(resource_id=resource.id, sync_run_id=job.id, status=data.status)
                db.add(snapshot)
                await db.flush()
                db.add(m.ResourcePayload(snapshot_id=snapshot.id, payload=data.payload))
                db.add_all([m.ResourceTag(snapshot_id=snapshot.id, key=key, value=value)
                            for key, value in data.tags.items()])
                await persist_network_snapshot(db, resource, snapshot, data.payload)
            job.status = "succeeded"
            job.records_processed = len(resources)
            job.finished_at = datetime.now(timezone.utc)
            connection = await db.get(m.CloudConnection, job.connection_id)
            record(db, job.requested_by, "sync.inventory.succeeded", job.correlation_id,
                   connection.project_id, job.id)
    except Exception as exc:
        # No persistir str(exc): los errores SDK pueden incluir endpoints o identificadores sensibles.
        code = "cloud_unavailable"
        if isinstance(exc, CloudError):
            code = str(exc)
        elif isinstance(exc, ClientError):
            code = "cloud_api_error"
        async with factory.begin() as db:
            job = await db.get(m.SyncRun, job_id)
            if job.status == "running":
                job.status, job.error_code = "failed", code
                job.finished_at = datetime.now(timezone.utc)
                connection = await db.get(m.CloudConnection, job.connection_id)
                record(db, job.requested_by, "sync.inventory.failed", job.correlation_id,
                       connection.project_id, job.id, "failed")
    return True


async def expire_abandoned(factory=SessionFactory):
    """Recuperación tras caída del worker; no dejar trabajos bloqueados para siempre."""
    async with factory.begin() as db:
        jobs = (await db.scalars(select(m.SyncRun).where(m.SyncRun.status == "running",
            m.SyncRun.started_at < datetime.now(timezone.utc) - timedelta(minutes=15))
            .with_for_update(skip_locked=True))).all()
        for job in jobs:
            job.status, job.error_code = "failed", "worker_interrupted"
            job.finished_at = datetime.now(timezone.utc)
            connection = await db.get(m.CloudConnection, job.connection_id)
            record(db, job.requested_by, "sync.inventory.interrupted", job.correlation_id,
                   connection.project_id, job.id, "failed")


async def main():
    try:
        while True:
            (Path(tempfile.gettempdir()) / "cloudops-worker-health").touch()
            await expire_abandoned()
            if not await run_once():
                await asyncio.sleep(2)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
