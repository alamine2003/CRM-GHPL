#!/usr/bin/env bash
# Vérifie la convention de version (ADR-018) et la présence de la version dans CHANGELOG.md.
# Avant 1.0.0 : 0.y.z avec y et z de 1 à 9 pour z (0.0.1 … 0.9.9) ; jamais de x.y.0.
set -euo pipefail
racine="$(cd "$(dirname "$0")/.." && pwd)"
version="$(tr -d '[:space:]' < "$racine/VERSION")"

if [[ ! "$version" =~ ^([0-9]+)\.([0-9])\.([0-9])$ ]]; then
  echo "VERSION « $version » invalide : format attendu X.Y.Z (Y et Z de 0 à 9)." >&2
  exit 1
fi
majeure="${BASH_REMATCH[1]}"; patch="${BASH_REMATCH[3]}"
if [[ "$majeure" == "0" && "$patch" == "0" ]]; then
  echo "VERSION « $version » invalide : les versions 0.y.0 n'existent pas (0.0.1 … 0.9.9, puis 1.0.0)." >&2
  exit 1
fi
if ! grep -q "^## \[$version\]" "$racine/CHANGELOG.md"; then
  echo "CHANGELOG.md ne contient pas de section « ## [$version] »." >&2
  exit 1
fi
echo "Version $version conforme."
