import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased
from starlette.concurrency import run_in_threadpool

from app import models as m
from app.audit import record
from app.auth import Db, Identity, authorize_project, hash_token
from app.cloud import CloudError, provider_for
from app.config import get_settings
from app.inventory_queries import latest_run, observed_resources
from app.schemas import (
    ConnectionInput,
    InventoryStatus,
    MockLogin,
    NetworkResourceOutput,
    ProjectInput,
    ProposalInput,
)

router = APIRouter(prefix="/api/v1")
Limit = Annotated[int, Query(ge=1, le=200)]
Offset = Annotated[int, Query(ge=0)]


def row(item, *fields):
    return {field: getattr(item, field) for field in fields}


def trace(request: Request) -> str:
    return request.state.correlation_id


@router.post("/auth/mock/login")
async def mock_login(body: MockLogin, db: Db, request: Request):
    if get_settings().app_env not in {"local", "test"}:
        raise HTTPException(404)
    user = await db.scalar(select(m.User).where(m.User.external_subject == f"mock:{body.profile}"))
    if user is None:
        raise HTTPException(503, "Ejecuta las migraciones y python -m app.bootstrap")
    token = secrets.token_urlsafe(48)
    expiry = datetime.now(timezone.utc) + timedelta(hours=8)
    db.add(m.AuthSession(token_hash=hash_token(token), user_id=user.id, expires_at=expiry))
    record(db, user.id, "auth.login.mock", trace(request))
    await db.commit()
    return {"access_token": token, "token_type": "bearer", "expires_at": expiry,
            "user": row(user, "id", "email", "display_name")}


@router.get("/auth/me")
async def me(db: Db, user: Identity):
    members = (await db.scalars(select(m.ProjectMember).where(m.ProjectMember.user_id == user.id))).all()
    permissions = (await db.scalars(select(m.RolePermission.permission_code).where(
        m.RolePermission.role_code.in_({member.role_code for member in members})))).all()
    scoped = (await db.execute(select(m.ProjectMember.project_id, m.RolePermission.permission_code)
        .join(m.RolePermission, m.RolePermission.role_code == m.ProjectMember.role_code)
        .where(m.ProjectMember.user_id == user.id))).all()
    project_permissions = {str(member.project_id): [] for member in members}
    for project_id, permission in scoped:
        project_permissions[str(project_id)].append(permission)
    return {**row(user, "id", "email", "display_name"), "external_subject": user.external_subject,
            "project_ids": [member.project_id for member in members],
            "roles": sorted({member.role_code for member in members}),
            "permissions": sorted(set(permissions)),
            "project_roles": {str(member.project_id): member.role_code for member in members},
            "project_permissions": project_permissions}


@router.get("/runtime")
async def runtime(user: Identity):
    settings = get_settings()
    return {"aws_enabled": settings.allow_aws,
            "aws_default_region": settings.aws_region_allowlist[0] if settings.aws_region_allowlist else None,
            "floci_account_id": settings.floci_account_id}


@router.post("/auth/logout", status_code=204)
async def logout(db: Db, user: Identity, request: Request):
    token = request.headers["authorization"].split(" ", 1)[1]
    await db.execute(delete(m.AuthSession).where(m.AuthSession.token_hash == hash_token(token)))
    record(db, user.id, "auth.logout", trace(request))
    await db.commit()
    return Response(status_code=204)


@router.get("/workspaces")
async def workspaces(db: Db, user: Identity):
    items = (await db.scalars(select(m.Workspace).join(m.WorkspaceMember).where(
        m.WorkspaceMember.user_id == user.id))).all()
    return [row(item, "id", "name", "slug") for item in items]


@router.get("/projects")
async def projects(db: Db, user: Identity, limit: Limit = 100, offset: Offset = 0):
    items = (await db.scalars(select(m.Project).join(m.ProjectMember).where(
        m.ProjectMember.user_id == user.id).order_by(m.Project.created_at, m.Project.id)
        .limit(limit).offset(offset))).all()
    return [row(item, "id", "workspace_id", "name", "slug", "description", "created_at") for item in items]


@router.post("/projects", status_code=201)
async def create_project(body: ProjectInput, db: Db, user: Identity, request: Request):
    member = await db.get(m.WorkspaceMember, (body.workspace_id, user.id))
    if member is None:
        raise HTTPException(404, "Workspace no encontrado")
    if member.role_code not in {"owner", "admin"}:
        raise HTTPException(403, "Sin permiso para crear proyectos")
    project = m.Project(**body.model_dump(), created_by=user.id)
    db.add(project)
    await db.flush()
    db.add(m.ProjectMember(project_id=project.id, user_id=user.id, role_code="admin"))
    record(db, user.id, "project.create", trace(request), project.id, project.id)
    await db.commit()
    return row(project, "id", "workspace_id", "name", "slug", "description", "created_at")


@router.get("/catalogs")
async def catalogs(db: Db, user: Identity):
    return {"services": [row(s, "code", "name") for s in (await db.scalars(select(m.CloudService))).all()],
            "regions": [r.code for r in (await db.scalars(select(m.CloudRegion))).all()],
            "frameworks": [f.code for f in (await db.scalars(select(m.ComplianceFramework))).all()]}


@router.get("/projects/{project_id}/connections")
async def connections(project_id: UUID, db: Db, user: Identity):
    await authorize_project(db, user.id, project_id, "cloud:read")
    items = (await db.scalars(select(m.CloudConnection).where(m.CloudConnection.project_id == project_id)
                             .order_by(m.CloudConnection.created_at, m.CloudConnection.id))).all()
    return [row(item, "id", "name", "mode", "account_id", "region_code", "last_checked_at") for item in items]


@router.post("/projects/{project_id}/connections", status_code=201)
async def create_connection(project_id: UUID, body: ConnectionInput, db: Db, user: Identity, request: Request):
    await authorize_project(db, user.id, project_id, "connection:write")
    if await db.get(m.CloudRegion, body.region_code) is None:
        raise HTTPException(422, "Región no soportada")
    connection = m.CloudConnection(**body.model_dump(), project_id=project_id)
    try:
        provider_for(connection, get_settings())  # Comprueba allowlists sin invocar APIs.
    except CloudError as exc:
        raise HTTPException(403, str(exc)) from exc
    db.add(connection)
    await db.flush()
    record(db, user.id, "connection.create", trace(request), project_id, connection.id)
    await db.commit()
    return row(connection, "id", "name", "mode", "account_id", "region_code", "last_checked_at")


async def connection_access(db, user, connection_id, permission):
    connection = await db.get(m.CloudConnection, connection_id)
    if connection is None:
        raise HTTPException(404, "Conexión no encontrada")
    await authorize_project(db, user.id, connection.project_id, permission)
    return connection


@router.post("/connections/{connection_id}/test")
async def test_connection(connection_id: UUID, db: Db, user: Identity, request: Request):
    connection = await connection_access(db, user, connection_id, "cloud:sync")
    try:
        identity = await run_in_threadpool(lambda: provider_for(connection, get_settings()).identity())
    except Exception as exc:
        record(db, user.id, "connection.test", trace(request), connection.project_id, connection.id, "failed")
        await db.commit()
        raise HTTPException(502, "No se pudo validar la identidad cloud; revisa conexión y permisos") from exc
    connection.last_checked_at = datetime.now(timezone.utc)
    record(db, user.id, "connection.test", trace(request), connection.project_id, connection.id)
    await db.commit()
    return {"status": "validated", "identity": identity, "mode": connection.mode,
            "permissions_verified": ["sts:GetCallerIdentity"]}


@router.post("/connections/{connection_id}/sync/inventory", status_code=202)
async def sync_inventory(connection_id: UUID, db: Db, user: Identity, request: Request):
    connection = await connection_access(db, user, connection_id, "cloud:sync")
    active = await db.scalar(select(m.SyncRun).where(m.SyncRun.connection_id == connection_id,
                                                    m.SyncRun.status.in_(["queued", "running"])))
    if active:
        return row(active, "id", "status", "connection_id", "sync_type", "correlation_id")
    job = m.SyncRun(connection_id=connection_id, requested_by=user.id, correlation_id=trace(request))
    db.add(job)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Ya existe una sincronización activa; actualiza el estado") from exc
    record(db, user.id, "sync.inventory.queued", trace(request), connection.project_id, job.id)
    await db.commit()
    return row(job, "id", "status", "connection_id", "sync_type", "correlation_id")


@router.get("/projects/{project_id}/sync-runs")
async def sync_runs(project_id: UUID, db: Db, user: Identity, limit: Limit = 50, offset: Offset = 0):
    await authorize_project(db, user.id, project_id, "cloud:read")
    jobs = (await db.scalars(select(m.SyncRun).join(m.CloudConnection).where(
        m.CloudConnection.project_id == project_id).order_by(m.SyncRun.created_at.desc(), m.SyncRun.id)
        .limit(limit).offset(offset))).all()
    return [row(job, "id", "status", "sync_type", "connection_id", "created_at", "started_at",
                "finished_at", "records_processed", "error_code", "correlation_id") for job in jobs]


@router.get("/projects/{project_id}/resources")
async def resources(project_id: UUID, db: Db, user: Identity, limit: Limit = 100, offset: Offset = 0):
    await authorize_project(db, user.id, project_id, "cloud:read")
    # Último inventario COMPLETO por conexión; evita mostrar recursos eliminados como activos.
    rows = (await db.execute(observed_resources(project_id).limit(limit).offset(offset))).all()
    return [{**row(resource, "id", "connection_id", "service_code", "region_code", "resource_type",
                    "external_id", "arn"), "status": snapshot.status, "observed_at": snapshot.created_at}
            for resource, snapshot, connection, job in rows]


@router.get("/projects/{project_id}/inventory-status", response_model=list[InventoryStatus])
async def inventory_status(project_id: UUID, db: Db, user: Identity, limit: Limit = 100, offset: Offset = 0):
    await authorize_project(db, user.id, project_id, "cloud:read")
    attempt, completed = aliased(m.SyncRun), aliased(m.SyncRun)
    query = (select(m.CloudConnection, attempt, completed).select_from(m.CloudConnection)
        .outerjoin(attempt, attempt.id == latest_run(m.CloudConnection.id).scalar_subquery())
        .outerjoin(completed, completed.id == latest_run(m.CloudConnection.id, successful=True).scalar_subquery())
        .where(m.CloudConnection.project_id == project_id)
        .order_by(m.CloudConnection.created_at, m.CloudConnection.id).limit(limit).offset(offset))

    def run_output(job):
        return None if job is None else row(job, "id", "status", "created_at", "finished_at",
                                            "records_processed", "error_code", "correlation_id")

    return [{**row(connection, "id", "name", "mode", "account_id", "region_code", "last_checked_at"),
             "last_attempt": run_output(last), "last_success": run_output(success)}
            for connection, last, success in (await db.execute(query)).all()]


@router.get("/projects/{project_id}/network/resources", response_model=list[NetworkResourceOutput])
async def network_resources(project_id: UUID, db: Db, user: Identity, limit: Limit = 100, offset: Offset = 0):
    await authorize_project(db, user.id, project_id, "cloud:read")
    parent, parent_snapshot = aliased(m.CloudResource), aliased(m.ResourceSnapshot)
    query = (observed_resources(project_id).add_columns(m.NetworkVpcSnapshot, m.NetworkSubnetSnapshot,
        parent.id, parent.external_id, parent_snapshot.id, m.ResourceTag.value)
        .outerjoin(m.NetworkVpcSnapshot, m.NetworkVpcSnapshot.snapshot_id == m.ResourceSnapshot.id)
        .outerjoin(m.NetworkSubnetSnapshot, m.NetworkSubnetSnapshot.snapshot_id == m.ResourceSnapshot.id)
        .outerjoin(parent, (parent.id == m.NetworkSubnetSnapshot.vpc_resource_id)
            & (parent.connection_id == m.CloudResource.connection_id)
            & (parent.region_code == m.CloudResource.region_code)
            & (parent.service_code == "vpc") & (parent.resource_type == "vpc"))
        .outerjoin(parent_snapshot, (parent_snapshot.resource_id == parent.id)
                   & (parent_snapshot.sync_run_id == m.ResourceSnapshot.sync_run_id))
        .outerjoin(m.ResourceTag, (m.ResourceTag.snapshot_id == m.ResourceSnapshot.id) & (m.ResourceTag.key == "Name"))
        .where(m.CloudResource.service_code == "vpc", m.CloudResource.resource_type.in_(["vpc", "subnet"]))
        .limit(limit).offset(offset))
    records = (await db.execute(query)).all()
    cidrs = {}
    if records:
        for block in (await db.scalars(select(m.NetworkCidrBlock).where(
                m.NetworkCidrBlock.snapshot_id.in_([record[1].id for record in records])))).all():
            cidrs.setdefault(block.snapshot_id, []).append(
                {"cidr": str(block.cidr), "association_state": block.association_state})
    result = []
    for resource, snapshot, connection, job, vpc, subnet, parent_id, parent_external, seen, name in records:
        fields = row(vpc, "is_default", "tenancy") if vpc else {}
        if subnet:
            fields.update(row(subnet, "availability_zone", "available_ip_address_count", "map_public_ip_on_launch"))
        result.append({**row(resource, "id", "connection_id", "service_code", "region_code", "resource_type", "external_id"),
            "status": snapshot.status, "observed_at": snapshot.created_at, "snapshot_id": snapshot.id,
            "sync_run_id": job.id, "correlation_id": job.correlation_id, "mode": connection.mode,
            "account_id": connection.account_id, "name": name,
            "cidr_blocks": sorted(cidrs.get(snapshot.id, []), key=lambda block: block["cidr"]),
            "vpc_resource_id": parent_id, "vpc_external_id": parent_external,
            "parent_observed": seen is not None, **fields})
    return result


async def proposal_output(db, proposal):
    return {**row(proposal, "id", "project_id", "name", "application_type", "description", "region_code",
                  "estimated_users", "availability", "migration_goal", "budget_limit", "rto_hours",
                  "rpo_minutes", "created_at"),
            "services": list(await db.scalars(select(m.ProposalService.service_code).where(
                m.ProposalService.proposal_id == proposal.id).order_by(m.ProposalService.service_code))),
            "frameworks": list(await db.scalars(select(m.ProposalFramework.framework_code).where(
                m.ProposalFramework.proposal_id == proposal.id).order_by(m.ProposalFramework.framework_code)))}


async def validate_proposal(db, body):
    services = set(await db.scalars(select(m.CloudService.code)))
    frameworks = set(await db.scalars(select(m.ComplianceFramework.code)))
    if not set(body.services) <= services or not set(body.frameworks) <= frameworks:
        raise HTTPException(422, "Servicios o marcos desconocidos; consulta /catalogs")
    if await db.get(m.CloudRegion, body.region_code) is None:
        raise HTTPException(422, "Región desconocida")


@router.get("/projects/{project_id}/proposals")
async def proposals(project_id: UUID, db: Db, user: Identity, limit: Limit = 100, offset: Offset = 0):
    await authorize_project(db, user.id, project_id, "proposal:read")
    items = (await db.scalars(select(m.ArchitectureProposal).where(m.ArchitectureProposal.project_id == project_id)
        .order_by(m.ArchitectureProposal.created_at.desc(), m.ArchitectureProposal.id)
        .limit(limit).offset(offset))).all()
    return [await proposal_output(db, item) for item in items]


@router.post("/projects/{project_id}/proposals", status_code=201)
async def create_proposal(project_id: UUID, body: ProposalInput, db: Db, user: Identity, request: Request):
    await authorize_project(db, user.id, project_id, "proposal:write")
    await validate_proposal(db, body)
    proposal = m.ArchitectureProposal(**body.model_dump(exclude={"services", "frameworks"}),
                                      project_id=project_id, created_by=user.id)
    db.add(proposal)
    await db.flush()
    db.add_all([m.ProposalService(proposal_id=proposal.id, service_code=s) for s in body.services])
    db.add_all([m.ProposalFramework(proposal_id=proposal.id, framework_code=f) for f in body.frameworks])
    record(db, user.id, "proposal.create", trace(request), project_id, proposal.id)
    await db.commit()
    return await proposal_output(db, proposal)


@router.put("/proposals/{proposal_id}")
async def update_proposal(proposal_id: UUID, body: ProposalInput, db: Db, user: Identity, request: Request):
    proposal = await db.get(m.ArchitectureProposal, proposal_id)
    if proposal is None:
        raise HTTPException(404, "Propuesta no encontrada")
    await authorize_project(db, user.id, proposal.project_id, "proposal:write")
    await validate_proposal(db, body)
    for key, value in body.model_dump(exclude={"services", "frameworks"}).items():
        setattr(proposal, key, value)
    await db.execute(delete(m.ProposalService).where(m.ProposalService.proposal_id == proposal_id))
    await db.execute(delete(m.ProposalFramework).where(m.ProposalFramework.proposal_id == proposal_id))
    db.add_all([m.ProposalService(proposal_id=proposal_id, service_code=s) for s in body.services])
    db.add_all([m.ProposalFramework(proposal_id=proposal_id, framework_code=f) for f in body.frameworks])
    record(db, user.id, "proposal.update", trace(request), proposal.project_id, proposal_id)
    await db.commit()
    return await proposal_output(db, proposal)


@router.delete("/proposals/{proposal_id}", status_code=204)
async def delete_proposal(proposal_id: UUID, db: Db, user: Identity, request: Request):
    proposal = await db.get(m.ArchitectureProposal, proposal_id)
    if proposal is None:
        raise HTTPException(404, "Propuesta no encontrada")
    await authorize_project(db, user.id, proposal.project_id, "proposal:write")
    record(db, user.id, "proposal.delete", trace(request), proposal.project_id, proposal_id)
    await db.delete(proposal)
    await db.commit()
    return Response(status_code=204)


@router.get("/projects/{project_id}/audit-events")
async def audit_events(project_id: UUID, db: Db, user: Identity, limit: Limit = 50, offset: Offset = 0):
    await authorize_project(db, user.id, project_id, "audit:read")
    events = (await db.scalars(select(m.AuditEvent).where(m.AuditEvent.project_id == project_id)
        .order_by(m.AuditEvent.created_at.desc(), m.AuditEvent.id).limit(limit).offset(offset))).all()
    return [row(event, "id", "actor_user_id", "action", "entity_id", "result", "correlation_id", "created_at")
            for event in events]
