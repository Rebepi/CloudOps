provider "aws" {
  region = "us-east-1"
}

variable "admin_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

resource "aws_security_group" "admin" {
  name        = "example-admin"
  description = "Administrative access"
  vpc_id      = "vpc-example"
  ingress {
    description = "Private SSH access"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }
}

resource "aws_iam_role_policy" "example" {
  name   = "example-policy"
  role   = "example-role"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["s3:GetObject"], Resource = ["arn:aws:s3:::example-bucket/private/object"] }]
  })
}

module "storage" {
  source = "./modules/storage"
}
