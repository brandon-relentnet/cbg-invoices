#!/usr/bin/env python3
"""
Bootstrap the Cambridge Invoice Portal registration in a fresh self-hosted Logto.

Prereq: a Machine-to-Machine application has been created in the Logto admin
console (http://localhost:3002) with Management API access, and its client
ID/secret have been pasted into .env as:
    LOGTO_M2M_APP_ID
    LOGTO_M2M_APP_SECRET

This script:
  1. Authenticates to the Logto Management API via client credentials.
  2. Creates (idempotently) a SPA application "Cambridge Invoice Portal".
  3. Creates (idempotently) an API resource "Invoice API".
  4. Writes the resulting LOGTO_APP_ID and LOGTO_RESOURCE to .env.logto.

Run:
    make logto-setup
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import httpx

# Import settings lazily so we can print friendly errors if env is missing.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

SPA_APP_NAME = "Cambridge Invoice Portal"
API_RESOURCE_NAME = "Invoice API"
# Management API indicator for self-hosted Logto (no tenant prefix).
MGMT_API_RESOURCE = "https://default.logto.app/api"


def env(key: str, default: str | None = None) -> str:
    val = os.environ.get(key, default)
    if val is None:
        print(f"ERROR: environment variable {key} is not set.", file=sys.stderr)
        sys.exit(1)
    return val


def info(msg: str) -> None:
    print(f"\033[36m→\033[0m {msg}")


def ok(msg: str) -> None:
    print(f"\033[32m✓\033[0m {msg}")


def warn(msg: str) -> None:
    print(f"\033[33m!\033[0m {msg}")


async def get_mgmt_token(client: httpx.AsyncClient, endpoint: str, app_id: str, secret: str) -> str:
    """Exchange M2M credentials for a Management API access token."""
    resp = await client.post(
        f"{endpoint}/oidc/token",
        data={
            "grant_type": "client_credentials",
            "resource": MGMT_API_RESOURCE,
            "scope": "all",
        },
        auth=(app_id, secret),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if resp.status_code != 200:
        print(f"Failed to get Management API token: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)
    return resp.json()["access_token"]


async def find_application(
    client: httpx.AsyncClient, endpoint: str, token: str, name: str
) -> dict | None:
    resp = await client.get(
        f"{endpoint}/api/applications",
        params={"page_size": 100},
        headers={"Authorization": f"Bearer {token}"},
    )
    resp.raise_for_status()
    for app in resp.json():
        if app.get("name") == name:
            return app
    return None


async def create_spa_application(
    client: httpx.AsyncClient,
    endpoint: str,
    token: str,
    app_base_url: str,
) -> dict:
    payload = {
        "name": SPA_APP_NAME,
        "description": "Internal AP portal for Cambridge Building Group.",
        "type": "SPA",
        "oidcClientMetadata": {
            "redirectUris": [f"{app_base_url}/callback"],
            "postLogoutRedirectUris": [app_base_url],
        },
        "customClientMetadata": {
            "corsAllowedOrigins": [app_base_url],
            "alwaysIssueRefreshToken": True,
            "rotateRefreshToken": True,
        },
    }
    resp = await client.post(
        f"{endpoint}/api/applications",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
    )
    if resp.status_code not in (200, 201):
        print(f"Failed to create SPA app: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)
    return resp.json()


async def find_resource(
    client: httpx.AsyncClient, endpoint: str, token: str, name: str
) -> dict | None:
    resp = await client.get(
        f"{endpoint}/api/resources",
        headers={"Authorization": f"Bearer {token}"},
    )
    resp.raise_for_status()
    for r in resp.json():
        if r.get("name") == name:
            return r
    return None


async def create_resource(
    client: httpx.AsyncClient,
    endpoint: str,
    token: str,
    indicator: str,
) -> dict:
    resp = await client.post(
        f"{endpoint}/api/resources",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "name": API_RESOURCE_NAME,
            "indicator": indicator,
            "accessTokenTtl": 3600,
        },
    )
    if resp.status_code not in (200, 201):
        print(f"Failed to create resource: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)
    return resp.json()


async def configure_sign_in_experience(
    client: httpx.AsyncClient, endpoint: str, token: str
) -> None:
    """Force email-first sign-up with no password requirement.

    Without this Logto's default SIE requires a *username* identifier on
    sign-up — which means a freshly invited user clicking a magic link gets
    bounced through a username/password prompt instead of the seamless
    one-time-token flow.
    """
    body = {
        "signUp": {
            "identifiers": ["email"],
            "password": False,
            "verify": True,
            "secondaryIdentifiers": [],
        },
    }
    resp = await client.patch(
        f"{endpoint}/api/sign-in-exp",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=body,
    )
    if resp.status_code >= 400:
        print(
            f"Failed to update sign-in experience: {resp.status_code} {resp.text}",
            file=sys.stderr,
        )
        sys.exit(1)


def write_env_logto(app_id: str, resource_indicator: str) -> Path:
    """Write generated values so the user can append them to .env."""
    out = Path(".env.logto")
    out.write_text(
        f"""# Generated by scripts/logto_setup.py — append these to your .env
LOGTO_APP_ID={app_id}
LOGTO_RESOURCE={resource_indicator}

VITE_LOGTO_APP_ID={app_id}
VITE_LOGTO_RESOURCE={resource_indicator}
"""
    )
    return out


async def main() -> None:
    # For server-to-server calls we use LOGTO_INTERNAL_URL (in Docker dev:
    # http://logto:3001), falling back to LOGTO_ENDPOINT for production
    # where the URL is the same either way.
    endpoint = (
        os.environ.get("LOGTO_INTERNAL_URL") or env("LOGTO_ENDPOINT")
    ).rstrip("/")
    m2m_id = env("LOGTO_M2M_APP_ID")
    m2m_secret = env("LOGTO_M2M_APP_SECRET")
    resource_indicator = os.environ.get("LOGTO_RESOURCE") or "https://invoice-api.cambridgebg.com"
    app_base_url = env("APP_BASE_URL", "http://localhost:5173")

    if not m2m_id or not m2m_secret:
        print(
            "LOGTO_M2M_APP_ID and LOGTO_M2M_APP_SECRET must be set.\n"
            "Create an M2M app with Management API access in the Logto admin console\n"
            f"({env('LOGTO_ADMIN_ENDPOINT', 'http://localhost:3002')}) and paste the\n"
            "credentials into .env, then rerun this script.",
            file=sys.stderr,
        )
        sys.exit(1)

    async with httpx.AsyncClient(timeout=30.0) as client:
        info(f"Authenticating to Logto Management API at {endpoint}…")
        token = await get_mgmt_token(client, endpoint, m2m_id, m2m_secret)
        ok("Management API authenticated")

        # SPA Application
        existing = await find_application(client, endpoint, token, SPA_APP_NAME)
        if existing:
            warn(f"SPA application already exists (id: {existing['id']})")
            app = existing
        else:
            info(f"Creating SPA application: {SPA_APP_NAME}")
            app = await create_spa_application(client, endpoint, token, app_base_url)
            ok(f"Created SPA application (id: {app['id']})")

        # API Resource
        existing_res = await find_resource(client, endpoint, token, API_RESOURCE_NAME)
        if existing_res:
            warn(f"API resource already exists (indicator: {existing_res['indicator']})")
            resource = existing_res
        else:
            info(f"Creating API resource: {API_RESOURCE_NAME} ({resource_indicator})")
            resource = await create_resource(client, endpoint, token, resource_indicator)
            ok(f"Created API resource (indicator: {resource['indicator']})")

        # Sign-in experience: email-first sign-up so magic-link invites work
        info("Configuring sign-in experience (email-first sign-up)…")
        await configure_sign_in_experience(client, endpoint, token)
        ok("Sign-in experience configured")

    out_path = write_env_logto(app["id"], resource["indicator"])

    print("")
    print("─" * 60)
    print("  Append these values to your .env (or use the generated file):")
    print("─" * 60)
    print(f"  LOGTO_APP_ID={app['id']}")
    print(f"  LOGTO_RESOURCE={resource['indicator']}")
    print(f"  VITE_LOGTO_APP_ID={app['id']}")
    print(f"  VITE_LOGTO_RESOURCE={resource['indicator']}")
    print("─" * 60)
    print(f"  Written to: {out_path.resolve()}")
    print("")
    print("  Next:")
    print("    1. cat .env.logto >> .env")
    print("    2. make restart")
    print("    3. Open http://localhost:3002 and create at least one user.")
    print("    4. Sign in at http://localhost:5173")
    print("")


if __name__ == "__main__":
    asyncio.run(main())
