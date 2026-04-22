#!/bin/bash
set -euo pipefail

echo "=== Fishing Game Secret Generator ==="
echo "NEVER commit these values to git!"
echo ""

# Verify openssl is available
if ! command -v openssl &>/dev/null; then
  echo "ERROR: openssl is not installed. Please install it first." >&2
  exit 1
fi

# Generate each secret
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
HMAC_SECRET_KEY=$(openssl rand -hex 32)

echo "Generated secrets (copy to your secret manager):"
echo ""
echo "JWT_SECRET=${JWT_SECRET}"
echo "ENCRYPTION_KEY=${ENCRYPTION_KEY}"
echo "HMAC_SECRET_KEY=${HMAC_SECRET_KEY}"
echo ""
echo "Set these in your environment:"
echo "  For local dev: add to .env (git-ignored)"
echo "  For k8s: kubectl create secret generic fishing-game-secrets \\"
echo "    --from-literal=JWT_SECRET=<value> \\"
echo "    --from-literal=ENCRYPTION_KEY=<value> \\"
echo "    --from-literal=HMAC_SECRET_KEY=<value> \\"
echo "    --from-literal=DATABASE_URL=<value> \\"
echo "    --from-literal=REDIS_URL=<value> \\"
echo "    -n fishing-game"
echo ""
echo "  For GitHub Actions: Settings → Secrets → Add KUBECONFIG"
echo ""
echo "WARNING: The generated values above are displayed only once."
echo "         Copy them to your secret manager immediately."
