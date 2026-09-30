"""Esquema inicial normalizado y catálogos. Snapshot congelado e independiente del ORM."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001_core"
down_revision = None
branch_labels = None
depends_on = None


def column(name, type_, *constraints, **kwargs):
    return sa.Column(name, type_, *constraints, nullable=False, **kwargs)


def entity(name, *columns, **kwargs):
    return op.create_table(name, column("id", sa.Uuid(), primary_key=True),
        column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")), *columns, **kwargs)


def fk(name, table, *, primary_key=False, ondelete=None, type_=None):
    return column(name, type_ or sa.Uuid(), sa.ForeignKey(table, ondelete=ondelete), primary_key=primary_key)


def upgrade():
    entity("users", column("external_subject", sa.String(200), unique=True),
           column("email", sa.String(254), unique=True), column("display_name", sa.String(120)))
    op.create_table("roles", column("code", sa.String(30), primary_key=True))
    op.create_table("permissions", column("code", sa.String(60), primary_key=True))
    op.create_table("role_permissions",
        fk("role_code", "roles.code", primary_key=True, type_=sa.String(30)),
        fk("permission_code", "permissions.code", primary_key=True, type_=sa.String(60)))
    entity("workspaces", column("name", sa.String(120)), column("slug", sa.String(80), unique=True))
    op.create_table("workspace_members", fk("workspace_id", "workspaces.id", primary_key=True),
        fk("user_id", "users.id", primary_key=True), fk("role_code", "roles.code", type_=sa.String(30)))
    entity("projects", fk("workspace_id", "workspaces.id"), column("name", sa.String(120)),
        column("slug", sa.String(80)), column("description", sa.Text()), fk("created_by", "users.id"),
        sa.UniqueConstraint("workspace_id", "slug"))
    op.create_index("ix_projects_workspace_id", "projects", ["workspace_id"])
    op.create_table("project_members", fk("project_id", "projects.id", primary_key=True),
        fk("user_id", "users.id", primary_key=True), fk("role_code", "roles.code", type_=sa.String(30)))
    op.create_table("auth_sessions", column("token_hash", sa.String(64), primary_key=True),
        fk("user_id", "users.id"), column("expires_at", sa.DateTime(timezone=True)))
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.create_table("cloud_providers", column("code", sa.String(30), primary_key=True),
                    column("name", sa.String(120)))
    op.create_table("cloud_regions", column("code", sa.String(40), primary_key=True),
        fk("provider_code", "cloud_providers.code", type_=sa.String(30)), column("partition", sa.String(30)))
    op.create_table("cloud_services", column("code", sa.String(30), primary_key=True),
        fk("provider_code", "cloud_providers.code", type_=sa.String(30)), column("name", sa.String(120)))
    entity("cloud_connections", fk("project_id", "projects.id"), column("name", sa.String(120)),
        column("mode", sa.String(10)), column("account_id", sa.String(12)),
        fk("region_code", "cloud_regions.code", type_=sa.String(40)),
        sa.Column("last_checked_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("mode IN ('floci', 'aws')", name="ck_connection_mode"),
        sa.CheckConstraint("account_id ~ '^[0-9]{12}$'", name="ck_connection_account"),
        sa.UniqueConstraint("project_id", "mode", "account_id", "region_code"))
    op.create_index("ix_cloud_connections_project_id", "cloud_connections", ["project_id"])
    entity("sync_runs", fk("connection_id", "cloud_connections.id"), fk("requested_by", "users.id"),
        column("sync_type", sa.String(30)), column("status", sa.String(20)),
        column("correlation_id", sa.String(36)), sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)), column("records_processed", sa.Integer()),
        sa.Column("error_code", sa.String(80)),
        sa.CheckConstraint("status IN ('queued','running','succeeded','failed')", name="ck_sync_status"),
        sa.CheckConstraint("sync_type = 'inventory'", name="ck_sync_type"))
    op.create_index("ix_sync_runs_connection_id", "sync_runs", ["connection_id"])
    op.create_index("ix_sync_queue", "sync_runs", ["status", "created_at"])
    op.create_index("uq_sync_active_connection", "sync_runs", ["connection_id"], unique=True,
                    postgresql_where=sa.text("status IN ('queued', 'running')"))
    entity("cloud_resources", fk("connection_id", "cloud_connections.id"),
        fk("service_code", "cloud_services.code", type_=sa.String(30)),
        fk("region_code", "cloud_regions.code", type_=sa.String(40)), column("resource_type", sa.String(60)),
        column("external_id", sa.String(512)), sa.Column("arn", sa.String(1024)),
        sa.UniqueConstraint("connection_id", "service_code", "region_code", "resource_type", "external_id"))
    op.create_index("ix_cloud_resources_connection_id", "cloud_resources", ["connection_id"])
    entity("resource_snapshots", fk("resource_id", "cloud_resources.id"), fk("sync_run_id", "sync_runs.id"),
        column("status", sa.String(60)), sa.UniqueConstraint("resource_id", "sync_run_id"))
    op.create_index("ix_resource_snapshots_resource_id", "resource_snapshots", ["resource_id"])
    op.create_table("resource_payloads", fk("snapshot_id", "resource_snapshots.id", primary_key=True),
                    column("payload", JSONB()))
    op.create_table("resource_tags", fk("snapshot_id", "resource_snapshots.id", primary_key=True),
                    column("key", sa.String(256), primary_key=True), column("value", sa.String(1024)))
    op.create_table("compliance_frameworks", column("code", sa.String(60), primary_key=True))
    entity("architecture_proposals", fk("project_id", "projects.id"), fk("created_by", "users.id"),
        column("name", sa.String(160)), column("application_type", sa.String(30)),
        column("description", sa.Text()), fk("region_code", "cloud_regions.code", type_=sa.String(40)),
        column("estimated_users", sa.Integer()), column("availability", sa.String(20)),
        column("migration_goal", sa.Text()), sa.Column("budget_limit", sa.Numeric(16, 2)),
        sa.Column("rto_hours", sa.Numeric(10, 2)), sa.Column("rpo_minutes", sa.Integer()),
        sa.CheckConstraint("estimated_users >= 1", name="ck_proposal_users"),
        sa.CheckConstraint("budget_limit IS NULL OR budget_limit >= 0", name="ck_proposal_budget"),
        sa.CheckConstraint("rto_hours IS NULL OR rto_hours >= 0", name="ck_proposal_rto"),
        sa.CheckConstraint("rpo_minutes IS NULL OR rpo_minutes >= 0", name="ck_proposal_rpo"),
        sa.CheckConstraint("availability IN ('basica','alta','critica')", name="ck_proposal_availability"))
    op.create_index("ix_architecture_proposals_project_id", "architecture_proposals", ["project_id"])
    op.create_table("proposal_services", fk("proposal_id", "architecture_proposals.id",
        primary_key=True, ondelete="CASCADE"), fk("service_code", "cloud_services.code", primary_key=True,
        type_=sa.String(30)))
    op.create_table("proposal_frameworks", fk("proposal_id", "architecture_proposals.id",
        primary_key=True, ondelete="CASCADE"), fk("framework_code", "compliance_frameworks.code",
        primary_key=True, type_=sa.String(60)))
    entity("audit_events", sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id")),
        fk("actor_user_id", "users.id"), column("action", sa.String(100)), sa.Column("entity_id", sa.Uuid()),
        column("result", sa.String(30)), column("correlation_id", sa.String(36)))
    op.create_index("ix_audit_project_created", "audit_events", ["project_id", "created_at"])
    # La inmutabilidad no depende sólo de que la API omita PATCH/DELETE.
    op.execute("""CREATE FUNCTION prevent_audit_changes() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'audit_events is append-only'; END; $$""")
    op.execute("""CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_changes()""")
    seed_catalogs()


def seed_catalogs():
    def insert(name, columns, rows):
        op.bulk_insert(sa.table(name, *[sa.column(c, sa.String()) for c in columns]),
                       [dict(zip(columns, row)) for row in rows])
    insert("roles", ["code"], [(r,) for r in ("owner", "admin", "analyst", "viewer")])
    read = ("cloud:read", "proposal:read", "audit:read")
    write = ("connection:write", "proposal:write", "cloud:sync")
    insert("permissions", ["code"], [(p,) for p in read + write])
    insert("role_permissions", ["role_code", "permission_code"],
        [(r, p) for r in ("owner", "admin", "analyst", "viewer")
         for p in (read if r == "viewer" else read + write)])
    # FLOCI emula AWS; el proveedor es AWS y el modo de conexión distingue el endpoint.
    insert("cloud_providers", ["code", "name"], [("aws", "Amazon Web Services")])
    insert("cloud_regions", ["code", "provider_code", "partition"],
        [(r, "aws", "aws") for r in ("us-east-1", "us-west-2", "sa-east-1", "eu-west-1",
         "eu-central-1", "ap-southeast-1", "ap-northeast-1", "ap-southeast-2")])
    insert("cloud_services", ["code", "provider_code", "name"],
        [(s, "aws", name) for s, name in {"ec2": "Amazon EC2", "s3": "Amazon S3", "rds": "Amazon RDS",
          "vpc": "Amazon VPC", "lambda": "AWS Lambda", "ebs": "Amazon EBS", "elb": "Elastic Load Balancing",
          "dynamodb": "Amazon DynamoDB", "cloudfront": "Amazon CloudFront", "route53": "Amazon Route 53",
          "waf": "AWS WAF", "iam": "AWS IAM", "kms": "AWS KMS", "cloudwatch": "Amazon CloudWatch"}.items()])
    insert("compliance_frameworks", ["code"], [(f,) for f in
        ("SOC 2 Tipo II", "PCI-DSS v4.0", "ISO/IEC 27001", "HIPAA", "GDPR", "SOC 2", "PCI-DSS")])


def downgrade():
    op.execute("DROP FUNCTION prevent_audit_changes() CASCADE")
    for table in ("audit_events", "proposal_frameworks", "proposal_services", "architecture_proposals",
                  "compliance_frameworks", "resource_tags", "resource_payloads", "resource_snapshots",
                  "cloud_resources", "sync_runs", "cloud_connections", "cloud_services", "cloud_regions",
                  "cloud_providers", "auth_sessions", "project_members", "projects", "workspace_members",
                  "workspaces", "role_permissions", "permissions", "roles", "users"):
        op.drop_table(table)
