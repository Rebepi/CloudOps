"""Inventario AWS opt-in, ejecutado localmente una vez y auditado en PostgreSQL.

La excepción root nunca se propaga a la API/worker habituales. Detener el worker
durante la prueba para que no reclame este trabajo antes del proceso smoke.
"""
import argparse
import asyncio
import json
import os
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import func, select

from app import models as m
from app.audit import record
from app.auth import authorize_project
from app.cloud import BotoCloudProvider, CloudError
from app.config import Settings, get_settings
from app.db import SessionFactory, engine
from app.schemas import ConnectionInput
from app.worker import run_once


def require_opt_in(execute: bool, settings: Settings):
    if not execute or os.getenv("RUN_AWS_SMOKE_TESTS") != "true":
        raise CloudError("aws_smoke_requires_explicit_opt_in")
    if settings.app_env != "local":
        raise CloudError("aws_smoke_requires_local_environment")


async def run_smoke(project_id: UUID, account: str, region: str, *, allow_root: bool,
                    factory=SessionFactory, provider_type=BotoCloudProvider):
    require_opt_in(True, get_settings())
    values = ConnectionInput(name="AWS real · prueba puntual", mode="aws",
                             account_id=account, region_code=region)
    settings = Settings(_env_file=None, app_env="local", allow_aws=True,
                        aws_account_allowlist=[values.account_id], aws_region_allowlist=[region])
    correlation = str(uuid4())
    async with factory.begin() as db:
        actor = await db.scalar(select(m.User).where(m.User.external_subject == "mock:admin"))
        if actor is None or await db.get(m.Project, project_id) is None:
            raise CloudError("local_actor_or_project_missing")
        await authorize_project(db, actor.id, project_id, "connection:write")
        await authorize_project(db, actor.id, project_id, "cloud:sync")
        if await db.get(m.CloudRegion, region) is None:
            raise CloudError("unsupported_region")
        connection = await db.scalar(select(m.CloudConnection).where(
            m.CloudConnection.project_id == project_id, m.CloudConnection.mode == "aws",
            m.CloudConnection.account_id == account, m.CloudConnection.region_code == region))
        if connection is None:
            connection = m.CloudConnection(**values.model_dump(), project_id=project_id)
            db.add(connection)
            await db.flush()
            record(db, actor.id, "connection.create", correlation, project_id, connection.id)
        active = await db.scalar(select(m.SyncRun.id).where(
            m.SyncRun.connection_id == connection.id, m.SyncRun.status.in_(["queued", "running"])))
        if active is not None:
            raise CloudError("connection_has_active_sync")
        job = m.SyncRun(connection_id=connection.id, requested_by=actor.id, correlation_id=correlation)
        db.add(job)
        await db.flush()
        job_id, connection_id = job.id, connection.id
        if allow_root:
            record(db, actor.id, "aws.smoke.root_exception.authorized", correlation,
                   project_id, job_id)
        record(db, actor.id, "sync.inventory.queued", correlation, project_id, job_id)

    def smoke_provider(connection, unused_settings):
        return provider_type(settings, "aws", connection.account_id, connection.region_code,
                             allow_root_local_smoke=allow_root)

    if not await run_once(factory, smoke_provider, target_job_id=job_id):
        raise CloudError("smoke_job_not_claimed")
    async with factory.begin() as db:
        job = await db.get(m.SyncRun, job_id)
        counts = (await db.execute(select(m.CloudResource.service_code, func.count())
            .join(m.ResourceSnapshot, m.ResourceSnapshot.resource_id == m.CloudResource.id)
            .where(m.ResourceSnapshot.sync_run_id == job_id)
            .group_by(m.CloudResource.service_code))).all()
        if job.status == "succeeded":
            connection = await db.get(m.CloudConnection, connection_id)
            connection.last_checked_at = datetime.now(timezone.utc)
        return {"status": job.status, "job_id": str(job_id), "connection_id": str(connection_id),
                "correlation_id": correlation, "records_processed": job.records_processed,
                "error_code": job.error_code, "services": dict(counts)}


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Autorizar lectura AWS real")
    parser.add_argument("--allow-root", action="store_true", help="Excepción root para esta ejecución local")
    parser.add_argument("--project-id", type=UUID, required=True)
    parser.add_argument("--account", required=True)
    parser.add_argument("--region", required=True)
    args = parser.parse_args()
    try:
        require_opt_in(args.execute, get_settings())
        result = await run_smoke(args.project_id, args.account, args.region, allow_root=args.allow_root)
        print(json.dumps(result))  # Sólo estado y conteos; nunca credenciales/payloads.
        return 0 if result["status"] == "succeeded" else 1
    except CloudError as exc:
        print(json.dumps({"status": "rejected", "error_code": str(exc)}))
        return 1
    except HTTPException:
        print(json.dumps({"status": "rejected", "error_code": "project_access_denied"}))
        return 1
    except Exception:
        print(json.dumps({"status": "failed", "error_code": "smoke_failed"}))
        return 1
    finally:
        await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
