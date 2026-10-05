import type { ControlePlanning, ListeCible, Passage, Semaine, Visite } from '@innov/api-client';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type DragEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EnTeteCarte, EnTetePage, Ligne, Potentiel } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

/** Ce que l'on fait glisser : un prospect de la liste cible, ou une visite déjà posée. */
type Glisse = { type: 'prospect'; id: string } | { type: 'visite'; id: string };
const FORMAT = 'application/x-innov-planning';

type Traduire = ReturnType<typeof useTranslation>['t'];

function normaliser(texte: string) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function nom(
  p: { civilite?: string | null; prenom?: string | null; nom: string } | null,
  t: Traduire,
) {
  if (!p) return t('visites.sansProspect');
  return [p.civilite ? t(`prospect.civilites.${p.civilite}`) : '', p.prenom, p.nom]
    .filter(Boolean)
    .join(' ');
}

/**
 * Absent toute la journée : une absence « journée », ou matin et après-midi. Un commando, un
 * déplacement ou un accompagnement garde ses visites (PLN-018).
 */
function jourAbsent(s: Semaine, date: string) {
  const parts = s.absences
    .filter((a) => a.date === date && !a.avec_visites)
    .reduce((n, a) => n + ((a.periode ?? 'journee') === 'journee' ? 2 : 1), 0);
  return parts >= 2;
}

/** Texte d'un contrôle (PLN-004), le même que sur le téléphone. */
function texteControle(c: ControlePlanning, t: Traduire, jourCourt: (iso: string) => string) {
  const jour = c.date ? jourCourt(c.date) : '';
  if (c.code === 'a_non_planifie') {
    const noms = (c.prospects ?? []).map((x) => x.nom);
    return t('controles.a_non_planifie', {
      count: noms.length,
      mois: c.mois ?? '',
      noms: noms.slice(0, 3).join(', '),
      suite: noms.length > 3 ? t('controles.etAutres', { count: noms.length - 3 }) : '',
    });
  }
  return t(`controles.${c.code}`, {
    jour,
    heure: c.heure,
    champs: (c.manquants ?? []).map((m) => t(`visites.champs.${m}`)).join(', '),
    fiche: c.fiche ? t(`controles.fiches.${c.fiche}`) : '',
    count: c.code === 'incomplete' ? 1 : c.visites.length,
    jours: jour,
  });
}

/** Une ligne par contrôle ; les seuils du jour tiennent sur une ligne par sens (comme au mobile). */
function lignesControles(
  controles: NonNullable<Semaine['controles']>,
  t: Traduire,
  jourCourt: (iso: string) => string,
) {
  const lignes: { cle: string; gravite: string; texte: string }[] = controles.bloquants.map(
    (c, i) => ({ cle: `b${i}`, gravite: c.gravite, texte: texteControle(c, t, jourCourt) }),
  );
  for (const code of ['seuil_bas', 'seuil_haut'] as const) {
    const jours = controles.signalements.filter((c) => c.code === code && c.date);
    if (jours.length) {
      lignes.push({
        cle: code,
        gravite: 'signalement',
        texte: t(`controles.${code}`, {
          count: jours.length,
          jours: jours.map((c) => jourCourt(c.date!)).join(', '),
        }),
      });
    }
  }
  controles.signalements
    .filter((c) => c.code !== 'seuil_bas' && c.code !== 'seuil_haut')
    .forEach((c, i) =>
      lignes.push({ cle: `s${i}`, gravite: c.gravite, texte: texteControle(c, t, jourCourt) }),
    );
  return lignes;
}

/**
 * Vue semaine du planning sur le portail (PLN-006) : un jour par colonne, le kilométrage
 * estimé (PLN-010) et les contrôles (PLN-004). En préparation, on glisse un prospect de la
 * liste cible sur un jour pour y poser une visite pré-remplie (PLN-005 CA1), ou une visite
 * d'un jour à l'autre pour la déplacer ; chaque glisser a son équivalent au clavier (menu).
 */
export default function Planning() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const [jour, setJour] = useState<string | undefined>(undefined);
  const [ouverte, setOuverte] = useState<Visite | null>(null);
  const semaine = useQuery({
    queryKey: ['planning-semaine', jour ?? 'courante'],
    queryFn: () => client.plannings.semaine(jour),
  });
  const s = semaine.data;
  const modifiable = !!s?.planning && s.modifiable;
  const rafraichir = () => void requetes.invalidateQueries({ queryKey: ['planning-semaine'] });

  const date = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, options).format(new Date(`${iso}T12:00:00`));
  const jourCourt = (iso: string) => date(iso, { weekday: 'short', day: 'numeric' });

  /** Lance une action, puis dit son résultat ; le message peut dépendre de la réponse. */
  async function agir<T>(action: () => Promise<T>, succes?: string | ((resultat: T) => string)) {
    try {
      const resultat = await action();
      const texte = typeof succes === 'function' ? succes(resultat) : succes;
      if (texte) notifier(texte);
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
    rafraichir();
  }

  async function deposer(glisse: Glisse, cible: string) {
    if (!s?.planning) return;
    if (glisse.type === 'prospect') {
      await agir(
        () => client.plannings.poser(s.planning!.id, cible, [glisse.id]),
        t('pose.posees', { count: 1, jour: date(cible, { weekday: 'long', day: 'numeric' }) }),
      );
    } else {
      const visite = s.visites.find((v) => v.id === glisse.id);
      if (!visite || visite.date === cible) return;
      await agir(
        () => client.visites.modifier(glisse.id, { date: cible }),
        t('planification.deplacee', { jour: date(cible, { weekday: 'long', day: 'numeric' }) }),
      );
    }
  }

  const periode =
    s && s.jours.length
      ? t('semaine.periode', {
          debut: date(s.semaine, { day: 'numeric', month: 'short' }),
          fin: date(s.jours.at(-1)!.date, { day: 'numeric', month: 'short' }),
        })
      : undefined;

  return (
    <Stack spacing={2.5}>
      <EnTetePage
        titre={t('navigation.planning')}
        sousTitre={periode}
        actions={
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <IconButton
              aria-label={t('semaine.precedente')}
              onClick={() => s && setJour(s.precedente)}
            >
              <ChevronLeftRounded />
            </IconButton>
            <Button size="small" disabled={!s || s.courante} onClick={() => setJour(undefined)}>
              {s?.courante ? t('semaine.cetteSemaine') : t('semaine.revenir')}
            </Button>
            <IconButton aria-label={t('semaine.suivante')} onClick={() => s && setJour(s.suivante)}>
              <ChevronRightRounded />
            </IconButton>
          </Stack>
        }
      />
      {semaine.isError ? (
        <ErreurChargement erreur={semaine.error} reessayer={() => void semaine.refetch()} />
      ) : !s ? (
        <Skeleton variant="rounded" height={320} />
      ) : (
        <>
          <Resume semaine={s} agir={agir} jourCourt={jourCourt} />
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', lg: modifiable ? '1fr 300px' : '1fr' },
              alignItems: 'start',
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: {
                  xs: '1fr',
                  md: `repeat(${s.jours.length}, minmax(0, 1fr))`,
                },
              }}
            >
              {s.jours.map((j) => (
                <Colonne
                  key={j.date}
                  semaine={s}
                  date={j.date}
                  titre={date(j.date, { weekday: 'long', day: 'numeric' })}
                  modifiable={modifiable}
                  surDeposer={(g) => void deposer(g, j.date)}
                  surOuvrir={setOuverte}
                />
              ))}
            </Box>
            {modifiable && (
              <ListeAGlisser
                semaine={s}
                jourCourt={jourCourt}
                surPoser={(id, cible) => void deposer({ type: 'prospect', id }, cible)}
              />
            )}
          </Box>
        </>
      )}
      {ouverte && s && (
        <DetailVisite
          semaine={s}
          visite={ouverte}
          modifiable={modifiable}
          jourCourt={jourCourt}
          surFermer={() => setOuverte(null)}
          agir={agir}
        />
      )}
    </Stack>
  );
}

/** Statut, bilan, kilomètres, actions de préparation, puis les contrôles. */
function Resume({
  semaine: s,
  agir,
  jourCourt,
}: {
  semaine: Semaine;
  agir: <T>(action: () => Promise<T>, succes?: string | ((resultat: T) => string)) => Promise<void>;
  jourCourt: (iso: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [reprise, setReprise] = useState(false);
  const km = s.kilometrage;
  const aCompleter = s.visites.filter((v) => v.manquants.length > 0).length;
  const controles = s.controles;
  const [confirmer, setConfirmer] = useState(false);
  // À l'heure du pays : l'échéance est « jeudi 18 h, heure du pays » (RG-013).
  const dateHeure = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: s.fuseau,
    }).format(new Date(iso));
  const enRetard = !!s.planning && new Date(s.planning.echeance) < new Date();
  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: controles ? '1fr 1fr' : '1fr' },
        }}
      >
        <Card>
          <EnTeteCarte titre={t('planification.resume')} />
          <Stack spacing={1} sx={{ p: 2 }}>
            {s.planning ? (
              <>
                <Ligne
                  libelle={t('detail.statut')}
                  valeur={t(`semaine.statuts.${s.planning.statut}`)}
                />
                <Ligne
                  libelle={t('planification.visites')}
                  valeur={
                    aCompleter
                      ? t('visites.bilanACompleter', { count: s.visites.length, aCompleter })
                      : t('visites.bilan', { count: s.visites.length })
                  }
                />
                {km && (
                  <Ligne
                    libelle={t('planification.kilometrage')}
                    valeur={
                      km.total_km > 0
                        ? `${t('km.jour', {
                            km: new Intl.NumberFormat(i18n.language, {
                              maximumFractionDigits: 1,
                            }).format(km.total_km),
                          })}${km.sans_coordonnees ? ` · ${t('km.partiel', { count: km.sans_coordonnees })}` : ''}`
                        : '—'
                    }
                  />
                )}
                <Ligne
                  libelle={t('soumission.libelle')}
                  valeur={
                    s.planning.soumis_le && !s.modifiable ? (
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                        <span>
                          {t('soumission.soumisLe', { date: dateHeure(s.planning.soumis_le) })}
                        </span>
                        {s.planning.en_retard && (
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{ color: 'warning.main', fontWeight: 600 }}
                          >
                            {t('soumission.enRetard')}
                          </Typography>
                        )}
                      </Stack>
                    ) : s.modifiable ? (
                      t(
                        new Date(s.planning.echeance) < new Date()
                          ? 'soumission.echeancePassee'
                          : 'soumission.echeance',
                        { date: dateHeure(s.planning.echeance) },
                      )
                    ) : (
                      '—'
                    )
                  }
                />
                {s.modifiable && (
                  <Box>
                    <Button
                      variant="contained"
                      disabled={!!controles?.bloquants.length}
                      onClick={() => setConfirmer(true)}
                    >
                      {t('soumission.soumettre')}
                    </Button>
                    {!!controles?.bloquants.length && (
                      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                        {t('soumission.bloquantsPortail', { count: controles.bloquants.length })}
                      </Typography>
                    )}
                  </Box>
                )}
                {s.modifiable && s.reprenables > 0 && (
                  <Box>
                    <Button
                      variant="outlined"
                      disabled={reprise}
                      onClick={() => {
                        setReprise(true);
                        void agir(
                          () => client.plannings.reprendre(s.planning!.id),
                          // Les visites vraiment reprises, et les jours sautés (PLN-005 CA2).
                          (r) =>
                            [
                              t('pose.reprises', { count: r.copiees }),
                              r.ignorees.length
                                ? t('pose.ignorees', {
                                    count: r.ignorees.length,
                                    jours: [...new Set(r.ignorees.map((x) => x.date))]
                                      .map(jourCourt)
                                      .join(', '),
                                  })
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' '),
                        ).finally(() => setReprise(false));
                      }}
                    >
                      {t('pose.reprendre', { count: s.reprenables })}
                    </Button>
                  </Box>
                )}
              </>
            ) : s.peut_creer ? (
              <>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('semaine.aPreparer')}
                </Typography>
                <Box>
                  <Button
                    variant="contained"
                    onClick={() => void agir(() => client.plannings.creer(s.semaine))}
                  >
                    {t('semaine.preparer')}
                  </Button>
                </Box>
              </>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('semaine.sansPoste')}
              </Typography>
            )}
          </Stack>
        </Card>
        {controles && (
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
        )}
      </Box>
      {confirmer && s.planning && (
        <Dialog open onClose={() => setConfirmer(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('soumission.titre')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{t('soumission.confirmation')}</Typography>
            {enRetard && (
              <Typography variant="body2" sx={{ mt: 1, color: 'warning.main' }}>
                {t('soumission.confirmationRetard')}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmer(false)}>{t('soumission.annuler')}</Button>
            <Button
              variant="contained"
              onClick={() => {
                setConfirmer(false);
                void agir(
                  () => client.plannings.soumettre(s.planning!.id),
                  // Le serveur seul dit si la soumission est en retard.
                  (p) => t(p.en_retard ? 'soumission.succesRetard' : 'soumission.succes'),
                );
              }}
            >
              {t('soumission.confirmer')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}

function Colonne({
  semaine: s,
  date,
  titre,
  modifiable,
  surDeposer,
  surOuvrir,
}: {
  semaine: Semaine;
  date: string;
  titre: string;
  modifiable: boolean;
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
        {s.absences
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
              <EventBusyRounded fontSize="small" sx={{ mt: 0.25 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: a.avec_visites ? 600 : 400 }}>
                  {t('absences.ligne', {
                    type: t(`absences.types.${a.type}`),
                    periode: t(`absences.periodes.${a.periode ?? 'journee'}`),
                  })}
                </Typography>
                {a.avec_visites && a.commentaire && (
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
    </Box>
  );
}

/** Liste cible à glisser sur un jour ; « Poser… » fait la même chose au clavier. */
function ListeAGlisser({
  semaine: s,
  jourCourt,
  surPoser,
}: {
  semaine: Semaine;
  jourCourt: (iso: string) => string;
  surPoser: (prospect: string, jour: string) => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [saisie, setSaisie] = useState('');
  const [menu, setMenu] = useState<{ ancre: HTMLElement; prospect: string } | null>(null);
  // Sous la semaine (écran étroit), une liste courte ; on l'allonge à la demande.
  const [limite, setLimite] = useState(12);
  const listes = useQuery({ queryKey: ['ciblage-moi'], queryFn: () => client.ciblage.mesListes() });
  const prevus = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const v of s.visites) {
      if (v.prospect) m.set(v.prospect.id, [...(m.get(v.prospect.id) ?? []), v.date]);
    }
    return m;
  }, [s.visites]);
  const cibles = useMemo(() => {
    const vus = new Map<string, ListeCible['cibles'][number]>();
    for (const c of (listes.data ?? []).flatMap((l) => l.cibles)) vus.set(c.prospect.id, c);
    return [...vus.values()];
  }, [listes.data]);
  const filtre = normaliser(saisie.trim());
  const retenues = cibles
    .filter((c) =>
      normaliser(
        `${c.prospect.prenom ?? ''} ${c.prospect.nom} ${c.prospect.specialite_libelle ?? ''} ${c.prospect.lieu_principal?.libelle ?? ''}`,
      ).includes(filtre),
    )
    .sort((a, b) => Number(prevus.has(a.prospect.id)) - Number(prevus.has(b.prospect.id)));
  const jours = s.jours.filter((j) => j.planifiable && !jourAbsent(s, j.date));

  return (
    <Card sx={{ position: { lg: 'sticky' }, top: { lg: 80 } }}>
      <EnTeteCarte titre={t('pose.titre')} />
      <Stack spacing={1} sx={{ p: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {t('planification.glisser')}
        </Typography>
        <TextField
          size="small"
          placeholder={t('visites.chercherProspect')}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': t('visites.chercherProspect') },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        {listes.isError ? (
          <Alert severity="warning">{t('ciblage.mobile.indisponible')}</Alert>
        ) : !listes.data ? (
          <Skeleton variant="rounded" height={200} />
        ) : (
          <Stack spacing={0.5} sx={{ maxHeight: { lg: 520 }, overflowY: 'auto' }}>
            {retenues.slice(0, limite).map((c) => {
              const deja = prevus.get(c.prospect.id);
              return (
                <Stack
                  key={c.prospect.id}
                  direction="row"
                  spacing={1}
                  draggable
                  onDragStart={(e: DragEvent) => {
                    e.dataTransfer.setData(
                      FORMAT,
                      JSON.stringify({ type: 'prospect', id: c.prospect.id }),
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  sx={{
                    alignItems: 'center',
                    p: 0.75,
                    borderRadius: 1,
                    cursor: 'grab',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <DragIndicatorRounded fontSize="small" sx={{ color: 'text.disabled' }} />
                  <Potentiel valeur={c.prospect.potentiel} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {nom(c.prospect, t)}
                    </Typography>
                    <Typography
                      variant="caption"
                      noWrap
                      component="p"
                      sx={{ color: 'text.secondary' }}
                    >
                      {deja
                        ? t('pose.dejaPrevu', { jours: deja.map(jourCourt).join(', ') })
                        : (c.prospect.specialite_libelle ?? c.prospect.type_libelle)}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    aria-label={t('planification.poserProspect', { nom: nom(c.prospect, t) })}
                    onClick={(e) => setMenu({ ancre: e.currentTarget, prospect: c.prospect.id })}
                  >
                    {t('planification.poser')}
                  </Button>
                </Stack>
              );
            })}
            {retenues.length > limite && (
              <Button size="small" onClick={() => setLimite(limite + 20)}>
                {t('planification.plus', { count: retenues.length - limite })}
              </Button>
            )}
          </Stack>
        )}
      </Stack>
      <Menu anchorEl={menu?.ancre} open={!!menu} onClose={() => setMenu(null)}>
        {jours.map((j) => (
          <MenuItem
            key={j.date}
            onClick={() => {
              if (menu) surPoser(menu.prospect, j.date);
              setMenu(null);
            }}
          >
            {jourCourt(j.date)}
          </MenuItem>
        ))}
      </Menu>
    </Card>
  );
}

function DetailVisite({
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
  agir: (action: () => Promise<unknown>, succes?: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const controles = s.controles
    ? [...s.controles.bloquants, ...s.controles.signalements].filter((c) =>
        c.visites.includes(v.id),
      )
    : [];
  return (
    <Dialog open onClose={surFermer} fullWidth maxWidth="xs">
      <DialogTitle>{nom(v.prospect, t)}</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          <Ligne
            libelle={t('detail.quand')}
            valeur={[jourCourt(v.date), v.heure].filter(Boolean).join(' · ')}
          />
          <Ligne libelle={t('visites.champs.etablissement')} valeur={v.etablissement?.nom ?? '—'} />
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
        {modifiable && (
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
