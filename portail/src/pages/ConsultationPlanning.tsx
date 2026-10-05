import type { ConsultationPlanning as Consultation, Visite } from '@innov/api-client';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import {
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
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
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

/**
 * Consultation d'un planning soumis par son superviseur (0.3.2) : la semaine telle que le
 * délégué l'a préparée, ses contrôles (PLN-004 CA2 : les seuils dépassés lui apparaissent), ses
 * activités connexes expliquées (PLN-018), le kilométrage (PLN-010) et le détail de chaque
 * visite avec ses alertes. Rien ne s'y modifie. Le responsable du poste l'approuve (PLN-012 ;
 * le DM pour un superviseur-visiteur, PLN-017) ; la demande de révision arrive en 0.3.4.
 */
export default function ConsultationPlanning({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [ouverte, setOuverte] = useState<Visite | null>(null);
  const consultation = useQuery({
    queryKey: ['planning-consultation', id],
    queryFn: () => client.plannings.consulter(id),
  });
  // La file sert à passer au planning suivant sans y revenir.
  const file = useQuery({ queryKey: ['plannings-a-valider'], queryFn: client.plannings.aValider });
  const rang = file.data?.findIndex((l) => l.planning.id === id) ?? -1;
  const suivant = rang >= 0 ? file.data?.[rang + 1] : undefined;
  const c = consultation.data;

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
                c.postes.join(', '),
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
            suivant={suivant ? `/validation/${suivant.planning.id}` : '/validation'}
          />
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
 * La décision du responsable : « Approuver » tant que le planning attend (PLN-012), puis qui a
 * décidé, quand, et sur quelle version (CA1).
 */
function BandeauDecision({
  consultation: c,
  suivant,
}: {
  consultation: Consultation;
  suivant: string;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const naviguer = useNavigate();
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const planning = c.planning!;
  const nom = `${c.delegue.prenom} ${c.delegue.nom}`;
  // Comptés comme les lignes de « À vérifier » : les seuils du jour tiennent sur une ligne.
  const signalements = c.controles?.signalements ?? [];
  const points =
    signalements.filter((x) => !x.code.startsWith('seuil_')).length +
    new Set(signalements.filter((x) => x.code.startsWith('seuil_')).map((x) => x.code)).size;
  const jour = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(
      new Date(`${iso}T12:00:00`),
    );

  async function approuver() {
    setEnvoi(true);
    try {
      await client.plannings.approuver(planning.id);
      notifier(t('approbation.succes', { nom }));
      await requetes.invalidateQueries({ queryKey: ['plannings-a-valider'] });
      await requetes.invalidateQueries({ queryKey: ['planning-consultation'] });
      setConfirmer(false);
      void naviguer(suivant);
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
      setConfirmer(false);
    }
    setEnvoi(false);
  }

  const decision = planning.decision;
  if (planning.statut !== 'soumis') {
    if (!decision) return null;
    return (
      <Card sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <CheckCircleRounded color="success" />
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
          </Typography>
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
            {t('approbation.aide')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={() => setConfirmer(true)}
          sx={{ flex: 'none', alignSelf: { xs: 'flex-start', sm: 'center' } }}
        >
          {t('approbation.approuver')}
        </Button>
      </Stack>
      {confirmer && (
        <Dialog open onClose={() => !envoi && setConfirmer(false)} maxWidth="xs" fullWidth>
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
          </DialogContent>
          <DialogActions>
            <Button disabled={envoi} onClick={() => setConfirmer(false)}>
              {t('commun.annuler')}
            </Button>
            <Button variant="contained" disabled={envoi} onClick={() => void approuver()}>
              {t('approbation.confirmer')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Card>
  );
}
