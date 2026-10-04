# Commandes courantes. Les mêmes vérifications tournent en CI (.github/workflows/ci.yml).
.PHONY: installer serveur portail mobile schema messages lint tests verifier

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

# Régénère le schéma OpenAPI puis les types TypeScript (ADR-012).
# Après tout nouveau message serveur : extraire, puis traduire dans locale/en (USR-004).
messages:
	cd backend && .venv/bin/python manage.py makemessages -l en --no-location
	cd backend && .venv/bin/python manage.py compilemessages

schema:
	cd backend && .venv/bin/python manage.py spectacular --file schema.yaml --validate --fail-on-warn
	npm run api:types

lint:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	npm run lint

tests:
	cd backend && .venv/bin/pytest -q
	npm test

verifier: lint tests
	./scripts/verifier_version.sh
	npm run typecheck
