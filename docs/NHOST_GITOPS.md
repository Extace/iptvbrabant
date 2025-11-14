# Nhost GitOps Workflow

Deze setup zorgt ervoor dat database wijzigingen automatisch worden toegepast wanneer je code pusht naar Git.

## 🚀 Snelle Start

### 1. Installeer Nhost CLI
```bash
curl -L https://github.com/nhost/cli/releases/latest/download/cli-linux-amd64 -o nhost
chmod +x nhost
sudo mv nhost /usr/local/bin/nhost
```

### 2. Configureer Environment
```bash
cp .env.template .env.local
# Bewerk .env.local met jouw Nhost gegevens
```

### 3. Login bij Nhost
```bash
nhost auth login
```

### 4. Test lokale setup
```bash
npm run nhost:status
```

## 📊 Database Management

### Nieuwe migratie maken
```bash
npm run db:create add_new_table
# of
./scripts/nhost-db.sh create add_new_table
```

### Migraties toepassen
```bash
npm run db:apply
# of  
./scripts/nhost-db.sh apply
```

### Database status bekijken
```bash
npm run db:status
# of
./scripts/nhost-db.sh status
```

### Development mode starten
```bash
npm run nhost:dev
# of
./scripts/nhost-db.sh dev
```

## 🔄 GitOps Workflow

### 1. Maak database wijzigingen
```bash
# Nieuwe migratie maken
npm run db:create add_user_preferences

# Bewerk het gegenereerde SQL bestand
# nhost/hasura/migrations/default/[timestamp]_add_user_preferences.sql
```

### 2. Test lokaal
```bash
# Pas migraties toe lokaal
npm run db:apply

# Controleer status
npm run db:status
```

### 3. Commit en push
```bash
git add nhost/hasura/migrations/
git commit -m "feat: add user preferences table"
git push origin main
```

### 4. Automatische deployment
- **Pull Request**: Deploy naar staging
- **Main branch**: Deploy naar productie
- GitHub Actions past automatisch alle migraties toe

## 📁 Project Structuur

```
├── .github/workflows/
│   └── nhost-deploy.yml      # GitHub Actions workflow
├── nhost/
│   ├── config.yaml           # Nhost configuratie
│   └── hasura/
│       └── migrations/       # Database migraties
├── scripts/
│   └── nhost-db.sh          # Database management script
├── .env.template            # Environment variabelen template
└── package.json             # NPM scripts
```

## 🔧 GitHub Secrets Setup

Voeg deze secrets toe aan je GitHub repository:

| Secret | Beschrijving |
|--------|--------------|
| `NHOST_SUBDOMAIN` | Je Nhost subdomain |
| `NHOST_REGION` | Nhost regio (eu-central-1) |
| `NHOST_ADMIN_SECRET` | Hasura admin secret |
| `NHOST_PAT` | Nhost Personal Access Token |
| `NHOST_CONFIG` | Nhost CLI config JSON |

### Nhost PAT maken
1. Ga naar [Nhost Console](https://app.nhost.io)
2. Settings → Personal Access Tokens
3. Maak nieuwe token
4. Voeg toe als GitHub Secret

## 🛠️ Commands Reference

### NPM Scripts
```bash
npm run dev                  # Start lokale webserver
npm run nhost:dev           # Start Nhost development mode  
npm run nhost:status        # Database status
npm run nhost:apply         # Pas migraties toe
npm run db:create <name>    # Nieuwe migratie
npm run db:apply            # Pas migraties toe
npm run db:status          # Database status
npm run db:reset           # Reset database (GEVAARLIJK!)
npm run deploy:staging     # Deploy naar staging
npm run deploy:production  # Deploy naar productie
```

### Direct Script Usage
```bash
./scripts/nhost-db.sh create <migration_name>
./scripts/nhost-db.sh apply
./scripts/nhost-db.sh status  
./scripts/nhost-db.sh reset
./scripts/nhost-db.sh backup
./scripts/nhost-db.sh dev
```

## 🔍 Troubleshooting

### CLI niet gevonden
```bash
which nhost
# Als leeg: installeer CLI opnieuw
curl -L https://github.com/nhost/cli/releases/latest/download/cli-linux-amd64 -o nhost
chmod +x nhost
sudo mv nhost /usr/local/bin/nhost
```

### Authentication problemen
```bash
nhost auth login --pat YOUR_PERSONAL_ACCESS_TOKEN
```

### Database connectie problemen
```bash
# Controleer configuratie
cat nhost/config.yaml

# Test connectie
npm run nhost:status
```

## 📚 Meer Info

- [Nhost Documentation](https://docs.nhost.io/)
- [Hasura Migrations](https://hasura.io/docs/latest/graphql/core/migrations/index.html)
- [GitHub Actions](https://docs.github.com/en/actions)