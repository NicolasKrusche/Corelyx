# Kubernetes / Helm Deployment Guide

Deploy Corelyx on Kubernetes using the included Helm chart.

## Prerequisites

- Kubernetes cluster ≥ 1.28
- Helm ≥ 3.14
- kubectl configured
- (Optional) cert-manager for TLS
- (Optional) nginx-ingress-controller

## Quick Start

```bash
# 1. Create namespace
kubectl create namespace corelyx

# 2. Create secrets
kubectl create secret generic corelyx-secrets \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY=your-key \
  --from-literal=ANTHROPIC_API_KEY=your-key \
  --from-literal=OPENAI_API_KEY=your-key \
  --from-literal=INNGEST_EVENT_KEY=your-key \
  --from-literal=INNGEST_SIGNING_KEY=your-key \
  --from-literal=INTERNAL_SERVICE_AUTH_SECRET_WEB_TO_RUNTIME=$(openssl rand -hex 32) \
  --from-literal=INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_TO_WEB=$(openssl rand -hex 32) \
  -n corelyx

# 3. Install Helm chart
helm install corelyx ./helm/corelyx \
  -n corelyx \
  --set config.appUrl=https://corelyx.your-domain.com \
  --set config.supabaseUrl=https://your-supabase-url \
  --set config.supabaseAnonKey=your-anon-key \
  --set postgres.host=your-rds-endpoint \
  --set redis.host=your-redis-endpoint \
  --set ingress.hosts[0].host=corelyx.your-domain.com
```

## Custom Configuration

Create a `values-production.yaml` override:

```yaml
web:
  replicaCount: 3
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: "2"
      memory: 2Gi

runtime:
  replicaCount: 3
  resources:
    requests:
      cpu: "1"
      memory: 2Gi
    limits:
      cpu: "4"
      memory: 4Gi

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: corelyx.your-domain.com
      paths:
        - path: /
          pathType: Prefix
          service: web
          port: 3000
  tls:
    - secretName: corelyx-tls
      hosts:
        - corelyx.your-domain.com

postgres:
  host: your-rds-endpoint.cluster-xxx.eu-central-1.rds.amazonaws.com
  port: 5432
```

```bash
helm upgrade corelyx ./helm/corelyx \
  -n corelyx \
  -f values-production.yaml
```

## Observability

### Check Pod Status

```bash
kubectl get pods -n corelyx -w
kubectl logs -f deployment/corelyx-web -n corelyx
kubectl logs -f deployment/corelyx-runtime -n corelyx
```

### Verify Health

```bash
kubectl exec -it $(kubectl get pod -l app.kubernetes.io/component=web -n corelyx -o jsonpath='{.items[0].metadata.name}') \
  -n corelyx -- wget -qO- http://localhost:3000/
```

## Scaling

```bash
# Manual scaling
kubectl scale deployment corelyx-web --replicas=5 -n corelyx
kubectl scale deployment corelyx-runtime --replicas=3 -n corelyx

# HPA is enabled by default in values.yaml
kubectl get hpa -n corelyx
```

## Upgrading

```bash
# Pull latest chart
git pull origin main

# Upgrade release
helm upgrade corelyx ./helm/corelyx -n corelyx -f values-production.yaml

# Rollback if needed
helm rollback corelyx -n corelyx
```
