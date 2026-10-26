resource "aws_ebs_volume" "data" {
  availability_zone = "us-east-1a"
  size              = 10
  encrypted         = true
  kms_key_id        = "arn:aws:kms:us-east-1:123456789012:key/11111111-1111-4111-8111-111111111111"
}
