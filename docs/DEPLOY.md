# Deploying to AWS

A step-by-step guide. It assumes an AWS account, the AWS CLI signed in to it,
Docker, and a domain. Replace these everywhere below:

| Placeholder | Example                                         |
| ----------- | ----------------------------------------------- |
| `<domain>`  | `loomapp.in`                                    |
| `<account>` | your 12-digit AWS account id                    |
| `<region>`  | `ap-south-1` (Mumbai, closest to the factories) |

## What you end up with

```
app.<domain>  ──►  CloudFront  ──►  S3             (the web app: static files)
api.<domain>  ──►  Load balancer ──► ECS Fargate   (the API container)
                                        │
                                        ▼
                                   RDS PostgreSQL  (private, not on the internet)
```

Both addresses sit under one domain on purpose. The login cookie is
`SameSite=Lax`, which a browser only sends between addresses on the same site:
`app.<domain>` and `api.<domain>` are, a CloudFront address and an AWS load
balancer address would not be.

**Rough cost** with no customers yet: about $40–50 a month (load balancer,
one small Fargate task, a `db.t4g.micro` database). Check the AWS pricing
calculator for today's numbers. The containers run in public subnets with a
security group that only lets the load balancer in, which avoids a NAT
gateway (another ~$32 a month).

---

## 1. Database

RDS → Create database:

- PostgreSQL 17, template **Free tier** or **Production** as you prefer
- Instance `db.t4g.micro`, 20 GB gp3, storage autoscaling on
- Master username `loom`, a long generated password — **save it**
- **Public access: No**
- New security group `loom-db` (you'll open it to the API in step 4)
- Initial database name: `loom`
- Automated backups **7 days**, encryption on, **deletion protection on**

## 2. Secrets

Secrets Manager → Store a new secret → Other type → plaintext, one secret each:

| Name                | Value                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| `loom/database-url` | `postgresql://loom:<password>@<rds-endpoint>:5432/loom?sslmode=require` |
| `loom/auth-secret`  | output of `openssl rand -base64 32`                                     |

These never go in the image or the repo.

## 3. The API images

There are two: `loom-api` runs the server, `loom-api-migrate` only updates the
database tables before a release. The migration tool is big and the server
never needs it, so it lives in its own image.

```bash
aws ecr create-repository --repository-name loom-api --region <region>
```

```bash
aws ecr create-repository --repository-name loom-api-migrate --region <region>
```

```bash
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
```

From the repo root:

```bash
docker build -f apps/api/Dockerfile -t <account>.dkr.ecr.<region>.amazonaws.com/loom-api:v1 .
```

```bash
docker build -f apps/api/Dockerfile --target migrate -t <account>.dkr.ecr.<region>.amazonaws.com/loom-api-migrate:v1 .
```

```bash
docker push <account>.dkr.ecr.<region>.amazonaws.com/loom-api:v1
```

```bash
docker push <account>.dkr.ecr.<region>.amazonaws.com/loom-api-migrate:v1
```

Tag each release with a new version (`v2`, `v3`…) rather than reusing `latest`,
so you always know what is running and can roll back.

## 4. Certificates

Certificate Manager, **two** certificates, both validated by DNS:

- `api.<domain>` in **`<region>`** — for the load balancer
- `app.<domain>` in **`us-east-1`** — CloudFront only accepts certificates from
  that region, wherever your users are

## 5. Load balancer and the API service

**Security groups**

- `loom-alb`: inbound 443 from anywhere
- `loom-api`: inbound 3001 **from `loom-alb` only**
- `loom-db`: inbound 5432 **from `loom-api` only**

**Target group**: type IP, protocol HTTP, port 3001, health check path
`/health`.

**Load balancer**: Application, internet-facing, public subnets, security group
`loom-alb`. Listener HTTPS:443 with the `api.<domain>` certificate, forwarding
to the target group. Add HTTP:80 redirecting to HTTPS.

**ECS**: create a cluster (Fargate). Task definition:

- 0.25 vCPU, 0.5 GB, Linux/X86_64
- Image `<account>.dkr.ecr.<region>.amazonaws.com/loom-api:v1`, port 3001
- Log driver `awslogs`, group `/ecs/loom-api`
- Environment:

| Name         | Value                  |
| ------------ | ---------------------- |
| `NODE_ENV`   | `production`           |
| `PORT`       | `3001`                 |
| `AUTH_URL`   | `https://api.<domain>` |
| `WEB_ORIGIN` | `https://app.<domain>` |

- Secrets (from Secrets Manager): `DATABASE_URL` ← `loom/database-url`,
  `AUTH_SECRET` ← `loom/auth-secret`. The task's execution role needs
  permission to read those two secrets.

Service: 1 task, public subnets, **assign public IP on** (to pull the image
without a NAT gateway), security group `loom-api`, attached to the target group.

Don't start real traffic until step 6 has run.

## 6. Set up the database

The tables are created by the migrate image. Make a second task definition,
`loom-migrate`: same size, log group and `DATABASE_URL` secret as the API one,
image `<account>.dkr.ecr.<region>.amazonaws.com/loom-api-migrate:v1`, no port,
no other environment.

ECS → Clusters → Run new task → `loom-migrate`, public subnets, public IP on,
security group `loom-api` (so the database lets it in). It runs, logs
`All migrations have been successfully applied.` and stops.

## 7. Your super admin account

Another one-off task, overriding the command and adding one environment
variable for this run only:

- Command: `["node", "dist/create-super-admin.js", "you@<domain>", "Your Name"]`
- Environment: `SUPER_ADMIN_PASSWORD` = a long password you choose

In production the script refuses to make up a password, because anything it
printed would sit in the logs. Sign in with it at `https://app.<domain>`.

## 8. The web app

S3: a **private** bucket, say `loom-web-<domain>`, all public access blocked.

Build with the API address baked in, from the repo root:

```bash
VITE_API_URL=https://api.<domain> pnpm -F @loom/web build
```

Upload. Everything with a hash in its name can be cached for a year; the files
that name those hashes must never be cached, or phones keep an old app:

```bash
aws s3 sync apps/web/dist s3://loom-web-<domain> --delete --cache-control "public,max-age=31536000,immutable" --exclude index.html --exclude sw.js --exclude registerSW.js --exclude manifest.webmanifest
```

```bash
aws s3 cp apps/web/dist s3://loom-web-<domain> --recursive --exclude "*" --include index.html --include sw.js --include registerSW.js --include manifest.webmanifest --cache-control "no-cache"
```

**CloudFront** distribution:

- Origin: the bucket, with **Origin Access Control** (let CloudFront update the
  bucket policy)
- Alternate domain `app.<domain>`, the `us-east-1` certificate
- Viewer protocol: redirect HTTP to HTTPS
- Default root object `index.html`
- Custom error responses: **403 and 404 → `/index.html`, response code 200**.
  The app handles its own routes, so `/looms` must load `index.html`.

## 9. DNS

- `app.<domain>` → the CloudFront distribution (alias/CNAME)
- `api.<domain>` → the load balancer (alias/CNAME)

On Route 53, use alias records. At another registrar, CNAMEs.

## 10. Check it

- `https://api.<domain>/health` → `{"ok":true,...}`
- `https://app.<domain>` loads, you can register a test factory and sign in
- **The service worker check that couldn't be done locally**: open
  `https://app.<domain>` in Chrome, DevTools → Application → Service Workers
  should show it _activated and running_. Then Network → Offline and reload:
  the app should still open. On an Android phone, Chrome's menu should offer
  **Install app**.

---

## Releasing a new version

Order matters: the database first, then the code that needs it.

1. Build and push both images with a new tag (step 3).
2. Point `loom-migrate` at the new migrate tag and run it (step 6).
3. Update the ECS service to a task definition using the new tag.
4. Build and upload the web app (step 8), then invalidate CloudFront:

```bash
aws cloudfront create-invalidation --distribution-id <id> --paths "/index.html" "/sw.js" "/registerSW.js" "/manifest.webmanifest"
```

Migrations only ever add; if a release has to be rolled back, point the
service back at the previous image tag.

## Backups and monitoring

- RDS keeps 7 days of automated backups and can restore to any point in them.
  Take a manual snapshot before any risky migration.
- Logs: CloudWatch → `/ecs/loom-api`.
- Worth adding: a CloudWatch alarm on the target group's `UnHealthyHostCount`
  above 0, and on the load balancer's 5xx count, sent to your email.
