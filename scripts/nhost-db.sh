#!/bin/bash

# Nhost Database Schema Management Script
# Dit script helpt bij het maken en toepassen van database wijzigingen

set -e

# Kleuren voor output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functies
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Controleer of nhost CLI beschikbaar is
check_nhost_cli() {
    if ! command -v nhost &> /dev/null; then
        log_error "Nhost CLI is niet geïnstalleerd!"
        log_info "Installeer het met: curl -L https://github.com/nhost/cli/releases/latest/download/cli-linux-amd64 -o nhost && chmod +x nhost && sudo mv nhost /usr/local/bin/"
        exit 1
    fi
    log_success "Nhost CLI gevonden: $(nhost --version)"
}

# Maak een nieuwe migratie
create_migration() {
    local name="$1"
    if [ -z "$name" ]; then
        log_error "Geen migratie naam opgegeven!"
        echo "Gebruik: $0 create <migration_name>"
        exit 1
    fi
    
    log_info "Nieuwe migratie maken: $name"
    cd nhost
    nhost hasura migrate create "$name" --database-name default
    log_success "Migratie gemaakt! Bewerk het SQL bestand in nhost/hasura/migrations/default/"
}

# Pas migraties toe
apply_migrations() {
    log_info "Migraties toepassen..."
    cd nhost
    
    # Check database connectie
    if ! nhost hasura migrate status --database-name default &> /dev/null; then
        log_error "Kan geen verbinding maken met database!"
        log_info "Controleer je Nhost configuratie en connectie"
        exit 1
    fi
    
    # Pas migraties toe
    nhost hasura migrate apply --database-name default
    nhost hasura metadata apply
    
    log_success "Migraties toegepast!"
}

# Reset database (GEVAARLIJK!)
reset_database() {
    log_warning "⚠️  GEVAAR: Dit verwijdert ALLE database data!"
    read -p "Typ 'RESET' om door te gaan: " confirm
    
    if [ "$confirm" != "RESET" ]; then
        log_info "Reset geannuleerd"
        exit 0
    fi
    
    log_info "Database resetten..."
    cd nhost
    nhost hasura migrate apply --version 0 --database-name default
    nhost hasura migrate apply --database-name default
    nhost hasura metadata apply
    
    log_success "Database gereset!"
}

# Toon database status
status() {
    log_info "Database status controleren..."
    cd nhost
    
    echo -e "\n${BLUE}📊 Migratie Status:${NC}"
    nhost hasura migrate status --database-name default
    
    echo -e "\n${BLUE}📋 Metadata Status:${NC}"
    nhost hasura metadata ic list
}

# Exporteer schema voor backup
backup_schema() {
    local backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    log_info "Schema backup maken naar $backup_dir"
    cd nhost
    
    # Exporteer metadata
    nhost hasura metadata export --output "$backup_dir/metadata"
    
    # Exporteer database schema
    nhost hasura migrate status --database-name default > "$backup_dir/migration_status.txt"
    
    log_success "Backup gemaakt in $backup_dir"
}

# Ontwikkelingsmodus
dev_mode() {
    log_info "Start Nhost development mode..."
    cd nhost
    nhost dev
}

# Help functie
show_help() {
    echo -e "${BLUE}Nhost Database Management${NC}"
    echo ""
    echo "Gebruik:"
    echo "  $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  create <name>    Maak een nieuwe database migratie"
    echo "  apply           Pas alle pending migraties toe"
    echo "  status          Toon huidige database status"
    echo "  reset           Reset database (GEVAARLIJK!)"
    echo "  backup          Maak een backup van het huidige schema"
    echo "  dev             Start development mode"
    echo "  help            Toon deze help"
    echo ""
    echo "Voorbeelden:"
    echo "  $0 create add_user_table"
    echo "  $0 apply"
    echo "  $0 status"
}

# Main script logic
main() {
    check_nhost_cli
    
    case "${1:-help}" in
        "create")
            create_migration "$2"
            ;;
        "apply")
            apply_migrations
            ;;
        "status")
            status
            ;;
        "reset")
            reset_database
            ;;
        "backup")
            backup_schema
            ;;
        "dev")
            dev_mode
            ;;
        "help"|"--help"|"-h"|"")
            show_help
            ;;
        *)
            log_error "Onbekend commando: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"