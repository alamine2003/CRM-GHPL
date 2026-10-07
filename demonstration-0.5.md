# Démonstration de fin de cycle 0.5 — Rapport de visite

Scénario d'environ 30 minutes pour le référent métier (prd.md §22, RSK-12). Toutes les données sont **fictives** (DEM-001) ; le filet orange et la mention « Démonstration » le rappellent sur chaque écran.

## Préparer (5 minutes avant)

1. Réinitialiser la base : `INNOV_DEMO_MOT_DE_PASSE='…' python manage.py reinitialiser_demo --oui` (instance `ENVIRONNEMENT=demonstration`). Le mot de passe vient de la variable d'environnement et ne s'écrit nulle part. Noter les comptes affichés à l'écran (README, « Démonstration ») : pour le Sénégal, le délégué, le superviseur et l'administrateur pays.
2. La base reprend le terrain du cycle 0.4 (semaine en cours approuvée, deux semaines précédentes exécutées, semaine suivante en préparation). S'y ajoutent, pour le **premier délégué** :
   - les **rapports** des visites effectuées des semaines passées, soumis le jour même, avec produits présentés, retour du prescripteur, échantillons une fois sur deux, un cadeau de temps en temps, un résultat, une prochaine action typée avec son échéance, et une visite proposée une fois sur deux ;
   - un rapport **soumis le lendemain** (« en retard »), un rapport avec un **document PDF** joint (fictif), l'avant-dernier rapport resté **en brouillon** et le dernier encore **à rédiger** ;
   - un champ propre au pays, « Patients concernés par semaine » (un nombre) ;
   - pour les hôpitaux, un **rayon de pointage** de 300 m.
3. **Choisir le jour** : comme au cycle 0.4, le scénario suppose un **mardi**. Un autre jour, adapter le nombre de visites du programme.
4. Activer à l'avance la double authentification des comptes marqués `*`, dont l'administrateur pays (étape 12).
5. Ouvrir le portail sur un ordinateur. Sur l'iPhone : `make telephone`, même Wi-Fi, puis scanner le QR code (README, « Sur un iPhone »). Accepter l'autorisation de position.

## Déroulé

| # | Qui | Ce qu'on montre | Exigences |
|---|---|---|---|
| 1 | Premier délégué (iPhone) | Accueil « Tournée » : la carte « **Rapports en retard** » en tête si un rapport d'hier attend encore ; dans le programme, une visite effectuée se lit « Rapport à rédiger » ou « Rapport en brouillon » | RPT-001, RG-032 |
| 2 | Premier délégué | Ouvrir la prochaine visite : « **Préparer ma visite** » (nombre de visites rapportées, derniers retours du prescripteur par produit, échantillons déjà remis), l'**action prévue** à la visite précédente et son échéance, puis les **rapports précédents** chez ce prospect, du plus récent au plus ancien | DC-47, RPT-006, RPT-011 |
| 3 | Premier délégué | « Démarrer la visite », puis « Terminer la visite » : l'annonce propose « **Rédiger le rapport** ». Le rapport s'ouvre avec l'**objectif prévu** en tête (pour une visite imprévue : sa justification) | VIS-004, RPT-001, RPT-002, RPT-003 |
| 4 | Premier délégué | Remplir : produits présentés dans l'ordre (seuls ceux du portefeuille, tel qu'au jour de la visite), le **retour du prescripteur** pour chacun, deux échantillons et un cadeau, le résultat, le résultat obtenu, la prochaine action typée avec son échéance, « Proposer une nouvelle visite », le champ du pays. Joindre un **PDF** (pas de photo : DC-48) | RPT-004, RPT-005, RPT-006, RPT-007, RPT-008, RG-033 |
| 5 | Premier délégué | Passer en **mode avion** au milieu de la saisie, quitter l'écran, revenir : tout est là (« Brouillon repris : vos dernières saisies, gardées sur le téléphone, ont été retrouvées. »). « Soumettre » : l'en-tête dit « Soumission en attente du réseau ». Repasser en ligne : le rapport part une seule fois, avec l'**heure du geste** | RPT-009, RPT-010 |
| 6 | Premier délégué | Rouvrir le rapport soumis : il est figé, en lecture seule. Ouvrir le rapport de la veille resté en brouillon et le soumettre : « **en retard** » (après l'heure limite du pays, 23 h 59) | RPT-010, RG-030, RG-032 |
| 7 | Premier délégué | « Je suis **indisponible** aujourd'hui » : la matinée, sans motif à donner. Les visites du matin sont justifiées d'un coup, la prochaine visite devient celle de l'après-midi. Le planning ne propose plus « maladie » | DC-51 |
| 8 | Premier délégué | Semaine suivante (en préparation) : retirer la visite d'un prospect pour qui une nouvelle visite a été proposée. Dans « Nouvelle visite », ce prospect remonte sous « **Proposées à votre dernière visite** » ; le poser d'un appui | DC-61 |
| 9 | Premier délégué | Laisser l'application en arrière-plan plus de 15 minutes (ou le délai réglé à l'étape 12) : elle demande le déverrouillage | DC-59 |
| 10 | Superviseur (portail) | Fiche d'un prospect du délégué, section « **Rapports de visite** » : les rapports soumis, avec le nom du délégué ; jamais un brouillon. Un DM ou un DF lit ceux des postes de ses réseaux | RPT-011, DC-62 |
| 11 | Superviseur (portail) | Planning de la semaine en cours, carte « Conformité des journées » : la matinée d'indisponibilité n'y laisse **aucun écart**. Une visite pointée avec une position trop imprécise compte « sans GPS » (« dont n à la position trop imprécise »), jamais « loin du lieu » ; dans un hôpital, le seuil est son rayon de 300 m | DC-51, DC-55, VIS-010 |
| 12 | Administrateur pays (portail) | « Paramètres » : carte « **Téléphone** », verrouillage de 5 à 30 minutes (15 par défaut). Carte « Champs du rapport » : ajouter un champ ; il apparaît dans les rapports ouverts ensuite. « Établissements » : la fiche d'un hôpital montre « Rayon de pointage · 300 m », modifiable. Fiche d'un prospect : « Le prescripteur accepte d’être contacté sur ce numéro » | DC-59, RPT-008, DC-55, DC-58 |
| 13 | — | Ce qui ne se montre pas en séance : la lecture et la validation des rapports par le superviseur, l'alerte à 48 h et les corrections (cycle 0.6) ; le mobile personnel d'un médecin vu par le délégué (la démonstration ne contient aucun numéro, DEM-001 : prouvé par les tests). Couvert ou attendu : `recette-0.5.md` | RPT-012 à RPT-017, DC-58 |

## Messages clés

- Le rapport naît de la visite : il s'ouvre à sa fin, avec l'objectif prévu en tête, et s'écrit sans réseau. Rien ne se perd : chaque champ est gardé sur le téléphone, et la soumission part au retour du réseau, une seule fois, avec l'heure du geste.
- Un rapport soumis est figé. Soumis après l'heure limite, il est « en retard », et c'est dit au délégué comme au superviseur.
- Le délégué prépare sa visite avec ce qu'il a lui-même rapporté : les retours du prescripteur et l'action promise. La prochaine action proposée revient à la préparation de la semaine.
- La relecture du cahier des charges a changé six règles, toutes livrées : indisponibilité imprévue sans motif médical, précision du GPS et rayon des grands établissements, mobile personnel protégé, verrouillage réglable, visite proposée reprise au planning, lecture des rapports par le DM et le DF.
- La recette du cycle est dans `recette-0.5.md` : chaque critère d'acceptation est relié au test qui le prouve.
- Prochain cycle (0.6) : la file de travail du superviseur, la lecture et la validation des rapports, les corrections.

## Points à faire trancher

1. **Heure limite du rapport** (23 h 59, RG-032) : convient-elle aux tournées du soir ?
2. **Tolérance d'horloge** (15 minutes, RPT-010) : au-delà, l'heure du téléphone est marquée « horodatage douteux ». Est-ce le bon écart ?
3. **Rayon des hôpitaux** (DC-55) : 300 m dans la démonstration. Les valeurs réelles se mesurent pendant le pilote.
4. **Verrouillage** (DC-59) : 15 minutes par défaut. À confirmer avec les délégués du pilote.

## Après la séance

Remettre les paramètres modifiés à leur valeur (verrouillage 15 minutes ; retirer le champ ajouté), puis réinitialiser la base (étape 1 de la préparation) : la démonstration suivante repart du même état.
