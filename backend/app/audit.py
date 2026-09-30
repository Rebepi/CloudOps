from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEvent


def record(db: AsyncSession, user_id: UUID, action: str, correlation_id: str,
           project_id: UUID | None = None, entity_id: UUID | None = None, result: str = "success"):
    db.add(AuditEvent(actor_user_id=user_id, action=action, correlation_id=correlation_id,
                      project_id=project_id, entity_id=entity_id, result=result))
