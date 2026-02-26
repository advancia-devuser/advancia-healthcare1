#!/usr/bin/env bash
set -euo pipefail

# Trigger GitHub repository_dispatch event for post-deploy verification.
#
# Usage:
#   GITHUB_TOKEN=<token> bash scripts/trigger-post-deploy-verify.sh
#   GITHUB_TOKEN=<token> bash scripts/trigger-post-deploy-verify.sh owner repo event_type
#   bash scripts/trigger-post-deploy-verify.sh owner repo event_type --dry-run
#
# Defaults:
#   owner      = advancia-devuser
#   repo       = advancia-healthcare1
#   event_type = post_deploy_verify

OWNER="${1:-advancia-devuser}"
REPO="${2:-advancia-healthcare1}"
EVENT_TYPE="${3:-post_deploy_verify}"
DRY_RUN="${4:-}"
TOKEN="${GITHUB_TOKEN:-}"

API_URL="https://api.github.com/repos/${OWNER}/${REPO}/dispatches"
BODY="{\"event_type\":\"${EVENT_TYPE}\"}"

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  echo "[dry-run] Repository dispatch preview"
  echo "[dry-run] URL: ${API_URL}"
  echo "[dry-run] BODY: ${BODY}"
  exit 0
fi

if [[ -z "$TOKEN" ]]; then
  echo "GITHUB_TOKEN is required (repo scope)"
  exit 1
fi

STATUS="$(curl -sS -o /tmp/trigger-post-deploy-verify.response.json -w "%{http_code}" \
  -X POST "$API_URL" \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$BODY")"

if [[ "$STATUS" == "204" ]]; then
  echo "Dispatch sent successfully: ${OWNER}/${REPO} event=${EVENT_TYPE}"
  exit 0
fi

echo "Dispatch failed: HTTP ${STATUS}"
cat /tmp/trigger-post-deploy-verify.response.json
exit 1
