param(
  [string]$Owner = "advancia-devuser",
  [string]$Repo = "advancia-healthcare1",
  [string]$StagingEnvironment = "staging",
  [string]$ProductionEnvironment = "production",
  [switch]$IncludeOptionalSecrets
)

$fullRepo = "$Owner/$Repo"

$requiredRepoSecrets = @(
  "VERCEL_TOKEN",
  "DATABASE_URL"
)

$requiredRepoVariables = @(
  "PRODUCTION_URL"
)

$requiredEitherSecretOrVariable = @(
  "STAGING_URL"
)

$optionalRepoSecrets = @(
  "STAGING_ADMIN_PASSWORD",
  "STAGING_ADMIN_TOTP"
)

function Invoke-GhNames {
  param(
    [string[]]$Arguments,
    [switch]$AllowNotFound
  )

  $output = & gh @Arguments 2>&1
  $exitCode = $LASTEXITCODE

  if ($exitCode -ne 0) {
    $message = ($output | Out-String).Trim()

    if ($AllowNotFound -and $message -match "HTTP 404|Not Found") {
      return @{ Items = @(); NotFound = $true }
    }

    throw "gh $($Arguments -join ' ') failed: $message"
  }

  $items = @($output | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
  return @{ Items = $items; NotFound = $false }
}

function Get-MissingItems {
  param(
    [string[]]$Required,
    [string[]]$Actual
  )

  return @($Required | Where-Object { $_ -notin $Actual })
}

try {
  $null = & gh auth status 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run 'gh auth login' or 'gh auth switch --user <account>' first."
  }

  $repoSecretsResult = Invoke-GhNames -Arguments @("secret", "list", "--repo", $fullRepo, "--json", "name", "--jq", ".[ ].name".Replace(" ", ""))
  $repoVariablesResult = Invoke-GhNames -Arguments @("variable", "list", "--repo", $fullRepo, "--json", "name", "--jq", ".[ ].name".Replace(" ", ""))
  $environmentsResult = Invoke-GhNames -Arguments @("api", "repos/$fullRepo/environments", "--jq", ".environments[].name")
  $stagingEnvSecretsResult = Invoke-GhNames -Arguments @("secret", "list", "--repo", $fullRepo, "--env", $StagingEnvironment, "--json", "name", "--jq", ".[ ].name".Replace(" ", "")) -AllowNotFound
  $productionEnvSecretsResult = Invoke-GhNames -Arguments @("secret", "list", "--repo", $fullRepo, "--env", $ProductionEnvironment, "--json", "name", "--jq", ".[ ].name".Replace(" ", "")) -AllowNotFound
}
catch {
  Write-Error $_.Exception.Message
  exit 2
}

$repoSecrets = $repoSecretsResult.Items
$repoVariables = $repoVariablesResult.Items
$environments = $environmentsResult.Items
$stagingEnvSecrets = $stagingEnvSecretsResult.Items
$productionEnvSecrets = $productionEnvSecretsResult.Items

$missingRepoSecrets = Get-MissingItems -Required $requiredRepoSecrets -Actual $repoSecrets
$missingRepoVariables = Get-MissingItems -Required $requiredRepoVariables -Actual $repoVariables
$missingEither = @(
  $requiredEitherSecretOrVariable | Where-Object {
    ($_ -notin $repoSecrets) -and ($_ -notin $repoVariables)
  }
)
$missingOptionalSecrets = Get-MissingItems -Required $optionalRepoSecrets -Actual $repoSecrets
$missingEnvironments = @(
  @($StagingEnvironment, $ProductionEnvironment) | Where-Object { $_ -notin $environments }
)

Write-Host "GitHub Actions readiness for $fullRepo"
Write-Host ""
Write-Host "Repository secrets found: $(@($repoSecrets).Count)"
if ($repoSecrets) {
  $repoSecrets | Sort-Object | ForEach-Object { Write-Host "  - $_" }
}

Write-Host ""
Write-Host "Repository variables found: $(@($repoVariables).Count)"
if ($repoVariables) {
  $repoVariables | Sort-Object | ForEach-Object { Write-Host "  - $_" }
}

Write-Host ""
Write-Host "GitHub environments found: $(@($environments).Count)"
if ($environments) {
  $environments | Sort-Object | ForEach-Object { Write-Host "  - $_" }
}

Write-Host ""
if ($stagingEnvSecretsResult.NotFound) {
  Write-Host "Environment '$StagingEnvironment' does not exist."
}
else {
  Write-Host "Environment '$StagingEnvironment' secrets found: $(@($stagingEnvSecrets).Count)"
  if ($stagingEnvSecrets) {
    $stagingEnvSecrets | Sort-Object | ForEach-Object { Write-Host "  - $_" }
  }
}

Write-Host ""
if ($productionEnvSecretsResult.NotFound) {
  Write-Host "Environment '$ProductionEnvironment' does not exist."
}
else {
  Write-Host "Environment '$ProductionEnvironment' secrets found: $(@($productionEnvSecrets).Count)"
  if ($productionEnvSecrets) {
    $productionEnvSecrets | Sort-Object | ForEach-Object { Write-Host "  - $_" }
  }
}

Write-Host ""
Write-Host "Missing required repository secrets:"
if ($missingRepoSecrets) {
  $missingRepoSecrets | ForEach-Object { Write-Host "  - $_" }
}
else {
  Write-Host "  - none"
}

Write-Host ""
Write-Host "Missing required repository variables:"
if ($missingRepoVariables) {
  $missingRepoVariables | ForEach-Object { Write-Host "  - $_" }
}
else {
  Write-Host "  - none"
}

Write-Host ""
Write-Host "Missing required variable-or-secret values:"
if ($missingEither) {
  $missingEither | ForEach-Object { Write-Host "  - $_" }
}
else {
  Write-Host "  - none"
}

Write-Host ""
Write-Host "Missing GitHub environments referenced operationally:"
if ($missingEnvironments) {
  $missingEnvironments | ForEach-Object { Write-Host "  - $_" }
}
else {
  Write-Host "  - none"
}

if ($IncludeOptionalSecrets) {
  Write-Host ""
  Write-Host "Missing optional repository secrets:"
  if ($missingOptionalSecrets) {
    $missingOptionalSecrets | ForEach-Object { Write-Host "  - $_" }
  }
  else {
    Write-Host "  - none"
  }
}

$hasBlockingIssues = ($missingRepoSecrets.Count -gt 0) -or ($missingRepoVariables.Count -gt 0) -or ($missingEither.Count -gt 0)

if ($hasBlockingIssues) {
  Write-Error "Required GitHub Actions configuration is missing for $fullRepo."
  exit 1
}

Write-Host ""
Write-Host "Required GitHub Actions configuration is present for $fullRepo."
exit 0