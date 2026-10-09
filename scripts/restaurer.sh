#!/usr/bin/env bash
# Restauration d'une sauvegarde chiffrée de R2 dans une base (0.9.5, NFR-006, REC-20).
#   scripts/restaurer.sh quotidiennes/innov-20261010T011700Z.dump.enc postgres://…/innov_restauree
# La base cible doit exister et être vide ; les rôles Grafana se recréent ensuite
# (python manage.py grafana_acces), puis l'API pointe sur la base restaurée.
set -euo pipefail
nom=${1:?nom de la sauvegarde}
cible=${2:?URL de la base cible}
: "${R2_URL:?}" "${R2_CLE:?}" "${R2_SECRET:?}" "${R2_COMPARTIMENT_SAUVEGARDES:?}" "${SAUVEGARDE_PHRASE:?}"
export AWS_ACCESS_KEY_ID="$R2_CLE" AWS_SECRET_ACCESS_KEY="$R2_SECRET" AWS_DEFAULT_REGION=auto
aws s3 cp "s3://$R2_COMPARTIMENT_SAUVEGARDES/$nom" - --endpoint-url "$R2_URL" \
  | openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:SAUVEGARDE_PHRASE \
  | pg_restore --no-owner --no-privileges --exit-on-error --dbname="$cible"
# L'adresse de la base n'est pas affichée : elle peut porter un mot de passe.
echo "Restauration terminée. Ensuite : grafana_acces --appliquer, puis les contrôles (docs/exploitation.md §7.2)."
