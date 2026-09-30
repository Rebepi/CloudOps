import hashlib
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import AuthSession, ProjectMember, RolePermission, User

Db = Annotated[AsyncSession, Depends(get_db)]
bearer = HTTPBearer(auto_error=False)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def current_user(db: Db, credentials: Annotated[
    HTTPAuthorizationCredentials | None, Depends(bearer)
]) -> User:
    if credentials is None:
        raise HTTPException(401, "Inicia una sesión local", headers={"WWW-Authenticate": "Bearer"})
    session = await db.get(AuthSession, hash_token(credentials.credentials))
    if session is None or session.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(401, "Sesión expirada o inválida")
    user = await db.get(User, session.user_id)
    if user is None:
        raise HTTPException(401, "Identidad inválida")
    return user


Identity = Annotated[User, Depends(current_user)]


async def authorize_project(db: AsyncSession, user_id: UUID, project_id: UUID, permission: str):
    membership = await db.get(ProjectMember, (project_id, user_id))
    if membership is None:
        # No revelar que el proyecto existe a usuarios sin pertenencia.
        raise HTTPException(404, "Proyecto no encontrado")
    allowed = await db.scalar(select(RolePermission.permission_code).where(
        RolePermission.role_code == membership.role_code,
        RolePermission.permission_code == permission,
    ))
    if not allowed:
        raise HTTPException(403, "No tienes permiso para esta operación")
