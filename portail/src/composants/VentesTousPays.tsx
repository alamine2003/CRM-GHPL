import type { ClassementTousPays, DeviseTaux, Perimetre, VentesTousPays } from '@innov/api-client';
import CurrencyExchangeRounded from '@mui/icons-material/CurrencyExchangeRounded';
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded';
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
  LinearProgress,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';
import DialogueFormulaire from './Dialogue';
import { Chiffre, ChiffresCles, EnTeteCarte, EnTetePage, EtatVide } from './Elements';
import { Evolution, Part } from './ElementsVentes';
import { ErreurChargement } from './Erreurs';
import { evolution, montant, montantCompact, nomDuMois, nombre } from './formatsVentes';
import GraphiqueVentes from './GraphiqueVentes';

/** Cellules plus serrées sur téléphone : rien ne doit déborder du cadre. */
const SERRE = { '& .MuiTableCell-root': { px: { xs: 1, sm: 2 } } };
const CLASSEMENTS: ClassementTousPays[] = ['produit', 'reseau', 'classe'];
const CONTENUS = ['pays', 'mensuel', 'classement'] as const;
const FICHIERS = ['xlsx', 'csv'] as const;
/** Le classement montre d'abord ses premières lignes ; « Tout afficher » ouvre le reste. */
const PREMIERS = 10;

function pourcent(valeur: number | null, langue: string): string {
  return valeur === null
    ? '—'
    : `${new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(valeur)} %`;
}

/**
 * Ventes de tous les pays (1.9.0, prd.md §14.90) : le siège, sans pays choisi, lit les ventes de
 * chaque pays converties en franc CFA de l'Ouest avec les taux qu'il fixe pour l'année — à taux
 * constant, l'an passé au taux de l'année. Un pays sans taux reste dans sa monnaie, hors des
 * totaux. Aucun nom de délégué ni de client n'y figure.
 */
export default function VentesTousPaysPage({ perimetre }: { perimetre: Perimetre }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const telephone = useMediaQuery(useTheme().breakpoints.down('sm'));
  const aujourdhui = new Date();
  const [annee, setAnnee] = useState(aujourdhui.getFullYear());
  const [moisFin, setMoisFin] = useState<number | undefined>();
  const [par, setPar] = useState<ClassementTousPays>('produit');
  const [taux, setTaux] = useState(false);
  const fixeTaux = perimetre.actions.includes('ventes.taux_gerer');
  const demande = { annee, mois_fin: moisFin, par };
  const donnees = useQuery({
    queryKey: ['ventes', 'tous-pays', demande],
    queryFn: () => client.ventes.tousPays(demande),
    placeholderData: (precedent) => precedent,
  });
  const d = donnees.data;
  const langue = i18n.language;
  const annees = [0, 1, 2, 3].map((n) => aujourdhui.getFullYear() - n);
  const dernierMois = annee === aujourdhui.getFullYear() ? aujourdhui.getMonth() + 1 : 12;

  const actions = (
    <>
      {d && <ExportTousPays demande={{ annee: d.annee, mois_fin: d.mois_fin, par }} />}
      {telephone ? (
        <Tooltip title={t('ventes.tousPays.taux.bouton')}>
          <IconButton aria-label={t('ventes.tousPays.taux.bouton')} onClick={() => setTaux(true)}>
            <CurrencyExchangeRounded />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          variant="outlined"
          startIcon={<CurrencyExchangeRounded />}
          onClick={() => setTaux(true)}
        >
          {t('ventes.tousPays.taux.bouton')}
        </Button>
      )}
    </>
  );

  return (
    <Stack spacing={2}>
      <EnTetePage
        titre={t('navigation.ventes')}
        sousTitre={t('ventes.tousPays.sousTitre')}
        actions={actions}
      />
      <Card>
        <Box
          sx={{
            p: 2,
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(auto-fill, minmax(170px, 1fr))' },
            '& .MuiTextField-root': { minWidth: 0 },
          }}
        >
          <TextField
            select
            size="small"
            label={t('ventes.filtres.annee')}
            value={annee}
            onChange={(e) => {
              setAnnee(Number(e.target.value));
              setMoisFin(undefined);
            }}
          >
            {annees.map((a) => (
              <MenuItem key={a} value={a}>
                {a}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label={t('ventes.filtres.jusquau')}
            value={d?.mois_fin ?? ''}
            onChange={(e) => setMoisFin(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <MenuItem key={m} value={m} disabled={m > dernierMois}>
                {nomDuMois(`${annee}-${String(m).padStart(2, '0')}`, langue, true).replace(
                  /\s?\d{4}$/,
                  '',
                )}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </Card>
      {donnees.isError && !d ? (
        <ErreurChargement erreur={donnees.error} reessayer={() => void donnees.refetch()} />
      ) : !d ? (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={72} />
          <Skeleton variant="rounded" height={280} />
        </Stack>
      ) : (
        <Contenu
          d={d}
          rechargement={donnees.isFetching}
          par={par}
          surPar={setPar}
          fixeTaux={fixeTaux}
          ouvrirTaux={() => setTaux(true)}
        />
      )}
      <DialogueTaux
        ouvert={taux}
        annee={d?.annee ?? annee}
        modifiable={fixeTaux}
        surFermer={() => setTaux(false)}
      />
    </Stack>
  );
}

function Contenu({
  d,
  rechargement,
  par,
  surPar,
  fixeTaux,
  ouvrirTaux,
}: {
  d: VentesTousPays;
  rechargement: boolean;
  par: ClassementTousPays;
  surPar: (p: ClassementTousPays) => void;
  fixeTaux: boolean;
  ouvrirTaux: () => void;
}) {
  const { t, i18n } = useTranslation();
  const telephone = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [toutAfficher, setToutAfficher] = useState(false);
  const langue = i18n.language;
  const m = (v: number | string, devise = d.devise) => montant(v, langue, devise);
  const mc = (v: number | string) => (telephone ? montantCompact(v, langue, d.devise) : m(v));
  const periode = nomDuMois(`${d.annee}-${String(d.mois_fin).padStart(2, '0')}`, langue, true);
  const avecVentes = d.pays.filter(
    (p) => Number(p.montant_ttc) > 0 || Number(p.precedent_montant_ttc) > 0,
  ).length;
  const vide = avecVentes === 0;
  const classement = toutAfficher ? d.classement : d.classement.slice(0, PREMIERS);

  return (
    <Stack spacing={2} aria-busy={rechargement}>
      {rechargement && <LinearProgress />}
      {d.devises_sans_taux.length > 0 && (
        <Alert
          severity="warning"
          action={
            fixeTaux && (
              <Button color="inherit" size="small" onClick={ouvrirTaux}>
                {t('ventes.tousPays.taux.fixer')}
              </Button>
            )
          }
        >
          {t('ventes.tousPays.sansTaux', {
            annee: d.annee,
            devises: d.devises_sans_taux.join(', '),
            count: d.devises_sans_taux.length,
          })}
        </Alert>
      )}
      {vide ? (
        <Card>
          <EtatVide titre={t('ventes.vide.titre')} texte={t('ventes.tousPays.vide')} />
        </Card>
      ) : (
        <>
          <ChiffresCles telephone={telephone}>
            <Chiffre
              libelle={t('ventes.chiffres.ytd', { periode })}
              valeur={mc(d.total.montant_ttc)}
              detail={`${evolution(d.total.evolution, langue)} ${t('ventes.chiffres.vsAnneePrecedente', { annee: d.annee - 1 })}`}
            />
            <Chiffre
              libelle={t('ventes.chiffres.anneePrecedente', { annee: d.annee - 1 })}
              valeur={mc(d.total.precedent_montant_ttc)}
            />
            <Chiffre
              libelle={t('ventes.tousPays.objectifAtteint')}
              valeur={pourcent(d.total.taux_cible, langue)}
              detail={
                d.total.taux_attendu === null
                  ? t('ventes.tousPays.sansObjectif')
                  : t('ventes.tousPays.duAttendu', { taux: pourcent(d.total.taux_attendu, langue) })
              }
            />
            <Chiffre
              libelle={t('ventes.tousPays.paysAvecVentes')}
              valeur={`${nombre(avecVentes, langue)} / ${nombre(d.pays.length, langue)}`}
            />
          </ChiffresCles>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('ventes.tousPays.note', { devise: d.devise, annee: d.annee })}
          </Typography>

          <Card>
            <EnTeteCarte titre={t('ventes.tousPays.parPays')} />
            <TableContainer>
              <Table size="small" aria-label={t('ventes.tousPays.parPays')} sx={SERRE}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('ventes.tousPays.colonnes.pays')}</TableCell>
                    <TableCell align="right">
                      {t('ventes.tousPays.colonnes.ca', { devise: d.devise })}
                    </TableCell>
                    <TableCell sx={{ width: 140, display: { xs: 'none', sm: 'table-cell' } }}>
                      {t('ventes.colonnes.part')}
                    </TableCell>
                    <TableCell align="right">{t('ventes.colonnes.evolution')}</TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {t('ventes.tousPays.colonnes.objectif')}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.pays.map((p) => (
                    <TableRow key={p.code} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {p.nom}
                        </Typography>
                        {p.devise !== d.devise && (
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', display: 'block' }}
                          >
                            {p.taux === null
                              ? t('ventes.tousPays.tauxManquant', { devise: p.devise })
                              : t('ventes.tousPays.tauxApplique', {
                                  devise: p.devise,
                                  taux: new Intl.NumberFormat(langue, {
                                    maximumFractionDigits: 6,
                                  }).format(Number(p.taux)),
                                  reference: d.devise,
                                })}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {p.montant_converti === null ? (
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {m(p.montant_ttc, p.devise)}
                          </Typography>
                        ) : (
                          <>
                            {m(p.montant_converti)}
                            {p.devise !== d.devise && (
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.secondary', display: 'block' }}
                              >
                                {m(p.montant_ttc, p.devise)}
                              </Typography>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Part valeur={p.part} />
                      </TableCell>
                      <TableCell align="right">
                        <Evolution valeur={p.evolution} />
                      </TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        {p.taux_cible === null ? (
                          '—'
                        ) : (
                          <>
                            {pourcent(p.taux_cible, langue)}
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.secondary', display: 'block' }}
                            >
                              {t('ventes.tousPays.duAttendu', {
                                taux: pourcent(p.taux_attendu, langue),
                              })}
                            </Typography>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          <Card>
            <EnTeteCarte titre={t('ventes.tousPays.mensuel', { annee: d.annee })} />
            <Box sx={{ p: 2 }}>
              <GraphiqueVentes
                mensuel={d.mensuel}
                moisFin={d.mois_fin}
                annee={d.annee}
                devise={d.devise}
              />
            </Box>
          </Card>

          <Card>
            <EnTeteCarte
              titre={t('ventes.tousPays.classement')}
              action={
                <TextField
                  select
                  size="small"
                  hiddenLabel
                  value={par}
                  onChange={(e) => {
                    surPar(e.target.value as ClassementTousPays);
                    setToutAfficher(false);
                  }}
                  slotProps={{
                    select: {
                      SelectDisplayProps: { 'aria-label': t('ventes.tousPays.classerPar') },
                    },
                  }}
                  sx={{ minWidth: 180 }}
                >
                  {CLASSEMENTS.map((c) => (
                    <MenuItem key={c} value={c}>
                      {t(`ventes.par.${c}`)}
                    </MenuItem>
                  ))}
                </TextField>
              }
            />
            <TableContainer>
              <Table size="small" aria-label={t('ventes.tousPays.classement')} sx={SERRE}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t(`ventes.par.${par}`)}</TableCell>
                    <TableCell align="right">
                      {t('ventes.tousPays.colonnes.ca', { devise: d.devise })}
                    </TableCell>
                    <TableCell sx={{ width: 140, display: { xs: 'none', sm: 'table-cell' } }}>
                      {t('ventes.colonnes.part')}
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {t('ventes.tousPays.colonnes.nbPays')}
                    </TableCell>
                    <TableCell align="right">{t('ventes.colonnes.evolution')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {classement.map((g, i) => (
                    <TableRow key={`${g.libelle}-${i}`} hover>
                      <TableCell>{g.libelle}</TableCell>
                      <TableCell align="right">{m(g.montant_ttc)}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Part valeur={g.part} />
                      </TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        {nombre(g.pays, langue)}
                      </TableCell>
                      <TableCell align="right">
                        <Evolution valeur={g.evolution} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {d.classement.length > PREMIERS && (
              <Box sx={{ p: 1, textAlign: 'center' }}>
                <Button onClick={() => setToutAfficher(!toutAfficher)}>
                  {toutAfficher
                    ? t('ventes.tousPays.premiers', { count: PREMIERS })
                    : t('ventes.tousPays.toutAfficher', { count: d.classement.length })}
                </Button>
              </Box>
            )}
          </Card>
        </>
      )}
    </Stack>
  );
}

/** Le tableau par pays, les ventes mensuelles ou le classement, en Excel ou en CSV ; audité. */
function ExportTousPays({
  demande,
}: {
  demande: { annee: number; mois_fin: number; par: ClassementTousPays };
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const telephone = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function exporter(contenu: (typeof CONTENUS)[number], fichier: (typeof FICHIERS)[number]) {
    setAncre(null);
    setEnvoi(true);
    try {
      const blob = await client.ventes.exporterTousPays({ ...demande, contenu, fichier });
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = `ventes-tous-pays-${contenu}-${demande.annee}-${String(demande.mois_fin).padStart(2, '0')}.${fichier}`;
      lien.click();
      URL.revokeObjectURL(lien.href);
      notifier(t('ventes.export.fait'));
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    } finally {
      setEnvoi(false);
    }
  }

  const libelle = envoi ? t('ventes.export.enCours') : t('ventes.export.bouton');
  return (
    <>
      {telephone ? (
        <Tooltip title={libelle}>
          <span>
            <IconButton
              aria-label={libelle}
              aria-haspopup="menu"
              disabled={envoi}
              onClick={(e) => setAncre(e.currentTarget)}
            >
              <FileDownloadRounded />
            </IconButton>
          </span>
        </Tooltip>
      ) : (
        <Button
          variant="outlined"
          startIcon={<FileDownloadRounded />}
          disabled={envoi}
          aria-haspopup="menu"
          onClick={(e) => setAncre(e.currentTarget)}
        >
          {libelle}
        </Button>
      )}
      <Menu anchorEl={ancre} open={!!ancre} onClose={() => setAncre(null)}>
        <ListSubheader
          disableSticky
          sx={{ lineHeight: 1.4, py: 1, maxWidth: 280, whiteSpace: 'normal' }}
        >
          {t('ventes.tousPays.exportAide')}
        </ListSubheader>
        {CONTENUS.flatMap((contenu) =>
          FICHIERS.map((fichier) => (
            <MenuItem key={`${contenu}-${fichier}`} onClick={() => void exporter(contenu, fichier)}>
              <ListItemText
                primary={t(`ventes.tousPays.export.${contenu}`)}
                secondary={t(`ventes.export.${fichier}`)}
              />
            </MenuItem>
          )),
        )}
      </Menu>
    </>
  );
}

/**
 * Les taux de l'année vers le XOF, une ligne par monnaie des pays. L'administrateur du siège les
 * fixe ou les corrige ; la direction du siège les lit. Un taux ne s'efface pas : on le corrige.
 */
function DialogueTaux({
  ouvert,
  annee,
  modifiable,
  surFermer,
}: {
  ouvert: boolean;
  annee: number;
  modifiable: boolean;
  surFermer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const file = useQueryClient();
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const taux = useQuery({
    queryKey: ['ventes', 'taux', annee],
    queryFn: () => client.ventes.taux(annee),
    enabled: ouvert,
  });
  const devises = taux.data?.devises ?? [];
  const reference = taux.data?.devise_reference ?? 'XOF';
  const valeur = (dv: DeviseTaux) =>
    saisies[dv.devise] ??
    (dv.taux === null
      ? ''
      : new Intl.NumberFormat(i18n.language, {
          maximumFractionDigits: 6,
          useGrouping: false,
        }).format(Number(dv.taux)));
  const changees = devises
    .filter((dv) => saisies[dv.devise] !== undefined && saisies[dv.devise]!.trim() !== '')
    .map((dv) => ({ devise: dv.devise, taux: saisies[dv.devise]!.trim() }));

  function fermer() {
    setSaisies({});
    surFermer();
  }

  const contenu = taux.isError ? (
    <ErreurChargement erreur={taux.error} reessayer={() => void taux.refetch()} />
  ) : !taux.data ? (
    <Skeleton variant="rounded" height={120} />
  ) : devises.length === 0 ? (
    <Typography variant="body2">{t('ventes.tousPays.taux.aucune', { reference })}</Typography>
  ) : (
    devises.map((dv) => (
      <TextField
        key={dv.devise}
        label={t('ventes.tousPays.taux.libelle', { devise: dv.devise, reference })}
        helperText={dv.pays.join(', ')}
        value={valeur(dv)}
        onChange={(e) => setSaisies({ ...saisies, [dv.devise]: e.target.value })}
        slotProps={{ htmlInput: { inputMode: 'decimal', readOnly: !modifiable } }}
        placeholder={t('ventes.tousPays.taux.aFixer')}
      />
    ))
  );

  if (!modifiable)
    return (
      <Dialog open={ouvert} onClose={fermer} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontFamily: 'h6.fontFamily', fontWeight: 700 }}>
          {t('ventes.tousPays.taux.titre', { annee })}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('ventes.tousPays.taux.aideLecture', { reference, annee })}
            </Typography>
            {contenu}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={fermer}>{t('commun.fermer')}</Button>
        </DialogActions>
      </Dialog>
    );
  return (
    <DialogueFormulaire
      ouvert={ouvert}
      titre={t('ventes.tousPays.taux.titre', { annee })}
      aide={t('ventes.tousPays.taux.aide', { reference, annee })}
      invalide={changees.length === 0}
      surFermer={fermer}
      surValider={async () => {
        await client.ventes.reglerTaux({ annee, taux: changees });
        await file.invalidateQueries({ queryKey: ['ventes'] });
      }}
    >
      {contenu}
    </DialogueFormulaire>
  );
}
