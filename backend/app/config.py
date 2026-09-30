from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["local", "test", "production"] = "local"
    auth_mode: Literal["mock"] = "mock"
    database_url: str = "postgresql+asyncpg://cloudops:cloudops_local@localhost:5432/cloudops"
    floci_endpoint_url: str = "http://localhost:4566"
    floci_account_id: str = "000000000000"
    floci_region: str = "us-east-1"
    allow_aws: bool = False
    aws_account_allowlist: list[str] = []
    aws_region_allowlist: list[str] = ["us-east-1"]
    cors_origins: list[str] = ["http://localhost:27901"]

    @model_validator(mode="after")
    def safe_configuration(self):
        if self.app_env == "production" and self.auth_mode == "mock":
            raise ValueError("El login mock no está permitido en producción; integrar Nexus primero")
        if self.allow_aws and not self.aws_account_allowlist:
            raise ValueError("ALLOW_AWS requiere AWS_ACCOUNT_ALLOWLIST explícita")
        if not self.floci_account_id.isdigit() or len(self.floci_account_id) != 12:
            raise ValueError("FLOCI_ACCOUNT_ID debe tener 12 dígitos")
        url = urlparse(self.floci_endpoint_url)
        if url.scheme != "http" or url.hostname not in {"localhost", "127.0.0.1", "floci"}:
            raise ValueError("FLOCI_ENDPOINT_URL debe apuntar al emulador local")
        if url.port != 4566 or url.username or url.password or url.query or url.path not in {"", "/"}:
            raise ValueError("Endpoint FLOCI inválido")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
