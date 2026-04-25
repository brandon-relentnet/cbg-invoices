# Local-development targets. Compose two files: the production-default
# docker-compose.yml plus the dev override (port mappings, source mounts,
# dev build targets, env_file from .env).
COMPOSE := docker compose -f docker-compose.yml -f docker-compose.dev.yml

.PHONY: up down restart logs migrate logto-setup logto-css shell test build fe-shell ps rebuild migration logs-backend logs-frontend logs-logto

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

restart:
	# Force-recreate picks up .env changes (plain restart doesn't re-read env_file)
	$(COMPOSE) up -d --force-recreate --no-deps backend frontend

logs:
	$(COMPOSE) logs -f

logs-backend:
	$(COMPOSE) logs -f backend

logs-frontend:
	$(COMPOSE) logs -f frontend

logs-logto:
	$(COMPOSE) logs -f logto

migrate:
	$(COMPOSE) exec backend alembic upgrade head

migration:
	$(COMPOSE) exec backend alembic revision --autogenerate -m "$(msg)"

logto-setup:
	# Recreate the backend so it picks up the latest .env values
	# (docker compose restart does NOT re-read env_file)
	$(COMPOSE) up -d --force-recreate --no-deps backend
	@sleep 2
	$(COMPOSE) exec backend python scripts/logto_setup.py

logto-css:
	# Apply Cambridge branding to Logto's hosted sign-in UI via the
	# Management API's Custom CSS feature.
	$(COMPOSE) exec backend python scripts/apply_logto_css.py

shell:
	$(COMPOSE) exec backend /bin/bash

fe-shell:
	$(COMPOSE) exec frontend /bin/sh

test:
	$(COMPOSE) exec backend pytest

build:
	$(COMPOSE) build

rebuild:
	$(COMPOSE) build --no-cache

ps:
	$(COMPOSE) ps
