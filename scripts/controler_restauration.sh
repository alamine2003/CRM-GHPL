#!/usr/bin/env bash
# Contrôles d'une base restaurée (0.9.5, REC-20) : utilisés par scripts/tester_restauration.sh
# et par le test mensuel de GitHub (.github/workflows/restauration.yml).
#   CIBLE_URL=postgres://…/innov_restauree scripts/controler_restauration.sh
set -euo pipefail
: "${CIBLE_URL:?CIBLE_URL manquant (base restaurée)}"
lire() { psql "$CIBLE_URL" -Atqc "$1"; }
tables=$(lire "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
migrations=$(lire "SELECT count(*) FROM django_migrations")
politiques=$(lire "SELECT count(*) FROM pg_policies WHERE schemaname = 'public'")
declencheurs=$(lire "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'audit_%'")
pays=$(lire "SELECT count(*) FROM socle_pays")
[ "$tables" -gt 0 ] && [ "$migrations" -gt 0 ] || { echo "ÉCHEC : base vide" >&2; exit 1; }
[ "$politiques" -gt 0 ] || { echo "ÉCHEC : aucune politique de sécurité au niveau des lignes" >&2; exit 1; }
[ "$declencheurs" -gt 0 ] || { echo "ÉCHEC : le journal d'audit n'est plus protégé" >&2; exit 1; }
echo "    $migrations migrations appliquées, $pays pays"
echo "    $politiques politiques de sécurité au niveau des lignes, $declencheurs protections de l'audit"
