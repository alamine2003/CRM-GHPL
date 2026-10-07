# Relecture du cahier des charges

Relecture du 7 octobre 2026 (question O-12, choix 16.A). Elle porte sur environ 190 éléments de `prd.md` : 118 exigences fonctionnelles, 48 règles de gestion, 15 exigences non fonctionnelles et 9 indicateurs. Seules les exigences douteuses sont listées, les plus importantes d'abord.

Pour chaque point : le problème, les choix possibles et une recommandation. **Rien n'est changé tant que tu n'as pas tranché.** Une réponse courte suffit, par exemple « R1.B, R2.B, R3.C… ».

| N° | Exigence | Où en est-elle |
|---|---|---|
| R1 | Score sur 100 et classement des délégués (DSH-012, §14.18) | À venir, cycle 0.7 |
| R2 | Taux de réalisation qui compte les annulations (KPI-03, DSH-006) | À venir, cycle 0.7 |
| R3 | « Maladie » déclarée à l'avance dans le planning (PLN-009) | Livrée |
| R4 | Position de référence d'un établissement tirée des pointages (§14.18) | À venir |
| R5 | Tendance de prescription par médecin (§14.35, RPT-004) | Le retour est livré, la tendance est à venir |
| R6 | Téléphone bloqué au 8ᵉ jour sans réseau (OFF-007, RG-054) | À venir, 0.8.3 |
| R7 | Distance de pointage de 100 m (§7.5, VIS-010) | Livrée |
| R8 | « Moins d'une seconde » contre « moins de 2 s en 3G » (§14.35, NFR-002) | À préciser |
| R9 | « Résumé automatique » (§14.35) | À venir, cycle 0.7 |
| R10 | Portable personnel des médecins visible de tous (§14.1) | Livrée |
| R11 | Application reverrouillée après 5 minutes (SEC-004) | Livrée |
| R12 | Échéance d'une demande de correction (RPT-014) | À venir, 0.6.4 |
| R13 | Réglages qui ne font rien (`echeance_approbation_planning`, « Proposer une nouvelle visite ») | Livrés |

---

## R1. Score sur 100 et classement des délégués

**Problème.** Plusieurs calculs sont faux ou injustes :
- le « taux de géolocalisation » divise des visites par des prospects, donc il dépasse 100 % dès qu'un médecin est vu deux fois ;
- le « respect du plan » pénalise les visites imprévues, qui sont pourtant permises ;
- le GPS pèse lourd alors que beaucoup d'établissements n'ont pas encore de position de référence.

Une note qui classe des salariés, avec un « meilleur délégué du mois », est aussi une évaluation automatisée, délicate au regard de la protection des données et du droit du travail.

Ces formules reprennent celles de l'outil actuel, retenues le 5 octobre 2026. Les corriger revient donc à revenir sur une décision déjà prise.

**Choix.**
- **A.** Garder le score et le classement tels qu'écrits.
- **B.** Afficher les taux côte à côte, avec des formules corrigées, sans note unique ni classement.
- **C.** Garder une note corrigée, avec moins de poids sur le GPS, visible du seul superviseur et sans palmarès.

**Recommandation : B.** Le superviseur voit où agir, sans qu'une note automatique décide à sa place.

## R2. Taux de réalisation qui compte les annulations

**Problème.** Un délégué qui annule toutes ses visites, avec un motif, obtient 100 %. Cela contredit le principe « la preuve avant le volume ». Le même nom désigne en plus un autre calcul dans R1.

**Choix.**
- **A.** Garder la définition actuelle.
- **B.** Deux chiffres distincts : visites faites sur visites prévues, et part des écarts justifiés.
- **C.** Retirer seulement les annulations du calcul.

**Recommandation : B.** Deux chiffres honnêtes valent mieux qu'un chiffre flatteur.

## R3. « Maladie » déclarée à l'avance dans le planning

**Problème.**
- « Maladie » est une donnée de santé sur le salarié, lisible par toute la hiérarchie.
- On ne tombe pas malade sur rendez-vous. Comme la semaine se ferme le lundi à 0 h, un délégué malade le mardi ne peut plus rien déclarer, et ses visites tombent en « non réalisée ».

**Choix.**
- **A.** Garder tel quel.
- **B.** Remplacer « maladie » par « indisponibilité imprévue », sans motif médical. Elle se déclarerait le jour même et justifierait d'un coup toutes les visites du jour.
- **C.** Retirer la maladie de l'application et la laisser aux ressources humaines.

**Recommandation : B.** Cela protège la vie privée et répond au vrai besoin du terrain.

## R4. Position de référence tirée des pointages des délégués

**Problème.** Le point de référence d'un établissement serait la médiane des trois premières visites pointées. Les délégués fixent donc eux-mêmes le point qui sert à les contrôler : celui qui pointe toujours depuis ailleurs valide sa propre erreur. L'administrateur pays validerait aussi des centaines de points sans moyen de les vérifier.

**Choix.**
- **A.** Garder tel quel.
- **B.** Ne proposer un point qu'à partir de pointages d'au moins deux personnes différentes, et le montrer sur une carte au moment de la validation.
- **C.** N'accepter que des positions saisies par l'administration (import, relevé du superviseur).

**Recommandation : B.** La base se remplit seule, sans le cercle vicieux.

## R5. Tendance de prescription par médecin

**Problème.** Le retour du prescripteur n'est qu'une impression du délégué. Comme il est obligatoire, il sera souvent coché par réflexe. En tirer une courbe médecin par médecin revient à profiler les prescriptions de chacun, ce qui est sensible pour les données personnelles et pour l'éthique de la promotion médicale.

**Choix.**
- **A.** Garder la tendance par médecin.
- **B.** Tendance seulement agrégée (par produit, secteur, réseau). Le détail par médecin reste visible du seul délégué, dans « Préparer ma visite ».
- **C.** B, et en plus le retour du prescripteur devient facultatif.

**Recommandation : B.** Le pilotage garde l'information sans fichier nominatif des prescriptions.

## R6. Téléphone bloqué au 8ᵉ jour sans réseau

**Problème.** Un délégué en longue tournée sans réseau perdrait l'accès à son programme et à ses rapports. Cela contredit le principe « le terrain ne dépend pas du réseau ».

**Choix.**
- **A.** Garder 7 jours pour tous.
- **B.** Au-delà de 7 jours, masquer seulement les fiches et les coordonnées, et laisser finir les visites et les rapports en cours.
- **C.** Faire du délai un paramètre du pays : 7 jours par défaut, plus long pour les zones isolées.

**Recommandation : C.** C'est simple, et chaque pays règle l'équilibre entre sécurité et terrain.

## R7. Distance de pointage de 100 m

**Problème.** Dans un hôpital, un téléphone d'entrée de gamme se trompe souvent de 50 à 150 m, et un grand hôpital fait plus de 100 m de large. Résultat : beaucoup de journées « à vérifier » à tort, et des superviseurs débordés.

**Choix.**
- **A.** Garder 100 m.
- **B.** Tenir compte de la précision annoncée par le téléphone (classer « position imprécise » plutôt que « loin du lieu ») et permettre un rayon propre aux grands établissements.
- **C.** Monter simplement le seuil à 200 ou 300 m.

**Recommandation : B**, avec des valeurs mesurées pendant le pilote.

## R8. « Moins d'une seconde » contre « moins de 2 s en 3G »

**Problème.** Les deux cibles se contredisent, et une seconde sur un réseau 3G est irréaliste.

**Choix.**
- **A.** 1 s pour le serveur et le portail sur une bonne connexion, 2 s sur le téléphone en 3G, mesurées toutes les deux.
- **B.** 1 s partout.

**Recommandation : A.** C'est vérifiable et cela supprime la contradiction.

## R9. « Résumé automatique »

**Problème.** On ne sait pas s'il s'agit d'intelligence artificielle. La condition sur les données envoyées hors du système est floue, et c'est lourd alors que les tableaux de bord donnent déjà les chiffres.

**Choix.**
- **A.** Le construire tel qu'écrit.
- **B.** Le remplacer par une liste de « points d'attention » calculés par des règles simples (actions promises en retard, prescripteurs en baisse…), chacun relié à ses visites.
- **C.** Le reporter après la version 1.0.0.

**Recommandation : B.** On garde l'essentiel de l'usage, sans risque.

## R10. Portable personnel des médecins visible de tous

**Problème.** La fiche est commune au pays. Le portable personnel d'un médecin s'affiche donc pour tous les délégués des réseaux qui le visitent, qui le gardent même sans réseau. Le risque de fuite et de démarchage est réel, sans l'accord du médecin.

**Choix.**
- **A.** Garder tel quel.
- **B.** Garder le numéro pour repérer les doublons, mais ne l'afficher qu'aux délégués qui ont ce médecin dans leur liste cible, et seulement si « accepte d'être contacté sur ce numéro » est coché.
- **C.** N'enregistrer que les numéros professionnels.

**Recommandation : B.** Le numéro reste utile sans être exposé.

## R11. Application reverrouillée après 5 minutes

**Problème.** Une visite dure plus de 5 minutes. Le délégué devrait donc déverrouiller l'application à chaque visite, plusieurs fois par jour.

**Choix.**
- **A.** Garder 5 minutes.
- **B.** En faire un paramètre du pays, de 15 à 30 minutes par défaut.
- **C.** Se reposer uniquement sur le verrouillage d'écran du téléphone.

**Recommandation : B.** La sécurité reste correcte sans irriter le terrain.

## R12. Échéance d'une demande de correction

**Problème.** Rien ne dit ce qui se passe quand l'échéance est dépassée. L'exigence ne peut donc pas être vérifiée.

**Choix.**
- **A.** Définir la suite : rappel, puis signalement au superviseur.
- **B.** Supprimer l'échéance. La notification « Correction demandée » et la liste « À corriger » suffisent.

**Recommandation : B.** Une règle de moins, sans usage établi.

## R13. Réglages qui ne font rien

**Problème.** Deux réglages trompent l'utilisateur :
- le paramètre « échéance d'approbation du planning » est affiché mais n'agit plus depuis la fermeture du lundi ;
- l'interrupteur « Proposer une nouvelle visite » est enregistré mais ne crée rien dans le planning.

**Choix.**
- **A.** Retirer les deux.
- **B.** Les faire agir tous les deux.
- **C.** Retirer le paramètre, et faire apparaître la visite proposée dans la préparation de la semaine suivante.

**Recommandation : C.** On retire ce qui est inutile et on rend utile ce qui sert.
