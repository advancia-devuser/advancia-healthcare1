param(
  [string]$Owner = "advancia-devuser",
  [string]$Repo = "advancia-healthcare1",
  [string]$EventType = "post_deploy_verify",
  [string]$Token = $env:GITHUB_TOKEN,
  [switch]$DryRun
)

$uri = "https://api.github.com/repos/$Owner/$Repo/dispatches"
$headers = @{
  Accept = "application/vnd.github+json"
  Authorization = "Bearer $Token"
}
$body = @{ event_type = $EventType } | ConvertTo-Json -Compress

if ($DryRun) {
  Write-Host "[dry-run] Repository dispatch preview"
  Write-Host "[dry-run] URL: $uri"
  Write-Host "[dry-run] BODY: $body"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "GITHUB_TOKEN is required (repo scope). Pass -Token or set env:GITHUB_TOKEN."
}

try {
  $null = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body -ContentType "application/json"
  Write-Host "Dispatch sent successfully: $Owner/$Repo event=$EventType"
}
catch {
  Write-Error "Dispatch failed: $($_.Exception.Message)"
  throw
}
