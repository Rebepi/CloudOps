import json
import logging
import time
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.api import router
from app.config import get_settings
from app.db import SessionFactory, engine

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("cloudops")


@asynccontextmanager
async def lifespan(app):
    yield
    await engine.dispose()


app = FastAPI(title="CloudOps API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins,
                   allow_methods=["GET", "POST", "PUT", "DELETE"],
                   allow_headers=["Authorization", "Content-Type", "X-Correlation-ID"],
                   expose_headers=["X-Correlation-ID"])
app.include_router(router)


@app.middleware("http")
async def correlation(request: Request, call_next):
    try:
        request.state.correlation_id = str(UUID(request.headers.get("X-Correlation-ID", "")))
    except ValueError:
        request.state.correlation_id = str(uuid4())
    started = time.monotonic()
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = request.state.correlation_id
    logger.info(json.dumps({"correlation_id": request.state.correlation_id,
        "method": request.method, "path": request.url.path, "status": response.status_code,
        "duration_ms": round((time.monotonic() - started) * 1000)}))
    return response


@app.exception_handler(IntegrityError)
async def conflict(request: Request, exc: IntegrityError):
    return JSONResponse(status_code=409, content={"detail": "Conflicto de integridad o registro duplicado"})


@app.get("/health/live")
async def live():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/health/ready")
async def ready():
    try:
        async with SessionFactory() as db:
            version = await db.scalar(text("SELECT version_num FROM alembic_version"))
            if version != "0002_network":
                return JSONResponse(status_code=503, content={"status": "migration_required"})
    except Exception:
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ready"}
