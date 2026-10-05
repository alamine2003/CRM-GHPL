import type { ListeCible, Semaine, Visite } from '@innov/api-client';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
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
import { CarteControles, Colonne, DetailVisite } from '../composants/SemainePlanning';
import { FORMAT, type Glisse, jourAbsent, nom } from '../composants/planningTextes';

function normaliser(texte: string) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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
                {s.planning.decision && (
                  <Ligne
                    libelle={t('approbation.decision')}
                    valeur={t(`approbation.decisionsCourt.${s.planning.decision.decision}`, {
                      par: s.planning.decision.par,
                      date: dateHeure(s.planning.decision.decide_le),
                    })}
                  />
                )}
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
        {controles && <CarteControles controles={controles} jourCourt={jourCourt} />}
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
