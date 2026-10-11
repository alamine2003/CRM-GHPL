"""API de l'organisation d'un pays (ORG-003 à ORG-008), limitée au périmètre.

Lecture : `organisation.lire` ; écriture : `organisation.gerer` (siège, administrateur pays).
Une écriture exige un pays actif : le siège choisit d'abord un pays (en-tête X-Pays).
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identite.models import Utilisateur
from apps.identite.vues_comptes import _comptes_du_perimetre
from apps.perimetre.matrice import Action
from apps.perimetre.perimetre import Perimetre, calculer_perimetre
from apps.perimetre.vues import ENTETE_PAYS, VuePerimetre
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import aujourdhui

from . import serializers as s
from . import services
from .models import (
    Division,
    Localite,
    Occupation,
    PerimetreReseau,
    Poste,
    Rattachement,
    Remplacement,
    Reseau,
    Secteur,
    Zone,
    actif_le,
)
from .selecteurs import avec_details, postes_visibles

LIRE_GERER = {"GET": Action.ORGANISATION_LIRE, "POST": Action.ORGANISATION_GERER}


def pays_requis(perimetre: Perimetre):
    if perimetre.pays_actif is None:
        raise ErreurMetier("pays_requis", _("Choisissez d'abord un pays."))
    return perimetre.pays_actif


def _references(modele, perimetre: Perimetre, ids, code: str):
    """Objets du pays actif désignés par leurs identifiants ; un inconnu est refusé."""
    ids = list(dict.fromkeys(ids))
    objets = list(modele.objects.filter(pays=pays_requis(perimetre), pk__in=ids))
    if len(objets) != len(ids):
        raise ErreurMetier(code, _("Élément inconnu ou archivé dans ce pays."))
    return objets


def _reference(modele, perimetre, identifiant, code):
    return _references(modele, perimetre, [identifiant], code)[0]


def _personne(perimetre: Perimetre, identifiant) -> Utilisateur:
    """Compte visible dans le pays actif (pays principal ou affectation, ORG-009)."""
    try:
        return _comptes_du_perimetre(perimetre).get(pk=identifiant)
    except Utilisateur.DoesNotExist:
        raise ErreurMetier("personne_inconnue", _("Personne inconnue dans ce pays.")) from None


# --- Divisions, réseaux, zones, secteurs (ORG-003, réseaux minimaux pour ORG-005/008) --------


class VueElements(VuePerimetre):
    modele = None
    actions = LIRE_GERER

    def selection(self, perimetre):
        qs = self.modele.objects.select_related("pays")
        if self.modele is Secteur:
            qs = qs.select_related("zone")
        return perimetre.filtrer_par_pays(qs)

    def liste(self, request):
        qs = self.get_queryset()
        if request.query_params.get("actifs") == "1":
            qs = qs.filter(archive_le__isnull=True)
        return Response(self.get_serializer(qs, many=True).data)

    def cree(self, objet):
        return Response(self.get_serializer(objet).data, status=status.HTTP_201_CREATED)


def _lire(serializer_creation, request):
    donnees = serializer_creation(data=request.data)
    donnees.is_valid(raise_exception=True)
    return donnees.validated_data


class DivisionsVue(VueElements):
    modele, serializer_class = Division, s.DivisionSerializer

    @extend_schema(responses=s.DivisionSerializer(many=True), operation_id="divisions_liste")
    def get(self, request):
        return self.liste(request)

    @extend_schema(request=s.CreationDivisionSerializer, responses={201: s.DivisionSerializer},
                   operation_id="division_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.CreationDivisionSerializer, request)
        pays = pays_requis(self.perimetre)
        return self.cree(services.creer_division(pays, v["code"], v["libelle"]))


class ReseauxVue(VueElements):
    modele, serializer_class = Reseau, s.ReseauSerializer

    @extend_schema(responses=s.ReseauSerializer(many=True), operation_id="reseaux_liste")
    def get(self, request):
        return self.liste(request)

    @extend_schema(request=s.CreationReseauSerializer, responses={201: s.ReseauSerializer},
                   operation_id="reseau_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.CreationReseauSerializer, request)
        division = _reference(Division, self.perimetre, v["division"], "division_invalide")
        return self.cree(services.creer_reseau(division.pays, division, v["code"], v["libelle"]))


class ZonesVue(VueElements):
    modele, serializer_class = Zone, s.ZoneSerializer

    @extend_schema(responses=s.ZoneSerializer(many=True), operation_id="zones_liste")
    def get(self, request):
        return self.liste(request)

    @extend_schema(request=s.LibelleSerializer, responses={201: s.ZoneSerializer},
                   operation_id="zone_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.LibelleSerializer, request)
        return self.cree(services.creer_zone(pays_requis(self.perimetre), v["libelle"]))


class SecteursVue(VueElements):
    modele, serializer_class = Secteur, s.SecteurSerializer

    @extend_schema(responses=s.SecteurSerializer(many=True), operation_id="secteurs_liste")
    def get(self, request):
        return self.liste(request)

    @extend_schema(request=s.CreationSecteurSerializer, responses={201: s.SecteurSerializer},
                   operation_id="secteur_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.CreationSecteurSerializer, request)
        zone = _reference(Zone, self.perimetre, v["zone"], "zone_invalide")
        return self.cree(services.creer_secteur(zone.pays, zone, v["libelle"]))


class LocalitesVue(VueElements):
    modele, serializer_class = Localite, s.LocaliteSerializer

    @extend_schema(
        parameters=[OpenApiParameter("secteur", str, required=False)],
        responses=s.LocaliteSerializer(many=True),
        operation_id="localites_liste",
    )
    def get(self, request):
        qs = self.get_queryset()
        if secteur := request.query_params.get("secteur"):
            qs = qs.filter(secteur_id=secteur)
        if request.query_params.get("actifs") == "1":
            qs = qs.filter(archive_le__isnull=True)
        return Response(self.get_serializer(qs, many=True).data)

    @extend_schema(request=s.CreationLocaliteSerializer, responses={201: s.LocaliteSerializer},
                   operation_id="localite_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.CreationLocaliteSerializer, request)
        secteur = _reference(Secteur, self.perimetre, v["secteur"], "secteur_invalide")
        return self.cree(services.creer_localite(secteur, v["libelle"]))


def _vue_element(modele, serializer, nom):
    """Renommage (PATCH) et archivage (POST …/archiver/) d'un élément simple."""

    class Renommage(VueElements):
        actions = {"PATCH": Action.ORGANISATION_GERER}
        serializer_class = serializer

        @extend_schema(request=s.LibelleSerializer, responses=serializer,
                       operation_id=f"{nom}_renommer")  # fmt: skip
        def patch(self, request, id):
            objet = get_object_or_404(self.get_queryset(), pk=id)
            v = _lire(s.LibelleSerializer, request)
            return Response(serializer(services.renommer(objet, v["libelle"])).data)

    class Archivage(VueElements):
        actions = {"POST": Action.ORGANISATION_GERER}
        serializer_class = serializer

        @extend_schema(request=None, responses=serializer, operation_id=f"{nom}_archiver")
        def post(self, request, id):
            objet = get_object_or_404(self.get_queryset(), pk=id)
            return Response(serializer(services.archiver(objet)).data)

    Renommage.modele = Archivage.modele = modele
    Renommage.__name__ = f"{modele.__name__}RenommageVue"
    Archivage.__name__ = f"{modele.__name__}ArchivageVue"
    return Renommage, Archivage


DivisionVue, DivisionArchivageVue = _vue_element(Division, s.DivisionSerializer, "division")
ReseauVue, ReseauArchivageVue = _vue_element(Reseau, s.ReseauSerializer, "reseau")
ZoneVue, ZoneArchivageVue = _vue_element(Zone, s.ZoneSerializer, "zone")
_SecteurRenommageVue, SecteurArchivageVue = _vue_element(Secteur, s.SecteurSerializer, "secteur")


class SecteurVue(_SecteurRenommageVue):
    @extend_schema(request=s.ModificationSecteurSerializer, responses=s.SecteurSerializer,
                   operation_id="secteur_modifier")  # fmt: skip
    def patch(self, request, id):
        secteur = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.ModificationSecteurSerializer, request)
        with transaction.atomic():
            if "zone" in v:
                zone = _reference(Zone, self.perimetre, v["zone"], "zone_invalide")
                secteur = services.deplacer_secteur(secteur, zone)
            if "libelle" in v:
                secteur = services.renommer(secteur, v["libelle"])
        return Response(s.SecteurSerializer(secteur).data)


LocaliteVue, LocaliteArchivageVue = _vue_element(Localite, s.LocaliteSerializer, "localite")


# --- Postes, occupations, rattachements (ORG-005 à ORG-007) ----------------------------------


class VuePostes(VuePerimetre):
    serializer_class = s.PosteSerializer

    def selection(self, perimetre):
        return avec_details(postes_visibles(perimetre).select_related("pays"))

    def poste_vise(self) -> Poste:
        return get_object_or_404(self.get_queryset(), pk=self.kwargs["id"])

    def detail(self, poste):
        return Response(s.PosteSerializer(self.selection(self.perimetre).get(pk=poste.pk)).data)


class PostesVue(VuePostes):
    actions = LIRE_GERER

    @extend_schema(responses=s.PosteSerializer(many=True), operation_id="postes_liste")
    def get(self, request):
        qs = self.get_queryset()
        if request.query_params.get("actifs") == "1":
            qs = qs.filter(archive_le__isnull=True)
        return Response(s.PosteSerializer(qs, many=True).data)

    @extend_schema(request=s.CreationPosteSerializer, responses={201: s.PosteSerializer},
                   operation_id="poste_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.CreationPosteSerializer, request)
        poste = services.creer_poste(
            pays_requis(self.perimetre),
            v["type_poste"],
            v["libelle"],
            _references(Reseau, self.perimetre, v["reseaux"], "reseau_invalide"),
            _references(Secteur, self.perimetre, v["secteurs"], "secteur_invalide"),
        )
        reponse = self.detail(poste)
        reponse.status_code = status.HTTP_201_CREATED
        return reponse


class PosteVue(VuePostes):
    actions = {"GET": Action.ORGANISATION_LIRE, "PATCH": Action.ORGANISATION_GERER}

    @extend_schema(responses=s.PosteSerializer, operation_id="poste_detail")
    def get(self, request, id):
        return Response(s.PosteSerializer(self.poste_vise()).data)

    @extend_schema(request=s.ModificationPosteSerializer, responses=s.PosteSerializer,
                   operation_id="poste_modifier")  # fmt: skip
    def patch(self, request, id):
        poste = self.poste_vise()
        v = _lire(s.ModificationPosteSerializer, request)
        reseaux, secteurs = v.get("reseaux"), v.get("secteurs")
        services.modifier_poste(
            poste,
            libelle=v.get("libelle"),
            type_poste=v.get("type_poste"),
            reseaux=None
            if reseaux is None
            else _references(Reseau, self.perimetre, reseaux, "reseau_invalide"),
            secteurs=None
            if secteurs is None
            else _references(Secteur, self.perimetre, secteurs, "secteur_invalide"),
        )
        return self.detail(poste)


class PosteArchivageVue(VuePostes):
    actions = {"POST": Action.ORGANISATION_GERER}

    @extend_schema(request=None, responses=s.PosteSerializer, operation_id="poste_archiver")
    def post(self, request, id):
        return self.detail(services.archiver(self.poste_vise()))


class OccupationsVue(VuePostes):
    actions = LIRE_GERER

    @extend_schema(responses=s.OccupationSerializer(many=True), operation_id="occupations_liste")
    def get(self, request, id):
        poste = self.poste_vise()
        # Une requête neuve : le poste visé porte un préchargement réduit (avec_details).
        liens = Occupation.objects.filter(poste=poste).select_related("utilisateur", "poste",
                                                                      "pays")  # fmt: skip
        return Response(s.OccupationSerializer(liens, many=True).data)

    @extend_schema(request=s.OccupationCreationSerializer, responses={201: s.OccupationSerializer},
                   operation_id="occupation_creer")  # fmt: skip
    def post(self, request, id):
        poste = self.poste_vise()
        v = _lire(s.OccupationCreationSerializer, request)
        personne = _personne(self.perimetre, v["utilisateur"])
        lien = services.occuper(poste, personne, v.get("debut"))
        return Response(s.OccupationSerializer(lien).data, status=status.HTTP_201_CREATED)


class RattachementsVue(VuePostes):
    actions = LIRE_GERER

    @extend_schema(
        responses=s.RattachementSerializer(many=True), operation_id="rattachements_liste"
    )
    def get(self, request, id):
        liens = Rattachement.objects.filter(poste=self.poste_vise()).select_related(
            "superviseur", "pays"
        )
        return Response(s.RattachementSerializer(liens, many=True).data)

    @extend_schema(request=s.RattachementCreationSerializer,
                   responses={201: s.RattachementSerializer},
                   operation_id="rattachement_creer")  # fmt: skip
    def post(self, request, id):
        poste = self.poste_vise()
        v = _lire(s.RattachementCreationSerializer, request)
        superviseur = _personne(self.perimetre, v["superviseur"])
        lien = services.rattacher(poste, superviseur, v.get("debut"))
        return Response(s.RattachementSerializer(lien).data, status=status.HTTP_201_CREATED)


class OccupationFinVue(VuePerimetre):
    actions = {"POST": Action.ORGANISATION_GERER}
    serializer_class = s.OccupationSerializer

    def selection(self, perimetre):
        return Occupation.objects.select_related("utilisateur", "poste", "pays").filter(
            poste__in=postes_visibles(perimetre)
        )

    @extend_schema(request=s.FinSerializer, responses=s.OccupationSerializer,
                   operation_id="occupation_terminer")  # fmt: skip
    def post(self, request, id):
        lien = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.FinSerializer, request)
        return Response(s.OccupationSerializer(services.terminer(lien, v.get("fin"))).data)


# --- Périmètres de réseaux des DF et DM (ORG-008) --------------------------------------------


class PerimetresReseauxVue(VuePerimetre):
    actions = LIRE_GERER
    serializer_class = s.PerimetreReseauSerializer

    def selection(self, perimetre):
        return _comptes_du_perimetre(perimetre)

    @extend_schema(responses=s.PerimetreReseauSerializer(many=True),
                   operation_id="perimetres_reseaux_liste")  # fmt: skip
    def get(self, request, id):
        personne = get_object_or_404(self.get_queryset(), pk=id)
        liens = self.perimetre.filtrer_par_pays(
            PerimetreReseau.objects.select_related("reseau", "pays").filter(utilisateur=personne)
        )
        return Response(s.PerimetreReseauSerializer(liens, many=True).data)

    @extend_schema(request=s.PerimetreReseauCreationSerializer,
                   responses={201: s.PerimetreReseauSerializer},
                   operation_id="perimetre_reseau_ajouter")  # fmt: skip
    def post(self, request, id):
        personne = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.PerimetreReseauCreationSerializer, request)
        reseau = _reference(Reseau, self.perimetre, v["reseau"], "reseau_invalide")
        lien = services.ajouter_reseau_au_perimetre(personne, reseau, v.get("debut"))
        return Response(s.PerimetreReseauSerializer(lien).data, status=status.HTTP_201_CREATED)


class PerimetreReseauFinVue(VuePerimetre):
    actions = {"POST": Action.ORGANISATION_GERER}
    serializer_class = s.PerimetreReseauSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(PerimetreReseau.objects.select_related("reseau", "pays"))

    @extend_schema(request=s.FinSerializer, responses=s.PerimetreReseauSerializer,
                   operation_id="perimetre_reseau_terminer")  # fmt: skip
    def post(self, request, id):
        lien = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.FinSerializer, request)
        return Response(s.PerimetreReseauSerializer(services.terminer(lien, v.get("fin"))).data)


# --- Synthèse et « Mon organisation » ---------------------------------------------------------


class SyntheseVue(VuePerimetre):
    """Chiffres de l'organisation visible : postes vacants, postes sans superviseur…"""

    actions = {"GET": Action.ORGANISATION_LIRE}
    serializer_class = s.SyntheseSerializer

    def selection(self, perimetre):
        return postes_visibles(perimetre).filter(archive_le__isnull=True)

    @extend_schema(responses=s.SyntheseSerializer, operation_id="organisation_synthese")
    def get(self, request):
        p = self.perimetre
        postes = self.get_queryset()
        # Vue consolidée du siège : date UTC, à un jour près selon le fuseau des pays.
        jour = aujourdhui(p.pays_actif) if p.pays_actif else timezone.now().date()
        occupes = Occupation.objects.filter(actif_le(jour)).values("poste_id")
        rattaches = Rattachement.objects.filter(actif_le(jour)).values("poste_id")
        compte = postes.aggregate(
            total=Count("id", distinct=True),
            vacants=Count("id", filter=~Q(id__in=occupes), distinct=True),
            sans_superviseur=Count("id", filter=~Q(id__in=rattaches), distinct=True),
        )

        def nombre(modele):
            return p.filtrer_par_pays(modele.objects.filter(archive_le__isnull=True)).count()

        return Response(
            s.SyntheseSerializer(
                {
                    "divisions": nombre(Division),
                    "reseaux": nombre(Reseau),
                    "zones": nombre(Zone),
                    "secteurs": nombre(Secteur),
                    "postes": compte["total"],
                    "postes_vacants": compte["vacants"],
                    "postes_sans_superviseur": compte["sans_superviseur"],
                }
            ).data
        )


class MonOrganisationVue(APIView):
    """Le poste de l'utilisateur, son superviseur, ses réseaux, dans le pays actif.

    Point d'accès personnel : il ne renvoie que des liens de l'utilisateur lui-même.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=s.MonOrganisationSerializer, operation_id="mon_organisation")
    def get(self, request):
        from apps.identite.views import exiger_double_auth

        exiger_double_auth(request)
        perimetre = calculer_perimetre(request.user, request.META.get(ENTETE_PAYS))
        vide = {"postes": [], "postes_supervises": 0, "reseaux": [], "superviseur_manquant": False}
        pays = perimetre.pays_actif
        if pays is None or not perimetre.roles:
            return Response(s.MonOrganisationSerializer(vide).data)
        jour = aujourdhui(pays)
        moi = request.user
        occupations = (
            Occupation.objects.filter(actif_le(jour), utilisateur=moi, pays=pays)
            .select_related("poste", "pays", "utilisateur")
            .prefetch_related("poste__reseaux", "poste__secteurs")
            .order_by("-principal", "debut")
        )
        postes = []
        for occupation in occupations:
            poste = occupation.poste
            postes.append(
                {
                    "occupation": occupation,
                    "type_poste": poste.type_poste,
                    "type_libelle": poste.get_type_poste_display(),
                    "reseaux": list(poste.reseaux.all()),
                    "secteurs": list(poste.secteurs.all()),
                    "superviseur": services.superviseur_du_poste(poste, jour),
                }
            )
        principal = next((p for p in postes if p["occupation"].principal), None)
        return Response(
            s.MonOrganisationSerializer(
                {
                    "postes": postes,
                    "postes_supervises": Rattachement.objects.filter(
                        actif_le(jour), superviseur=moi, pays=pays
                    ).count(),
                    "reseaux": PerimetreReseau.objects.filter(
                        actif_le(jour), utilisateur=moi, pays=pays
                    ).select_related("reseau", "pays"),
                    "superviseur_manquant": principal is not None
                    and principal["superviseur"] is None,
                }
            ).data
        )


# --- Remplaçant daté d'un superviseur (ORG-013) ----------------------------------------------


def _remplacables(perimetre: Perimetre) -> set | None:
    """Superviseurs que l'utilisateur peut faire remplacer (prd.md §6.3) : tous pour
    l'administrateur pays (None), ceux de ses réseaux pour le DM, lui-même pour le
    superviseur."""
    from apps.identite.models import Role

    if Role.ADMIN_PAYS in perimetre.roles:
        return None
    ids = set()
    if Role.DM in perimetre.roles:
        ids |= services.superviseurs_du_dm(perimetre.utilisateur, pays_requis(perimetre))
    if Role.SUPERVISEUR in perimetre.roles:
        ids.add(perimetre.utilisateur.pk)
    return ids


class VueRemplacements(VuePerimetre):
    serializer_class = s.RemplacementSerializer

    def selection(self, perimetre):
        qs = perimetre.filtrer_par_pays(
            Remplacement.objects.filter(archive_le__isnull=True).select_related(
                "superviseur", "remplacant", "designe_par", "pays"
            )
        )
        portee = _remplacables(perimetre)
        if portee is None:
            return qs
        moi = perimetre.utilisateur.pk
        return qs.filter(Q(superviseur__in=portee) | Q(remplacant=moi))

    def exiger_portee(self, superviseur_id) -> None:
        portee = _remplacables(self.perimetre)
        if portee is not None and superviseur_id not in portee:
            raise ErreurMetier(
                "hors_perimetre", _("Ce superviseur n'est pas dans votre périmètre."),
                status.HTTP_404_NOT_FOUND,
            )  # fmt: skip


class RemplacementsVue(VueRemplacements):
    actions = {"GET": Action.REMPLACEMENTS_GERER, "POST": Action.REMPLACEMENTS_GERER}

    @extend_schema(responses=s.RemplacementSerializer(many=True),
                   operation_id="remplacements_liste")  # fmt: skip
    def get(self, request):
        jour = aujourdhui(pays_requis(self.perimetre))
        # Les remplacements en cours et à venir, puis les trente derniers jours.
        recents = self.get_queryset().filter(fin__gte=jour - timedelta(days=30))
        contexte = {"portee": _remplacables(self.perimetre)}
        return Response(
            s.RemplacementSerializer(recents.order_by("debut"), many=True, context=contexte).data
        )

    @extend_schema(request=s.CreationRemplacementSerializer,
                   responses={201: s.RemplacementSerializer},
                   operation_id="remplacement_designer")  # fmt: skip
    def post(self, request):
        v = _lire(s.CreationRemplacementSerializer, request)
        self.exiger_portee(v["superviseur"])
        pays = pays_requis(self.perimetre)
        remplacement = services.designer_remplacant(
            pays, _personne(self.perimetre, v["superviseur"]),
            _personne(self.perimetre, v["remplacant"]), v["debut"], v["fin"], request.user,
        )  # fmt: skip
        contexte = {"portee": _remplacables(self.perimetre)}
        return Response(
            s.RemplacementSerializer(remplacement, context=contexte).data,
            status=status.HTTP_201_CREATED,
        )


class RemplacementTerminerVue(VueRemplacements):
    actions = {"POST": Action.REMPLACEMENTS_GERER}

    @extend_schema(request=None, responses=s.RemplacementSerializer,
                   operation_id="remplacement_terminer")  # fmt: skip
    def post(self, request, id):
        remplacement = get_object_or_404(self.get_queryset(), pk=id)
        self.exiger_portee(remplacement.superviseur_id)
        remplacement = services.terminer_remplacement(remplacement)
        contexte = {"portee": _remplacables(self.perimetre)}
        return Response(s.RemplacementSerializer(remplacement, context=contexte).data)


class CandidatsRemplacementVue(VueRemplacements):
    actions = {"GET": Action.REMPLACEMENTS_GERER}

    @extend_schema(responses=s.CandidatsRemplacementSerializer,
                   operation_id="remplacements_candidats")  # fmt: skip
    def get(self, request):
        superviseurs = services.superviseurs_du_pays(pays_requis(self.perimetre))
        portee = _remplacables(self.perimetre)
        return Response(
            s.CandidatsRemplacementSerializer(
                {
                    "superviseurs": [p for p in superviseurs if portee is None or p.pk in portee],
                    "remplacants": superviseurs,
                }
            ).data
        )
