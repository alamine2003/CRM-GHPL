# Démonstration de fin de cycle 0.0 — Fondations

Scénario d'environ 20 minutes pour le référent métier (prd.md §22, RSK-12). Toutes les données sont **fictives** (DEM-001) ; le bandeau orange « Démonstration » le rappelle sur chaque écran.

## Préparer (5 minutes avant)

1. Réinitialiser la base : `INNOV_DEMO_MOT_DE_PASSE='…' python manage.py reinitialiser_demo --oui` (instance `ENVIRONNEMENT=demonstration`). Noter les comptes affichés.
2. Les comptes marqués `*` (siège, direction, responsable et administrateur pays, DF, DM) doivent activer la double authentification à la première connexion : avoir un téléphone avec Google Authenticator ou Microsoft Authenticator. Activer ces comptes **avant** la séance, sauf celui qui sert à montrer l'activation (étape 2).
3. Ouvrir le portail sur un ordinateur, l'application mobile (Expo Go ou version de test) sur un téléphone.

## Déroulé

| # | Qui | Ce qu'on montre | Exigences |
|---|---|---|---|
| 1 | — | Écran de connexion bilingue ; un mot de passe compromettant (« Dakar-Plateau-2026 ») est refusé au changement | USR-004, SEC-001 |
| 2 | Administrateur pays (Sénégal) | Première connexion : activation imposée de la double authentification (QR code, codes de secours) | SEC-003 |
| 3 | Administrateur pays | Accueil « À traiter » ; Organisation : divisions, réseaux, zones, secteurs, 227 postes, vacants ; créer un poste, l'affecter, le rattacher | ORG-003 à ORG-007 |
| 4 | Administrateur pays | Équipe : créer un compte (identifiant prenom.nom), attribuer un rôle, suspendre puis réactiver ; Téléphones : révoquer un appareil | USR-001, USR-003, USR-006 |
| 5 | Administrateur pays | Paramètres du pays : changer la distance de pointage ; l'ancienne et la nouvelle valeur sont auditées | ORG-011, AUD-001 |
| 6 | Administrateur du siège | Vue consolidée, choix du pays actif ; Pays : suspendre le Togo (ses utilisateurs ne peuvent plus se connecter), le réactiver | ORG-001, ORG-009 |
| 7 | Administrateur du siège | Affecter un DF sénégalais au Togo par intérim ; il ne voit que les données du pays choisi | ORG-009, USR-002 |
| 8 | DM | Ne voit que les postes de ses réseaux | ORG-008 |
| 9 | Délégué (téléphone) | Connexion mobile, mon poste, mon superviseur ; mettre l'application en arrière-plan plus de 5 minutes : verrouillage local | ORG-006, ORG-007, SEC-004 |
| 10 | N'importe quel compte | Mon profil : sessions ouvertes (fermer celle du téléphone : l'application est déconnectée), activité récente, apparence claire ou sombre | SEC-004, AUD-001 |
| 11 | Administrateur technique | Exploitation : base, isolation des pays, journal d'audit immuable, suivi des erreurs | — |

## Messages clés

- Chaque pays ne voit que ses données, même si un filtre manquait (sécurité au niveau des lignes PostgreSQL).
- Toute action sensible est tracée dans un journal que personne ne peut modifier.
- Prochain cycle (0.1, Référentiel) : produits, prospects, établissements, ciblage, doublons, imports BirdNotes.

## Après la séance

Réinitialiser la base (étape 1) : la démonstration suivante repart du même état.
