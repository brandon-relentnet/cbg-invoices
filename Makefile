.PHONY: up down restart logs migrate logto-setup shell test build fe-shell

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart backend frontend

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
	docker compose exec backend python scripts/logto_setup.py

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
