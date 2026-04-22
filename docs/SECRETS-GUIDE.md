# Secrets Management Guide

## 1. Required Secrets and Why

| Secret | Purpose | Format |
|--------|---------|--------|
| `JWT_SECRET` | Signs HS256 JWTs for player authentication | Base64, min 32 chars (256-bit entropy) |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection string for sessions and pub/sub | `redis://host:6379` |
| `ENCRYPTION_KEY` | AES-256-GCM encryption of user email at rest | Hex, exactly 64 chars (32 bytes) |
| `HMAC_SECRET_KEY` | HMAC-SHA256 hash of email for indexed lookup | Hex, exactly 64 chars (32 bytes) |

All secrets must have real, cryptographically random values before the server starts.
The startup validator (`scripts/secrets/validate-env.ts`) enforces this at boot time.

## 2. Generating Secrets

Run the generator script to create new random values:

```bash
bash scripts/secrets/generate-secrets.sh
```

The script uses `openssl rand` for cryptographic randomness and prints the values once.
Copy them immediately to your secret manager.

## 3. Local Development Setup

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Generate secrets:
   ```bash
   bash scripts/secrets/generate-secrets.sh
   ```

3. Fill in your `.env`:
   - Paste the generated `JWT_SECRET`, `ENCRYPTION_KEY`, `HMAC_SECRET_KEY`
   - Set `DATABASE_URL` to your local Postgres instance
   - Set `REDIS_URL` to your local Redis instance

4. Verify `.env` is git-ignored:
   ```bash
   git check-ignore -v .env   # should output: .gitignore:N:.env
   ```

The server will refuse to start if any secret is missing or still contains a placeholder value.

## 4. Production Kubernetes Setup

Create the k8s Secret directly from real values (never from `k8s/secret.yaml`, which contains only placeholders):

```bash
kubectl create secret generic fishing-game-secrets \
  --from-literal=JWT_SECRET="<value>" \
  --from-literal=DATABASE_URL="<value>" \
  --from-literal=REDIS_URL="<value>" \
  --from-literal=ENCRYPTION_KEY="<value>" \
  --from-literal=HMAC_SECRET_KEY="<value>" \
  -n fishing-game
```

Alternatively, use an External Secrets Operator to pull from AWS Secrets Manager, GCP Secret Manager, or HashiCorp Vault.

> **Note:** `k8s/secret.yaml` contains only placeholder values and must never be applied directly to a production cluster.

## 5. GitHub Actions Secrets Setup

CI/CD pipelines need `KUBECONFIG` to deploy to the cluster:

1. `Settings` → `Secrets and variables` → `Actions` → `New repository secret`
2. Name: `KUBECONFIG`, Value: your base64-encoded kubeconfig

Other secrets (JWT_SECRET, etc.) live only inside the k8s cluster and are never stored as GitHub Actions secrets.

## 6. Secret Rotation Procedures

### Rotating a single secret (non-zero-downtime)

Use `k8s-rotate.sh` to patch a specific key and restart pods:

```bash
# Example: rotate ENCRYPTION_KEY
NEW_KEY=$(openssl rand -hex 32)
bash scripts/secrets/k8s-rotate.sh ENCRYPTION_KEY "${NEW_KEY}"
```

### Zero-downtime JWT_SECRET rotation

JWT tokens have a 15-minute TTL. The full rotation script handles the dual-validation window:

```bash
bash scripts/secrets/rotate-secrets.sh
```

The procedure:
1. Generates a new `JWT_SECRET`
2. Stores the old value as `JWT_SECRET_OLD` in the k8s Secret
3. Triggers rolling restart — pods now accept tokens signed by either key
4. Waits 15 minutes for all old tokens to expire naturally
5. Removes `JWT_SECRET_OLD` and restarts pods again

No users are forced to log out during rotation.

### Rotation schedule recommendation

| Secret | Rotation Frequency |
|--------|-------------------|
| `JWT_SECRET` | Every 90 days |
| `ENCRYPTION_KEY` | Every 180 days (coordinate with re-encryption job) |
| `HMAC_SECRET_KEY` | Every 180 days (coordinate with re-hashing job) |
| `DATABASE_URL` | On DB password change |
| `REDIS_URL` | On Redis auth change |

## 7. Incident Response — Compromised Secret

If you suspect a secret has been exposed (leaked in logs, CI output, repository, etc.):

**Immediate actions (within 30 minutes):**

1. **Revoke / rotate the exposed secret immediately** — do not wait.
   - For JWT_SECRET: run `bash scripts/secrets/rotate-secrets.sh`
   - For others: run `bash scripts/secrets/k8s-rotate.sh <KEY> <new-value>`

2. **Invalidate all active sessions** if JWT_SECRET was compromised:
   - After rotation, any token signed with the old secret is immediately invalid.
   - Users will be prompted to log in again — this is expected.

3. **Audit access logs** for the exposure window:
   ```bash
   kubectl logs -n fishing-game -l app=fishing-game-server --since=24h | grep -i "auth\|jwt\|token"
   ```

4. **Identify the exposure vector** (git history, logs, CI artifacts):
   - Remove leaked values from git history using `git filter-repo` or BFG Repo Cleaner.
   - Revoke any GitHub Actions secrets that may have been printed.

5. **Notify stakeholders** per your incident response policy.

6. **Post-incident review** within 48 hours — document timeline, impact, and prevention measures.

## 8. Secret Audit Checklist

Run this checklist before every production deployment:

- [ ] `.env` is present in `.gitignore` — `git check-ignore -v .env`
- [ ] No `.env` file in git history — `git log --all --full-history -- .env`
- [ ] `k8s/secret.yaml` contains only `REPLACE_ME` placeholder values
- [ ] All live k8s secrets are non-placeholder — `kubectl get secret fishing-game-secrets -n fishing-game -o json | grep -v REPLACE`
- [ ] `JWT_SECRET` last rotated within 90 days — check audit log
- [ ] Server starts cleanly with env validation passing — check pod logs
- [ ] No secrets printed in CI/CD job logs — review GitHub Actions run logs
- [ ] No secrets in application logs — `kubectl logs` grep for known patterns
