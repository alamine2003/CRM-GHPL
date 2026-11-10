#!/bin/sh
# Démarrage de l'instance gratuite (render-demo.yaml ; 1.0.5) : migrations, création du premier
# administrateur d'une base sans compte (preparer_instance, 1.0.8 : plus de données fictives),
# puis le serveur web sur le port donné par Render. Un fichier plutôt qu'une commande en ligne : Render ne transmet pas
# fidèlement les guillemets d'une commande `sh -c "…"`.
# 1.9.5 : l'import BirdNotes se traite pendant la requête ; au volume réel (9 700 prospects), il
# dure plusieurs minutes sur l'offre gratuite. Gunicorn coupait toute requête au bout de 30 s.
set -e
python manage.py migrate --noinput
python manage.py preparer_instance
exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" \
    --timeout "${GUNICORN_TIMEOUT:-1800}"
