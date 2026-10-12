#!/bin/sh
# Démarrage de la démonstration gratuite (render-demo.yaml ; 1.0.5) : migrations, remplissage
# d'une base vide par des données fictives (preparer_demo), puis le serveur web sur le port
# donné par Render. Un fichier plutôt qu'une commande en ligne : Render ne transmet pas
# fidèlement les guillemets d'une commande `sh -c "…"`.
set -e
python manage.py migrate --noinput
python manage.py preparer_demo
exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}"
