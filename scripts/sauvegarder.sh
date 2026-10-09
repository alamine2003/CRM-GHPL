#!/bin/sh
# Sauvegarde logique chiffrée vers R2 (0.9.5, NFR-006) ; appelée chaque nuit par Render.
# Restaurer : scripts/restaurer.sh ; vérifier régulièrement : scripts/tester_restauration.sh.
set -eu
: "${DATABASE_URL:?}" "${R2_URL:?}" "${R2_CLE:?}" "${R2_SECRET:?}"
: "${R2_COMPARTIMENT_SAUVEGARDES:?}" "${SAUVEGARDE_PHRASE:?}"
nom="innov-$(date -u +%Y%m%dT%H%M%SZ).dump.enc"
export AWS_ACCESS_KEY_ID="$R2_CLE" AWS_SECRET_ACCESS_KEY="$R2_SECRET" AWS_DEFAULT_REGION=auto
pg_dump --format=custom --no-owner "$DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:SAUVEGARDE_PHRASE \
  | aws s3 cp - "s3://$R2_COMPARTIMENT_SAUVEGARDES/quotidiennes/$nom" --endpoint-url "$R2_URL"
echo "Sauvegarde déposée : quotidiennes/$nom"
# Le 1er du mois, une copie de plus, gardée un an (règles de cycle de vie de R2 : 35 jours
# pour quotidiennes/, 400 jours pour mensuelles/ ; docs/exploitation.md §2).
if [ "$(date -u +%d)" = "01" ]; then
  aws s3 cp "s3://$R2_COMPARTIMENT_SAUVEGARDES/quotidiennes/$nom" \
    "s3://$R2_COMPARTIMENT_SAUVEGARDES/mensuelles/$nom" --endpoint-url "$R2_URL"
  echo "Copie mensuelle : mensuelles/$nom"
fi
