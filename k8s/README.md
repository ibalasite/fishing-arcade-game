# Fishing Arcade Game — Kubernetes Deployment Guide

## Prerequisites

- `kubectl` >= 1.27 configured for your cluster
- `kustomize` >= 5.x (or `kubectl` with built-in kustomize support)
- [cert-manager](https://cert-manager.io/) installed in the cluster with a `ClusterIssuer` named `letsencrypt-prod`
- [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) controller running in the `ingress-nginx` namespace
- Container image built and pushed to `ghcr.io/ibalasite/fishing-game-server:<GIT_SHA>`

---

## Deploy

### 1. Replace placeholder secrets

Before deploying, populate `k8s/secret.yaml` with real base64-encoded values,
or (preferred) use an External Secrets Operator to inject them from a secrets manager.

```sh
# Example: encode a real value
echo -n 'your-jwt-secret-here' | base64
```

Replace each `UkVQTEFDRV9NRQ==` in `k8s/secret.yaml` accordingly.

### 2. Apply the full stack

```sh
kubectl apply -k k8s/
```

This creates: namespace, configmap, secret, deployment, service, ingress, HPA, PDB, network policy, and Redis.

---

## Update the application image

After a CI build produces a new image tagged with the git SHA:

```sh
export GIT_SHA=abc1234
kubectl set image deployment/fishing-game-server \
  server=ghcr.io/ibalasite/fishing-game-server:${GIT_SHA} \
  -n fishing-game
```

The rolling update strategy (`maxUnavailable: 0, maxSurge: 1`) ensures zero downtime.

---

## Check status

```sh
# Pod health
kubectl get pods -n fishing-game

# Rollout progress
kubectl rollout status deployment/fishing-game-server -n fishing-game

# HPA scaling state
kubectl get hpa -n fishing-game

# Recent events
kubectl get events -n fishing-game --sort-by='.lastTimestamp'
```

---

## Secret rotation procedure

1. Generate new secret values and encode them:
   ```sh
   echo -n 'new-value' | base64
   ```
2. Update the secret (do **not** commit real values to git — use `kubectl edit` or a secrets manager):
   ```sh
   kubectl edit secret fishing-game-secrets -n fishing-game
   ```
3. Trigger a rolling restart so pods pick up the new environment variables:
   ```sh
   kubectl rollout restart deployment/fishing-game-server -n fishing-game
   ```
4. Verify the rollout completes cleanly:
   ```sh
   kubectl rollout status deployment/fishing-game-server -n fishing-game
   ```

---

## Production Redis

The `redis.yaml` manifest is a **single-instance StatefulSet for development only**.
For production, delete it from the kustomization and point `REDIS_URL` to a managed service:

- **AWS**: ElastiCache for Redis (Multi-AZ with automatic failover)
- **GCP**: Memorystore for Redis
- **Self-managed**: Redis Sentinel or Redis Cluster on dedicated nodes

---

## Architecture notes

| Component | Detail |
|-----------|--------|
| Sticky sessions | Cookie-based affinity via ingress + ClientIP affinity on Service — required for Colyseus WebSocket rooms |
| Graceful shutdown | `terminationGracePeriodSeconds: 60` + `preStop: sleep 5` allows room cleanup before pod removal |
| Disruption budget | `minAvailable: 1` prevents total outage during node drains |
| Autoscaling | HPA scales 2–10 replicas on CPU (70%) and memory (80%) with conservative scale-down |
| Network isolation | NetworkPolicy restricts ingress to ingress-nginx, egress to PostgreSQL, Redis, and kube-dns |
