"""Datos locales idempotentes. Sólo identidades mock, sin tocar FLOCI ni AWS."""
import asyncio

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionFactory, engine
from app.models import Project, ProjectMember, User, Workspace, WorkspaceMember


async def bootstrap():
    if get_settings().app_env != "local":
        raise RuntimeError("El bootstrap mock sólo puede ejecutarse en local")
    async with SessionFactory.begin() as db:
        workspace = await db.scalar(select(Workspace).where(Workspace.slug == "local"))
        if workspace is None:
            workspace = Workspace(name="Laboratorio CloudOps", slug="local")
            db.add(workspace)
            await db.flush()
        users = {}
        for profile in ("admin", "viewer"):
            user = await db.scalar(select(User).where(User.external_subject == f"mock:{profile}"))
            if user is None:
                user = User(external_subject=f"mock:{profile}", email=f"{profile}@cloudops.local",
                            display_name=f"Usuario local ({profile})")
                db.add(user)
                await db.flush()
            users[profile] = user
            if await db.get(WorkspaceMember, (workspace.id, user.id)) is None:
                db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role_code=profile))
        project = await db.scalar(select(Project).where(Project.workspace_id == workspace.id,
                                                        Project.slug == "laboratorio"))
        if project is None:
            project = Project(workspace_id=workspace.id, name="Laboratorio local", slug="laboratorio",
                              created_by=users["admin"].id)
            db.add(project)
            await db.flush()
        for profile, user in users.items():
            if await db.get(ProjectMember, (project.id, user.id)) is None:
                db.add(ProjectMember(project_id=project.id, user_id=user.id, role_code=profile))
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(bootstrap())
