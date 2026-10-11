#!/usr/bin/env bash
# REC-20, NFR-006 (0.9.5) : restauration complète sur une base jetable, chronométrée.
#   SOURCE_URL=postgres://… CIBLE_ADMIN_URL=postgres://…/postgres scripts/tester_restauration.sh
# 1. sauvegarde logique de la source (format personnalisé, comme la sauvegarde quotidienne) ;
# 2. restauration dans une base jetable neuve ;
# 3. contrôles : nombre de lignes de chaque table identique, migrations appliquées,
#    journal d'audit toujours immuable, sécurité au niveau des lignes toujours active ;
# 4. durée totale comparée au RTO (4 h, NFR-006) ; la base jetable est supprimée.
set -euo pipefail

: "${SOURCE_URL:?SOURCE_URL manquant (base à sauvegarder)}"
: "${CIBLE_ADMIN_URL:?CIBLE_ADMIN_URL manquant (serveur où créer la base jetable)}"
RTO_SECONDES=${RTO_SECONDES:-14400}
JETABLE="innov_restauration_$(date +%s)"
DOSSIER=$(mktemp -d)
trap 'psql "$CIBLE_ADMIN_URL" -qc "DROP DATABASE IF EXISTS $JETABLE" >/dev/null 2>&1; rm -rf "$DOSSIER"' EXIT
CIBLE_URL="${CIBLE_ADMIN_URL%/*}/$JETABLE"

debut=$(date +%s)
# Le même chiffrement que la sauvegarde de nuit (scripts/sauvegarder.sh), avec une phrase
# tirée au hasard pour l'essai : la chaîne complète est éprouvée, sauf le dépôt sur R2.
SAUVEGARDE_PHRASE=$(openssl rand -hex 32)
export SAUVEGARDE_PHRASE
echo "1/4 Sauvegarde chiffrée de la source"
pg_dump --format=custom --no-owner "$SOURCE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:SAUVEGARDE_PHRASE \
  > "$DOSSIER/sauvegarde.dump.enc"
echo "    $(du -h "$DOSSIER/sauvegarde.dump.enc" | cut -f1)"

echo "2/4 Déchiffrement et restauration dans $JETABLE"
psql "$CIBLE_ADMIN_URL" -qc "CREATE DATABASE $JETABLE"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:SAUVEGARDE_PHRASE \
  < "$DOSSIER/sauvegarde.dump.enc" \
  | pg_restore --no-owner --exit-on-error --dbname="$CIBLE_URL"

echo "3/4 Contrôles"
compter='SELECT string_agg(t, E'"'"'\n'"'"' ORDER BY t) FROM (
  SELECT format('"'"'%s %s'"'"', table_name, (xpath('"'"'/row/n/text()'"'"',
    query_to_xml(format('"'"'SELECT count(*) AS n FROM %I'"'"', table_name), false, true, '"'"''"'"')))[1]::text) AS t
  FROM information_schema.tables WHERE table_schema = '"'"'public'"'"' AND table_type = '"'"'BASE TABLE'"'"') x'
# Le propriétaire des tables lit toutes les lignes (la sécurité au niveau des lignes ne le
# concerne pas) : les comptes sont complets des deux côtés.
psql "$SOURCE_URL" -Atqc "$compter" > "$DOSSIER/source.txt"
psql "$CIBLE_URL" -Atqc "$compter" > "$DOSSIER/cible.txt"
if ! diff -q "$DOSSIER/source.txt" "$DOSSIER/cible.txt" >/dev/null; then
  echo "ÉCHEC : les nombres de lignes diffèrent" >&2
  diff "$DOSSIER/source.txt" "$DOSSIER/cible.txt" | head -20 >&2
  exit 1
fi
echo "    $(wc -l < "$DOSSIER/cible.txt") tables, nombres de lignes identiques"
CIBLE_URL="$CIBLE_URL" "$(dirname "$0")/controler_restauration.sh"
if [ -n "${MANAGE:-}" ]; then
  DATABASE_URL="$CIBLE_URL" $MANAGE migrate --check >/dev/null
  echo "    migrations : aucune en attente"
fi

duree=$(( $(date +%s) - debut ))
echo "4/4 Restauration complète en ${duree} s (RTO : ${RTO_SECONDES} s)"
[ "$duree" -le "$RTO_SECONDES" ] || { echo "ÉCHEC : au-delà du RTO" >&2; exit 1; }
echo "Restauration conforme."
