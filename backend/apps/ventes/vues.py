"""API du suivi des ventes (prd.md §14.84), limitée au périmètre.

Lecture : `ventes.lire` ; saisie et import : `ventes.gerer` (administrateur pays, et le siège
une fois un pays choisi). Une consultation nominative par le siège est auditée.
"""

from datetime import date

from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.identite.models import Utilisateur
from apps.imports import serializers as imp
from apps.organisation.models import Zone
from apps.organisation.vues import pays_requis
from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre
from apps.prospects.recherche import paginer
from apps.referentiel.models import Produit
from apps.socle.erreurs import ErreurMetier
from apps.socle.services import aujourdhui

from . import exports, importation, objectifs, selecteurs, services, synthese
from . import serializers as s
from .models import Client, ObjectifVente, SourceVente, TypeClient, Vente


def _lire(serializer, request):
    donnees = serializer(data=request.data)
    donnees.is_valid(raise_exception=True)
    return donnees.validated_data


def _mois(texte: str) -> date:
    annee, mois = texte.split("-")
    return date(int(annee), int(mois), 1)


def _periode(pays, v: dict) -> tuple[int, int]:
    """L'année choisie (par défaut celle du pays) et le mois où le cumul s'arrête (par défaut le
    mois en cours, ou décembre pour une année passée) ; jamais un mois qui n'est pas arrivé."""
    aujourd = aujourdhui(pays)
    annee = v.get("annee", aujourd.year)
    mois_fin = v.get("mois_fin") or (aujourd.month if annee == aujourd.year else 12)
    if annee == aujourd.year and mois_fin > aujourd.month:
        mois_fin = aujourd.month
    return annee, mois_fin


def _filtres(v: dict) -> dict:
    return {k: str(x) for k, x in v.items() if k in synthese.FILTRES}


def _avec_liens(lignes):
    return lignes.select_related(
        "delegue", "produit", "client__zone", "reseau", "zone"
    )  # fmt: skip


class VueVentes(VuePerimetre):
    def selection(self, perimetre):
        return selecteurs.lignes_visibles(perimetre)


class SyntheseVentesVue(VueVentes):
    """Le cumul de l'année (YTD) face à l'an passé, les ventes mois par mois, et la ventilation
    éclatée selon `par`, avec tous les filtres."""

    actions = {"GET": Action.VENTES_LIRE}
    serializer_class = s.SyntheseVentesSerializer

    @extend_schema(
        parameters=[s.ChoixSyntheseSerializer],
        responses=s.SyntheseVentesSerializer,
        operation_id="ventes_synthese",
    )
    def get(self, request):
        pays = pays_requis(self.perimetre)
        choix = s.ChoixSyntheseSerializer(data=request.query_params)
        choix.is_valid(raise_exception=True)
        v = choix.validated_data
        annee, mois_fin = _periode(pays, v)
        params = _filtres(v)
        donnees = synthese.synthese(
            self.get_queryset(), annee=annee, mois_fin=mois_fin, par=v["par"], params=params
        )
        donnees["devise"] = pays.devise
        if self.perimetre.est_siege and (v["par"] == "delegue" or v.get("delegue")):
            # Comme DSH-004 CA1 : toute consultation nominative par le siège est auditée.
            from apps.audit.services import enregistrer

            enregistrer("ventes.consultation_nominative", pays=pays, details={
                "annee": annee, "mois_fin": mois_fin, "par": v["par"],
                "filtres": params,
            })  # fmt: skip
        return Response(s.SyntheseVentesSerializer(donnees).data)


class ExportVentesVue(VueVentes):
    """VNT-006 (1.6.2) : exporter ce que la synthèse montre — la ventilation, les ventes
    mensuelles ou les lignes du cumul — en CSV ou en classeur Excel, avec la même période, les
    mêmes filtres et le même périmètre. Chaque export est inscrit au journal d'audit."""

    actions = {"GET": Action.VENTES_EXPORTER}

    @extend_schema(
        parameters=[s.ChoixExportVentesSerializer],
        responses={(200, "text/csv"): OpenApiTypes.BINARY,
                   (200, exports.FORMATS["xlsx"][0]): OpenApiTypes.BINARY},
        operation_id="ventes_export",
    )  # fmt: skip
    def get(self, request):
        from django.http import HttpResponse

        from apps.audit.services import enregistrer

        pays = pays_requis(self.perimetre)
        choix = s.ChoixExportVentesSerializer(data=request.query_params)
        choix.is_valid(raise_exception=True)
        v = choix.validated_data
        annee, mois_fin = _periode(pays, v)
        params = _filtres(v)
        if v["contenu"] == "lignes":
            qs = synthese.lignes_du_cumul(
                self.get_queryset(), annee=annee, mois_fin=mois_fin, params=params
            )
            if qs.count() > exports.LIGNES_MAX:
                raise ErreurMetier(
                    "export_trop_gros",
                    _("Trop de lignes pour un export : resserrez les filtres ou la période."),
                )
            entetes, rangees = exports.lignes(qs)
        else:
            donnees = synthese.synthese(
                self.get_queryset(), annee=annee, mois_fin=mois_fin, par=v["par"], params=params
            )
            if v["contenu"] == "mensuel":
                entetes, rangees = exports.mensuel(donnees)
            else:
                entetes, rangees = exports.ventilation(
                    donnees, synthese.libelle_regroupement(v["par"])
                )
        titres = {"ventilation": _("Ventes éclatées"), "mensuel": _("Ventes mensuelles"),
                  "lignes": _("Lignes de vente")}  # fmt: skip
        type_mime, extension = exports.FORMATS[v["fichier"]]
        contenu = (exports.en_xlsx(entetes, rangees, str(titres[v["contenu"]]))
                   if v["fichier"] == "xlsx" else exports.en_csv(entetes, rangees))  # fmt: skip
        enregistrer("export.ventes", pays=pays, details={
            "contenu": v["contenu"], "format": v["fichier"], "annee": annee,
            "mois_fin": mois_fin, "par": v["par"] if v["contenu"] == "ventilation" else "",
            "filtres": params, "lignes": len(rangees),
        })  # fmt: skip
        nom = f"ventes-{v['contenu']}-{pays.code.lower()}-{annee}-{mois_fin:02d}.{extension}"
        reponse = HttpResponse(contenu, content_type=type_mime)
        reponse["Content-Disposition"] = f'attachment; filename="{nom}"'
        return reponse


class OptionsVentesVue(VueVentes):
    actions = {"GET": Action.VENTES_LIRE}
    serializer_class = s.OptionsVentesSerializer

    @extend_schema(responses=s.OptionsVentesSerializer, operation_id="ventes_options")
    def get(self, request):
        pays = pays_requis(self.perimetre)
        lignes = self.get_queryset()
        aujourd = aujourdhui(pays)

        def distincts(champ_id, champ_libelle):
            return [
                {"id": i, "libelle": libelle}
                for i, libelle in lignes.exclude(**{f"{champ_id}__isnull": True})
                .values_list(champ_id, champ_libelle).distinct().order_by(champ_libelle)
            ]  # fmt: skip

        delegues = sorted(
            (
                {"id": u.pk, "nom": f"{u.first_name} {u.last_name}".strip() or u.username}
                for u in Utilisateur.objects.filter(pk__in=lignes.values("delegue_id").distinct())
            ),
            key=lambda d: d["nom"],
        )
        annees = sorted({m.year for m in lignes.dates("mois", "year")} | {aujourd.year},
                        reverse=True)  # fmt: skip
        donnees = {
            "annees": annees,
            "aujourdhui_annee": aujourd.year,
            "aujourdhui_mois": aujourd.month,
            "delegues": delegues,
            "produits": distincts("produit_id", "produit__libelle"),
            "classes": distincts("produit__classe_id", "produit__classe__libelle"),
            "reseaux": distincts("reseau_id", "reseau__libelle"),
            "zones": distincts("zone_id", "zone__libelle"),
            "types_client": [{"valeur": t.value, "libelle": t.label} for t in TypeClient],
        }
        return Response(s.OptionsVentesSerializer(donnees).data)


class LignesVentesVue(VueVentes):
    """Les lignes mensuelles (une page à la fois) ; l'administrateur pays en saisit."""

    actions = {"GET": Action.VENTES_LIRE, "POST": Action.VENTES_GERER}
    serializer_class = s.LigneVenteRenduSerializer

    @extend_schema(
        parameters=[
            OpenApiParameter("mois", OpenApiTypes.STR, required=False, description="AAAA-MM"),
            OpenApiParameter("delegue", OpenApiTypes.UUID, required=False),
            OpenApiParameter("produit", OpenApiTypes.UUID, required=False),
            OpenApiParameter("client", OpenApiTypes.UUID, required=False),
            OpenApiParameter("page", OpenApiTypes.INT, required=False),
            OpenApiParameter("taille", OpenApiTypes.INT, required=False),
        ],
        responses=s.PageLignesSerializer,
        operation_id="ventes_lignes",
    )
    def get(self, request):
        pays_requis(self.perimetre)
        p = request.query_params
        lignes = _avec_liens(self.get_queryset())
        if p.get("mois"):
            try:
                lignes = lignes.filter(mois=_mois(p["mois"]))
            except ValueError:
                raise ErreurMetier("filtre_invalide", _("Mois illisible."), champ="mois") from None
        for champ in ("delegue", "produit", "client"):
            if p.get(champ):
                lignes = lignes.filter(**{f"{champ}_id": p[champ]})
        resultats, pagination = paginer(lignes.order_by("-mois", "delegue__last_name", "id"), p)
        page = {**pagination, "resultats": [s.representer_ligne(v) for v in resultats]}
        return Response(s.PageLignesSerializer(page).data)

    @extend_schema(request=s.SaisieVenteSerializer, responses={201: s.LigneVenteRenduSerializer},
                   operation_id="ventes_saisir")  # fmt: skip
    def post(self, request):
        pays = pays_requis(self.perimetre)
        v = _lire(s.SaisieVenteSerializer, request)
        delegue = get_object_or_404(Utilisateur, pk=v["delegue"])
        produit = get_object_or_404(Produit, pk=v["produit"], pays=pays, archive_le__isnull=True)
        client = get_object_or_404(Client, pk=v["client"], pays=pays, archive_le__isnull=True)
        vente, _cree = services.enregistrer_ligne(
            pays, request.user, mois=_mois(v["mois"]), delegue=delegue, produit=produit,
            client=client, quantite=services.nombre(v["quantite"], "quantite", entier=True),
            montant_ttc=services.nombre(v["montant_ttc"], "montant_ttc"),
            source=SourceVente.SAISIE,
        )  # fmt: skip
        vente = _avec_liens(Vente.objects.filter(pk=vente.pk)).get()
        return Response(
            s.LigneVenteRenduSerializer(s.representer_ligne(vente)).data,
            status=status.HTTP_201_CREATED,
        )


class LigneVenteVue(VueVentes):
    actions = {"PATCH": Action.VENTES_GERER}
    serializer_class = s.LigneVenteRenduSerializer

    @extend_schema(request=s.ModificationVenteSerializer, responses=s.LigneVenteRenduSerializer,
                   operation_id="ventes_corriger")  # fmt: skip
    def patch(self, request, id):
        pays_requis(self.perimetre)
        vente = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.ModificationVenteSerializer, request)
        services.modifier_ligne(
            vente, request.user,
            quantite=services.nombre(v["quantite"], "quantite", entier=True)
            if "quantite" in v else None,
            montant_ttc=services.nombre(v["montant_ttc"], "montant_ttc")
            if "montant_ttc" in v else None,
        )  # fmt: skip
        vente = _avec_liens(Vente.objects.filter(pk=vente.pk)).get()
        return Response(s.LigneVenteRenduSerializer(s.representer_ligne(vente)).data)


class ArchiverLigneVenteVue(VueVentes):
    actions = {"POST": Action.VENTES_GERER}
    serializer_class = s.LigneVenteRenduSerializer

    @extend_schema(request=None, responses={204: None}, operation_id="ventes_archiver")
    def post(self, request, id):
        pays_requis(self.perimetre)
        services.archiver_ligne(get_object_or_404(self.get_queryset(), pk=id))
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClientsVentesVue(VueVentes):
    """Les clients (pharmacies, parapharmacies, grossistes) : la recherche aide à choisir celui
    d'une ligne ; l'administrateur pays en crée."""

    actions = {"GET": Action.VENTES_LIRE, "POST": Action.VENTES_GERER}
    serializer_class = s.ClientSerializer

    @staticmethod
    def _rendre(client: Client) -> dict:
        zone = client.zone
        return {
            "id": client.pk,
            "nom": client.nom,
            "type": client.type,
            "zone": None if zone is None else {"id": zone.pk, "libelle": zone.libelle},
        }

    @extend_schema(
        parameters=[OpenApiParameter("q", OpenApiTypes.STR, required=False),
                    OpenApiParameter("type", OpenApiTypes.STR, required=False)],
        responses=s.ClientSerializer(many=True), operation_id="ventes_clients",
    )  # fmt: skip
    def get(self, request):
        pays_requis(self.perimetre)
        clients = selecteurs.clients_du_pays(self.perimetre).select_related("zone")
        if request.query_params.get("q"):
            clients = clients.filter(nom__icontains=request.query_params["q"].strip())
        if request.query_params.get("type") in TypeClient.values:
            clients = clients.filter(type=request.query_params["type"])
        return Response([self._rendre(c) for c in clients.order_by("nom")[:50]])

    @extend_schema(request=s.SaisieClientSerializer, responses={201: s.ClientSerializer},
                   operation_id="ventes_client_creer")  # fmt: skip
    def post(self, request):
        pays = pays_requis(self.perimetre)
        v = _lire(s.SaisieClientSerializer, request)
        zone = None
        if v.get("zone"):
            zone = get_object_or_404(Zone, pk=v["zone"], pays=pays)
        client = services.creer_client(pays, v["nom"], v["type"], zone)
        return Response(self._rendre(client), status=status.HTTP_201_CREATED)


class ImportVentesVue(VueVentes):
    """Simuler puis importer le fichier de ventes (classeur Excel)."""

    actions = {"POST": Action.VENTES_GERER}
    parser_classes = [MultiPartParser]
    serializer_class = imp.DetailLotSerializer

    @extend_schema(request={"multipart/form-data": imp.ImportBirdNotesSerializer},
                   responses={201: imp.DetailLotSerializer},
                   operation_id="import_ventes")  # fmt: skip
    def post(self, request):
        donnees = imp.ImportBirdNotesSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        fichier = donnees.validated_data["fichier"]
        lot = importation.importer(
            pays_requis(self.perimetre), request.user, fichier.read(), fichier.name,
            simulation=donnees.validated_data["simulation"],
        )  # fmt: skip
        return Response(imp.DetailLotSerializer(lot).data, status=status.HTTP_201_CREATED)


def _objectif_rendu(objectif: ObjectifVente, mois_fin: int) -> dict:
    suivi = objectifs.suivi(objectif, mois_fin)

    def element(o, champ="libelle"):
        return None if o is None else {"id": o.pk, "libelle": getattr(o, champ)}

    return {
        "id": objectif.pk, "reseau": element(objectif.reseau), "produit": element(objectif.produit),
        "annee": objectif.annee, **suivi, "repartition_libre": bool(objectif.mois),
    }  # fmt: skip


def _total_objectifs(rendus: list[dict]) -> dict | None:
    """Le total des seuls objectifs de réseau : ceux de produit en sont le détail."""
    reseaux = [o for o in rendus if o["produit"] is None]
    if not reseaux:
        return None
    cible, attendu, realise = (sum(o[k] for o in reseaux) for k in ("cible", "attendu", "realise"))

    def taux(a, b):
        return round(float(a / b) * 100, 1) if b else None

    return {"cible": cible, "attendu": attendu, "realise": realise,
            "taux_cible": taux(realise, cible), "taux_attendu": taux(realise, attendu)}  # fmt: skip


class VueObjectifsVentes(VuePerimetre):
    def selection(self, perimetre):
        return objectifs.objectifs_visibles(perimetre)


class ObjectifsVentesVue(VueObjectifsVentes):
    """Les objectifs de ventes de l'année, avec le cumul de l'année (YTD) face à la cible et à
    l'attendu ; l'administrateur pays en fixe."""

    actions = {"GET": Action.VENTES_OBJECTIFS_LIRE, "POST": Action.VENTES_OBJECTIFS_GERER}
    serializer_class = s.ObjectifsVentesSerializer

    @extend_schema(
        parameters=[s.ChoixObjectifsSerializer],
        responses=s.ObjectifsVentesSerializer,
        operation_id="ventes_objectifs",
    )
    def get(self, request):
        pays = pays_requis(self.perimetre)
        choix = s.ChoixObjectifsSerializer(data=request.query_params)
        choix.is_valid(raise_exception=True)
        annee, mois_fin = _periode(pays, choix.validated_data)
        rendus = [
            _objectif_rendu(o, mois_fin)
            for o in objectifs.objectifs_visibles(self.perimetre, annee).order_by(
                "reseau__libelle", "produit__libelle"
            )
        ]
        gerables = []
        if Action.VENTES_OBJECTIFS_GERER.value in self.perimetre.actions():
            from apps.pilotage.objectifs import reseaux_geres
            from apps.referentiel.models import Portefeuille

            for reseau in reseaux_geres(self.perimetre).order_by("libelle"):
                produits = {
                    lien.produit_id: lien.produit
                    for lien in Portefeuille.objects.filter(
                        reseau=reseau, archive_le__isnull=True
                    ).select_related("produit")
                }
                gerables.append({
                    "id": reseau.pk, "libelle": reseau.libelle,
                    "produits": [
                        {"id": p.pk, "libelle": p.libelle}
                        for p in sorted(produits.values(), key=lambda p: p.libelle)
                    ],
                })  # fmt: skip
        donnees = {
            "devise": pays.devise, "annee": annee, "mois_fin": mois_fin, "objectifs": rendus,
            "total": _total_objectifs(rendus), "reseaux_gerables": gerables,
        }  # fmt: skip
        return Response(s.ObjectifsVentesSerializer(donnees).data)

    @extend_schema(
        request=s.SaisieObjectifVenteSerializer,
        responses={201: s.ObjectifVenteRenduSerializer},
        operation_id="ventes_objectif_creer",
    )
    def post(self, request):
        from apps.organisation.models import Reseau

        pays = pays_requis(self.perimetre)
        v = _lire(s.SaisieObjectifVenteSerializer, request)
        reseau = get_object_or_404(Reseau, pk=v["reseau"], pays=pays, archive_le__isnull=True)
        produit = (
            get_object_or_404(Produit, pk=v["produit"], pays=pays, archive_le__isnull=True)
            if v.get("produit") else None
        )  # fmt: skip
        objectif = objectifs.creer(
            self.perimetre, reseau=reseau, annee=v["annee"], cible=v.get("cible"),
            mois=v.get("mois"), produit=produit,
        )  # fmt: skip
        _annee, mois_fin = _periode(pays, {"annee": objectif.annee})
        return Response(
            s.ObjectifVenteRenduSerializer(_objectif_rendu(objectif, mois_fin)).data,
            status=status.HTTP_201_CREATED,
        )


class ObjectifVenteVue(VueObjectifsVentes):
    actions = {"PATCH": Action.VENTES_OBJECTIFS_GERER}
    serializer_class = s.ObjectifVenteRenduSerializer

    @extend_schema(
        request=s.ModificationObjectifVenteSerializer,
        responses=s.ObjectifVenteRenduSerializer,
        operation_id="ventes_objectif_corriger",
    )
    def patch(self, request, id):
        pays = pays_requis(self.perimetre)
        objectif = get_object_or_404(self.get_queryset(), pk=id)
        champs = _lire(s.ModificationObjectifVenteSerializer, request)
        objectifs.modifier(self.perimetre, objectif, champs)
        _annee, mois_fin = _periode(pays, {"annee": objectif.annee})
        return Response(s.ObjectifVenteRenduSerializer(_objectif_rendu(objectif, mois_fin)).data)


class ArchiverObjectifVenteVue(VueObjectifsVentes):
    actions = {"POST": Action.VENTES_OBJECTIFS_GERER}
    serializer_class = s.ObjectifVenteRenduSerializer

    @extend_schema(request=None, responses={204: None}, operation_id="ventes_objectif_archiver")
    def post(self, request, id):
        pays_requis(self.perimetre)
        objectifs.archiver(self.perimetre, get_object_or_404(self.get_queryset(), pk=id))
        return Response(status=status.HTTP_204_NO_CONTENT)
