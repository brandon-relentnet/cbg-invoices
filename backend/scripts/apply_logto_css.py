"""Apply the Cambridge brand theme to Logto's hosted sign-in UI.

Patches the sign-in experience config:
- color.primaryColor → amber (Logto uses this for accents in places our
  CSS can't reach, like favicon overlays and email templates).
- customCss → contents of scripts/logto-theme/cambridge.css.

Idempotent — re-running produces the same state.

Run from the monorepo root:
    make logto-css
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import httpx

# Allow `python scripts/apply_logto_css.py` to find the `app` package
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.services.logto_admin import _get_mgmt_token  # noqa: E402

THEME_DIR = Path(__file__).parent / "logto-theme"
CSS_FILE = THEME_DIR / "cambridge.css"

# Cambridge palette
PRIMARY_COLOR = "#c8923c"      # amber
DARK_PRIMARY_COLOR = "#d39d4a"  # slightly lighter amber for dark mode


async def main() -> int:
    settings = get_settings()
    if not settings.logto_m2m_app_id or not settings.logto_m2m_app_secret:
        print(
            "✖ LOGTO_M2M_APP_ID / LOGTO_M2M_APP_SECRET must be set in .env "
            "before applying CSS.",
            file=sys.stderr,
        )
        return 1

    if not CSS_FILE.exists():
        print(f"✖ CSS file not found: {CSS_FILE}", file=sys.stderr)
        return 1

    css_content = CSS_FILE.read_text()
    print(f"→ Loaded {len(css_content):,} bytes of CSS from {CSS_FILE.name}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        token = await _get_mgmt_token(client)

        body = {
            "color": {
                "primaryColor": PRIMARY_COLOR,
                "darkPrimaryColor": DARK_PRIMARY_COLOR,
                "isDarkModeEnabled": False,
            },
            "customCss": css_content,
        }

        url = f"{settings.logto_internal_endpoint}/api/sign-in-exp"
        r = await client.patch(
            url,
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )

        if r.status_code >= 400:
            print(f"✖ PATCH {url} → {r.status_code}", file=sys.stderr)
            print(r.text, file=sys.stderr)
            return 1

    print("✓ Cambridge theme applied to Logto sign-in experience.")
    print(f"  Primary color: {PRIMARY_COLOR}")
    print(f"  Custom CSS:    {len(css_content):,} bytes")
    print()
    print(f"  Test at: {settings.logto_endpoint}/sign-in")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
