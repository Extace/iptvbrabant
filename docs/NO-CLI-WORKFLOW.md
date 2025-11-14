# 🚀 Nhost Workflow ZONDER CLI

Omdat de Nhost CLI problemen geeft, gebruiken we deze alternatieve workflow:

## ✅ Wat WEL werkt:

1. **Nhost Console (Web Interface)** - Voor database schema management
2. **Direct GraphQL calls** - Voor testen en data management  
3. **GitHub Actions** - Voor automatische deployments (werkt ook zonder lokale CLI)
4. **Handmatige migratie bestanden** - We schrijven SQL handmatig

## 🔧 Workflow Stappen:

### 1. Database Schema Wijzigen

**Via Nhost Console:**
1. Ga naar [app.nhost.io](https://app.nhost.io)
2. Login en selecteer project `yvkysucfvqxfaqbyeggp`
3. Ga naar **Database** → **Data**
4. Gebruik **SQL Editor** of **Table Designer** om tabellen te maken

**Via SQL Editor in Console:**
```sql
-- Bijvoorbeeld: nieuwe products tabel
CREATE TABLE products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions instellen voor GraphQL
-- (doe dit via de Permissions tab in Nhost Console)
```

### 2. Migratie Bestand Maken (Handmatig)

Na elke database wijziging in de console:

```bash
# Maak nieuwe migratie directory
mkdir -p nhost/hasura/migrations/default/$(date +%Y%m%d%H%M%S)_add_products

# Maak up.sql bestand
cat > nhost/hasura/migrations/default/$(date +%Y%m%d%H%M%S)_add_products/up.sql << 'EOF'
CREATE TABLE products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
EOF

# Maak down.sql bestand  
cat > nhost/hasura/migrations/default/$(date +%Y%m%d%H%M%S)_add_products/down.sql << 'EOF'
DROP TABLE IF EXISTS products;
EOF
```

### 3. Testen

**Lokaal testen via browser:**
1. Open: `http://localhost:8000/nhost-direct-test.html`
2. Test connectie en queries
3. Verify dat nieuwe tabellen werken

**GraphQL Playground:**
- Ga naar: `https://yvkysucfvqxfaqbyeggp.graphql.eu-west-2.nhost.run/v1/graphql`
- Test queries en mutations

### 4. Deployment

**Handmatig via GitHub:**
```bash
git add nhost/hasura/migrations/
git commit -m "feat: add products table" 
git push origin main
```

**GitHub Actions doet de rest:**
- Detecteert wijzigingen in `nhost/` directory
- Past migraties toe op production
- Deploy wordt automatisch uitgevoerd

## 🛠️ Handige Scripts (Zonder CLI)

### Database Migration Helper
```bash
#!/bin/bash
# scripts/manual-migration.sh

TIMESTAMP=$(date +%Y%m%d%H%M%S)
MIGRATION_NAME=${1:-"new_migration"}
MIGRATION_DIR="nhost/hasura/migrations/default/${TIMESTAMP}_${MIGRATION_NAME}"

echo "📁 Creating migration: $MIGRATION_DIR"
mkdir -p "$MIGRATION_DIR"

# Template files
cat > "$MIGRATION_DIR/up.sql" << 'EOF'
-- Migration: {{MIGRATION_NAME}}
-- Created: {{TIMESTAMP}}

-- Add your SQL here
-- Example:
-- CREATE TABLE example (
--     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMPTZ DEFAULT NOW()
-- );
EOF

cat > "$MIGRATION_DIR/down.sql" << 'EOF'
-- Rollback for: {{MIGRATION_NAME}}

-- Add rollback SQL here
-- Example:
-- DROP TABLE IF EXISTS example;
EOF

# Replace placeholders
sed -i "s/{{MIGRATION_NAME}}/$MIGRATION_NAME/g" "$MIGRATION_DIR/up.sql"
sed -i "s/{{MIGRATION_NAME}}/$MIGRATION_NAME/g" "$MIGRATION_DIR/down.sql"
sed -i "s/{{TIMESTAMP}}/$TIMESTAMP/g" "$MIGRATION_DIR/up.sql"

echo "✅ Migration created at: $MIGRATION_DIR"
echo "📝 Edit the SQL files and test in Nhost Console before committing"
```

### GraphQL Test Helper
```javascript
// scripts/test-graphql.js
const ENDPOINT = 'https://yvkysucfvqxfaqbyeggp.graphql.eu-west-2.nhost.run/v1';

async function testQuery(query, variables = {}) {
    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-hasura-role': 'anonymous'
        },
        body: JSON.stringify({ query, variables })
    });
    
    const result = await response.json();
    console.log(JSON.stringify(result, null, 2));
    return result;
}

// Test examples:
// testQuery('query { orders { id customer_name } }');
// testQuery('mutation($obj: orders_insert_input!) { insert_orders_one(object: $obj) { id } }', {obj: {...}});
```

## 📚 Resources

- **Nhost Console**: [app.nhost.io](https://app.nhost.io)
- **GraphQL Playground**: `https://yvkysucfvqxfaqbyeggp.graphql.eu-west-2.nhost.run/v1/graphql`
- **Direct Test Page**: `http://localhost:8000/nhost-direct-test.html`
- **Hasura Docs**: [hasura.io/docs](https://hasura.io/docs)

## 🎯 Next Steps

1. Test de directe connectie: `http://localhost:8000/nhost-direct-test.html`
2. Ga naar Nhost Console en maak een test tabel
3. Schrijf handmatig een migratie bestand
4. Commit en push - GitHub Actions deploy automatisch
5. Vergeet de CLI - je hebt hem niet nodig! 🚀