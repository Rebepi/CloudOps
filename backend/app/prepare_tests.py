"""Crear (sin borrar) una base de laboratorio terminada en _test y aplicar migraciones."""
import asyncio
import os
import re
import subprocess
import sys
from pathlib import Path

from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import create_async_engine


async def ensure_database(url: str):
    parsed = make_url(url)
    name = parsed.database or ""
    if not re.fullmatch(r"[a-z][a-z0-9_]*_test", name):
        raise ValueError("La base debe terminar en _test y usar un identificador seguro")
    engine = create_async_engine(parsed.set(database="postgres"), isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        if not await conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": name}):
            await conn.execute(text(f'CREATE DATABASE "{name}"'))
    await engine.dispose()


def migrate(url: str, *args):
    env = {**os.environ, "DATABASE_URL": url, "APP_ENV": "test"}
    subprocess.run([sys.executable, "-m", "alembic", *args], env=env,
                   cwd=Path(__file__).resolve().parents[1], check=True)


if __name__ == "__main__":
    url = os.environ["TEST_DATABASE_URL"]
    asyncio.run(ensure_database(url))
    migrate(url, "upgrade", "head")
