#!/bin/bash
# Helper script om nieuwe migratie te maken

if [ -z "$1" ]; then
    echo "Usage: ./create-migration.sh <migration_name>"
    exit 1
fi

TIMESTAMP=$(date +%Y%m%d%H%M%S)
MIGRATION_NAME="$1"
MIGRATION_DIR="nhost/hasura/migrations/default/${TIMESTAMP}_${MIGRATION_NAME}"

echo "Creating migration: $MIGRATION_DIR"
mkdir -p "$MIGRATION_DIR"

cat > "$MIGRATION_DIR/up.sql" << EOF
-- Migration: $MIGRATION_NAME
-- Created: $(date)

-- Voeg hier je SQL toe:
-- Bijvoorbeeld:
CREATE TABLE IF NOT EXISTS example_table (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
EOF

cat > "$MIGRATION_DIR/down.sql" << EOF
-- Rollback for: $MIGRATION_NAME

DROP TABLE IF EXISTS example_table;
EOF

echo "✅ Migration created at: $MIGRATION_DIR"
echo "📝 Edit the SQL files in VS Code, then commit and push!"