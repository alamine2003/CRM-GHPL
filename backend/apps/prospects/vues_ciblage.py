"""API des listes cibles (PRP-011) : lecture selon la visibilité des postes, tenue par le
superviseur du poste ou l'administrateur pays (RG-043)."""

from django.db.models import Count, Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response

from apps.organisation.models import Occupation, Poste, actif_le
from apps.organisation.vues import _lire
from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import aujourdhui, valeur_parametre

from . import ciblage
from . import serializers as s
from .models import Cible, Exercice, Prospect
from .services import prospects_visibles

#: Candidats proposés à la fois ; la recherche affine.
LIMITE_CANDIDATS = 100


def _avec_prospect(qs):
    en_cours = Exercice.objects.filter(fin__isnull=True).select_related("etablissement")
    return qs.select_related(
        "prospect__type", "prospect__specialite", "prospect__secteur"
    ).prefetch_related(
        Prefetch("prospect__exercices", queryset=en_cours, to_attr="exercices_en_cours")
    )


def _syntheses(postes) -> dict:
    """Synthèse de chaque poste en une requête : taille, A/B/C, charge par cycle."""
    lignes = (
        Cible.objects.filter(fin__isnull=True, poste__in=postes)
        .values("poste_id")
        .annotate(
            total=Count("id"),
            charge=Sum("frequence"),
            a=Count("id", filter=Q(prospect__potentiel="A")),
            b=Count("id", filter=Q(prospect__potentiel="B")),
            c=Count("id", filter=Q(prospect__potentiel="C")),
        )
    )
    return {ligne["poste_id"]: ligne for ligne in lignes}


def _cycle(pays) -> tuple[int, int, dict]:
    semaines = int(valeur_parametre(pays, "cycle_visite_semaines"))
    jours = semaines * len(valeur_parametre(pays, "jours_ouvres") or [1, 2, 3, 4, 5])
    return semaines, max(1, jours), valeur_parametre(pays, "seuils_visites_jour") or {}


def _poste(poste: Poste, ligne: dict | None, gerable: bool, cycles: dict) -> dict:
    if poste.pays_id not in cycles:
        cycles[poste.pays_id] = _cycle(poste.pays)
    semaines, jours, seuils = cycles[poste.pays_id]
    seuil = seuils.get(poste.type_poste) or {}
    ligne = ligne or {}
    charge = ligne.get("charge") or 0
    occupant = next((o.utilisateur for o in poste.occupations_en_cours), None)
    return {
        "id": poste.pk,
        "libelle": poste.libelle,
        "type_poste": poste.type_poste,
        "occupant": f"{occupant.first_name} {occupant.last_name}" if occupant else None,
        "secteurs": [{"id": x.pk, "libelle": x.libelle} for x in poste.secteurs.all()],
        "gerable": gerable,
        "synthese": {
            "total": ligne.get("total", 0),
            "potentiels": {"A": ligne.get("a", 0), "B": ligne.get("b", 0), "C": ligne.get("c", 0)},
            "visites_par_cycle": charge,
            "visites_par_jour": round(charge / jours, 1),
            "cycle_semaines": semaines,
            # Seuils de visites par jour du type de poste (RG-016) : la charge s'y compare.
            "seuil_min": seuil.get("min"),
            "seuil_max": seuil.get("max"),
        },
    }


class VueCiblage(VuePerimetre):
    serializer_class = s.CibleSerializer

    def postes(self):
        """Postes lisibles (architecture §11.2) : tout le pays pour l'administration, les postes
        rattachés pour le superviseur, ceux des réseaux pour DF et DM, le sien pour le délégué."""
        # Occupant du jour ; la fin d'une occupation est exclue (architecture §13.2).
        jour = aujourdhui(self.perimetre.pays_actif) if self.perimetre.pays_actif else None
        jour_occupations = Occupation.objects.select_related("utilisateur")
        if jour is not None:
            jour_occupations = jour_occupations.filter(actif_le(jour))
        return (
            ciblage.postes_lisibles(self.perimetre)
            .filter(archive_le__isnull=True)
            .select_related("pays")
            .prefetch_related(
                "secteurs",
                Prefetch("occupations", queryset=jour_occupations, to_attr="occupations_en_cours"),
            )
            .order_by("libelle")
        )

    def liste(self, poste: Poste, historique: bool = False) -> dict:
        cibles = _avec_prospect(Cible.objects.filter(poste=poste))
        if not historique:
            cibles = cibles.filter(fin__isnull=True)
        gerable = ciblage.postes_geres(self.perimetre).filter(pk=poste.pk).exists()
        ligne = _syntheses([poste]).get(poste.pk)
        secteurs = {x.pk for x in poste.secteurs.all()}
        contexte = {**self.get_serializer_context(), "secteurs_poste": secteurs}
        return {
            "poste": s.PosteCibleSerializer(_poste(poste, ligne, gerable, {})).data,
            "cibles": s.CibleSerializer(
                sorted(
                    cibles,
                    key=lambda c: (
                        c.fin is not None,
                        c.prospect.potentiel,
                        c.prospect.nom,
                        c.prospect.prenom,
                    ),
                ),  # fmt: skip
                many=True,
                context=contexte,
            ).data,
        }


class PostesCiblageVue(VueCiblage):
    actions = {"GET": Action.CIBLES_LIRE}

    @extend_schema(responses=s.PosteCibleSerializer(many=True), operation_id="ciblage_postes")
    def get(self, request):
        postes = list(self.postes())
        geres = set(ciblage.postes_geres(self.perimetre).values_list("pk", flat=True))
        lignes, cycles = _syntheses(postes), {}
        return Response(
            s.PosteCibleSerializer(
                [_poste(p, lignes.get(p.pk), p.pk in geres, cycles) for p in postes], many=True
            ).data
        )


class ListeCibleVue(VueCiblage):
    actions = {"GET": Action.CIBLES_LIRE, "POST": Action.CIBLES_GERER}

    @extend_schema(
        parameters=[OpenApiParameter("historique", str, required=False)],
        responses=s.ListeCibleSerializer,
        operation_id="ciblage_liste",
    )
    def get(self, request, id):
        poste = get_object_or_404(self.postes(), pk=id)
        return Response(self.liste(poste, request.query_params.get("historique") == "1"))

    @extend_schema(request=s.AjoutCiblesSerializer, responses={201: s.ResultatAjoutSerializer},
                   operation_id="ciblage_ajouter")  # fmt: skip
    def post(self, request, id):
        poste = get_object_or_404(self.postes(), pk=id)
        ciblage.exiger_gestion(self.perimetre, poste)
        v = _lire(s.AjoutCiblesSerializer, request)
        ids = list(dict.fromkeys(v["prospects"]))
        trouves = {p.pk: p for p in prospects_visibles(self.perimetre).filter(pk__in=ids)}
        if len(trouves) != len(ids):
            raise ErreurMetier(
                "prospect_invalide",
                _("Seule une fiche active du pays entre dans une liste cible."),
                champ="prospects",
            )
        resultat = ciblage.ajouter(
            poste, [trouves[i] for i in ids], request.user, v.get("frequence")
        )
        return Response(
            {"ajoutes": len(resultat["creees"]), "deja_presents": resultat["deja_presents"]},
            status=status.HTTP_201_CREATED,
        )


class CandidatsCiblageVue(VueCiblage):
    actions = {"GET": Action.CIBLES_GERER}

    @extend_schema(
        parameters=[
            OpenApiParameter("q", str, required=False),
            OpenApiParameter("potentiel", str, required=False),
        ],
        responses=s.ProspectCibleSerializer(many=True),
        operation_id="ciblage_candidats",
    )
    def get(self, request, id):
        """Prospects actifs des secteurs du poste, pas encore ciblés (affectation
        territoriale) ; potentiel A d'abord."""
        from .services import rechercher

        poste = get_object_or_404(self.postes(), pk=id)
        ciblage.exiger_gestion(self.perimetre, poste)
        qs = ciblage.candidats(poste)
        if request.query_params.get("q"):
            # Recherche dans tout le pays : un prospect hors secteur reste ciblable (RG-024).
            deja = Cible.objects.filter(poste=poste, fin__isnull=True).values("prospect_id")
            qs = rechercher(
                Prospect.objects.filter(pays=poste.pays, statut="actif").exclude(pk__in=deja),
                request.query_params["q"],
            )
        if potentiel := request.query_params.get("potentiel"):
            qs = qs.filter(potentiel=potentiel)
        en_cours = Exercice.objects.filter(fin__isnull=True).select_related("etablissement")
        prospects = (
            qs.select_related("type", "specialite", "secteur")
            .prefetch_related(
                Prefetch("exercices", queryset=en_cours, to_attr="exercices_en_cours")
            )
            .order_by("potentiel", "nom", "prenom")[:LIMITE_CANDIDATS]
        )
        return Response(s.ProspectCibleSerializer(prospects, many=True).data)


class VueCible(VueCiblage):
    def cible(self, id) -> Cible:
        return get_object_or_404(
            _avec_prospect(Cible.objects.filter(poste__in=ciblage.postes_geres(self.perimetre))),
            pk=id,
        )


class CibleVue(VueCible):
    actions = {"PATCH": Action.CIBLES_GERER}

    @extend_schema(request=s.FrequenceSerializer, responses=s.CibleSerializer,
                   operation_id="cible_frequence")  # fmt: skip
    def patch(self, request, id):
        cible = self.cible(id)
        v = _lire(s.FrequenceSerializer, request)
        return Response(self.get_serializer(ciblage.modifier_frequence(cible, v["frequence"])).data)


class CibleRetraitVue(VueCible):
    actions = {"POST": Action.CIBLES_GERER}

    @extend_schema(request=s.RetraitCibleSerializer, responses=s.CibleSerializer,
                   operation_id="cible_retirer")  # fmt: skip
    def post(self, request, id):
        cible = self.cible(id)
        v = _lire(s.RetraitCibleSerializer, request)
        return Response(self.get_serializer(ciblage.retirer(cible, v.get("motif", ""))).data)


class MaListeCibleVue(VueCiblage):
    actions = {"GET": Action.CIBLES_LIRE}

    @extend_schema(responses=s.ListeCibleSerializer(many=True), operation_id="ciblage_moi")
    def get(self, request):
        """Listes des postes que l'utilisateur occupe : celle du délégué, à emporter sur le
        téléphone (CA2)."""
        pays = self.perimetre.pays_actif
        if pays is None:
            return Response([])
        occupes = ciblage.postes_occupes(request.user, pays).values("pk")
        return Response([self.liste(p) for p in self.postes().filter(pk__in=occupes)])
