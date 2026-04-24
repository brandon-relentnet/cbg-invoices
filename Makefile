.PHONY: up down restart logs migrate logto-setup logto-css shell test build fe-shell

up:
	docker compose up -d

down:
	docker compose down

restart:
	# Force-recreate picks up .env changes (plain restart doesn't re-read env_file)
	docker compose up -d --force-recreate --no-deps backend frontend

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-frontend:
	docker compose logs -f frontend

logs-logto:
	docker compose logs -f logto

migrate:
	docker compose exec backend alembic upgrade head

migration:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

logto-setup:
	# Recreate the backend so it picks up the latest .env values
	# (docker compose restart does NOT re-read env_file)
	docker compose up -d --force-recreate --no-deps backend
	@sleep 2
	docker compose exec backend python scripts/logto_setup.py

logto-css:
	# Apply Cambridge branding to Logto's hosted sign-in UI via the
	# Management API's Custom CSS feature.
	docker compose exec backend python scripts/apply_logto_css.py

shell:
	docker compose exec backend /bin/bash

fe-shell:
	docker compose exec frontend /bin/sh

test:
	docker compose exec backend pytest

build:
	docker compose build

rebuild:
	docker compose build --no-cache

ps:
	docker compose ps
