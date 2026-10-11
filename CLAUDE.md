# Consignes pour les agents

Avant toute modification, lire **[`architecture-essentials.md`](architecture-essentials.md)** : ses règles sont non négociables. Le métier est dans [`prd.md`](prd.md), la technique dans [`architecture.md`](architecture.md).

## Vérifier avant de livrer

```bash
make verifier          # lint, tests, types, convention de version
make schema            # après toute modification de l'API : schema.yaml + types TypeScript
```

La CI (`.github/workflows/ci.yml`) rejoue ces vérifications ; une PR rouge ne se fusionne pas.

## Rappels

- Code, interface, documentation et commits en français ; tout texte affiché passe par `@innov/i18n` (`fr` et `en`) ou gettext côté serveur.
- Une nouvelle version : modifier `VERSION` **et** ajouter sa section dans `CHANGELOG.md`.
- Citer les identifiants d'exigence (`PLN-004`, `RG-018`) dans les commits et PR qui les livrent.
- Aucune donnée réelle, aucun secret dans le dépôt.
