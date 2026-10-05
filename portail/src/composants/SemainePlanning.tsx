/**
 * Vue semaine d'un planning, partagée par la préparation (PLN-006, `pages/Planning.tsx`) et la
 * consultation du superviseur (0.3.2, `pages/ConsultationPlanning.tsx`) : un jour par colonne,
 * les visites et passages, les activités connexes, les contrôles (PLN-004) et le détail d'une
 * visite avec ses alertes.
 */
import type { Activite, Passage, Semaine, Visite } from '@innov/api-client';
import DirectionsCarRounded from '@mui/icons-material/DirectionsCarRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import SupervisorAccountRounded from '@mui/icons-material/SupervisorAccountRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { type DragEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';
import { EnTeteCarte, Ligne } from './Elements';
import {
  FORMAT,
  type Glisse,
  jourAbsent,
  lignesControles,
  nom,
  texteControle,
} from './planningTextes';

export function Colonne({
  semaine: s,
  date,
  titre,
  modifiable,
  explications = true,
  surDeposer,
  surOuvrir,
}: {
  semaine: Semaine;
  date: string;
  titre: string;
  modifiable: boolean;
  /** Les explications des activités ; la consultation les montre une fois, au-dessus. */
  explications?: boolean;
  surDeposer: (g: Glisse) => void;
  surOuvrir: (v: Visite) => void;
}) {
  const { t, i18n } = useTranslation();
  const [survol, setSurvol] = useState(false);
  const jour = s.jours.find((j) => j.date === date)!;
  const absent = jourAbsent(s, date);
  const accepte = modifiable && jour.planifiable && !absent;
  const visites = s.visites.filter((v) => v.date === date);
  const objectif = s.controles?.objectifs.find((o) => o.date === date);
  const km = s.kilometrage?.jours.find((k) => k.date === date);
  const dehors = objectif && (objectif.visites < objectif.min || objectif.visites > objectif.max);

  // Une visite seule, ou les visites d'un passage regroupées.
  const unites: { passage?: Passage; visites: Visite[] }[] = [];
  for (const v of visites) {
    const passage = v.passage ? s.passages.find((x) => x.id === v.passage) : undefined;
    const existante = passage && unites.find((u) => u.passage?.id === passage.id);
    if (existante) existante.visites.push(v);
    else unites.push({ passage, visites: [v] });
  }

  const auSurvol = (e: DragEvent) => {
    if (!accepte || !e.dataTransfer.types.includes(FORMAT)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setSurvol(true);
  };

  return (
    <Card
      aria-label={titre}
      onDragOver={auSurvol}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        setSurvol(false);
        if (!accepte) return;
        e.preventDefault();
        try {
          surDeposer(JSON.parse(e.dataTransfer.getData(FORMAT)) as Glisse);
        } catch {
          // Contenu étranger déposé sur la colonne : ignoré.
        }
      }}
      sx={{
        minHeight: { md: 280 },
        display: 'flex',
        flexDirection: 'column',
        outline: survol ? 2 : 0,
        outlineColor: 'primary.main',
        bgcolor: jour.planifiable ? 'background.paper' : 'action.hover',
      }}
    >
      <Box sx={{ px: 1.5, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
        <Typography sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{titre}</Typography>
        <Typography
          variant="caption"
          component="p"
          aria-label={
            objectif
              ? t('controles.objectif', {
                  count: objectif.visites,
                  min: objectif.min,
                  max: objectif.max,
                })
              : undefined
          }
          sx={{ color: dehors ? 'warning.main' : 'text.secondary', fontWeight: dehors ? 600 : 400 }}
        >
          {jour.ferie
            ? t('semaine.ferie', { libelle: jour.ferie })
            : objectif
              ? t('controles.objectifCourt', {
                  nombre: objectif.visites,
                  min: objectif.min,
                  max: objectif.max,
                })
              : t('jour.nombre', { count: visites.length })}
        </Typography>
        {km && km.km > 0 && (
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
            {t('planification.km', {
              km: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(km.km),
            })}
          </Typography>
        )}
      </Box>
      <Stack spacing={1} sx={{ p: 1, flex: 1 }}>
        {s.activites
          .filter((a) => a.date === date)
          .map((a) => (
            <Stack
              key={a.id}
              direction="row"
              spacing={0.75}
              sx={{
                alignItems: 'flex-start',
                color: a.avec_visites ? 'text.primary' : 'text.secondary',
                px: 0.5,
              }}
            >
              <Box sx={{ display: 'flex', mt: 0.25 }}>
                <IconeActivite type={a.type} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: a.avec_visites ? 600 : 400 }}>
                  {t('activites.ligne', {
                    type: t(`activites.types.${a.type}`),
                    periode: t(`activites.periodes.${a.periode ?? 'journee'}`),
                  })}
                </Typography>
                {explications && a.avec_visites && a.commentaire && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {a.commentaire}
                  </Typography>
                )}
              </Box>
            </Stack>
          ))}
        {unites.map((u) =>
          u.passage ? (
            <Box
              key={u.passage.id}
              sx={{ borderLeft: 2, borderColor: 'primary.main', pl: 1, display: 'grid', gap: 0.75 }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {u.passage.heure ?? '--:--'} ·{' '}
                {t('passages.ligne', {
                  lieu: u.passage.etablissement.nom,
                  count: u.visites.length,
                })}
              </Typography>
              {u.visites.map((v) => (
                <CarteVisite
                  key={v.id}
                  visite={v}
                  semaine={s}
                  modifiable={modifiable}
                  dansPassage
                  surOuvrir={surOuvrir}
                />
              ))}
            </Box>
          ) : (
            <CarteVisite
              key={u.visites[0]!.id}
              visite={u.visites[0]!}
              semaine={s}
              modifiable={modifiable}
              surOuvrir={surOuvrir}
            />
          ),
        )}
        {accepte && (
          <Box
            sx={{
              mt: 'auto',
              border: 1,
              borderStyle: 'dashed',
              borderColor: survol ? 'primary.main' : 'divider',
              borderRadius: 1,
              py: 0.5,
              textAlign: 'center',
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('planification.deposer')}
            </Typography>
          </Box>
        )}
      </Stack>
    </Card>
  );
}

function CarteVisite({
  visite: v,
  semaine: s,
  modifiable,
  dansPassage,
  surOuvrir,
}: {
  visite: Visite;
  semaine: Semaine;
  modifiable: boolean;
  dansPassage?: boolean;
  surOuvrir: (v: Visite) => void;
}) {
  const { t } = useTranslation();
  const bloquee = s.controles?.bloquants.some(
    (c) => c.code !== 'incomplete' && c.visites.includes(v.id),
  );
  // Les signalements qui nomment cette visite (hors liste cible, hors secteur…) : le superviseur
  // les repère sans ouvrir chaque visite (0.3.2).
  const alertes = alertesDeLaVisite(s, v).filter((c) => c.gravite !== 'bloquant').length;
  return (
    <Box
      component="button"
      type="button"
      draggable={modifiable}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData(FORMAT, JSON.stringify({ type: 'visite', id: v.id }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => surOuvrir(v)}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        display: 'grid',
        gap: 0.25,
        p: 1,
        borderRadius: 1,
        border: 1,
        borderColor: bloquee ? 'error.main' : 'divider',
        cursor: modifiable ? 'grab' : 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-visible': { outline: 2, outlineColor: 'primary.main' },
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
        {!dansPassage && (
          <Box
            component="span"
            sx={{ color: 'text.secondary', mr: 0.75, fontVariantNumeric: 'tabular-nums' }}
          >
            {v.heure ?? '--:--'}
          </Box>
        )}
        {nom(v.prospect, t)}
      </Typography>
      {!dansPassage && v.etablissement && (
        <Typography variant="caption" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
          {v.etablissement.nom}
        </Typography>
      )}
      {v.manquants.length > 0 && (
        <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
          {t('visites.aCompleter', {
            champs: v.manquants.map((c) => t(`visites.champs.${c}`)).join(', '),
          })}
        </Typography>
      )}
      {alertes > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'warning.main' }}>
          <InfoOutlined sx={{ fontSize: 16 }} />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {t('consultation.alertes', { count: alertes })}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}

/** Contrôles qui nomment une visite, bloquants et signalements. */
function alertesDeLaVisite(s: Semaine, v: Visite) {
  return s.controles
    ? [...s.controles.bloquants, ...s.controles.signalements].filter((c) =>
        c.visites.includes(v.id),
      )
    : [];
}

export function DetailVisite({
  semaine: s,
  visite: v,
  modifiable,
  jourCourt,
  surFermer,
  agir,
}: {
  semaine: Semaine;
  visite: Visite;
  modifiable: boolean;
  jourCourt: (iso: string) => string;
  surFermer: () => void;
  /** Absente en consultation : rien ne s'y modifie. */
  agir?: (action: () => Promise<unknown>, succes?: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const controles = alertesDeLaVisite(s, v);
  const passage = v.passage ? s.passages.find((p) => p.id === v.passage) : undefined;
  const prospect = v.prospect
    ? [
        v.prospect.specialite_libelle ?? v.prospect.type_libelle,
        t('consultation.potentiel', { valeur: v.prospect.potentiel }),
      ].join(' · ')
    : '—';
  return (
    <Dialog open onClose={surFermer} fullWidth maxWidth="xs">
      <DialogTitle>{nom(v.prospect, t)}</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          <Ligne
            libelle={t('detail.quand')}
            valeur={[jourCourt(v.date), v.heure].filter(Boolean).join(' · ')}
          />
          <Ligne libelle={t('visites.champs.prospect')} valeur={prospect} />
          <Ligne libelle={t('visites.champs.etablissement')} valeur={v.etablissement?.nom ?? '—'} />
          {passage && (
            <Ligne
              libelle={t('consultation.passage')}
              valeur={t('passages.ligne', {
                lieu: passage.etablissement.nom,
                count: passage.visites.length,
              })}
            />
          )}
          <Ligne libelle={t('visites.champs.objectif')} valeur={v.objectif || '—'} />
          <Ligne libelle={t('visites.champs.reseau')} valeur={v.reseau?.libelle ?? '—'} />
          {v.note ? <Ligne libelle={t('visites.champs.note')} valeur={v.note} /> : null}
          {controles.map((c, i) => (
            <Alert key={i} severity={c.gravite === 'bloquant' ? 'error' : 'warning'}>
              {texteControle(c, t, jourCourt)}
            </Alert>
          ))}
          {modifiable && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('planification.aideDetail')}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {modifiable && agir && (
          <Button
            color="error"
            onClick={() => {
              surFermer();
              void agir(() => client.visites.retirer(v.id), t('visites.retiree'));
            }}
          >
            {t('visites.retirer')}
          </Button>
        )}
        <Button onClick={surFermer}>{t('commun.fermer')}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Les contrôles de la semaine : bloquants d'abord, puis les signalements (PLN-004). */
export function CarteControles({
  controles,
  jourCourt,
}: {
  controles: NonNullable<Semaine['controles']>;
  jourCourt: (iso: string) => string;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <EnTeteCarte titre={t('controles.titre')} />
      <Stack spacing={0.5} sx={{ p: 2 }}>
        {controles.bloquants.length === 0 && controles.signalements.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('planification.rienAVerifier')}
          </Typography>
        )}
        {lignesControles(controles, t, jourCourt).map(({ cle, gravite, texte }) => (
          <Stack key={cle} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            {gravite === 'bloquant' ? (
              <ErrorOutlineRounded fontSize="small" color="error" sx={{ mt: 0.25 }} />
            ) : (
              <InfoOutlined fontSize="small" color="warning" sx={{ mt: 0.25 }} />
            )}
            <Typography variant="body2">{texte}</Typography>
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}

const ICONES: Partial<Record<Activite['type'], ReactNode>> = {
  commando: <GroupsRounded fontSize="small" />,
  deplacement: <DirectionsCarRounded fontSize="small" />,
  accompagnement: <SupervisorAccountRounded fontSize="small" />,
};

/** Icône d'une activité connexe : celles avec visites ont la leur (PLN-018). */
export function IconeActivite({ type }: { type: Activite['type'] }) {
  return <>{ICONES[type] ?? <EventBusyRounded fontSize="small" />}</>;
}

/**
 * Les activités connexes de la semaine, chacune avec son jour, sa période, qui l'a demandée et
 * son explication (PLN-018) ; le superviseur les lit avant de décider.
 */
export function ListeActivites({ activites }: { activites: Activite[] }) {
  const { t, i18n } = useTranslation();
  const jour = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric' }).format(
      new Date(`${iso}T12:00:00`),
    );
  return (
    <Stack spacing={1}>
      {activites.map((a) => (
        <Stack key={a.id} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Box
            sx={{
              color: a.avec_visites ? 'primary.main' : 'text.secondary',
              display: 'flex',
              pt: 0.25,
            }}
          >
            <IconeActivite type={a.type} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {jour(a.date)} ·{' '}
              {t('activites.ligne', {
                type: t(`activites.types.${a.type}`),
                periode: t(`activites.periodes.${a.periode ?? 'journee'}`),
              })}
              {a.demande_superviseur ? ` · ${t('activites.parSuperviseur')}` : ''}
            </Typography>
            {a.commentaire && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {a.commentaire}
              </Typography>
            )}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
