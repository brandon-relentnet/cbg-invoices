# Cambridge Invoice Portal

Internal AP portal for Cambridge Building Group. Receives vendor invoices via
email or upload, extracts fields with Claude vision, routes them through PM
review, and posts approved invoices as Bills to QuickBooks Online with the
PDF attached and the project tagged.

## Stack

- **Backend**: FastAPI (async), SQLAlchemy 2.x, PostgreSQL 16, Alembic
- **Frontend**: React 19 + Vite, Tailwind v4, TanStack Router/Query, Motion
- **Auth**: [Logto](https://logto.io) (self-hosted in the compose stack)
- **Storage**: Cloudflare R2
- **Email intake**: Postmark Inbound
- **Deploy**: Docker Compose on Coolify

## Quick Start (Local)

```bash
cp .env.example .env
# Fill in the secrets you have (ANTHROPIC_API_KEY, R2_*, POSTMARK_*, QBO_*)
docker compose up -d
```

Then:

1. Open **http://localhost:3002** — Logto admin console. Create the initial
   admin account (one-time, takes ~90s).
2. In Logto admin: create a Machine-to-Machine application with Management API
   access. Copy its app ID and secret into `.env` as `LOGTO_M2M_APP_ID` and
   `LOGTO_M2M_APP_SECRET`.
3. Run:
   ```bash
   make logto-setup
   ```
   This will create the SPA app registration and the API resource.
   Append the printed `LOGTO_APP_ID` and `LOGTO_RESOURCE` values to `.env`.
4. `make restart`
5. Open **http://localhost:5173** — the portal. Log in via Logto.

## Services

| Service    | Port (dev) | Purpose                            |
|------------|-----------|------------------------------------|
| postgres   | 5432      | App + Logto databases (separate)   |
| logto      | 3001/3002 | User-facing / admin console        |
| backend    | 8000      | FastAPI                            |
| frontend   | 5173      | Vite dev server                    |

## Make Targets

```bash
make up              # Start all services
make down            # Stop and remove containers
make restart         # Restart backend + frontend
make logs            # Tail all logs
make migrate         # Run alembic migrations
make logto-setup     # Bootstrap Logto app registration
make shell           # Open shell in backend container
make test            # Run backend tests
make migration msg="add foo"  # Create a new migration
```

## Build Order

See the project specification. Phases 1-10 are committed independently.

## Deployment

See [DEPLOY.md](./DEPLOY.md) for the Coolify walkthrough.

## License

Proprietary — Cambridge Building Group.
