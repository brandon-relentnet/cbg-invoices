# Cambridge Invoice Portal

Internal AP portal for Cambridge Building Group. Receives vendor invoices via
email or manual upload, extracts fields with Claude vision, routes them through
PM review, and posts approved invoices as **Bills** to QuickBooks Online with
the PDF attached and the project tagged.

## Stack

- **Backend**: FastAPI (async), SQLAlchemy 2.x, PostgreSQL 16, Alembic
- **Frontend**: React 19 + Vite, Tailwind v4, TanStack Router/Query, Motion
- **Auth**: [Logto](https://logto.io) (self-hosted in the compose stack)
- **Extraction**: Anthropic Claude (`claude-sonnet-4-5`) with vision
- **Storage**: Cloudflare R2 (S3-compatible)
- **Email intake**: Postmark Inbound webhook
- **Deploy**: Docker Compose on Coolify

## Quick Start (Local)

### 1. Copy and fill in environment

```bash
cp .env.example .env
```

Fill in the secrets you have — **at minimum**:
- `POSTGRES_PASSWORD` (any strong value)
- `ANTHROPIC_API_KEY` (from https://console.anthropic.com)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
  `R2_ENDPOINT` (from Cloudflare R2 dashboard)

You can leave `POSTMARK_WEBHOOK_SECRET` and `QBO_*` blank and wire them up
later — the portal will still start and you can upload PDFs manually.

### 2. Start the stack

```bash
docker compose up -d
```

All four services (postgres, logto, backend, frontend) will boot. Backend
will run migrations automatically.

### 3. Bootstrap Logto (one-time, ~2 minutes)

1. Open **http://localhost:3002** — Logto admin console. Create the initial
   admin account (takes ~90 seconds).
2. In the admin console, go to **Applications → Create Application** and
   create a Machine-to-Machine app called *Bootstrap*. Assign the "Logto
   Management API" role. Copy the app ID and secret into `.env`:
   ```
   LOGTO_M2M_APP_ID=xxx
   LOGTO_M2M_APP_SECRET=xxx
   ```
3. Run:
   ```bash
   make logto-setup
   ```
   This creates the SPA application and API resource. It will print something
   like:
   ```
   LOGTO_APP_ID=abc123
   LOGTO_RESOURCE=https://invoice-api.cambridgebg.com
   ```
   Append those to `.env` (or copy from the generated `.env.logto` file).
4. Restart so the new env is picked up:
   ```bash
   make restart
   ```
5. In Logto admin, **create at least one user** (Users → Add user) so you can
   log in. Alternatively enable a social connector.

### 4. Log in

Open **http://localhost:5173** — the portal redirects you through Logto's
sign-in page, then lands on `/invoices`.

### 5. Connect QuickBooks Online

1. Create a QBO developer app at https://developer.intuit.com/app/developer/myapps
2. Add `http://localhost:8000/api/qbo/callback` as a redirect URI.
3. Copy the Client ID and Client Secret into `.env` as `QBO_CLIENT_ID` /
   `QBO_CLIENT_SECRET`. Keep `QBO_ENVIRONMENT=sandbox` until production cut-over.
4. Restart: `make restart`.
5. In the portal, open **Settings → Connect to QuickBooks Online**, authorize
   your sandbox company, then pick a default expense account and sync vendors
   + projects.

### 6. (Optional) Configure inbound email

Set up Postmark Inbound:
- Create a Postmark server, enable inbound, and point the webhook URL at:
  `https://<user>:<POSTMARK_WEBHOOK_SECRET>@your-backend.example.com/api/webhooks/postmark`
  (Basic Auth; the `<user>` part is ignored and just needs to be present.)
- Set `POSTMARK_WEBHOOK_SECRET` in `.env`.
- Forward a vendor invoice PDF to your Postmark inbound address — an Invoice
  appears in the queue within a few seconds.

## Services

| Service    | Port (dev) | Purpose                            |
|------------|-----------|------------------------------------|
| postgres   | 5432      | App + Logto databases (separate)   |
| logto      | 3001      | Logto user-facing (sign-in, OIDC)  |
| logto      | 3002      | Logto admin console                |
| backend    | 8000      | FastAPI                            |
| frontend   | 5173      | Vite dev server                    |

## Make Targets

```bash
make up              # Start all services
make down            # Stop and remove containers
make restart         # Restart backend + frontend (env changes)
make logs            # Tail all logs
make logs-backend    # Tail only backend
make migrate         # Run alembic upgrade head
make logto-setup     # Bootstrap Logto app registration
make shell           # Open shell in backend container
make test            # Run backend pytest
make migration msg="add foo"  # Create a new alembic revision
```

## Repository Layout

```
cambridge-invoice-portal/
├── backend/                 # FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── models/          # SQLAlchemy ORM
│   │   ├── schemas/         # Pydantic DTOs
│   │   ├── routers/         # HTTP endpoints
│   │   ├── services/        # Business logic (extraction, QBO, storage, audit)
│   │   ├── prompts/         # LLM prompts (invoice_extraction)
│   │   ├── config.py        # pydantic-settings
│   │   └── main.py          # FastAPI app factory
│   ├── alembic/             # Migrations
│   └── scripts/             # logto_setup.py
├── frontend/                # React 19 + Vite
│   ├── src/
│   │   ├── routes/          # TanStack Router flat-file routes
│   │   ├── components/      # layout/, invoices/, ui/
│   │   ├── lib/             # API client, hooks, formatters
│   │   └── assets/css/      # Tailwind v4 @theme + utilities
│   └── nginx.conf           # Prod static serving
├── infra/
│   └── postgres-init/       # Creates logto DB on first boot
├── docker-compose.yml       # Dev
├── docker-compose.prod.yml  # Coolify override
└── Makefile
```

## Key Design Decisions

- **Money as integers (cents).** Never floats. Conversion only at the display edge.
- **Audit everything.** Every status transition, edit, QBO call recorded in
  `audit_logs` with before/after diffs.
- **Idempotency.** Postmark webhook dedups on MessageID. Approval is safe to
  retry — QBO bill creation skips if `qbo_bill_id` is already set and only
  re-attempts the attachment.
- **Background jobs via `BackgroundTasks`.** No Redis/Celery — volume is low
  enough (~dozens of invoices/day) that FastAPI's built-in suffices.
- **No secrets in frontend.** LLM calls server-side only; R2 URLs are
  presigned (15-min TTL) by the backend.

## Deployment

See [DEPLOY.md](./DEPLOY.md) for the Coolify walkthrough.

## License

Proprietary — Cambridge Building Group.
