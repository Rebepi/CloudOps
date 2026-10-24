provider "aws" {
  region = "us-east-1"
}

resource "aws_security_group" "admin" {
  name        = "example-admin"
  description = "Administrative access"
  vpc_id      = "vpc-example"
  ingress {
    description = "SSH access"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_iam_role_policy" "example" {
  name   = "example-policy"
  role   = "example-role"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["*"], Resource = ["*"] }]
  })
}

module "storage" {
  source = "./modules/storage"
}
