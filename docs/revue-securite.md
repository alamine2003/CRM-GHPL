# Revue de sécurité (version 0.9.3)

Revue de l'application avant le pilote (prd.md §21.2, condition 2 : aucun défaut critique ou majeur ouvert sur l'authentification, les permissions, l'isolation, la synchronisation, les workflows et l'audit). Chaque point renvoie à ce qui le prouve : un test automatisé, un réglage relu, ou un risque accepté. Elle suit les chapitres de l'OWASP ASVS (niveau 2) qui concernent une API et deux clients.

> Cette revue est faite par l'équipe de développement. **Elle ne remplace pas un test d'intrusion indépendant**, recommandé avant la 1.0.0 (voir « Ce qui reste à faire »).

## 1. Authentification et sessions

| Point | État | Preuve |
|---|---|---|
| Mots de passe : 12 caractères, refus des mots courants, compromettants et fuités ; Argon2id | Conforme | SEC-001, `identite/tests` ; `PASSWORD_HASHERS` |
| Verrouillage après 5 échecs, 15 minutes ; alerte par courriel | Conforme | SEC-002, NOT-004 |
| Double authentification obligatoire pour les rôles sensibles ; codes de secours | Conforme | SEC-003, `identite/tests/test_double_auth.py` |
| Jeton d'accès de 15 minutes ; rafraîchissement par rotation, rejeu détecté (la session est révoquée) | Conforme | `test_jeton_de_rafraichissement_rejoue_revoque_la_session` |
| Portail : jeton de rafraîchissement en cookie httpOnly, SameSite=Strict (ou `None` et `Secure` tant que portail et API n'ont pas de domaine commun, 1.0.1, `INNOV_COOKIE_SAMESITE`), limité à `/api/v1/auth/`, lu seulement avec l'en-tête `X-Innov-Client` (requête CORS obligatoire) | Conforme | `identite/views.py` ; W003 de `check --deploy` écarté et justifié (`config/settings.py`) |
| Changement de mot de passe, suspension du compte, révocation d'un téléphone : toutes les sessions tombent | Conforme | `test_changement_de_mot_de_passe_connecte`, `test_reinitialisation_change_le_mot_de_passe_et_ferme_les_sessions`, SEC-006 |
| Inactivité : portail 30 minutes ; téléphone verrouillé selon le pays (5 à 30 minutes) | Conforme | SEC-004, DC-59 |

## 2. Contrôle d'accès et isolation

| Point | État | Preuve |
|---|---|---|
| Matrice des droits = prd.md §6.3, testée action par action | Conforme | `perimetre/tests/test_matrice.py` (345 cas) |
| Isolation des pays dans l'application et dans la base (sécurité au niveau des lignes) | Conforme | SEC-008, `make isolation` (§14.69) |
| Isolation dans un pays (autre délégué, superviseur non rattaché, autre réseau) | Conforme | `test_isolation_complete.py` |
| Objet hors périmètre : 404, jamais 403 qui révélerait son existence | Conforme | `test_isolation_routes.py` |
| Siège : agrégats sans nom ; nominatif audité | Conforme | DSH-004 |

## 3. Données, fichiers, journaux

| Point | État | Preuve |
|---|---|---|
| Pièces jointes : PDF seul, contrôlé par son contenu (pas son nom), 10 Mo, trois par rapport | Conforme | RPT-007, `test_pieces.py` |
| Pièce ouverte dans un navigateur : `Content-Security-Policy: sandbox`, `nosniff`, `no-store` | Conforme (0.9.3) | `test_rpt007_joindre_relire_et_rejouer_sans_doublon` |
| Journal d'audit immuable (déclencheurs de la base) ; jamais de secret dans ses détails | Conforme | AUD-001, `audit/tests` |
| Journaux techniques sans donnée personnelle en clair | Conforme | architecture §16.3, `test_erreurs_journaux.py` |
| Téléphone : base chiffrée (SQLCipher), clé dans le magasin sécurisé ; effacement à distance | Conforme | SEC-005, SEC-006 |
| Notifications : aucun nom ni donnée de santé sur l'écran verrouillé | Conforme | NOT-002 CA2 |
| Exports : périmètre seulement, audités, cellules neutralisées contre l'injection de formules | Conforme | RPT-019 |

## 4. Configuration et en-têtes

| Point | État | Preuve |
|---|---|---|
| Production : `check --deploy` sans avertissement, clé secrète obligatoire (50 caractères), jamais en débogage | Conforme (0.9.3) | `tests/test_securite.py` |
| HTTPS forcé, HSTS un an (sous-domaines compris), cookies sécurisés | Conforme | `config/settings.py` ; préchargement HSTS volontairement différé (W021) |
| Chaque réponse : `Content-Security-Policy` fermée, `Permissions-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `nosniff` | Conforme (0.9.3) | `test_chaque_reponse_porte_les_entetes_de_securite` |
| Pas de compression des routes d'authentification (BREACH) | Conforme | OFF-006, `test_reseau_faible.py` |
| CORS limité aux origines déclarées | Conforme | `CORS_ALLOWED_ORIGINS` |
| Aucun secret dans le dépôt | Conforme | Analyse de secrets (gitleaks) à chaque push |

## 5. Dépendances

| Point | État | Preuve |
|---|---|---|
| Serveur : aucune faille connue | Conforme (0.9.3) | `pip-audit` en CI ; Django REST framework monté en 3.17.2 (PYSEC-2026-3827 et 3828) |
| Portail et paquets livrés : aucune faille critique | Conforme | `npm audit --omit=dev --audit-level=critical` en CI |
| Chaîne de construction mobile (Expo, Metro, Jest, node-forge) : alertes « élevées » | **Risque accepté** | Outils de construction et de test, non livrés dans l'application ; levées à la montée de version d'Expo, qui se fait une fois par cycle (Dependabot, RT-06) |

## Risques acceptés

| Risque | Pourquoi il est accepté | Ce qui le réduit |
|---|---|---|
| Un PDF peut contenir du contenu actif | Les documents médicaux et commerciaux sont des PDF ; les refuser n'est pas possible | Ouvert en bac à sable dans le navigateur ; contrôle du type par le contenu ; lecture réservée au périmètre |
| Alertes de la chaîne de construction mobile | Non livrées ; leur correction exige une montée d'Expo | Montée d'Expo planifiée ; aucune alerte critique |
| Hébergement mutualisé (Render) | Choix du cadrage (DC-33) | Offres payantes, base dédiée et sauvegardes en 0.9.5 ; rôle de base sans contournement de la sécurité au niveau des lignes (contrôlé par la page « Exploitation ») |

## Ce qui reste à faire

1. **Test d'intrusion indépendant** sur la préproduction (0.9.5), avant la 1.0.0 : prestataire à choisir par l'entreprise.
2. Rejouer cette revue à chaque montée de version majeure (Django, Expo).
3. Au premier déploiement, vérifier chez Render que les en-têtes du portail décrits dans `render.yaml` (1.0.1, repris de la 0.9.5) sont bien servis : `curl -I https://<portail>/connexion`.
