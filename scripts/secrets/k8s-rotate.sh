#!/bin/bash
set -euo pipefail

# =============================================================================
# k8s-rotate.sh — Zero-downtime k8s secret rotation for a single key
# =============================================================================
#
# Usage:
#   ./scripts/secrets/k8s-rotate.sh JWT_SECRET <new-value>
#   ./scripts/secrets/k8s-rotate.sh ENCRYPTION_KEY <new-hex-64-chars>
#
# Environment variables:
#   NAMESPACE   — k8s namespace (default: fishing-game)
#   SECRET_NAME — k8s Secret resource name (default: fishing-game-secrets)
#
# The script:
#   1. Validates inputs
#   2. Base64-encodes the new value
#   3. Patches the k8s Secret in-place (no redeploy of secret.yaml needed)
#   4. Triggers a rolling restart of the server deployment
#   5. Waits for the rollout to finish (5-minute timeout)
# =============================================================================

NAMESPACE=${NAMESPACE:-fishing-game}
SECRET_NAME=${SECRET_NAME:-fishing-game-secrets}

KEY=${1:-}
VALUE=${2:-}

# --- Input validation ---------------------------------------------------------

if [[ -z "${KEY}" ]]; then
  echo "ERROR: SECRET_KEY argument is required." >&2
  echo "Usage: $0 <SECRET_KEY> <new-value>" >&2
  exit 1
fi

if [[ -z "${VALUE}" ]]; then
  echo "ERROR: new value argument is required." >&2
  echo "Usage: $0 <SECRET_KEY> <new-value>" >&2
  exit 1
fi

ALLOWED_KEYS=("JWT_SECRET" "DATABASE_URL" "REDIS_URL" "ENCRYPTION_KEY" "HMAC_SECRET_KEY")
VALID_KEY=false
for k in "${ALLOWED_KEYS[@]}"; do
  if [[ "${KEY}" == "${k}" ]]; then
    VALID_KEY=true
    break
  fi
done

if [[ "${VALID_KEY}" == "false" ]]; then
  echo "ERROR: Unknown secret key '${KEY}'." >&2
  echo "Allowed keys: ${ALLOWED_KEYS[*]}" >&2
  exit 1
fi

if ! command -v kubectl &>/dev/null; then
  echo "ERROR: kubectl is not installed or not in PATH." >&2
  exit 1
fi

if ! kubectl get namespace "${NAMESPACE}" &>/dev/null; then
  echo "ERROR: Namespace '${NAMESPACE}' not found." >&2
  exit 1
fi

if ! kubectl get secret "${SECRET_NAME}" -n "${NAMESPACE}" &>/dev/null; then
  echo "ERROR: Secret '${SECRET_NAME}' not found in namespace '${NAMESPACE}'." >&2
  exit 1
fi

# --- Rotation -----------------------------------------------------------------

echo "Rotating secret key '${KEY}' in '${NAMESPACE}/${SECRET_NAME}'..."

# Base64-encode the new value (no trailing newline)
ENCODED=$(echo -n "${VALUE}" | base64)

# Patch the secret
kubectl patch secret "${SECRET_NAME}" -n "${NAMESPACE}" \
  --type='json' \
  -p="[{\"op\": \"replace\", \"path\": \"/data/${KEY}\", \"value\": \"${ENCODED}\"}]"

echo "  k8s Secret patched."

# Trigger rolling restart so pods mount the updated secret
kubectl rollout restart deployment/fishing-game-server -n "${NAMESPACE}"
echo "  Rolling restart triggered."

# Wait for the rollout to complete
kubectl rollout status deployment/fishing-game-server -n "${NAMESPACE}" --timeout=300s
echo ""
echo "Secret ${KEY} rotated and deployment restarted successfully."
echo "Record this rotation in your audit log."
