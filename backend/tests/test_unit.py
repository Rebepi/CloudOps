import pytest
from boto3.session import Session
from botocore.stub import Stubber
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.aws_readonly_smoke import require_opt_in
from app.cloud import BotoCloudProvider, CloudError
from app.config import Settings
from app.main import app
from app.schemas import ProposalInput


def proposal(**changes):
    return dict(name="Proyecto test", application_type="Web", description="Diseño", region_code="us-east-1",
                estimated_users=100, availability="alta", migration_goal="Migrar", services=["s3"], **changes)


def test_proposal_validation():
    assert ProposalInput(**proposal(budget_limit=0)).budget_limit == 0
    for changes in ({"budget_limit": -1}, {"budget_limit": float("nan")}, {"rto_hours": -1}):
        with pytest.raises(ValidationError):
            ProposalInput(**proposal(**changes))
    values = proposal()
    values["services"] = ["s3", "s3"]
    with pytest.raises(ValidationError):
        ProposalInput(**values)


@pytest.mark.parametrize("url", ["http://169.254.169.254:4566", "https://aws.amazon.com:4566",
                                     "http://localhost:80", "http://test:secret@localhost:4566"])
def test_floci_rejects_external_endpoints(url):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, floci_endpoint_url=url)


def test_mock_cannot_run_in_production():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_env="production")


def test_aws_requires_explicit_allowlists(monkeypatch):
    def never_create_session(*args, **kwargs):
        pytest.fail("No se deben descubrir credenciales AWS si la cuenta no está autorizada")
    monkeypatch.setattr("app.cloud.boto3.Session", never_create_session)
    with pytest.raises(CloudError, match="aws_not_allowed"):
        BotoCloudProvider(Settings(_env_file=None), "aws", "123456789012", "us-east-1")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, allow_aws=True)


def test_identity_checks_account_before_inventory(monkeypatch):
    cloud = BotoCloudProvider(Settings(_env_file=None), "floci", "000000000000", "us-east-1")
    sts = cloud.client("sts")
    with Stubber(sts) as stub:
        stub.add_response("get_caller_identity", {"Account": "111111111111", "Arn": "arn:aws:iam::111111111111:root",
                                                  "UserId": "test"}, {})
        monkeypatch.setattr(cloud, "client", lambda service: sts if service == "sts" else pytest.fail("Inventario prematuro"))
        with pytest.raises(CloudError, match="account_mismatch"):
            cloud.inventory()


async def test_liveness_and_unauthenticated_access():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        health = await client.get("/health/live")
        assert health.status_code == 200
        assert "X-Correlation-ID" in health.headers
        response = await client.get("/projects", headers={})
        assert response.status_code == 404
        response = await client.get("/api/v1/projects")
        assert response.status_code == 401


@pytest.mark.parametrize("partition", ["aws", "aws-cn", "aws-us-gov"])
def test_aws_root_rejected_before_inventory(monkeypatch, partition):
    session = Session(aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
    monkeypatch.setattr("app.cloud.boto3.Session", lambda **kwargs: session)
    settings = Settings(_env_file=None, allow_aws=True, aws_account_allowlist=["123456789012"])
    cloud = BotoCloudProvider(settings, "aws", "123456789012", "us-east-1")
    sts = cloud.client("sts")
    with Stubber(sts) as stub:
        stub.add_response("get_caller_identity", {"Account": "123456789012",
            "Arn": f"arn:{partition}:iam::123456789012:root", "UserId": "test"}, {})
        monkeypatch.setattr(cloud, "client", lambda service: sts if service == "sts"
                            else pytest.fail("Root no debe leer inventario"))
        with pytest.raises(CloudError, match="^aws_root_credentials_forbidden$"):
            cloud.inventory()


@pytest.mark.parametrize("arn", ["arn:aws:iam::123456789012:user/cloudops-readonly",
    "arn:aws:sts::123456789012:assumed-role/cloudops-readonly/local-session"])
def test_aws_non_root_identity_accepted(monkeypatch, arn):
    session = Session(aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
    monkeypatch.setattr("app.cloud.boto3.Session", lambda **kwargs: session)
    settings = Settings(_env_file=None, allow_aws=True, aws_account_allowlist=["123456789012"])
    cloud = BotoCloudProvider(settings, "aws", "123456789012", "us-east-1")
    sts = cloud.client("sts")
    with Stubber(sts) as stub:
        stub.add_response("get_caller_identity", {"Account": "123456789012", "Arn": arn, "UserId": "test"}, {})
        monkeypatch.setattr(cloud, "client", lambda service: sts)
        assert cloud.identity()["Arn"] == arn


def test_root_exception_only_for_explicit_local_smoke(monkeypatch):
    session = Session(aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
    monkeypatch.setattr("app.cloud.boto3.Session", lambda **kwargs: session)
    settings = Settings(_env_file=None, app_env="local", allow_aws=True,
                        aws_account_allowlist=["123456789012"])
    cloud = BotoCloudProvider(settings, "aws", "123456789012", "us-east-1", allow_root_local_smoke=True)
    sts = cloud.client("sts")
    with Stubber(sts) as stub:
        stub.add_response("get_caller_identity", {"Account": "123456789012",
            "Arn": "arn:aws:iam::123456789012:root", "UserId": "test"}, {})
        monkeypatch.setattr(cloud, "client", lambda service: sts)
        assert cloud.identity()["Account"] == "123456789012"
    with pytest.raises(CloudError, match="root_exception_not_allowed"):
        BotoCloudProvider(settings.model_copy(update={"app_env": "test"}), "aws",
                          "123456789012", "us-east-1", allow_root_local_smoke=True)
    for account, region in (("000000000000", "us-east-1"), ("123456789012", "us-west-2")):
        with pytest.raises(CloudError, match="aws_not_allowed"):
            BotoCloudProvider(settings, "aws", account, region, allow_root_local_smoke=True)


@pytest.mark.parametrize("service,operation,params", [
    ("s3", "create_bucket", {"Bucket": "cloudops-blocked-write"}),
    ("ec2", "run_instances", {"ImageId": "ami-test", "MinCount": 1, "MaxCount": 1}),
    ("rds", "create_db_instance", {"DBInstanceIdentifier": "blocked", "DBInstanceClass": "db.t3.micro",
                                    "Engine": "postgres"}),
])
def test_aws_sdk_rejects_write_operations(monkeypatch, service, operation, params):
    session = Session(aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
    monkeypatch.setattr("app.cloud.boto3.Session", lambda **kwargs: session)
    settings = Settings(_env_file=None, app_env="local", allow_aws=True,
                        aws_account_allowlist=["123456789012"])
    cloud = BotoCloudProvider(settings, "aws", "123456789012", "us-east-1", allow_root_local_smoke=True)
    client = cloud.client(service)
    with Stubber(client) as stub:
        stub.add_response(operation, {}, params)
        with pytest.raises(CloudError, match="aws_operation_not_allowed"):
            getattr(client, operation)(**params)


@pytest.mark.parametrize("execute,flag", [(False, "true"), (True, "false"), (True, "")])
def test_smoke_requires_double_opt_in(monkeypatch, execute, flag):
    monkeypatch.setenv("RUN_AWS_SMOKE_TESTS", flag)
    with pytest.raises(CloudError, match="aws_smoke_requires_explicit_opt_in"):
        require_opt_in(execute, Settings(_env_file=None, app_env="local"))


def test_smoke_rejects_nonlocal_environment(monkeypatch):
    monkeypatch.setenv("RUN_AWS_SMOKE_TESTS", "true")
    with pytest.raises(CloudError, match="aws_smoke_requires_local_environment"):
        require_opt_in(True, Settings(_env_file=None, app_env="test"))
