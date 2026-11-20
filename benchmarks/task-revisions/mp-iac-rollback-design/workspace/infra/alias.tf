resource "aws_lambda_alias" "api_live" {
  name             = "live"
  function_name    = "api-handler"
  function_version = "41"

  routing_config {
    additional_version_weights = {
      "42" = 0.10
    }
  }
}
