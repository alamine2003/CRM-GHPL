import type { Cible, Perimetre, PosteCible, Potentiel, ProspectCible } from '@innov/api-client';
import AddRounded from '@mui/icons-material/AddRounded';
import AddCircleOutlineRounded from '@mui/icons-material/AddCircleOutlineRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import EventRepeatRounded from '@mui/icons-material/EventRepeatRounded';
import GpsNotFixedRounded from '@mui/icons-material/GpsNotFixedRounded';
import PersonOffRounded from '@mui/icons-material/PersonOffRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import TrackChangesRounded from '@mui/icons-material/TrackChangesRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import {
  EnTeteCarte,
  EnTetePage,
  EtatVide,
  GrilleTuiles,
  PastilleIcone,
  Tuile,
} from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

const POTENTIELS: Potentiel[] = ['A', 'B', 'C'];

function normaliser(texte: string) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function useCouleurPotentiel() {
  const theme = useTheme();
  return (p: Potentiel) =>
    p === 'A'
      ? theme.palette.secondary.main
      : p === 'B'
        ? theme.palette.info.main
        : theme.palette.text.disabled;
}

function nomAffiche(p: ProspectCible, t: (c: string) => string) {
  return [p.civilite ? t(`prospect.civilites.${p.civilite}`) : '', p.prenom, p.nom]
    .filter(Boolean)
    .join(' ');
}

/** Barre A/B/C de la liste, proportionnelle au nombre de prospects. */
function BarrePotentiels({ potentiels }: { potentiels: Record<string, number> }) {
  const { t } = useTranslation();
  const couleur = useCouleurPotentiel();
  const total = POTENTIELS.reduce((n, p) => n + (potentiels[p] ?? 0), 0);
  if (!total) return null;
  return (
    <Box
      role="img"
      aria-label={t('ciblage.repartition', {
        a: potentiels.A ?? 0,
        b: potentiels.B ?? 0,
        c: potentiels.C ?? 0,
      })}
      sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', mt: 1 }}
    >
      {POTENTIELS.map((p) =>
        potentiels[p] ? <Box key={p} sx={{ flex: potentiels[p], bgcolor: couleur(p) }} /> : null,
      )}
    </Box>
  );
}

function PastillePotentiel({ potentiel }: { potentiel: Potentiel }) {
  const { t } = useTranslation();
  const couleur = useCouleurPotentiel()(potentiel);
  return (
    <Box
      aria-label={t(`prospect.potentiels.${potentiel}`)}
      sx={{
        width: 30,
        height: 30,
        flex: 'none',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 800,
        fontSize: 13,
        color: couleur,
        bgcolor: alpha(couleur, 0.14),
      }}
    >
      {potentiel}
    </Box>
  );
}

// --- Choix du poste -----------------------------------------------------------------------------

function ListePostes({
  postes,
  choisi,
  choisir,
}: {
  postes: PosteCible[];
  choisi: string | null;
  choisir: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [filtre, setFiltre] = useState('');
  const visibles = postes.filter((p) =>
    normaliser(
      `${p.libelle} ${p.occupant ?? ''} ${p.secteurs.map((s) => s.libelle).join(' ')}`,
    ).includes(normaliser(filtre)),
  );
  return (
    <Card sx={{ alignSelf: 'start' }}>
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          size="small"
          fullWidth
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          placeholder={t('ciblage.chercherPoste')}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            },
            htmlInput: { 'aria-label': t('ciblage.chercherPoste') },
          }}
        />
      </Box>
      <List component="div" disablePadding sx={{ maxHeight: { md: 640 }, overflow: 'auto' }}>
        {visibles.map((p) => (
          <ListItemButton
            key={p.id}
            selected={p.id === choisi}
            onClick={() => choisir(p.id)}
            divider
            sx={{ display: 'block', py: 1.25 }}
          >
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Typography sx={{ fontWeight: 700, minWidth: 0 }} noWrap>
                {p.libelle}
              </Typography>
              <Typography sx={{ fontWeight: 800, color: 'text.secondary' }}>
                {p.synthese.total}
              </Typography>
            </Stack>
            <Typography
              variant="caption"
              sx={{ color: p.occupant ? 'text.secondary' : 'warning.main' }}
            >
              {p.occupant ?? t('ciblage.vacant')}
            </Typography>
            <BarrePotentiels potentiels={p.synthese.potentiels} />
          </ListItemButton>
        ))}
        {visibles.length === 0 && (
          <Typography variant="body2" sx={{ p: 2, color: 'text.secondary' }}>
            {t('ciblage.aucunPoste')}
          </Typography>
        )}
      </List>
    </Card>
  );
}

// --- Ajout de prospects ---------------------------------------------------------------------------

function DialogueAjout({ poste, surFermer }: { poste: PosteCible; surFermer: () => void }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const [saisie, setSaisie] = useState('');
  const [q, setQ] = useState('');
  const [potentiel, setPotentiel] = useState<Potentiel | ''>('');
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    const minuteur = setTimeout(() => setQ(saisie), 250);
    return () => clearTimeout(minuteur);
  }, [saisie]);
  const candidats = useQuery({
    queryKey: ['ciblage', 'candidats', poste.id, q, potentiel],
    queryFn: () => client.ciblage.candidats(poste.id, { q, potentiel: potentiel || undefined }),
  });
  const liste = candidats.data ?? [];
  const tous = liste.length > 0 && liste.every((p) => choix.has(p.id));
  const basculer = (id: string) =>
    setChoix((avant) => {
      const suivant = new Set(avant);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  async function ajouter() {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await client.ciblage.ajouter(poste.id, [...choix]);
      notifier(t('ciblage.ajoutes', { count: r.ajoutes }));
      void requetes.invalidateQueries({ queryKey: ['ciblage'] });
      surFermer();
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Dialog open onClose={surFermer} maxWidth="sm" fullWidth aria-labelledby="titre-ajout-cibles">
      <DialogTitle id="titre-ajout-cibles">
        {t('ciblage.ajouterTitre', { poste: poste.libelle })}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {q ? t('ciblage.rechercheTexte') : t('ciblage.candidatsTexte')}
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Stack spacing={1.5} sx={{ p: 2, pb: 1 }}>
          {erreur && <Alert severity="error">{erreur}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              size="small"
              fullWidth
              autoFocus
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder={t('ciblage.chercherProspect')}
              slotProps={{ htmlInput: { 'aria-label': t('ciblage.chercherProspect') } }}
            />
            <ToggleButtonGroup
              size="small"
              exclusive
              value={potentiel}
              onChange={(_, v: Potentiel | null) => setPotentiel(v ?? '')}
              aria-label={t('prospect.champs.potentiel')}
            >
              {POTENTIELS.map((p) => (
                <ToggleButton key={p} value={p} sx={{ px: 1.75, fontWeight: 800 }}>
                  {p}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              size="small"
              disabled={liste.length === 0}
              onClick={() =>
                setChoix((avant) => {
                  const suivant = new Set(avant);
                  for (const p of liste) {
                    if (tous) suivant.delete(p.id);
                    else suivant.add(p.id);
                  }
                  return suivant;
                })
              }
            >
              {tous ? t('ciblage.toutDeselectionner') : t('ciblage.toutSelectionner')}
            </Button>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('ciblage.frequenceDefaut')}
            </Typography>
          </Stack>
        </Stack>
        <List component="div" dense sx={{ maxHeight: 380, overflow: 'auto' }}>
          {candidats.isLoading &&
            [0, 1, 2].map((i) => <Skeleton key={i} height={52} sx={{ mx: 2 }} />)}
          {!candidats.isLoading && liste.length === 0 && (
            <Typography variant="body2" sx={{ px: 2, py: 3, color: 'text.secondary' }}>
              {t('ciblage.aucunCandidat')}
            </Typography>
          )}
          {liste.map((p) => (
            <ListItemButton key={p.id} onClick={() => basculer(p.id)} sx={{ gap: 1.25 }}>
              <Checkbox
                edge="start"
                checked={choix.has(p.id)}
                tabIndex={-1}
                slotProps={{ input: { 'aria-label': nomAffiche(p, t) } }}
              />
              <PastillePotentiel potentiel={p.potentiel} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {nomAffiche(p, t)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap component="p">
                  {[p.specialite_libelle ?? p.type_libelle, p.lieu_principal?.libelle ?? p.secteur]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
              </Box>
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={surFermer}>{t('commun.annuler')}</Button>
        <Button
          variant="contained"
          startIcon={<PlaylistAddCheckRounded />}
          disabled={choix.size === 0 || envoi}
          onClick={() => void ajouter()}
        >
          {t('ciblage.ajouterN', { count: choix.size })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// --- Liste d'un poste -----------------------------------------------------------------------------

function Frequence({ cible, gerer }: { cible: Cible; gerer: boolean }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  async function changer(valeur: number) {
    try {
      await client.ciblage.frequence(cible.id, valeur);
      void requetes.invalidateQueries({ queryKey: ['ciblage'] });
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
  }
  const nom = nomAffiche(cible.prospect, t);
  return (
    <Stack direction="row" sx={{ alignItems: 'center' }}>
      {gerer && (
        <IconButton
          size="small"
          disabled={cible.frequence <= 1}
          onClick={() => void changer(cible.frequence - 1)}
          aria-label={`${t('ciblage.moins')} · ${nom}`}
        >
          <RemoveCircleOutlineRounded fontSize="small" />
        </IconButton>
      )}
      <Tooltip title={t('ciblage.frequenceAide')}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, minWidth: 64, textAlign: 'center', whiteSpace: 'nowrap' }}
        >
          {t('ciblage.parCycle', { count: cible.frequence })}
        </Typography>
      </Tooltip>
      {gerer && (
        <IconButton
          size="small"
          disabled={cible.frequence >= 20}
          onClick={() => void changer(cible.frequence + 1)}
          aria-label={`${t('ciblage.plus')} · ${nom}`}
        >
          <AddCircleOutlineRounded fontSize="small" />
        </IconButton>
      )}
    </Stack>
  );
}

function DetailPoste({ id }: { id: string }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const couleur = useCouleurPotentiel();
  const requetes = useQueryClient();
  const [ajout, setAjout] = useState(false);
  const [retrait, setRetrait] = useState<Cible | null>(null);
  const [potentiel, setPotentiel] = useState<Potentiel | ''>('');
  const liste = useQuery({
    queryKey: ['ciblage', 'liste', id],
    queryFn: () => client.ciblage.liste(id),
  });
  if (liste.isError) {
    return <ErreurChargement erreur={liste.error} reessayer={() => void liste.refetch()} />;
  }
  if (!liste.data) return <Skeleton variant="rounded" height={420} />;
  const { poste, cibles } = liste.data;
  const s = poste.synthese;
  const horsSecteur = cibles.filter((c) => c.hors_secteur).length;
  const surcharge = s.seuil_max != null && s.visites_par_jour > s.seuil_max;
  const affichees = cibles.filter((c) => !potentiel || c.prospect.potentiel === potentiel);

  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Card sx={{ p: 2.5 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
            <PastilleIcone icone={<BadgeRounded />} taille={48} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h5" component="h2" noWrap>
                {poste.libelle}
              </Typography>
              <Typography sx={{ color: poste.occupant ? 'text.secondary' : 'warning.main' }}>
                {poste.occupant ?? t('ciblage.vacant')}
              </Typography>
            </Box>
          </Stack>
          {poste.gerable && (
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAjout(true)}>
              {t('ciblage.ajouter')}
            </Button>
          )}
        </Stack>
        <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mt: 1.5 }}>
          {poste.secteurs.map((x) => (
            <Chip key={x.id} size="small" variant="outlined" label={x.libelle} />
          ))}
        </Stack>
      </Card>

      <GrilleTuiles>
        <Tuile
          libelle={t('ciblage.chiffres.prospects')}
          valeur={s.total}
          icone={<TrackChangesRounded />}
          detail={t('ciblage.repartition', {
            a: s.potentiels.A,
            b: s.potentiels.B,
            c: s.potentiels.C,
          })}
        />
        <Tuile
          libelle={t('ciblage.chiffres.visitesCycle', { semaines: s.cycle_semaines })}
          valeur={s.visites_par_cycle}
          icone={<EventRepeatRounded />}
          ton="secondary"
        />
        <Tuile
          libelle={t('ciblage.chiffres.visitesJour')}
          valeur={s.visites_par_jour.toLocaleString()}
          icone={<EventRepeatRounded />}
          ton={surcharge ? 'error' : 'info'}
          detail={
            s.seuil_min != null && s.seuil_max != null
              ? t('ciblage.chiffres.seuils', { min: s.seuil_min, max: s.seuil_max })
              : undefined
          }
        />
        <Tuile
          libelle={t('ciblage.chiffres.horsSecteur')}
          valeur={horsSecteur}
          icone={<GpsNotFixedRounded />}
          ton="warning"
          detail={t('ciblage.chiffres.horsSecteurDetail')}
        />
      </GrilleTuiles>
      {surcharge && <Alert severity="warning">{t('ciblage.surcharge')}</Alert>}

      <Card>
        <EnTeteCarte
          titre={t('ciblage.liste')}
          action={
            <ToggleButtonGroup
              size="small"
              exclusive
              value={potentiel}
              onChange={(_, v: Potentiel | null) => setPotentiel(v ?? '')}
              aria-label={t('prospect.champs.potentiel')}
            >
              {POTENTIELS.map((p) => (
                <ToggleButton key={p} value={p} sx={{ px: 1.5, fontWeight: 800 }}>
                  {p}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          }
        />
        {cibles.length === 0 ? (
          <EtatVide
            icone={<TrackChangesRounded />}
            titre={t('ciblage.vide')}
            texte={poste.gerable ? t('ciblage.videTexte') : t('ciblage.videLecture')}
            action={
              poste.gerable && (
                <Button
                  variant="contained"
                  startIcon={<AddRounded />}
                  onClick={() => setAjout(true)}
                >
                  {t('ciblage.ajouter')}
                </Button>
              )
            }
          />
        ) : (
          <Box>
            {affichees.map((c) => (
              <Stack
                key={c.id}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={{ xs: 0.5, sm: 1.5 }}
                sx={{
                  alignItems: { sm: 'center' },
                  px: 2,
                  py: 1.1,
                  borderTop: 1,
                  borderColor: 'divider',
                  borderLeft: 3,
                  borderLeftColor: couleur(c.prospect.potentiel),
                }}
              >
                <Stack
                  direction="row"
                  spacing={1.25}
                  sx={{ alignItems: 'center', flexGrow: 1, minWidth: 0 }}
                >
                  <PastillePotentiel potentiel={c.prospect.potentiel} />
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      <Typography sx={{ fontWeight: 600 }} noWrap>
                        {nomAffiche(c.prospect, t)}
                      </Typography>
                      {c.hors_secteur && (
                        <Tooltip title={t('ciblage.horsSecteurAide')}>
                          <Chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            label={t('ciblage.horsSecteur')}
                            sx={{ height: 20 }}
                          />
                        </Tooltip>
                      )}
                    </Stack>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
                      {[
                        c.prospect.specialite_libelle ?? c.prospect.type_libelle,
                        c.prospect.lieu_principal?.libelle ?? c.prospect.secteur,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  </Box>
                </Stack>
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ alignItems: 'center', alignSelf: { xs: 'flex-end', sm: 'center' } }}
                >
                  <Frequence cible={c} gerer={poste.gerable} />
                  {poste.gerable && (
                    <Tooltip title={t('ciblage.retirer')}>
                      <IconButton
                        size="small"
                        onClick={() => setRetrait(c)}
                        aria-label={`${t('ciblage.retirer')} · ${nomAffiche(c.prospect, t)}`}
                      >
                        <PersonOffRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              </Stack>
            ))}
          </Box>
        )}
      </Card>
      {ajout && <DialogueAjout poste={poste} surFermer={() => setAjout(false)} />}
      {retrait && (
        <DialogueRetrait
          cible={retrait}
          surFermer={() => {
            setRetrait(null);
            void requetes.invalidateQueries({ queryKey: ['ciblage'] });
          }}
        />
      )}
    </Stack>
  );
}

function DialogueRetrait({ cible, surFermer }: { cible: Cible; surFermer: () => void }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [motif, setMotif] = useState('');
  return (
    <DialogueFormulaire
      ouvert
      titre={t('ciblage.retirerTitre', { prospect: nomAffiche(cible.prospect, t) })}
      aide={t('ciblage.retirerAide')}
      libelleValider={t('ciblage.retirer')}
      surFermer={surFermer}
      surValider={() => client.ciblage.retirer(cible.id, motif)}
    >
      <TextField
        label={t('prospect.fiche.motif')}
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        autoFocus
      />
    </DialogueFormulaire>
  );
}

/** Listes cibles par poste et fréquences cibles (PRP-011). */
export default function Ciblage({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const postes = useQuery({
    queryKey: ['ciblage', 'postes', cle],
    queryFn: client.ciblage.postes,
  });
  const [choisi, setChoisi] = useState<string | null>(null);
  const liste = useMemo(() => postes.data ?? [], [postes.data]);
  // Premier poste à tenir, sinon le premier visible.
  const courant = choisi ?? liste.find((p) => p.gerable)?.id ?? liste[0]?.id ?? null;
  const total = liste.reduce((n, p) => n + p.synthese.total, 0);
  const sansListe = liste.filter((p) => p.occupant && p.synthese.total === 0).length;

  return (
    <Stack spacing={2.5}>
      <EnTetePage
        titre={t('ciblage.titre')}
        sousTitre={
          perimetre.pays_actif
            ? t('ciblage.sousTitre', { pays: perimetre.pays_actif.nom })
            : t('ciblage.sousTitreConsolide')
        }
      />
      {postes.isError ? (
        <ErreurChargement erreur={postes.error} reessayer={() => void postes.refetch()} />
      ) : !postes.data ? (
        <Skeleton variant="rounded" height={360} />
      ) : liste.length === 0 ? (
        <Card>
          <EtatVide
            icone={<BadgeRounded />}
            titre={t('ciblage.aucunPoste')}
            texte={t('ciblage.aucunPosteTexte')}
          />
        </Card>
      ) : (
        <>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('ciblage.resume', { count: liste.length, total })}
            {sansListe > 0 && ` · ${t('ciblage.sansListe', { count: sansListe })}`}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: '300px minmax(0, 1fr)' },
            }}
          >
            <ListePostes postes={liste} choisi={courant} choisir={setChoisi} />
            {courant && <DetailPoste id={courant} />}
          </Box>
        </>
      )}
    </Stack>
  );
}
