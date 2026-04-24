# Deploying Cambridge Invoice Portal on Coolify

This walks through deploying the full stack to an existing Coolify-managed VPS.
The stack is 4 services: **postgres**, **logto**, **backend**, **frontend**,
defined by `docker-compose.yml` + `docker-compose.prod.yml`.

## Prerequisites

- A Coolify instance running and connected to this Git repository.
- Three subdomains configured with DNS:
  - `invoices.cambridgebg.com` — frontend (the portal itself)
  - `invoices-api.cambridgebg.com` — backend (FastAPI)
  - `auth.cambridgebg.com` — Logto user-facing endpoint
  - `auth-admin.cambridgebg.com` — Logto admin console (access should be IP-restricted)
- Cloudflare R2 bucket created (`cambridge-invoices` or similar).
- Anthropic API key.
- QuickBooks Online developer app (production keys when ready; sandbox until then).
- Postmark Inbound webhook server set up.

## Step 1 — Create the Coolify application

1. Coolify → **+ New Resource → Docker Compose**.
2. Point it at this Git repository, branch `main`.
3. For the Compose file, specify both files:
   ```
   docker-compose.yml
   docker-compose.prod.yml
   ```
   Coolify merges them — the `prod.yml` file removes port mappings and adds
   `restart: unless-stopped`.
4. Save.

## Step 2 — Configure environment variables in Coolify

Coolify → your app → **Environment Variables**. Paste in the following (adjust
domains and secrets):

```bash
# ---- App ----
APP_ENV=production
APP_BASE_URL=https://invoices.cambridgebg.com
BACKEND_BASE_URL=https://invoices-api.cambridgebg.com

# ---- Database ----
POSTGRES_USER=invoice
POSTGRES_PASSWORD=<generate a 40+ char random string>
POSTGRES_DB=invoice_portal
DATABASE_URL=postgresql+asyncpg://invoice:<same-password>@postgres:5432/invoice_portal

# ---- Logto ----
LOGTO_ENDPOINT=https://auth.cambridgebg.com
LOGTO_ADMIN_ENDPOINT=https://auth-admin.cambridgebg.com
LOGTO_M2M_APP_ID=           # filled after Step 4
LOGTO_M2M_APP_SECRET=       # filled after Step 4
LOGTO_APP_ID=               # filled after Step 4
LOGTO_RESOURCE=https://invoices-api.cambridgebg.com

# Frontend build-time env
VITE_LOGTO_ENDPOINT=https://auth.cambridgebg.com
VITE_LOGTO_APP_ID=          # filled after Step 4
VITE_LOGTO_RESOURCE=https://invoices-api.cambridgebg.com
VITE_API_BASE_URL=https://invoices-api.cambridgebg.com

# ---- Anthropic ----
ANTHROPIC_API_KEY=<your key>
EXTRACTION_MODEL=claude-sonnet-4-5

# ---- Cloudflare R2 ----
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<access key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET=cambridge-invoices
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com

# ---- Postmark ----
POSTMARK_WEBHOOK_SECRET=<generate a 32+ char random string>

# ---- QuickBooks Online (start in sandbox) ----
QBO_CLIENT_ID=<dev app client id>
QBO_CLIENT_SECRET=<dev app client secret>
QBO_ENVIRONMENT=sandbox
QBO_REDIRECT_URI=https://invoices-api.cambridgebg.com/api/qbo/callback
QBO_DEFAULT_EXPENSE_ACCOUNT_ID=
```

> **IMPORTANT:** `VITE_*` variables are compiled into the frontend bundle at
> build time. Any change requires a rebuild, not just a restart.

## Step 3 — Route the subdomains

In Coolify, set up one **Service Proxy / Domain** entry per service:

| Container | Domain                                | Internal Port |
|-----------|---------------------------------------|---------------|
| frontend  | `invoices.cambridgebg.com`            | 80            |
| backend   | `invoices-api.cambridgebg.com`        | 8000          |
| logto     | `auth.cambridgebg.com`                | 3001          |
| logto     | `auth-admin.cambridgebg.com`          | 3002          |

Coolify will issue Let's Encrypt certificates automatically for each.

Add Basic Auth or IP allowlisting to `auth-admin.cambridgebg.com` through
Coolify's proxy settings — it's an admin panel and should not be publicly
browsable.

## Step 4 — First boot and Logto bootstrap

1. Deploy. Wait for postgres, logto, backend, and frontend to report healthy.
2. Visit **https://auth-admin.cambridgebg.com**. Create the initial Logto
   admin account (90 seconds, one-time).
3. In Logto admin:
   - **Applications → Create Application → Machine-to-Machine**.
   - Name: *Bootstrap*. Assign the *Logto Management API* role.
   - Copy the app ID and secret into Coolify env vars:
     - `LOGTO_M2M_APP_ID`
     - `LOGTO_M2M_APP_SECRET`
   - Save env vars and **redeploy** (Coolify → Redeploy).
4. Open a shell in the backend container (Coolify → Terminal or
   `docker exec -it <backend> bash`) and run:
   ```bash
   python scripts/logto_setup.py
   ```
   Copy the printed `LOGTO_APP_ID` and `LOGTO_RESOURCE` values into Coolify env
   (plus their `VITE_*` mirrors). **Redeploy** so the frontend is rebuilt with
   the new `VITE_LOGTO_APP_ID`.
5. In Logto admin → Users → Add user. Create a Project Manager account. They
   will use this to log in.

## Step 5 — Configure QuickBooks Online

1. In the Intuit developer portal, add your **production** redirect URI:
   `https://invoices-api.cambridgebg.com/api/qbo/callback`
2. In the portal, go to **Settings → Connect to QuickBooks Online**.
3. Authorize the Cambridge QBO company.
4. Pick the **default expense account** (this is where bills post).
5. Click **Sync vendors** and **Sync projects**.

## Step 6 — Configure Postmark Inbound

1. In Postmark, open your inbound server and set the webhook URL to:
   ```
   https://anything:<POSTMARK_WEBHOOK_SECRET>@invoices-api.cambridgebg.com/api/webhooks/postmark
   ```
   (Basic Auth; the username before the colon is ignored. The password must
   match `POSTMARK_WEBHOOK_SECRET`.)
2. Send a test email with a PDF attachment. An invoice should appear in the
   queue within a few seconds.

## Rotating Secrets

Secrets live exclusively in Coolify env vars. To rotate:

| Secret                  | How                                                   |
|-------------------------|-------------------------------------------------------|
| `ANTHROPIC_API_KEY`     | Update env var → Redeploy. No other steps.            |
| `R2_SECRET_ACCESS_KEY`  | Update env var → Redeploy.                            |
| `POSTMARK_WEBHOOK_SECRET` | Update env var → Redeploy. Update Postmark webhook URL. |
| `QBO_CLIENT_SECRET`     | Update env var → Redeploy. Disconnect + reconnect in Settings. |
| `POSTGRES_PASSWORD`     | Rotate carefully — must update both services' env + restart postgres first. Consider a scheduled maintenance window. |
| `LOGTO_M2M_APP_SECRET`  | Regenerate in Logto admin → paste new secret → Redeploy. |

## Switching QBO from Sandbox to Production

1. In the Intuit developer portal, get the **Production** client ID/secret.
2. Update `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, and flip `QBO_ENVIRONMENT=production`.
3. Redeploy.
4. In the portal → Settings → **Disconnect**, then **Connect** again — this
   time authorize the real Cambridge QBO company.
5. Re-sync vendors and projects.

## Backups

Coolify takes volume snapshots of `pgdata`. Configure the retention under
**Storage → Volumes → pgdata**. Additionally:

- **R2**: enable object versioning on the `cambridge-invoices` bucket.
- **Database**: consider a nightly `pg_dump` to a separate location for
  off-site disaster recovery (Cambridge policy should dictate frequency).

## Health Checks and Observability

- Backend: `GET /api/health` returns `{ status, db }`. Use this as Coolify's
  health check.
- Logs: `docker compose logs -f backend` or through Coolify's log viewer.
- Structured errors in extraction and QBO posting land in `audit_logs` with
  the full error message — query `/api/audit?action=extraction_failed` or
  `action=qbo_post_failed`.

## Troubleshooting

**Frontend shows "Invalid redirect URI" after login.**
Logto's SPA app's Redirect URIs must include `${APP_BASE_URL}/callback`.
Re-run `python scripts/logto_setup.py` — it's idempotent.

**"QBO is not connected" even though I connected.**
If you rotated `QBO_CLIENT_SECRET`, existing tokens are invalidated.
Disconnect and reconnect in Settings.

**Postmark webhook returns 401.**
Verify the password component of the webhook URL exactly matches
`POSTMARK_WEBHOOK_SECRET`. URL-encode any special characters.

**Extraction returns blank fields.**
Check `audit_logs` for `extraction_failed`. The PDF might be a scan of poor
quality or encrypted. Click **Re-extract** in the review page to retry.
