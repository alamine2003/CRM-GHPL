import type { DetailLot, LotImport, Perimetre } from '@innov/api-client';
import ApartmentRounded from '@mui/icons-material/ApartmentRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import MedicationRounded from '@mui/icons-material/MedicationRounded';
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ReportProblemRounded from '@mui/icons-material/ReportProblemRounded';
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type DragEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EnTeteCarte,
  EnTetePage,
  EtatVide,
  GrilleTuiles,
  PastilleIcone,
  Tuile,
} from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { depuis } from '../composants/formats';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

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
  const ton = lot.statut === 'termine' ? 'success' : lot.statut === 'echec' ? 'error' : 'info';
  return (
    <Chip size="small" color={ton} variant="outlined" label={t(`imports.statuts.${lot.statut}`)} />
  );
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
      <GrilleTuiles>
        <Tuile
          libelle={t('imports.chiffres.prospects')}
          valeur={n('prospects', 'crees')}
          icone={<PeopleAltRounded />}
          detail={t('imports.chiffres.existants', { count: n('prospects', 'existants') })}
        />
        <Tuile
          libelle={t('imports.chiffres.etablissements')}
          valeur={n('etablissements', 'crees')}
          icone={<ApartmentRounded />}
          ton="secondary"
          detail={t('imports.chiffres.aPreciser', {
            count: n('etablissements', 'type_a_preciser'),
          })}
        />
        <Tuile
          libelle={t('imports.chiffres.produits')}
          valeur={n('produits', 'crees')}
          icone={<MedicationRounded />}
          ton="info"
          detail={t('imports.chiffres.reseaux', { count: n('reseaux', 'crees') })}
        />
        <Tuile
          libelle={t('imports.chiffres.rejets')}
          valeur={lot.rejets}
          icone={<ReportProblemRounded />}
          ton={lot.rejets ? 'warning' : 'success'}
          detail={t('imports.chiffres.anomalies', { count: lot.nb_anomalies })}
        />
      </GrilleTuiles>
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
                sx={{ px: 2.25, py: 1.1, alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Typography sx={{ fontWeight: 600 }}>
                  {t(`imports.entites.${e}`, { defaultValue: e })}
                </Typography>
                <Stack
                  direction="row"
                  sx={{ flexWrap: 'wrap', gap: 0.5, justifyContent: 'flex-end' }}
                >
                  {Object.entries(c[e] ?? {}).map(([action, nombre]) => (
                    <Chip
                      key={action}
                      size="small"
                      color={
                        action === 'rejetes'
                          ? 'warning'
                          : action === 'crees'
                            ? 'primary'
                            : 'default'
                      }
                      variant={action === 'crees' ? 'filled' : 'outlined'}
                      label={`${t(`imports.actions.${action}`, { defaultValue: action })} ${nombre.toLocaleString()}`}
                    />
                  ))}
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Card>
        <Card>
          <EnTeteCarte
            titre={t('imports.anomalies')}
            action={
              <Button
                size="small"
                startIcon={<DownloadRounded />}
                onClick={() => void telecharger()}
              >
                {t('imports.rapportCsv')}
              </Button>
            }
          />
          {motifs.length === 0 ? (
            <EtatVide icone={<CheckCircleRounded />} titre={t('imports.aucuneAnomalie')} />
          ) : (
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
              {motifs.map(([motif, m]) => (
                <Stack
                  key={motif}
                  direction="row"
                  spacing={1.5}
                  sx={{ px: 2.25, py: 1.1, alignItems: 'center' }}
                >
                  <Chip
                    size="small"
                    color={m.niveau === 'rejet' ? 'warning' : 'default'}
                    label={m.nombre.toLocaleString()}
                    sx={{ minWidth: 48, fontWeight: 700 }}
                  />
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
      const lot = await client.imports.birdnotes(fichier, fichier.name, simulation);
      setResultat(lot);
      setConsulte(null);
      notifier(simulation ? t('imports.simulationTerminee') : t('imports.importTermine'));
      void requetes.invalidateQueries({ queryKey: ['imports'] });
      if (!simulation) {
        for (const q of ['prospects', 'etablissements', 'organisation', 'referentiel']) {
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
      <Stack spacing={2.5}>
        <EnTetePage titre={t('imports.titre')} />
        <Alert severity="info">{t('imports.choisirPays')}</Alert>
      </Stack>
    );
  }

  const affiche = consulte ? detail.data : resultat;

  return (
    <Stack spacing={2.5}>
      <EnTetePage
        titre={t('imports.titre')}
        sousTitre={t('imports.sousTitre', { pays: perimetre.pays_actif.nom })}
      />
      <Card>
        <EnTeteCarte
          titre={t('imports.birdnotes')}
          action={<PastilleIcone icone={<CloudUploadRounded />} taille={32} />}
        />
        <Stack spacing={2.5} sx={{ p: { xs: 2, sm: 3 } }}>
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
              border: 2,
              borderStyle: 'dashed',
              borderColor: survol ? 'primary.main' : 'divider',
              borderRadius: 3,
              p: 3,
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
              accept=".json,.zip,application/json,application/zip"
              hidden
              onChange={(e) => choisir(e.target.files?.[0])}
            />
            <PastilleIcone
              icone={fichier ? <DescriptionRounded /> : <CloudUploadRounded />}
              ton={fichier ? 'success' : 'primary'}
              taille={48}
            />
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                {fichier ? fichier.name : t('imports.deposer')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {fichier ? taille(fichier.size) : t('imports.formats')}
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
              startIcon={<ScienceRounded />}
              disabled={!fichier || envoi !== null || importe}
              onClick={() => void lancer(true)}
            >
              {simule ? t('imports.resimuler') : t('imports.simuler')}
            </Button>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<PlayArrowRounded />}
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
        <EnTeteCarte
          titre={t('imports.historique')}
          action={<PastilleIcone icone={<HistoryRounded />} ton="secondary" taille={32} />}
        />
        {lots.isError ? (
          <Box sx={{ p: 2 }}>
            <ErreurChargement erreur={lots.error} reessayer={() => void lots.refetch()} />
          </Box>
        ) : !lots.data ? (
          <Skeleton variant="rounded" height={120} sx={{ m: 2 }} />
        ) : lots.data.length === 0 ? (
          <EtatVide
            icone={<HistoryRounded />}
            titre={t('imports.aucunLot')}
            texte={t('imports.aucunLotTexte')}
          />
        ) : (
          <List disablePadding>
            {lots.data.map((lot) => (
              <ListItemButton
                key={lot.id}
                selected={consulte === lot.id}
                onClick={() => setConsulte(lot.id)}
                divider
              >
                <ListItemIcon>
                  {lot.simulation ? <ScienceRounded /> : <CheckCircleRounded color="success" />}
                </ListItemIcon>
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
          <Button variant="contained" color="secondary" onClick={() => void lancer(false)}>
            {t('imports.importer')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
