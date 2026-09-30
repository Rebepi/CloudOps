from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MockLogin(Input):
    profile: Literal["admin", "viewer"] = "admin"


class ProjectInput(Input):
    workspace_id: UUID
    name: str = Field(min_length=3, max_length=120)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    description: str = Field(default="", max_length=5000)


class ConnectionInput(Input):
    name: str = Field(min_length=3, max_length=120)
    mode: Literal["floci", "aws"] = "floci"
    account_id: str = Field(default="000000000000", pattern=r"^\d{12}$")
    region_code: str = "us-east-1"


class ProposalInput(Input):
    name: str = Field(min_length=3, max_length=160)
    application_type: Literal["Web", "Móvil", "API", "Analítica", "Interna"]
    description: str = Field(min_length=1, max_length=10000)
    region_code: str
    estimated_users: int = Field(ge=1, le=100000000)
    availability: Literal["basica", "alta", "critica"]
    migration_goal: str = Field(min_length=1, max_length=5000)
    budget_limit: float | None = Field(default=None, ge=0, le=1000000000, allow_inf_nan=False)
    rto_hours: float | None = Field(default=None, ge=0, le=8760, allow_inf_nan=False)
    rpo_minutes: int | None = Field(default=None, ge=0, le=525600)
    services: list[str] = Field(min_length=1, max_length=30)
    frameworks: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("services", "frameworks")
    @classmethod
    def unique_values(cls, values):
        if len(values) != len(set(values)):
            raise ValueError("Los valores no deben repetirse")
        return values


class ObservedRun(BaseModel):
    id: UUID
    status: Literal["queued", "running", "succeeded", "failed"]
    created_at: datetime
    finished_at: datetime | None
    records_processed: int
    error_code: str | None
    correlation_id: str


class InventoryStatus(BaseModel):
    id: UUID
    name: str
    mode: Literal["aws", "floci"]
    account_id: str
    region_code: str
    last_checked_at: datetime | None
    last_attempt: ObservedRun | None
    last_success: ObservedRun | None


class CidrOutput(BaseModel):
    cidr: str
    association_state: str | None


class NetworkResourceOutput(BaseModel):
    id: UUID
    connection_id: UUID
    service_code: Literal["vpc"]
    region_code: str
    resource_type: Literal["vpc", "subnet"]
    external_id: str
    status: str
    observed_at: datetime
    mode: Literal["aws", "floci"]
    account_id: str
    snapshot_id: UUID
    sync_run_id: UUID
    correlation_id: str
    name: str | None
    cidr_blocks: list[CidrOutput]
    is_default: bool | None = None
    tenancy: str | None = None
    vpc_resource_id: UUID | None = None
    vpc_external_id: str | None = None
    parent_observed: bool = False
    availability_zone: str | None = None
    available_ip_address_count: int | None = None
    map_public_ip_on_launch: bool | None = None
