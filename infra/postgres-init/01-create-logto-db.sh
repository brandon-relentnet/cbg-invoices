#!/bin/bash
# Creates the separate Logto database on postgres first boot.
# The main invoice_portal DB is created via POSTGRES_DB env var.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
    CREATE DATABASE logto;
    GRANT ALL PRIVILEGES ON DATABASE logto TO $POSTGRES_USER;
EOSQL

echo "Created Logto database."
