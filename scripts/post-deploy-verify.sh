#!/usr/bin/env bash
set -euo pipefail

# Post-deploy verification for Advancia Smart Wallet app
# Usage:
#   bash scripts/post-deploy-verify.sh https://your-domain.com
# Optional env vars:
#   ADMIN_PASSWORD=...      # if set, script tests admin login invalid/valid flows
#   ADMIN_TOTP=...          # optional 2FA code for valid admin login test

BASE_URL="${1:-https://advanciapayledger.com}"
API_BASE="${BASE_URL%/}/api"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1"
    exit 1
  }
}

http_code() {
  local method="$1"
  local url="$2"
  local data="${3:-}"

  if [[ -n "$data" ]]; then
    curl -sS -o /tmp/advancia_verify_body.json -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Content-Type: application/json" \
      --data "$data"
  else
    curl -sS -o /tmp/advancia_verify_body.json -w "%{http_code}" \
      -X "$method" "$url"
  fi
}

expect_code() {
  local label="$1"
  local got="$2"
  shift 2
  local ok=1
  for expected in "$@"; do
    if [[ "$got" == "$expected" ]]; then
      ok=0
      break
    fi
  done
  if [[ $ok -eq 0 ]]; then
    pass "$label (status=$got)"
  else
    local body
    body="$(cat /tmp/advancia_verify_body.json 2>/dev/null || true)"
    fail "$label (status=$got expected=$*) body=${body:0:200}"
  fi
}

echo "=============================================="
echo " Advancia Post-Deploy Verification"
echo " Target: $BASE_URL"
echo "=============================================="

require_cmd curl
require_cmd grep

# 1) Public health endpoint
code="$(http_code GET "${API_BASE}/health")"
expect_code "GET /api/health" "$code" 200

# 2) robots and sitemap should be reachable
code="$(http_code GET "${BASE_URL%/}/robots.txt")"
expect_code "GET /robots.txt" "$code" 200

code="$(http_code GET "${BASE_URL%/}/sitemap.xml")"
expect_code "GET /sitemap.xml" "$code" 200

# 3) Session nonce endpoint
nonce_json="$(curl -sS "${API_BASE}/auth/session?address=0xabcdef1234567890abcdef1234567890abcdef12")"
if echo "$nonce_json" | grep -q '"nonce"'; then
  pass "GET /api/auth/session returns nonce"
else
  fail "GET /api/auth/session missing nonce field"
fi

# 4) Session creation should fail with invalid signature/nonce
code="$(http_code POST "${API_BASE}/auth/session" '{"address":"0xabcdef1234567890abcdef1234567890abcdef12","signature":"0xdeadbeef","nonce":"invalid"}')"
expect_code "POST /api/auth/session rejects invalid proof" "$code" 400 401

# 5) Protected endpoint should reject unauthenticated access
code="$(http_code GET "${API_BASE}/profile")"
expect_code "GET /api/profile unauthenticated" "$code" 401

# 6) Admin endpoint should reject unauthenticated access
code="$(http_code GET "${API_BASE}/admin/users")"
expect_code "GET /api/admin/users unauthenticated" "$code" 401 403

# 7) Admin login negative test
code="$(http_code POST "${API_BASE}/admin/login" '{"password":"definitely-wrong"}')"
expect_code "POST /api/admin/login wrong password" "$code" 401 429

# 8) Optional admin positive test
if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
  payload="{\"password\":\"${ADMIN_PASSWORD}\""
  if [[ -n "${ADMIN_TOTP:-}" ]]; then
    payload+=" ,\"totpCode\":\"${ADMIN_TOTP}\""
  fi
  payload+="}"

  code="$(http_code POST "${API_BASE}/admin/login" "$payload")"
  expect_code "POST /api/admin/login with provided credentials" "$code" 200 403
  if [[ "$code" == "403" ]]; then
    warn "Admin login returned 403 (likely requires 2FA code). Provide ADMIN_TOTP to validate success path."
  fi
else
  warn "Skipping positive admin login test (set ADMIN_PASSWORD to enable)."
fi

# 9) Security headers spot check
headers="$(curl -sSI "${BASE_URL%/}" || true)"
if echo "$headers" | grep -qi "strict-transport-security"; then
  pass "HSTS header present"
else
  warn "HSTS header missing on root response"
fi

if echo "$headers" | grep -qi "x-content-type-options"; then
  pass "X-Content-Type-Options header present"
else
  warn "X-Content-Type-Options header missing on root response"
fi

echo ""
echo "=============================================="
echo " Results: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "=============================================="

if [[ $FAIL_COUNT -gt 0 ]]; then
  exit 1
fi
