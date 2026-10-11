# Sauvegarde logique quotidienne (0.9.5, NFR-006) : pg_dump de la même version que la base,
# chiffré, déposé sur Cloudflare R2 (compartiment dédié, privé, avec durée de rétention).
FROM postgres:16-alpine
RUN apk add --no-cache aws-cli openssl
COPY scripts/sauvegarder.sh /usr/local/bin/sauvegarder
USER postgres
CMD ["sauvegarder"]
