# Commandes courantes. Les mêmes vérifications tournent en CI (.github/workflows/ci.yml).
.PHONY: installer serveur portail mobile telephone schema messages lint tests verifier isolation couverture

installer:
	cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
	cd backend && .venv/bin/python manage.py compilemessages
	npm install

serveur:
	cd backend && .venv/bin/python manage.py runserver

portail:
	npm run dev -w portail

mobile:
	npm run start -w mobile

# Application sur un vrai téléphone (même Wi-Fi) : API exposée sur le réseau local + Expo Go.
telephone:
	./scripts/telephone.sh

# Régénère le schéma OpenAPI, les types TypeScript (ADR-012) et la table des états (ADR-011).
# Après tout nouveau message serveur : extraire, puis traduire dans locale/en (USR-004).
messages:
	cd backend && .venv/bin/python manage.py makemessages -l en --no-location
	cd backend && .venv/bin/python manage.py compilemessages

schema:
	cd backend && .venv/bin/python manage.py spectacular --file schema.yaml --validate --fail-on-warn
	cd backend && .venv/bin/python manage.py exporter_etats
	npm run api:types

lint:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	npm run lint

tests:
	cd backend && .venv/bin/pytest -q
	npm test

# NFR-014 : couverture au moins 90 % des permissions, workflows et synchronisation (serveur et
# téléphone ; le seuil du téléphone s'applique à chaque `npm test`).
couverture:
	cd backend && .venv/bin/pytest -q --cov --cov-report=term
	npm test -w mobile

# SEC-008 : la suite d'isolation seule (pays, rôle, réseau, délégué, Grafana), avant chaque livraison.
isolation:
	cd backend && .venv/bin/pytest -q -m isolation

verifier: lint tests
	./scripts/verifier_version.sh
	npm run typecheck
