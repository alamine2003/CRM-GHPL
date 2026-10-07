import type { Journee, RapportLu, VisiteJournee } from '@innov/api-client';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import { Box, Button, Card, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur } from 'react-router';
import { texteEcart } from '../composants/conformiteTextes';
import { EnTeteCarte, Etiquette } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

type Traduire = ReturnType<typeof useTranslation>['t'];

/**
 * Une journée d'un délégué, ouverte depuis « À traiter » (0.6.2) : ses contrôles, puis chaque
 * visite avec ce qui s'est passé et son rapport soumis, en entier — produits et retours,
 * remises, résultat, suite prévue, champs du pays, pièces jointes (RPT-007 CA2), retard et
 * horodatage douteux (RPT-010 CA1). Un brouillon reste au délégué : seul son état s'affiche.
 */
export default function JourneeRapports({ cle }: { cle: string }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [delegue, date] = cle.split('/') as [string, string];
  const journee = useQuery({
    queryKey: ['rapports-journee', delegue, date],
    queryFn: () => client.rapports.journee(delegue, date),
  });
  const jour = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`));
  const retour = (
    <Button component={LienRouteur} to="/a-traiter" startIcon={<ArrowBackRounded />}>
      {t('navigation.aTraiter')}
    </Button>
  );

  if (journee.isError) {
    return (
      <Stack spacing={2}>
        <Box>{retour}</Box>
        <ErreurChargement erreur={journee.error} reessayer={() => void journee.refetch()} />
      </Stack>
    );
  }
  if (!journee.data) {
    return (
      <Stack spacing={2}>
        <Box>{retour}</Box>
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={320} />
      </Stack>
    );
  }
  const j = journee.data;
  const conforme = j.classement === 'conforme';
  return (
    <Stack spacing={2.5}>
      <Box sx={{ ml: -1 }}>{retour}</Box>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1">
            {j.delegue.prenom} {j.delegue.nom}
          </Typography>
          <Typography
            sx={{ color: 'text.secondary', '&::first-letter': { textTransform: 'uppercase' } }}
          >
            {jour}
          </Typography>
        </Box>
        <Button variant="outlined" component={LienRouteur} to={`/validation/${j.planning}`}>
          {t('aTraiter.consulter')}
        </Button>
      </Stack>

      <Card component="section" aria-labelledby="controles-journee">
        <Box sx={{ px: 2, py: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {conforme ? (
              <CheckCircleRounded sx={{ color: 'success.main', fontSize: 20 }} />
            ) : (
              <ErrorOutlineRounded sx={{ color: 'warning.main', fontSize: 20 }} />
            )}
            <Typography id="controles-journee" variant="h6" component="h2">
              {t('journee.controles')}
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: conforme ? 'success.main' : 'warning.main' }}
            >
              {conforme
                ? t('conformite.conforme')
                : t('conformite.aVerifier', { count: j.ecarts.length })}
            </Typography>
          </Stack>
          {j.ecarts.map((e, i) => (
            <Typography
              key={`${e.code}-${e.visite ?? i}`}
              variant="body2"
              sx={{ pl: 3.5, pt: 0.5, overflowWrap: 'anywhere' }}
            >
              {texteEcart(e, t)}
            </Typography>
          ))}
          {j.activites.map((a) => (
            <Typography
              key={a.id}
              variant="body2"
              sx={{ pl: 3.5, pt: 0.5, color: 'text.secondary' }}
            >
              {t('activites.ligne', {
                type: t(`activites.types.${a.type}`),
                periode: t(`activites.periodes.${a.periode ?? 'journee'}`),
              })}
            </Typography>
          ))}
        </Box>
      </Card>

      <Stack spacing={1.5} component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {j.visites.map((v) => (
          <Box component="li" key={v.id}>
            <CarteVisite visite={v} ecarts={j.ecarts.filter((e) => e.visite === v.id)} />
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

function heureLocale(iso: string | null | undefined, langue: string) {
  return iso
    ? new Intl.DateTimeFormat(langue, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : null;
}

/** Ce qui s'est passé pendant la visite : heures, durée, distance au lieu, ou le motif. */
function deroulement(v: VisiteJournee, t: Traduire, langue: string): string[] {
  const lignes: string[] = [];
  const debut = heureLocale(v.debut_le, langue);
  const fin = heureLocale(v.fin_le, langue);
  if (debut && fin && v.debut_le && v.fin_le) {
    const minutes = Math.round((Date.parse(v.fin_le) - Date.parse(v.debut_le)) / 60000);
    const distance = Math.max(v.distance_debut_m ?? 0, v.distance_fin_m ?? 0);
    lignes.push(
      [
        t('journee.deroulement', { debut, fin, minutes }),
        v.sans_gps
          ? t('journee.sansGps')
          : v.distance_debut_m !== null || v.distance_fin_m !== null
            ? t('journee.distance', { distance })
            : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
  }
  if (v.motif_ecart) {
    lignes.push(
      [t('journee.motif', { motif: v.motif_ecart }), v.commentaire_ecart]
        .filter(Boolean)
        .join(' — '),
    );
  }
  if (v.est_imprevue && v.justification) {
    lignes.push(t('journee.imprevue', { justification: v.justification }));
  }
  return lignes;
}

function CarteVisite({ visite: v, ecarts }: { visite: VisiteJournee; ecarts: Journee['ecarts'] }) {
  const { t, i18n } = useTranslation();
  return (
    <Card component="article" aria-label={[v.heure, v.prospect].filter(Boolean).join(' · ')}>
      <EnTeteCarte
        titre={[v.heure, v.prospect ?? t('visites.sansProspect')].filter(Boolean).join(' · ')}
        action={
          <Stack direction="row" spacing={1.5}>
            {v.est_imprevue && <Etiquette ton="info">{t('visites.imprevue')}</Etiquette>}
            <Etiquette ton={v.statut === 'effectuee' ? 'success' : 'neutre'}>
              {t(`visites.statuts.${v.statut}`)}
            </Etiquette>
          </Stack>
        }
      />
      <Box sx={{ px: 2, pb: 1.5 }}>
        {v.etablissement && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {v.etablissement}
          </Typography>
        )}
        {deroulement(v, t, i18n.language).map((ligne) => (
          <Typography key={ligne} variant="body2" sx={{ pt: 0.5 }}>
            {ligne}
          </Typography>
        ))}
        {ecarts.map((e) => (
          <Stack key={e.code} direction="row" spacing={0.75} sx={{ pt: 0.5, alignItems: 'center' }}>
            <ErrorOutlineRounded sx={{ color: 'warning.main', fontSize: 18 }} />
            <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 600 }}>
              {texteEcart(e, t)}
            </Typography>
          </Stack>
        ))}
        {v.rapport ? (
          <Rapport rapport={v.rapport} />
        ) : v.rapport_statut ? (
          <Typography variant="body2" sx={{ pt: 1, color: 'warning.main', fontWeight: 600 }}>
            {v.rapport_statut === 'brouillon' ? t('journee.brouillon') : t('journee.attendu')}
          </Typography>
        ) : null}
      </Box>
    </Card>
  );
}

function Rapport({ rapport: r }: { rapport: RapportLu }) {
  const { t, i18n } = useTranslation();
  const soumis = r.soumis_le
    ? new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(r.soumis_le))
    : null;
  const echeance = r.prochaine_action_echeance
    ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(
        new Date(`${r.prochaine_action_echeance}T12:00:00`),
      )
    : null;
  const vide = '—';
  return (
    <Box component="section" sx={{ mt: 1.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
      <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" component="h3">
          {t('journee.rapport')}
        </Typography>
        {soumis && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('journee.soumisLe', { date: soumis })}
          </Typography>
        )}
        {r.en_retard && <Etiquette ton="warning">{t('chronologie.enRetard')}</Etiquette>}
        {r.horodatage_douteux && (
          <Etiquette ton="warning">{t('journee.horodatageDouteux')}</Etiquette>
        )}
        {r.versions > 1 && <Etiquette>{t('journee.versions', { count: r.versions })}</Etiquette>}
      </Stack>
      {r.horodatage_douteux && (
        <Typography variant="body2" sx={{ color: 'text.secondary', pt: 0.5 }}>
          {t('journee.horodatageDetail', {
            telephone: heureLocale(r.heure_telephone, i18n.language) ?? vide,
            recu: heureLocale(r.recu_le, i18n.language) ?? vide,
          })}
        </Typography>
      )}
      <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
        {r.objectif_prevu && (
          <Ligne libelle={t('rapport.objectifPrevu')} valeur={r.objectif_prevu} />
        )}
        <Ligne
          libelle={t('rapport.produits')}
          valeur={
            r.presentations.length ? (
              <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
                {r.presentations.map((p, i) => (
                  <li key={`${p.produit ?? p.libelle}-${i}`}>
                    {p.retour ? `${p.libelle} — ${t(`rapport.retours.${p.retour}`)}` : p.libelle}
                  </li>
                ))}
              </Box>
            ) : (
              vide
            )
          }
        />
        {r.remises.length > 0 && (
          <Ligne
            libelle={t('rapport.remises')}
            valeur={
              <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
                {r.remises.map((x, i) => (
                  <li key={`${x.produit ?? x.article}-${i}`}>
                    {t('journee.remise', {
                      type: t(`rapport.typesRemise.${x.type}`),
                      libelle: x.libelle,
                      quantite: x.quantite,
                    })}
                  </li>
                ))}
              </Box>
            }
          />
        )}
        <Ligne
          libelle={t('journee.resultat')}
          valeur={[r.resultat, r.resultat_obtenu].filter(Boolean).join(' — ') || vide}
        />
        {r.resume && <Ligne libelle={t('rapport.resume')} valeur={r.resume} />}
        <Ligne
          libelle={t('rapport.prochaineAction')}
          valeur={
            <>
              {[r.prochaine_action_type, r.prochaine_action].filter(Boolean).join(' — ') || vide}
              {(echeance || r.visite_proposee) && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {[
                    echeance ? t('journee.echeance', { date: echeance }) : null,
                    r.visite_proposee ? t('rapport.visiteProposeeLue') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
              )}
            </>
          }
        />
        {r.champs.map((c) => (
          <Ligne key={c.libelle} libelle={c.libelle} valeur={valeurChamp(c.valeur, t) ?? vide} />
        ))}
        {r.pieces_jointes.length > 0 && (
          <Ligne
            libelle={t('journee.pieces')}
            valeur={
              <Stack spacing={0.5} sx={{ alignItems: 'flex-start', ml: -0.75 }}>
                {r.pieces_jointes.map((p) => (
                  <BoutonPiece key={p.id} id={p.id} nom={p.nom} />
                ))}
              </Stack>
            }
          />
        )}
      </Stack>
    </Box>
  );
}

/** Libellé à gauche, texte aligné à gauche : un résumé de plusieurs lignes reste lisible. */
function Ligne({ libelle, valeur }: { libelle: string; valeur: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '200px minmax(0, 1fr)' },
        columnGap: 2,
        rowGap: 0.25,
        py: 1,
      }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {libelle}
      </Typography>
      <Typography component="div" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
        {valeur}
      </Typography>
    </Box>
  );
}

function valeurChamp(valeur: unknown, t: Traduire): string | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  if (typeof valeur === 'boolean') return valeur ? t('rapport.oui') : t('rapport.non');
  if (Array.isArray(valeur)) return valeur.join(', ');
  return String(valeur);
}

/** RPT-007 CA2 : la pièce se lit avec la session ; elle s'ouvre dans un nouvel onglet. */
function BoutonPiece({ id, nom }: { id: string; nom: string }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  async function ouvrir() {
    // L'onglet s'ouvre tout de suite, dans le geste de l'utilisateur ; le fichier suit.
    const onglet = window.open('', '_blank');
    try {
      const fichier = await client.rapports.piece(id);
      const adresse = URL.createObjectURL(fichier);
      if (onglet) onglet.location.href = adresse;
      else window.location.href = adresse;
    } catch (erreur) {
      onglet?.close();
      notifier(messageErreur(erreur, t('erreurs.reseau')), 'error');
    }
  }
  return (
    <Button
      size="small"
      startIcon={<PictureAsPdfRounded />}
      onClick={() => void ouvrir()}
      sx={{ textAlign: 'left' }}
    >
      {nom}
    </Button>
  );
}
