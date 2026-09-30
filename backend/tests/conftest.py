import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app import models as m
from app.auth import hash_token
from app.db import get_db
from app.main import app


@pytest.fixture
def db_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL no configurada; requiere PostgreSQL migrado")
    database = make_url(url).database
    if not database or not database.endswith("_test"):
        pytest.fail("La base de pruebas debe terminar en _test")
    return url


@pytest_asyncio.fixture
async def db(db_url):
    engine = create_async_engine(db_url)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False,
                                join_transaction_mode="create_savepoint") as session:
            yield session
        await transaction.rollback()
    await engine.dispose()


@pytest_asyncio.fixture
async def api(db):
    async def override():
        yield db
    app.dependency_overrides[get_db] = override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def identities(db):
    suffix = uuid4().hex
    admin = m.User(external_subject=f"admin-{suffix}", email=f"a-{suffix}@test.local", display_name="Admin")
    viewer = m.User(external_subject=f"viewer-{suffix}", email=f"v-{suffix}@test.local", display_name="Viewer")
    db.add_all([admin, viewer])
    await db.flush()
    workspace = m.Workspace(name="Test", slug=suffix)
    db.add(workspace)
    await db.flush()
    project = m.Project(workspace_id=workspace.id, name="Project", slug="project", created_by=admin.id)
    private = m.Project(workspace_id=workspace.id, name="Private", slug="private", created_by=admin.id)
    db.add_all([project, private])
    await db.flush()
    for user, role in ((admin, "admin"), (viewer, "viewer")):
        db.add(m.WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role_code=role))
        db.add(m.ProjectMember(project_id=project.id, user_id=user.id, role_code=role))
        db.add(m.AuthSession(token_hash=hash_token(str(user.id)), user_id=user.id,
                            expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
    db.add(m.ProjectMember(project_id=private.id, user_id=admin.id, role_code="admin"))
    await db.commit()
    return {"admin": {"Authorization": f"Bearer {admin.id}"},
            "viewer": {"Authorization": f"Bearer {viewer.id}"},
            "project": str(project.id), "private": str(private.id), "admin_id": admin.id}
