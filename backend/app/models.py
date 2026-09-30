"""Núcleo OLTP: identidades, pertenencia, catálogos, propuestas e inventario.

JSONB contiene únicamente la evidencia original del proveedor, nunca relaciones.
Las migraciones contienen una copia explícita del esquema; no usan create_all.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import CIDR, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Entity:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Entity, Base):
    __tablename__ = "users"
    external_subject: Mapped[str] = mapped_column(String(200), unique=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))


class Role(Base):
    __tablename__ = "roles"
    code: Mapped[str] = mapped_column(String(30), primary_key=True)


class Permission(Base):
    __tablename__ = "permissions"
    code: Mapped[str] = mapped_column(String(60), primary_key=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    role_code: Mapped[str] = mapped_column(ForeignKey("roles.code"), primary_key=True)
    permission_code: Mapped[str] = mapped_column(ForeignKey("permissions.code"), primary_key=True)


class Workspace(Entity, Base):
    __tablename__ = "workspaces"
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(80), unique=True)


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role_code: Mapped[str] = mapped_column(ForeignKey("roles.code"))


class Project(Entity, Base):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("workspace_id", "slug"),)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))


class ProjectMember(Base):
    __tablename__ = "project_members"
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role_code: Mapped[str] = mapped_column(ForeignKey("roles.code"))


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class CloudProvider(Base):
    __tablename__ = "cloud_providers"
    code: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class CloudRegion(Base):
    __tablename__ = "cloud_regions"
    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    provider_code: Mapped[str] = mapped_column(ForeignKey("cloud_providers.code"))
    partition: Mapped[str] = mapped_column(String(30))


class CloudService(Base):
    __tablename__ = "cloud_services"
    code: Mapped[str] = mapped_column(String(30), primary_key=True)
    provider_code: Mapped[str] = mapped_column(ForeignKey("cloud_providers.code"))
    name: Mapped[str] = mapped_column(String(120))


class CloudConnection(Entity, Base):
    __tablename__ = "cloud_connections"
    __table_args__ = (
        CheckConstraint("mode IN ('floci', 'aws')", name="ck_connection_mode"),
        CheckConstraint("account_id ~ '^[0-9]{12}$'", name="ck_connection_account"),
        UniqueConstraint("project_id", "mode", "account_id", "region_code"),
    )
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    mode: Mapped[str] = mapped_column(String(10))
    account_id: Mapped[str] = mapped_column(String(12))
    region_code: Mapped[str] = mapped_column(ForeignKey("cloud_regions.code"))
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SyncRun(Entity, Base):
    __tablename__ = "sync_runs"
    __table_args__ = (
        CheckConstraint("status IN ('queued','running','succeeded','failed')", name="ck_sync_status"),
        CheckConstraint("sync_type = 'inventory'", name="ck_sync_type"),
        Index("ix_sync_queue", "status", "created_at"),
        Index("uq_sync_active_connection", "connection_id", unique=True,
              postgresql_where=text("status IN ('queued', 'running')")),
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cloud_connections.id"), index=True)
    requested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    sync_type: Mapped[str] = mapped_column(String(30), default="inventory")
    status: Mapped[str] = mapped_column(String(20), default="queued")
    correlation_id: Mapped[str] = mapped_column(String(36))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    records_processed: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(80))


class CloudResource(Entity, Base):
    __tablename__ = "cloud_resources"
    __table_args__ = (
        UniqueConstraint("connection_id", "service_code", "region_code", "resource_type", "external_id"),
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cloud_connections.id"), index=True)
    service_code: Mapped[str] = mapped_column(ForeignKey("cloud_services.code"))
    region_code: Mapped[str] = mapped_column(ForeignKey("cloud_regions.code"))
    resource_type: Mapped[str] = mapped_column(String(60))
    external_id: Mapped[str] = mapped_column(String(512))
    arn: Mapped[str | None] = mapped_column(String(1024))


class ResourceSnapshot(Entity, Base):
    __tablename__ = "resource_snapshots"
    __table_args__ = (UniqueConstraint("resource_id", "sync_run_id"),)
    resource_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cloud_resources.id"), index=True)
    sync_run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sync_runs.id"))
    status: Mapped[str] = mapped_column(String(60))


class ResourcePayload(Base):
    __tablename__ = "resource_payloads"
    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("resource_snapshots.id"), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSONB)


class ResourceTag(Base):
    __tablename__ = "resource_tags"
    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("resource_snapshots.id"), primary_key=True)
    key: Mapped[str] = mapped_column(String(256), primary_key=True)
    value: Mapped[str] = mapped_column(String(1024))


class NetworkVpcSnapshot(Base):
    __tablename__ = "network_vpc_snapshots"
    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("resource_snapshots.id"), primary_key=True)
    is_default: Mapped[bool | None]
    tenancy: Mapped[str | None] = mapped_column(String(20))


class NetworkSubnetSnapshot(Base):
    __tablename__ = "network_subnet_snapshots"
    __table_args__ = (CheckConstraint("available_ip_address_count IS NULL OR available_ip_address_count >= 0",
                                     name="ck_subnet_available_ips"),)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("resource_snapshots.id"), primary_key=True)
    vpc_resource_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cloud_resources.id"), index=True)
    availability_zone: Mapped[str | None] = mapped_column(String(128))
    available_ip_address_count: Mapped[int | None]
    map_public_ip_on_launch: Mapped[bool | None]


class NetworkCidrBlock(Base):
    __tablename__ = "network_cidr_blocks"
    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("resource_snapshots.id"), primary_key=True)
    cidr: Mapped[str] = mapped_column(CIDR(), primary_key=True)
    association_state: Mapped[str | None] = mapped_column(String(30))


class ComplianceFramework(Base):
    __tablename__ = "compliance_frameworks"
    code: Mapped[str] = mapped_column(String(60), primary_key=True)


class ArchitectureProposal(Entity, Base):
    __tablename__ = "architecture_proposals"
    __table_args__ = (
        CheckConstraint("estimated_users >= 1", name="ck_proposal_users"),
        CheckConstraint("budget_limit IS NULL OR budget_limit >= 0", name="ck_proposal_budget"),
        CheckConstraint("rto_hours IS NULL OR rto_hours >= 0", name="ck_proposal_rto"),
        CheckConstraint("rpo_minutes IS NULL OR rpo_minutes >= 0", name="ck_proposal_rpo"),
        CheckConstraint("availability IN ('basica','alta','critica')", name="ck_proposal_availability"),
    )
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(160))
    application_type: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(Text)
    region_code: Mapped[str] = mapped_column(ForeignKey("cloud_regions.code"))
    estimated_users: Mapped[int] = mapped_column(Integer)
    availability: Mapped[str] = mapped_column(String(20))
    migration_goal: Mapped[str] = mapped_column(Text)
    budget_limit: Mapped[Decimal | None] = mapped_column(Numeric(16, 2))
    rto_hours: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    rpo_minutes: Mapped[int | None] = mapped_column(Integer)


class ProposalService(Base):
    __tablename__ = "proposal_services"
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("architecture_proposals.id", ondelete="CASCADE"), primary_key=True)
    service_code: Mapped[str] = mapped_column(ForeignKey("cloud_services.code"), primary_key=True)


class ProposalFramework(Base):
    __tablename__ = "proposal_frameworks"
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("architecture_proposals.id", ondelete="CASCADE"), primary_key=True)
    framework_code: Mapped[str] = mapped_column(ForeignKey("compliance_frameworks.code"), primary_key=True)


class AuditEvent(Entity, Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_project_created", "project_id", "created_at"),)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"))
    actor_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[uuid.UUID | None] = mapped_column()
    result: Mapped[str] = mapped_column(String(30), default="success")
    correlation_id: Mapped[str] = mapped_column(String(36))
