import os
from uuid import uuid4

import pytest

from app.cloud import BotoCloudProvider
from app.config import Settings


@pytest.mark.contract
def test_floci_identity_and_s3_inventory():
    if os.getenv("RUN_FLOCI_TESTS") != "true":
        pytest.skip("RUN_FLOCI_TESTS=true requiere FLOCI local")
    settings = Settings(_env_file=None)
    cloud = BotoCloudProvider(settings, "floci", settings.floci_account_id, "us-east-1")
    assert cloud.identity()["Account"] == settings.floci_account_id
    name = f"cloudops-contract-{uuid4().hex}"
    s3 = cloud.client("s3")
    s3.create_bucket(Bucket=name)  # Escritura sólo en fixtures FLOCI locales.
    try:
        resources = cloud.inventory()
        assert any(r.external_id == name and r.service == "s3" for r in resources)
    finally:
        s3.delete_bucket(Bucket=name)


@pytest.mark.aws
def test_aws_identity_explicit_opt_in():
    if os.getenv("RUN_AWS_SMOKE_TESTS") != "true":
        pytest.skip("AWS real desactivado")
    settings = Settings()
    assert settings.allow_aws and settings.aws_account_allowlist
    account = os.environ["AWS_TEST_ACCOUNT_ID"]
    cloud = BotoCloudProvider(settings, "aws", account, settings.aws_region_allowlist[0])
    assert cloud.identity()["Account"] == account
