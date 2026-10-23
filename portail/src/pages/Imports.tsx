import type { DetailLot, LotImport, Perimetre } from '@innov/api-client';
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type DragEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarreChiffres,
  Chiffre,
  EnTeteCarte,
  EnTetePage,
  EtatVide,
  Etiquette,
} from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { depuis } from '../composants/formats';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

type SourceImport = 'birdnotes' | 'organisation' | 'ventes';

/** Ordre d'affichage des compteurs : celui des dépendances de l'import. */
const ENTITES = [
  'secteurs',
  'localites',
  'divisions',
  'reseaux',
  'produits',
  'portefeuilles',
  'etablissements',
  'prospects',
  'exercices',
  'demandes_modification',
];

function taille(octets: number) {
  return octets > 1e6 ? `${(octets / 1e6).toFixed(1)} Mo` : `${Math.ceil(octets / 1e3)} Ko`;
}

function StatutLot({ lot }: { lot: LotImport }) {
  const { t } = useTranslation();
  const ton = lot.statut === 'termine' ? 'success' : lot.statut === 'echec' ? 'error' : 'neutre';
  return <Etiquette ton={ton}>{t(`imports.statuts.${lot.statut}`)}</Etiquette>;
}

/** Compteurs et anomalies d'un lot (PRP-013 CA2). */
function ResultatLot({ lot }: { lot: DetailLot }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const c = lot.compteurs;
  const n = (entite: string, action: string) => c[entite]?.[action] ?? 0;
  const entites = [
    ...ENTITES.filter((e) => c[e]),
    ...Object.keys(c).filter((e) => !ENTITES.includes(e)),
  ];
  // Les anomalies se lisent par motif : « 298 téléphones inexploitables » plutôt que 298 lignes.
  const motifs = useMemo(() => {
    const parMotif = new Map<string, { niveau: string; entite: string; nombre: number }>();
    for (const a of lot.anomalies) {
      const actuel = parMotif.get(a.motif);
      if (actuel) actuel.nombre += 1;
      else parMotif.set(a.motif, { niveau: a.niveau, entite: a.entite, nombre: 1 });
    }
    return [...parMotif.entries()].sort(
      (a, b) =>
        Number(b[1].niveau === 'rejet') - Number(a[1].niveau === 'rejet') ||
        b[1].nombre - a[1].nombre,
    );
  }, [lot.anomalies]);

  async function telecharger() {
    try {
      const csv = await client.imports.rapport(lot.id);
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      lien.download = `rapport-import-${lot.debut.slice(0, 10)}.csv`;
      lien.click();
      URL.revokeObjectURL(lien.href);
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
  }

  return (
    <Stack spacing={2}>
      <BarreChiffres>
        {lot.source === 'ventes' ? (
          <>
            <Chiffre
              libelle={t('imports.chiffres.ventes')}
              valeur={n('ventes', 'crees')}
              detail={t('imports.chiffres.remplacees', { count: n('ventes', 'remplacees') })}
            />
            <Chiffre libelle={t('imports.chiffres.clients')} valeur={n('clients', 'crees')} />
            <Chiffre libelle={t('imports.chiffres.rejetees')} valeur={n('ventes', 'rejetes')} />
          </>
        ) : lot.source === 'organisation' ? (
          <>
            <Chiffre
              libelle={t('imports.chiffres.postes')}
              valeur={n('postes', 'crees')}
              detail={t('imports.chiffres.existants', { count: n('postes', 'existants') })}
            />
            <Chiffre libelle={t('imports.chiffres.vacants')} valeur={n('postes', 'vacants')} />
            <Chiffre
              libelle={t('imports.chiffres.comptes')}
              valeur={n('comptes', 'crees')}
              detail={t('imports.chiffres.reseaux', { count: n('reseaux', 'crees') })}
            />
          </>
        ) : (
          <>
            <Chiffre
              libelle={t('imports.chiffres.prospects')}
              valeur={n('prospects', 'crees')}
              detail={t('imports.chiffres.existants', { count: n('prospects', 'existants') })}
            />
            <Chiffre
              libelle={t('imports.chiffres.etablissements')}
              valeur={n('etablissements', 'crees')}
              detail={t('imports.chiffres.aPreciser', {
                count: n('etablissements', 'type_a_preciser'),
              })}
            />
            <Chiffre
              libelle={t('imports.chiffres.produits')}
              valeur={n('produits', 'crees')}
              detail={t('imports.chiffres.reseaux', { count: n('reseaux', 'crees') })}
            />
          </>
        )}
        <Chiffre
          libelle={t('imports.chiffres.rejets')}
          valeur={lot.rejets}
          ton="warning"
          detail={t('imports.chiffres.anomalies', { count: lot.nb_anomalies })}
        />
      </BarreChiffres>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' },
          alignItems: 'start',
        }}
      >
        <Card>
          <EnTeteCarte titre={t('imports.detail')} />
          <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
            {entites.map((e) => (
              <Stack
                key={e}
                direction="row"
                spacing={1}
                sx={{ px: 2, py: 1, alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Typography sx={{ fontWeight: 500 }}>
                  {t(`imports.entites.${e}`, { defaultValue: e })}
                </Typography>
                <Typography variant="body2" sx={{ textAlign: 'right', color: 'text.secondary' }}>
                  {Object.entries(c[e] ?? {}).map(([action, nombre], i) => (
                    <Box
                      component="span"
                      key={action}
                      sx={{
                        color: action === 'rejetes' && nombre ? 'warning.main' : undefined,
                        fontWeight: action === 'crees' ? 600 : 400,
                      }}
                    >
                      {i > 0 && ' · '}
                      {`${t(`imports.actions.${action}`, { defaultValue: action })} ${nombre.toLocaleString()}`}
                    </Box>
                  ))}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Card>
        <Card>
          <EnTeteCarte
            titre={t('imports.anomalies')}
            action={
              <Button size="small" onClick={() => void telecharger()}>
                {t('imports.rapportCsv')}
              </Button>
            }
          />
          {motifs.length === 0 ? (
            <EtatVide titre={t('imports.aucuneAnomalie')} />
          ) : (
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
              {motifs.map(([motif, m]) => (
                <Stack
                  key={motif}
                  direction="row"
                  spacing={1.5}
                  sx={{ px: 2, py: 1, alignItems: 'center' }}
                >
                  <Typography
                    sx={{
                      minWidth: 56,
                      textAlign: 'right',
                      fontWeight: 600,
                      color: m.niveau === 'rejet' ? 'warning.main' : 'text.primary',
                    }}
                  >
                    {m.nombre.toLocaleString()}
                  </Typography>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2">{motif}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {t(`imports.niveaux.${m.niveau}`, { defaultValue: m.niveau })}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}
        </Card>
      </Box>
    </Stack>
  );
}

/** Reprise contrôlée de l'export du CRM en place (PRP-013) : simuler, vérifier, importer. */
export default function Imports({ perimetre }: { perimetre: Perimetre }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  // Deux sources : l'export BirdNotes (PRP-013) et le fichier d'organisation (ORG-014).
  const [source, setSource] = useState<SourceImport>('birdnotes');
  const [fichier, setFichier] = useState<File | null>(null);
  const [survol, setSurvol] = useState(false);
  const [envoi, setEnvoi] = useState<'simulation' | 'import' | null>(null);
  const [resultat, setResultat] = useState<DetailLot | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [consulte, setConsulte] = useState<string | null>(null);
  const cle = perimetre.pays_actif?.code ?? 'consolide';

  const lots = useQuery({
    queryKey: ['imports', cle],
    queryFn: client.imports.liste,
    enabled: perimetre.pays_actif !== null,
  });
  const detail = useQuery({
    queryKey: ['imports', cle, consulte],
    queryFn: () => client.imports.detail(consulte!),
    enabled: consulte !== null,
  });

  const simule = resultat?.statut === 'simule';
  const importe = resultat?.statut === 'termine';
  const etape = !fichier ? 0 : !simule && !importe ? 1 : simule ? 2 : 3;

  function choisir(f: File | undefined) {
    if (!f) return;
    setFichier(f);
    setResultat(null);
    setConsulte(null);
  }

  async function lancer(simulation: boolean) {
    if (!fichier) return;
    setEnvoi(simulation ? 'simulation' : 'import');
    setConfirmation(false);
    try {
      const lot =
        source === 'ventes'
          ? await client.ventes.importer(fichier, fichier.name, simulation)
          : await client.imports[source](fichier, fichier.name, simulation);
      setResultat(lot);
      setConsulte(null);
      notifier(simulation ? t('imports.simulationTerminee') : t('imports.importTermine'));
      void requetes.invalidateQueries({ queryKey: ['imports'] });
      if (!simulation) {
        for (const q of ['prospects', 'etablissements', 'organisation', 'referentiel', 'ventes']) {
          void requetes.invalidateQueries({ queryKey: [q] });
        }
      }
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    } finally {
      setEnvoi(null);
    }
  }

  const deposer = (e: DragEvent) => {
    e.preventDefault();
    setSurvol(false);
    choisir(e.dataTransfer.files[0]);
  };

  if (!perimetre.pays_actif) {
    return (
      <Stack spacing={2}>
        <EnTetePage titre={t('imports.titre')} />
        <Alert severity="info">{t('imports.choisirPays')}</Alert>
      </Stack>
    );
  }

  const affiche = consulte ? detail.data : resultat;

  return (
    <Stack spacing={2}>
      <EnTetePage titre={t('imports.titre')} sousTitre={perimetre.pays_actif.nom} />
      <Card>
        <EnTeteCarte
          titre={t(`imports.sources.${source}`)}
          action={
            <ToggleButtonGroup
              size="small"
              exclusive
              value={source}
              onChange={(_, v: SourceImport | null) => {
                if (!v) return;
                setSource(v);
                setFichier(null);
                setResultat(null);
              }}
              aria-label={t('imports.source')}
            >
              <ToggleButton value="birdnotes">{t('imports.sourcesCourtes.birdnotes')}</ToggleButton>
              <ToggleButton value="organisation">
                {t('imports.sourcesCourtes.organisation')}
              </ToggleButton>
              {perimetre.actions.includes('ventes.gerer') && (
                <ToggleButton value="ventes">{t('imports.sourcesCourtes.ventes')}</ToggleButton>
              )}
            </ToggleButtonGroup>
          }
        />
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stepper activeStep={etape} alternativeLabel>
            {(['fichier', 'simulation', 'import'] as const).map((e) => (
              <Step key={e}>
                <StepLabel>{t(`imports.etapes.${e}`)}</StepLabel>
              </Step>
            ))}
          </Stepper>
          <Box
            component="label"
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={deposer}
            sx={(theme) => ({
              border: 1,
              borderStyle: 'dashed',
              borderColor: survol ? 'primary.main' : 'divider',
              borderRadius: 1,
              p: 2,
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: 'center',
              textAlign: { xs: 'center', sm: 'left' },
              gap: 2,
              cursor: 'pointer',
              bgcolor: survol ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
              transition: 'background-color .15s, border-color .15s',
              '&:hover': { borderColor: 'primary.main' },
            })}
          >
            <input
              type="file"
              accept={
                source === 'birdnotes'
                  ? '.json,.zip,application/json,application/zip'
                  : '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              }
              hidden
              onChange={(e) => choisir(e.target.files?.[0])}
            />
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                {fichier ? fichier.name : t(`imports.deposerSource.${source}`)}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {fichier ? taille(fichier.size) : t(`imports.formatsSource.${source}`)}
              </Typography>
            </Box>
            <Button variant="outlined" component="span">
              {fichier ? t('imports.changer') : t('imports.choisir')}
            </Button>
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('imports.confidentialite')}
          </Typography>
          {envoi && (
            <Box>
              <LinearProgress />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('imports.enCours')}
              </Typography>
            </Box>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              variant={simule ? 'outlined' : 'contained'}
              disabled={!fichier || envoi !== null || importe}
              onClick={() => void lancer(true)}
            >
              {simule ? t('imports.resimuler') : t('imports.simuler')}
            </Button>
            <Button
              variant="contained"
              disabled={!simule || envoi !== null}
              onClick={() => setConfirmation(true)}
            >
              {t('imports.importer')}
            </Button>
          </Stack>
          {simule && !consulte && <Alert severity="info">{t('imports.simulationAide')}</Alert>}
          {importe && !consulte && <Alert severity="success">{t('imports.importAide')}</Alert>}
        </Stack>
      </Card>

      {consulte && detail.isError ? (
        <ErreurChargement erreur={detail.error} reessayer={() => void detail.refetch()} />
      ) : consulte && !affiche ? (
        <Skeleton variant="rounded" height={240} />
      ) : (
        affiche && (
          <Stack spacing={1}>
            <Typography variant="h6" component="h2">
              {t(
                affiche.statut === 'simule'
                  ? 'imports.resultatSimulation'
                  : 'imports.resultatImport',
                {
                  fichier: affiche.fichier,
                },
              )}
            </Typography>
            <ResultatLot lot={affiche} />
          </Stack>
        )
      )}

      <Card>
        <EnTeteCarte titre={t('imports.historique')} />
        {lots.isError ? (
          <Box sx={{ p: 2 }}>
            <ErreurChargement erreur={lots.error} reessayer={() => void lots.refetch()} />
          </Box>
        ) : !lots.data ? (
          <Skeleton variant="rounded" height={120} sx={{ m: 2 }} />
        ) : lots.data.length === 0 ? (
          <EtatVide titre={t('imports.aucunLot')} texte={t('imports.aucunLotTexte')} />
        ) : (
          <List component="div" disablePadding>
            {lots.data.map((lot) => (
              <ListItemButton
                key={lot.id}
                selected={consulte === lot.id}
                onClick={() => setConsulte(lot.id)}
                divider
              >
                <ListItemText
                  primary={lot.fichier}
                  secondary={t('imports.lance', {
                    personne: lot.lance_par,
                    quand: depuis(lot.debut, i18n.language),
                    count: lot.nb_anomalies,
                  })}
                  slotProps={{ primary: { sx: { overflowWrap: 'anywhere' } } }}
                />
                <StatutLot lot={lot} />
              </ListItemButton>
            ))}
          </List>
        )}
      </Card>

      <Dialog open={confirmation} onClose={() => setConfirmation(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('imports.confirmerTitre')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('imports.confirmerTexte', {
              prospects: resultat?.compteurs.prospects?.crees ?? 0,
              etablissements: resultat?.compteurs.etablissements?.crees ?? 0,
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(false)}>{t('commun.annuler')}</Button>
          <Button variant="contained" onClick={() => void lancer(false)}>
            {t('imports.importer')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
