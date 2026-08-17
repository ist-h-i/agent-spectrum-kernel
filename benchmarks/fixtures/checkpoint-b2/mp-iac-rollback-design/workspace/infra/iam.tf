resource "aws_iam_role_policy" "api_runtime" {
  name = "api-runtime"
  role = "api-runtime-role"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "arn:aws:logs:us-east-1:111122223333:log-group:/aws/lambda/api-handler:*"
    }]
  })
}
