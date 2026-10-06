import type { ConsultationPlanning as Consultation, Visite } from '@innov/api-client';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur, useNavigate } from 'react-router';
import { EnTeteCarte, EnTetePage, Ligne } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import {
  CarteControles,
  Colonne,
  DetailVisite,
  ListeActivites,
} from '../composants/SemainePlanning';
import { HistoriqueVersions } from '../composants/HistoriqueVersions';
import { BoutonRouvrir } from '../composants/Reouverture';
import { AttenteApprobation, HeuresChangees } from '../composants/SuiviApprobation';
import { libelleVersion, texteEscalade } from '../composants/planningTextes';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

/**
 * Consultation d'un planning soumis par son superviseur (0.3.2) : la semaine telle que le
 * délégué l'a préparée, ses contrôles (PLN-004 CA2 : les seuils dépassés lui apparaissent), ses
 * activités connexes expliquées (PLN-018), le kilométrage (PLN-010) et le détail de chaque
 * visite avec ses alertes. Rien ne s'y modifie. Le responsable du poste l'approuve (PLN-012 ;
 * le DM pour un superviseur-visiteur, PLN-017), ou demande une révision commentée, sur le
 * planning ou des visites précises (PLN-013) ; son remplaçant daté décide à sa place (ORG-013).
 */
export default function ConsultationPlanning({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [ouverte, setOuverte] = useState<Visite | null>(null);
  // Remarques de révision en cours de rédaction, par visite (PLN-013).
  const [brouillon, setBrouillon] = useState<Record<string, string>>({});
  const consultation = useQuery({
    queryKey: ['planning-consultation', id],
    queryFn: () => client.plannings.consulter(id),
  });
  // La file sert à passer au planning suivant sans y revenir.
  const file = useQuery({ queryKey: ['plannings-a-valider'], queryFn: client.plannings.aValider });
  const rang = file.data?.findIndex((l) => l.planning.id === id) ?? -1;
  const suivant = rang >= 0 ? file.data?.[rang + 1] : undefined;
  const c = consultation.data;
  const aDecider = c?.planning?.statut === 'soumis';
  const decision = c?.planning?.decision;
  // En attente : les remarques que l'on rédige ; après une révision : celles envoyées.
  const remarques: Record<string, string> = aDecider
    ? brouillon
    : decision?.decision === 'a_reviser' && c?.planning?.statut === 'a_reviser'
      ? Object.fromEntries(decision.remarques.map((r) => [r.visite, r.commentaire]))
      : {};

  const date = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, options).format(new Date(`${iso}T12:00:00`));
  const jourCourt = (iso: string) => date(iso, { weekday: 'short', day: 'numeric' });

  return (
    <Stack spacing={2.5}>
      <Box>
        <Button
          component={LienRouteur}
          to="/validation"
          size="small"
          startIcon={<ArrowBackRounded />}
          sx={{ ml: -1 }}
        >
          {t('consultation.retour')}
        </Button>
      </Box>
      <EnTetePage
        titre={c ? `${c.delegue.prenom} ${c.delegue.nom}` : t('navigation.validation')}
        sousTitre={
          c && c.jours.length
            ? [
                c.remplace
                  ? t('remplacements.pour', { nom: `${c.remplace.prenom} ${c.remplace.nom}` })
                  : '',
                c.postes.join(', '),
                libelleVersion(c.planning, t),
                t('semaine.periode', {
                  debut: date(c.semaine, { day: 'numeric', month: 'short' }),
                  fin: date(c.jours.at(-1)!.date, { day: 'numeric', month: 'short' }),
                }),
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        actions={
          suivant && (
            <Button
              component={LienRouteur}
              to={`/validation/${suivant.planning.id}`}
              variant="outlined"
              size="small"
              endIcon={<ArrowForwardRounded />}
            >
              {t('consultation.suivant', {
                nom: `${suivant.delegue.prenom} ${suivant.delegue.nom}`,
              })}
            </Button>
          )
        }
      />
      {consultation.isError ? (
        <ErreurChargement
          erreur={consultation.error}
          reessayer={() => void consultation.refetch()}
        />
      ) : !c ? (
        <Skeleton variant="rounded" height={320} />
      ) : (
        <>
          <BandeauDecision
            consultation={c}
            remarques={brouillon}
            suivant={suivant ? `/validation/${suivant.planning.id}` : '/validation'}
          />
          {c.escalade && (
            <Alert severity="warning" variant="outlined">
              {texteEscalade(c.escalade, t, i18n.language, c.fuseau)}
            </Alert>
          )}
          <AttenteApprobation semaine={c} jourCourt={jourCourt} />
          {aDecider && decision?.decision === 'a_reviser' && (
            <RevisionPrecedente consultation={c} jourCourt={jourCourt} />
          )}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              alignItems: 'start',
            }}
          >
            <Resume consultation={c} />
            {c.controles && <CarteControles controles={c.controles} jourCourt={jourCourt} />}
          </Box>
          <HeuresChangees semaine={c} jourCourt={jourCourt} />
          <HistoriqueVersions planning={c.planning!.id} fuseau={c.fuseau} />
          {c.activites.length > 0 && (
            <Card>
              <EnTeteCarte titre={t('consultation.activites')} />
              <Box sx={{ p: 2 }}>
                <ListeActivites activites={c.activites} />
              </Box>
            </Card>
          )}
          <Box
            component="section"
            aria-label={t('consultation.semaine')}
            sx={{
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: { xs: '1fr', md: `repeat(${c.jours.length}, minmax(0, 1fr))` },
            }}
          >
            {c.jours.map((j) => (
              <Colonne
                key={j.date}
                semaine={c}
                date={j.date}
                titre={date(j.date, { weekday: 'long', day: 'numeric' })}
                modifiable={false}
                explications={false}
                remarques={remarques}
                surDeposer={() => undefined}
                surOuvrir={setOuverte}
              />
            ))}
          </Box>
        </>
      )}
      {ouverte && c && (
        <DetailVisite
          semaine={c}
          visite={ouverte}
          modifiable={false}
          jourCourt={jourCourt}
          surFermer={() => setOuverte(null)}
          remarque={remarques[ouverte.id]}
          surRemarque={
            aDecider
              ? (texte) =>
                  setBrouillon((r) => {
                    const suite = { ...r, [ouverte.id]: texte };
                    if (!texte.trim()) delete suite[ouverte.id];
                    return suite;
                  })
              : undefined
          }
        />
      )}
    </Stack>
  );
}

/** Statut, soumission, visites et kilomètres de la semaine. */
function Resume({ consultation: c }: { consultation: Consultation }) {
  const { t, i18n } = useTranslation();
  const km = c.kilometrage;
  const planning = c.planning!;
  const aCompleter = c.visites.filter((v) => v.manquants.length > 0).length;
  const nombre = (valeur: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(valeur);
  // À l'heure du pays, comme l'échéance (RG-013).
  const dateHeure = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: c.fuseau,
    }).format(new Date(iso));
  return (
    <Card>
      <EnTeteCarte titre={t('planification.resume')} />
      <Stack spacing={1} sx={{ p: 2 }}>
        <Ligne libelle={t('detail.statut')} valeur={t(`semaine.statuts.${planning.statut}`)} />
        <Ligne
          libelle={t('soumission.libelle')}
          valeur={
            planning.soumis_le ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                <span>{t('soumission.soumisLe', { date: dateHeure(planning.soumis_le) })}</span>
                {planning.en_retard && (
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ color: 'warning.main', fontWeight: 600 }}
                  >
                    {t('soumission.enRetard')}
                  </Typography>
                )}
              </Stack>
            ) : (
              '—'
            )
          }
        />
        <Ligne
          libelle={t('planification.visites')}
          valeur={
            aCompleter
              ? t('visites.bilanACompleter', { count: c.visites.length, aCompleter })
              : t('visites.bilan', { count: c.visites.length })
          }
        />
        {km && (
          <Ligne
            libelle={t('planification.kilometrage')}
            valeur={
              km.total_km > 0
                ? `${t('km.jour', { km: nombre(km.total_km) })}${
                    km.sans_coordonnees
                      ? ` · ${t('km.partiel', { count: km.sans_coordonnees })}`
                      : ''
                  }`
                : '—'
            }
          />
        )}
        <Typography variant="caption" sx={{ color: 'text.secondary', pt: 0.5 }}>
          {t('consultation.lectureSeule')}
        </Typography>
      </Stack>
    </Card>
  );
}

/**
 * La décision du responsable : « Approuver » (PLN-012) ou « Demander une révision » (PLN-013)
 * tant que le planning attend, puis qui a décidé, quand, sur quelle version, et pourquoi.
 */
function BandeauDecision({
  consultation: c,
  remarques,
  suivant,
}: {
  consultation: Consultation;
  /** Remarques rédigées sur des visites, jointes à la révision. */
  remarques: Record<string, string>;
  suivant: string;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const naviguer = useNavigate();
  const [dialogue, setDialogue] = useState<'approuver' | 'reviser' | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const planning = c.planning!;
  const nom = `${c.delegue.prenom} ${c.delegue.nom}`;
  // Comptés comme les lignes de « À vérifier » : les seuils du jour tiennent sur une ligne.
  const signalements = c.controles?.signalements ?? [];
  const points =
    signalements.filter((x) => !x.code.startsWith('seuil_')).length +
    new Set(signalements.filter((x) => x.code.startsWith('seuil_')).map((x) => x.code)).size;
  const nombreRemarques = Object.keys(remarques).length;
  const jour = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(
      new Date(`${iso}T12:00:00`),
    );

  async function decider(action: () => Promise<unknown>, succes: string) {
    setEnvoi(true);
    try {
      await action();
      notifier(succes);
      await requetes.invalidateQueries({ queryKey: ['plannings-a-valider'] });
      await requetes.invalidateQueries({ queryKey: ['planning-consultation'] });
      setDialogue(null);
      void naviguer(suivant);
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
    setEnvoi(false);
  }

  const decision = planning.decision;
  // Fermé le lundi 0 h sans décision : il faut d'abord en rouvrir la rédaction.
  if (planning.ferme) {
    return (
      <Card sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Box>
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
              {t('fermeture.titre')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('fermeture.consultation')}
            </Typography>
          </Box>
          <BoutonRouvrir delegue={c.delegue} semaine={c.semaine} />
        </Stack>
      </Card>
    );
  }
  if (planning.statut !== 'soumis') {
    if (!decision) return null;
    const revision = decision.decision === 'a_reviser';
    return (
      <Card sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          {revision ? (
            <RateReviewOutlined color="warning" sx={{ mt: 0.25 }} />
          ) : (
            <CheckCircleRounded color="success" sx={{ mt: 0.25 }} />
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t(`approbation.decisions.${decision.decision}`, {
                date: new Intl.DateTimeFormat(i18n.language, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: c.fuseau,
                }).format(new Date(decision.decide_le)),
                par: decision.par,
                numero: decision.numero,
              })}
              {decision.mode === 'remplacement' ? ` · ${t('remplacements.enRemplacement')}` : ''}
              {decision.mode === 'escalade' ? ` · ${t('escalade.parEscalade')}` : ''}
            </Typography>
            {decision.commentaire && (
              <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-line' }}>
                {decision.commentaire}
              </Typography>
            )}
            {revision && decision.remarques.length > 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('revision.remarquesEnvoyees', { count: decision.remarques.length })}
              </Typography>
            )}
          </Box>
        </Stack>
      </Card>
    );
  }
  return (
    <Card sx={{ p: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
            {t('approbation.aDecider')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {nombreRemarques > 0
              ? t('revision.remarquesPretes', { count: nombreRemarques })
              : t('approbation.aide')}
          </Typography>
        </Box>
        <Stack direction="row" sx={{ flex: 'none', flexWrap: 'wrap', gap: 1 }}>
          <Button variant="outlined" onClick={() => setDialogue('reviser')}>
            {t('revision.demander')}
          </Button>
          <Button variant="contained" onClick={() => setDialogue('approuver')}>
            {t('approbation.approuver')}
          </Button>
        </Stack>
      </Stack>
      {dialogue === 'approuver' && (
        <Dialog open onClose={() => !envoi && setDialogue(null)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('approbation.titre')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              {t('approbation.confirmation', {
                nom,
                debut: jour(c.semaine),
                fin: jour(c.jours.at(-1)?.date ?? c.semaine),
              })}
            </Typography>
            {/* Les points signalés restent visibles au moment de décider (PLN-004 CA2). */}
            {points > 0 && (
              <Typography variant="body2" sx={{ mt: 1.5, color: 'warning.main', fontWeight: 600 }}>
                {t('approbation.signalements', { count: points })}
              </Typography>
            )}
            {nombreRemarques > 0 && (
              <Typography variant="body2" sx={{ mt: 1.5, color: 'text.secondary' }}>
                {t('revision.remarquesIgnorees', { count: nombreRemarques })}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button disabled={envoi} onClick={() => setDialogue(null)}>
              {t('commun.annuler')}
            </Button>
            <Button
              variant="contained"
              disabled={envoi}
              onClick={() =>
                void decider(
                  () => client.plannings.approuver(planning.id),
                  t('approbation.succes', { nom }),
                )
              }
            >
              {t('approbation.confirmer')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {dialogue === 'reviser' && (
        <Dialog open onClose={() => !envoi && setDialogue(null)} maxWidth="sm" fullWidth>
          <DialogTitle>{t('revision.titre')}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <Typography variant="body2">{t('revision.aide', { nom })}</Typography>
              <TextField
                label={t('revision.commentaire')}
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                multiline
                minRows={3}
                autoFocus
                slotProps={{ htmlInput: { maxLength: 1000 } }}
                helperText={
                  nombreRemarques > 0
                    ? t('revision.avecRemarques', { count: nombreRemarques })
                    : t('revision.obligatoire')
                }
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={envoi} onClick={() => setDialogue(null)}>
              {t('commun.annuler')}
            </Button>
            <Button
              variant="contained"
              disabled={envoi || (!commentaire.trim() && nombreRemarques === 0)}
              onClick={() =>
                void decider(
                  () =>
                    client.plannings.reviser(planning.id, {
                      commentaire: commentaire.trim(),
                      remarques: Object.entries(remarques).map(([visite, texte]) => ({
                        visite,
                        commentaire: texte.trim(),
                      })),
                    }),
                  t('revision.succes', { nom }),
                )
              }
            >
              {t('revision.envoyer')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Card>
  );
}

/**
 * PLN-014 : la version suivante d'un planning révisé. Le responsable retrouve ce qu'il avait
 * demandé — commentaire et remarques par visite — pour vérifier que chaque point a été repris.
 */
function RevisionPrecedente({
  consultation: c,
  jourCourt,
}: {
  consultation: Consultation;
  jourCourt: (iso: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const decision = c.planning!.decision!;
  const visite = (id: string) => {
    const v = c.visites.find((x) => x.id === id);
    if (!v) return t('resoumission.visiteRetiree');
    const qui = v.prospect
      ? [v.prospect.prenom, v.prospect.nom].filter(Boolean).join(' ')
      : t('visites.sansProspect');
    return `${qui} · ${jourCourt(v.date)}${v.heure ? ` ${v.heure}` : ''}`;
  };
  return (
    <Card sx={{ p: 2, borderLeft: 3, borderLeftColor: 'warning.main' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <RateReviewOutlined color="warning" sx={{ mt: 0.25 }} />
        <Stack spacing={0.75} sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('resoumission.precedente', {
              numero: decision.numero,
              par: decision.par,
              date: new Intl.DateTimeFormat(i18n.language, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: c.fuseau,
              }).format(new Date(decision.decide_le)),
            })}
          </Typography>
          {decision.commentaire && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
              {decision.commentaire}
            </Typography>
          )}
          {decision.remarques.length > 0 && (
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {decision.remarques.map((r) => (
                <Typography component="li" variant="body2" key={r.visite}>
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    {visite(r.visite)}
                  </Box>{' '}
                  : {r.commentaire}
                </Typography>
              ))}
            </Box>
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('resoumission.verifier')}
          </Typography>
        </Stack>
      </Stack>
    </Card>
  );
}
