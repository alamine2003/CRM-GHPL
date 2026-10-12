"""API des rapports de visite (cycle 0.5).

- Rapport d'une visite (RPT-001, RPT-002) : `rapports.rediger`, sur ses propres visites.
- Chronologie des rapports d'un prospect (RPT-011) : `rapports.lire`, dans le périmètre.
- Champs du rapport par pays (RPT-008) : lus avec les paramètres du pays, gérés par qui les
  modifie (administrateur pays, siège).
"""

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.organisation.vues import _lire, pays_requis
from apps.perimetre.matrice import Action
from apps.perimetre.vues import VuePerimetre
from apps.planning.models import Visite
from apps.socle.erreurs import ErreurMetier

from . import serializers as s
from . import serializers_file as sf
from . import services
from .models import ChampRapport, PieceJointe, Rapport, StatutRapport

REDIGER = Action.RAPPORTS_REDIGER
LIRE = Action.RAPPORTS_LIRE
VALIDER = Action.RAPPORTS_VALIDER


class VueVisitesDuDelegue(VuePerimetre):
    serializer_class = s.RapportSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(
            Visite.objects.filter(planning__delegue=self.request.user, archive_le__isnull=True)
        ).select_related("planning", "reseau")


class RapportVisiteVue(VueVisitesDuDelegue):
    """RPT-001 : le rapport de la visite effectuée, ouvert en brouillon à la première lecture."""

    actions = {"GET": REDIGER, "PUT": REDIGER}

    @extend_schema(responses=s.RapportSerializer, operation_id="rapport_lire")
    def get(self, request, id):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        return Response(s.RapportSerializer(services.rapport_de(visite)).data)

    @extend_schema(request=s.SaisieRapportSerializer, responses=s.RapportSerializer,
                   operation_id="rapport_enregistrer")  # fmt: skip
    def put(self, request, id):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.SaisieRapportSerializer, request)
        rapport = services.enregistrer(services.rapport_de(visite), **v)
        return Response(s.RapportSerializer(rapport).data)


class ModelesRapportVue(VueVisitesDuDelegue):
    """OFF-002 (0.8.2) : pour chaque visite de la semaine et de la suivante, son rapport ou un
    modèle vierge (champs du pays, produits, résultats, types d'action), à garder sur le
    téléphone : le rapport s'écrit sans réseau, même jamais ouvert."""

    actions = {"GET": REDIGER}

    @extend_schema(responses=s.ModelesRapportSerializer, operation_id="synchro_rapports")
    def get(self, request):
        from datetime import timedelta

        from django.utils import timezone

        from apps.planning.calendrier import lundi
        from apps.planning.etats import StatutVisite
        from apps.socle.services import aujourdhui

        pays = pays_requis(self.perimetre)
        debut = lundi(aujourdhui(pays))
        visites = self.get_queryset().filter(
            date__gte=debut, date__lt=debut + timedelta(days=14),
            statut__in=(StatutVisite.PREVUE, StatutVisite.EN_COURS, StatutVisite.EFFECTUEE),
        ).select_related("planning", "reseau", "pays").order_by("date", "heure")  # fmt: skip
        visites = list(visites)
        # 0.9.4 : les rapports existants et leurs pièces en deux requêtes, les listes du pays
        # et des portefeuilles une fois par réponse (`memo`).
        existants = {
            r.visite_id: r
            for r in Rapport.objects.filter(visite__in=visites).prefetch_related("pieces_jointes")
        }
        for v in visites:
            if v.pk in existants:  # la visite et le pays déjà lus
                existants[v.pk].visite, existants[v.pk].pays = v, v.pays
        definitions = [c.definition() for c in services.champs_actifs(pays)]
        donnees = {
            "genere_le": timezone.now(),
            "rapports": [
                {"visite": v.pk,
                 "rapport": existants.get(v.pk) or services.modele_vierge(v, definitions)}
                for v in visites
            ],
        }  # fmt: skip
        return Response(s.ModelesRapportSerializer(donnees, context={"memo": {}}).data)


class SoumissionRapportVue(VueVisitesDuDelegue):
    """RPT-002 CA1 : la soumission exige le socle et les champs obligatoires du pays. RPT-010 :
    version figée, retard après 23 h 59 le jour de la visite, heure du téléphone contrôlée."""

    actions = {"POST": REDIGER}

    @extend_schema(request=s.SoumissionRapportSerializer, responses=s.RapportSerializer,
                   operation_id="rapport_soumettre")  # fmt: skip
    def post(self, request, id):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.SoumissionRapportSerializer, request)
        rapport = services.soumettre(services.rapport_de(visite), v["soumis_le"],
                                     v.get("envoye_le"))  # fmt: skip
        return Response(s.RapportSerializer(rapport).data)


class PiecesRapportVue(VueVisitesDuDelegue):
    """RPT-007 : joindre un document PDF au rapport de sa visite."""

    actions = {"POST": REDIGER}
    parser_classes = [MultiPartParser]

    @extend_schema(request={"multipart/form-data": s.SaisiePieceSerializer},
                   responses={201: s.PieceJointeSerializer},
                   operation_id="piece_jointe_ajouter")  # fmt: skip
    def post(self, request, id):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.SaisiePieceSerializer, request)
        piece = services.joindre(services.rapport_de(visite), **v)
        return Response(s.PieceJointeSerializer(piece).data, status=status.HTTP_201_CREATED)


class AnnoncePieceVue(VueVisitesDuDelegue):
    """OFF-005 (0.8.7) : le téléphone annonce un document ; son fichier suivra."""

    actions = {"POST": REDIGER}

    @extend_schema(request=s.AnnoncePieceSerializer, responses={201: s.PieceJointeSerializer},
                   operation_id="piece_jointe_annoncer")  # fmt: skip
    def post(self, request, id):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.AnnoncePieceSerializer, request)
        piece = services.annoncer(services.rapport_de(visite), **v)
        return Response(s.PieceJointeSerializer(piece).data, status=status.HTTP_201_CREATED)


def _fichier(p: PieceJointe):
    """Le fichier d'une pièce ; annoncée, elle n'en a pas encore (OFF-005)."""
    if p.recue_le is None:
        raise ErreurMetier("piece_en_attente",
                           _("Ce document n'est pas encore arrivé du téléphone."),
                           status.HTTP_409_CONFLICT)  # fmt: skip
    reponse = FileResponse(p.fichier.open("rb"), content_type=p.type_mime,
                           as_attachment=False, filename=p.nom)  # fmt: skip
    reponse["Cache-Control"] = "private, no-store"
    reponse["X-Content-Type-Options"] = "nosniff"
    # 0.9.3 : ouvert dans un navigateur, le PDF n'exécute ni script ni formulaire.
    reponse["Content-Security-Policy"] = "sandbox; default-src 'none'; frame-ancestors 'none'"
    return reponse


class PieceRapportVue(VueVisitesDuDelegue):
    """RPT-007 CA2 : la pièce jointe ne se lit que par qui voit le rapport ; elle se retire
    tant que le rapport n'est pas soumis."""

    actions = {"GET": REDIGER, "DELETE": REDIGER}

    def _piece(self, id, piece):
        visite = get_object_or_404(self.get_queryset(), pk=id)
        return get_object_or_404(PieceJointe, pk=piece, rapport__visite=visite,
                                 archive_le__isnull=True)  # fmt: skip

    @extend_schema(responses={(200, "application/octet-stream"): OpenApiTypes.BINARY},
                   operation_id="piece_jointe_lire")  # fmt: skip
    def get(self, request, id, piece):
        return _fichier(self._piece(id, piece))

    @extend_schema(responses={204: None}, operation_id="piece_jointe_retirer")
    def delete(self, request, id, piece):
        services.retirer_piece(self._piece(id, piece))
        return Response(status=status.HTTP_204_NO_CONTENT)


class VueChamps(VuePerimetre):
    serializer_class = s.ChampRapportSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(ChampRapport.objects.filter(archive_le__isnull=True))


class ChampsRapportVue(VueChamps):
    actions = {"GET": Action.PARAMETRES_LIRE, "POST": Action.PARAMETRES_MODIFIER}

    @extend_schema(responses=s.ChampRapportSerializer(many=True), operation_id="champs_rapport")
    def get(self, request):
        champs = services.champs_actifs(pays_requis(self.perimetre))
        return Response(s.ChampRapportSerializer(champs, many=True).data)

    @extend_schema(request=s.SaisieChampSerializer, responses={201: s.ChampRapportSerializer},
                   operation_id="champ_rapport_creer")  # fmt: skip
    def post(self, request):
        v = _lire(s.SaisieChampSerializer, request)
        champ = services.creer_champ(pays_requis(self.perimetre), **v)
        return Response(s.ChampRapportSerializer(champ).data, status=status.HTTP_201_CREATED)


class ChampRapportVue(VueChamps):
    actions = {"PATCH": Action.PARAMETRES_MODIFIER}

    @extend_schema(request=s.ModificationChampSerializer, responses=s.ChampRapportSerializer,
                   operation_id="champ_rapport_modifier")  # fmt: skip
    def patch(self, request, id):
        champ = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(s.ModificationChampSerializer, request)
        return Response(s.ChampRapportSerializer(services.modifier_champ(champ, **v)).data)


class ChampRapportArchivageVue(VueChamps):
    actions = {"POST": Action.PARAMETRES_MODIFIER}

    @extend_schema(request=None, responses=s.ChampRapportSerializer,
                   operation_id="champ_rapport_archiver")  # fmt: skip
    def post(self, request, id):
        champ = get_object_or_404(self.get_queryset(), pk=id)
        return Response(s.ChampRapportSerializer(services.archiver_champ(champ)).data)


class ChronologieProspectVue(VuePerimetre):
    """RPT-011 : les rapports d'un prospect que l'on a le droit de lire, du plus récent au
    plus ancien ; CA1 : un délégué ne voit que les siens."""

    actions = {"GET": LIRE}
    serializer_class = s.RapportChronologieSerializer

    def selection(self, perimetre):
        from apps.prospects.services import prospects_visibles

        return prospects_visibles(perimetre)

    @extend_schema(responses=s.RapportChronologieSerializer(many=True),
                   operation_id="prospect_rapports")  # fmt: skip
    def get(self, request, id):
        from .chronologie import chronologie

        prospect = get_object_or_404(self.get_queryset(), pk=id)
        rapports = chronologie(self.perimetre, prospect)
        return Response(s.RapportChronologieSerializer(
            rapports, many=True, context={"lecteur": request.user}).data)  # fmt: skip


class HistoriqueSynchroVue(VuePerimetre):
    """OFF-001 (0.8.1) : en une lecture, les trois derniers rapports de chaque prospect de sa
    liste cible, que le téléphone garde pour travailler sans réseau."""

    actions = {"GET": LIRE}
    serializer_class = s.HistoriqueSynchroSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Rapport.objects.none())

    @extend_schema(responses=s.HistoriqueSynchroSerializer, operation_id="synchro_historique")
    def get(self, request):
        from django.utils import timezone

        from .chronologie import historique_liste_cible

        contexte = {"lecteur": request.user}
        donnees = {
            "genere_le": timezone.now(),
            "prospects": [
                {"prospect": p, "rapports": s.RapportChronologieSerializer(
                    rapports, many=True, context=contexte).data}
                for p, rapports in historique_liste_cible(self.perimetre)
            ],
        }  # fmt: skip
        return Response(donnees)


class VisitesProposeesVue(VuePerimetre):
    """DC-61 : à la préparation de la semaine, les visites proposées dans ses rapports et pas
    encore replanifiées."""

    actions = {"GET": REDIGER}
    serializer_class = s.VisiteProposeeSerializer

    def selection(self, perimetre):
        return Rapport.objects.none()

    @extend_schema(responses=s.VisiteProposeeSerializer(many=True),
                   operation_id="visites_proposees")  # fmt: skip
    def get(self, request):
        from .chronologie import visites_proposees

        rapports = [r for r in visites_proposees(request.user)
                    if r.pays_id == getattr(self.perimetre.pays_actif, "pk", None)]  # fmt: skip
        return Response(s.VisiteProposeeSerializer(rapports, many=True).data)


class ATraiterVue(VuePerimetre):
    """RPT-012 : la file de travail du superviseur, ses journées à traiter par délégué (CA1),
    et le nombre de plannings qui attendent sa décision (DC-47, engagement 3)."""

    actions = {"GET": VALIDER}
    serializer_class = sf.ATraiterSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Rapport.objects.none())

    @extend_schema(responses=sf.ATraiterSerializer, operation_id="rapports_a_traiter")
    def get(self, request):
        from apps.planning.services import plannings_a_valider

        from .file import journees_a_traiter

        pays = pays_requis(self.perimetre)
        donnees = {
            "delegues": journees_a_traiter(request.user, pays),
            "plannings_a_valider": len(plannings_a_valider(request.user, pays)),
        }
        return Response(sf.ATraiterSerializer(donnees).data)


class JourneeVue(VuePerimetre):
    """0.6.2 : une journée d'un délégué, ses visites et leurs rapports, pour le responsable du
    poste ou son remplaçant (`?delegue=<id>&date=AAAA-MM-JJ`)."""

    actions = {"GET": VALIDER}
    serializer_class = sf.JourneeSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Rapport.objects.none())

    @extend_schema(
        parameters=[OpenApiParameter("delegue", OpenApiTypes.UUID, required=True),
                    OpenApiParameter("date", OpenApiTypes.DATE, required=True)],
        responses=sf.JourneeSerializer, operation_id="rapports_journee",
    )  # fmt: skip
    def get(self, request):
        from .journee import journee

        choix = sf.ChoixJourneeSerializer(data=request.query_params)
        choix.is_valid(raise_exception=True)
        v = choix.validated_data
        pays = pays_requis(self.perimetre)
        donnees = journee(request.user, pays, v["delegue"], v["date"])
        return Response(sf.JourneeSerializer(donnees).data)


class PieceLueVue(VuePerimetre):
    """RPT-007 CA2 : une pièce jointe se lit par qui voit le rapport (`rapports.lire`, dans le
    périmètre : le superviseur, le DM, le DF, le responsable pays) ; jamais d'un brouillon."""

    actions = {"GET": LIRE}

    def selection(self, perimetre):
        from .chronologie import rapports_visibles

        return PieceJointe.objects.filter(
            rapport__in=rapports_visibles(perimetre), archive_le__isnull=True
        ).exclude(rapport__statut=StatutRapport.BROUILLON)

    @extend_schema(responses={(200, "application/octet-stream"): OpenApiTypes.BINARY},
                   operation_id="piece_jointe_consulter")  # fmt: skip
    def get(self, request, id):
        return _fichier(get_object_or_404(self.get_queryset(), pk=id))


class ValidationRapportVue(VuePerimetre):
    """RPT-013 : valider un rapport soumis, seul (mode `unitaire`, ou `remplacement`,
    `escalade`, RPT-018)."""

    actions = {"POST": VALIDER}

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Rapport.objects.select_related("visite__planning"))

    @extend_schema(request=None, responses=sf.RapportLuSerializer,
                   operation_id="rapport_valider")  # fmt: skip
    def post(self, request, id):
        from .validation import valider_rapport

        rapport = get_object_or_404(self.get_queryset(), pk=id)
        rapport = valider_rapport(rapport, request.user)
        return Response(sf.RapportLuSerializer(rapport).data)


class ValidationJourneeVue(VuePerimetre):
    """RPT-013 : valider une journée ; 22.A : tous ses rapports doivent être soumis."""

    actions = {"POST": VALIDER}

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Rapport.objects.none())

    @extend_schema(request=sf.JourneeChoisieSerializer, responses=sf.ResultatValidationSerializer,
                   operation_id="journee_valider")  # fmt: skip
    def post(self, request):
        from .validation import planning_du_jour, valider_journee

        v = _lire(sf.JourneeChoisieSerializer, request)
        pays = pays_requis(self.perimetre)
        planning, titre = planning_du_jour(request.user, pays, v["delegue"], v["date"])
        n = valider_journee(planning, v["date"], request.user, titre)
        return Response(sf.ResultatValidationSerializer({"journees": 1, "rapports": n}).data)


class ValidationLotVue(VuePerimetre):
    """RPT-013 CA1, RG-035 : « Valider les n conformes » ; 23.A : seules les journées
    conformes, complètes et sans horodatage douteux."""

    actions = {"POST": VALIDER}

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Rapport.objects.none())

    @extend_schema(request=sf.ValidationLotSerializer, responses=sf.ResultatValidationSerializer,
                   operation_id="lot_valider")  # fmt: skip
    def post(self, request):
        from .validation import valider_lot

        v = _lire(sf.ValidationLotSerializer, request)
        pays = pays_requis(self.perimetre)
        resultat = valider_lot(request.user, pays,
                               [(j["delegue"], j["date"]) for j in v["journees"]])  # fmt: skip
        return Response(sf.ResultatValidationSerializer(resultat).data)


class CorrectionRapportVue(VuePerimetre):
    """RPT-014 : renvoyer un rapport soumis au délégué, avec un commentaire (CA1) et les
    champs à revoir ; sans échéance (DC-60)."""

    actions = {"POST": VALIDER}

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Rapport.objects.select_related("visite__planning"))

    @extend_schema(request=sf.DemandeCorrectionSerializer, responses=sf.RapportLuSerializer,
                   operation_id="rapport_correction")  # fmt: skip
    def post(self, request, id):
        from .validation import demander_correction

        rapport = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(sf.DemandeCorrectionSerializer, request)
        rapport = demander_correction(rapport, request.user, v["commentaire"], v["champs"])
        return Response(sf.RapportLuSerializer(rapport).data)


class ReouvertureRapportVue(VuePerimetre):
    """RPT-016 : rouvrir un rapport validé, avec un motif ; le responsable jusqu'à 30 jours
    après la validation, l'administrateur pays au-delà (CA1)."""

    actions = {"POST": VALIDER}

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Rapport.objects.select_related("visite__planning"))

    @extend_schema(request=sf.DemandeReouvertureRapportSerializer, responses=sf.RapportLuSerializer,
                   operation_id="rapport_rouvrir")  # fmt: skip
    def post(self, request, id):
        from .validation import rouvrir

        rapport = get_object_or_404(self.get_queryset(), pk=id)
        v = _lire(sf.DemandeReouvertureRapportSerializer, request)
        rapport = rouvrir(rapport, request.user, v["motif"])
        return Response(sf.RapportLuSerializer(rapport).data)


class RetardsVue(VuePerimetre):
    """RPT-017 : les rapports en retard et les journées anciennes non validées
    (`?delegue=<id>` pour un seul délégué, CA1)."""

    actions = {"GET": VALIDER}
    serializer_class = sf.RetardsSerializer

    def selection(self, perimetre):
        return perimetre.filtrer_par_pays(Rapport.objects.none())

    @extend_schema(parameters=[OpenApiParameter("delegue", OpenApiTypes.UUID, required=False)],
                   responses=sf.RetardsSerializer, operation_id="rapports_retards")  # fmt: skip
    def get(self, request):
        from .retards import retards

        choix = sf.ChoixRetardsSerializer(data=request.query_params)
        choix.is_valid(raise_exception=True)
        pays = pays_requis(self.perimetre)
        donnees = retards(request.user, pays, choix.validated_data.get("delegue"))
        return Response(sf.RetardsSerializer(donnees).data)
