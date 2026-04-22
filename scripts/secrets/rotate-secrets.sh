#!/bin/bash
set -euo pipefail

# =============================================================================
# rotate-secrets.sh — Zero-downtime JWT_SECRET rotation for fishing-game
# =============================================================================
#
# Strategy: dual-validation rolling rotation
#   Phase 1 — Introduce new secret alongside old (validate both)
#   Phase 2 — Wait for all tokens signed with old secret to expire (15 min TTL)
#   Phase 3 — Remove old secret; server validates new secret only
#
# Usage:
#   bash scripts/secrets/rotate-secrets.sh
#
# Prerequisites:
#   - kubectl configured with access to the fishing-game namespace
#   - NAMESPACE env var (default: fishing-game)
#   - SECRET_NAME env var (default: fishing-game-secrets)
#   - openssl installed
# =============================================================================

NAMESPACE=${NAMESPACE:-fishing-game}
SECRET_NAME=${SECRET_NAME:-fishing-game-secrets}
TOKEN_TTL_SECONDS=${TOKEN_TTL_SECONDS:-900}   # 15 minutes

echo "=== JWT_SECRET Rotation — Zero-Downtime Procedure ==="
echo "Namespace : ${NAMESPACE}"
echo "Secret    : ${SECRET_NAME}"
echo "Token TTL : ${TOKEN_TTL_SECONDS}s"
echo ""

# --- Safety checks ------------------------------------------------------------

if ! command -v kubectl &>/dev/null; then
  echo "ERROR: kubectl is not installed or not in PATH." >&2
  exit 1
fi

if ! command -v openssl &>/dev/null; then
  echo "ERROR: openssl is not installed or not in PATH." >&2
  exit 1
fi

if ! kubectl get namespace "${NAMESPACE}" &>/dev/null; then
  echo "ERROR: Namespace '${NAMESPACE}' not found. Check your kubeconfig context." >&2
  exit 1
fi

if ! kubectl get secret "${SECRET_NAME}" -n "${NAMESPACE}" &>/dev/null; then
  echo "ERROR: Secret '${SECRET_NAME}' not found in namespace '${NAMESPACE}'." >&2
  exit 1
fi

# Confirm intent
echo "This will rotate JWT_SECRET in k8s secret '${SECRET_NAME}'."
echo "All active sessions remain valid during the dual-validation window."
echo ""
read -rp "Type 'rotate' to confirm: " CONFIRM
if [[ "${CONFIRM}" != "rotate" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "[1/5] Generating new JWT_SECRET..."
NEW_JWT_SECRET=$(openssl rand -base64 32)
echo "      New secret generated (not printed for security)."

echo ""
echo "[2/5] Reading current JWT_SECRET from k8s..."
OLD_JWT_SECRET_B64=$(kubectl get secret "${SECRET_NAME}" -n "${NAMESPACE}" \
  -o jsonpath='{.data.JWT_SECRET}')

echo "[3/5] Writing JWT_SECRET_OLD + JWT_SECRET_NEW to k8s secret..."
# Store the old secret under JWT_SECRET_OLD so the server can still validate
# existing tokens while the new secret is adopted.
NEW_JWT_SECRET_B64=$(echo -n "${NEW_JWT_SECRET}" | base64)

kubectl patch secret "${SECRET_NAME}" -n "${NAMESPACE}" \
  --type='json' \
  -p="[
    {\"op\": \"add\",  \"path\": \"/data/JWT_SECRET_OLD\", \"value\": \"${OLD_JWT_SECRET_B64}\"},
    {\"op\": \"replace\", \"path\": \"/data/JWT_SECRET\",  \"value\": \"${NEW_JWT_SECRET_B64}\"}
  ]"
echo "      k8s secret patched."

echo ""
echo "[4/5] Triggering rolling restart so pods pick up the new secret..."
kubectl rollout restart deployment/fishing-game-server -n "${NAMESPACE}"
kubectl rollout status deployment/fishing-game-server -n "${NAMESPACE}" --timeout=300s
echo "      Rolling restart complete."

echo ""
echo "[5/5] Waiting ${TOKEN_TTL_SECONDS}s for all tokens signed with old secret to expire..."
echo "      (Interrupt with Ctrl+C only if you know no users are currently active)"
for ((i=TOKEN_TTL_SECONDS; i>0; i-=30)); do
  echo "      ${i}s remaining..."
  sleep 30
done

echo ""
echo "      Removing JWT_SECRET_OLD from k8s secret..."
kubectl patch secret "${SECRET_NAME}" -n "${NAMESPACE}" \
  --type='json' \
  -p='[{"op": "remove", "path": "/data/JWT_SECRET_OLD"}]'

echo "      Triggering final rolling restart (single-secret validation mode)..."
kubectl rollout restart deployment/fishing-game-server -n "${NAMESPACE}"
kubectl rollout status deployment/fishing-game-server -n "${NAMESPACE}" --timeout=300s

echo ""
echo "=== JWT_SECRET rotation complete ==="
echo "    Pods now validate only the new secret."
echo "    Record the rotation date in your audit log."
