import type {
  ClientVente,
  FiltresVentes,
  LigneVente,
  Perimetre,
  RegroupementVentes,
  SyntheseVentes,
  TypeClientVente,
} from '@innov/api-client';
import AddRounded from '@mui/icons-material/AddRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  LinearProgress,
  MenuItem,
  Pagination,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import DialogueFormulaire from '../composants/Dialogue';
import { BarreChiffres, Chiffre, EnTeteCarte, EnTetePage, EtatVide } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { evolution, montant, montantCompact, nomDuMois, nombre } from '../composants/formatsVentes';
import GraphiqueVentes from '../composants/GraphiqueVentes';
import {
  ChoixClient,
  DialogueCorrectionVente,
  DialogueSaisieVente,
} from '../composants/SaisieVente';
import { useSession } from '../contexteSession';

const REGROUPEMENTS: RegroupementVentes[] = [
  'delegue',
  'produit',
  'classe',
  'reseau',
  'zone',
  'client',
  'type_client',
];
/** Cellules plus serrées sur téléphone : rien ne doit déborder du cadre. */
const SERRE = { '& .MuiTableCell-root': { px: { xs: 1, sm: 2 } } };
const TYPES: TypeClientVente[] = ['pharmacie', 'parapharmacie', 'grossiste'];
/** Les filtres qui désignent un identifiant, dans l'ordre où la barre les affiche. */
const FILTRES_ID = ['delegue', 'produit', 'classe', 'reseau', 'zone'] as const;

type Filtres = Pick<
  FiltresVentes,
  'delegue' | 'produit' | 'classe' | 'reseau' | 'zone' | 'client' | 'type_client'
>;

/** L'évolution face à l'an passé, en toutes lettres par son signe (jamais par la couleur seule). */
function Evolution({ valeur }: { valeur: number | null }) {
  const { i18n } = useTranslation();
  return (
    <Typography
      component="span"
      variant="body2"
      sx={{
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color:
          valeur === null || valeur === 0
            ? 'text.secondary'
            : valeur > 0
              ? 'success.main'
              : 'error.main',
      }}
    >
      {evolution(valeur, i18n.language)}
    </Typography>
  );
}

/**
 * « Ventes » (1.6.0, prd.md §14.84) : le DO, le siège, le pays, le DM et le superviseur
 * observent et analysent les ventes des délégués de leur périmètre — cumul de l'année (YTD)
 * face à l'an passé, ventes mensuelles, ventes éclatées par délégué, produit, classe
 * thérapeutique, réseau, zone, client ou type de client, avec tous les filtres. L'administrateur
 * pays importe un fichier Excel ou saisit des lignes.
 */
export default function Ventes({ perimetre }: { perimetre: Perimetre }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const navigate = useNavigate();
  const [onglet, setOnglet] = useState<'synthese' | 'lignes'>('synthese');
  const [annee, setAnnee] = useState<number | undefined>();
  const [moisFin, setMoisFin] = useState<number | undefined>();
  const [par, setPar] = useState<RegroupementVentes>('produit');
  const [filtres, setFiltres] = useState<Filtres>({});
  const [saisie, setSaisie] = useState(false);
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const gere = perimetre.actions.includes('ventes.gerer');
  const actif = perimetre.pays_actif !== null;

  const options = useQuery({
    queryKey: ['ventes', 'options', cle],
    queryFn: client.ventes.options,
    enabled: actif,
  });
  const requete: FiltresVentes = { annee, mois_fin: moisFin, par, ...filtres };
  const synthese = useQuery({
    queryKey: ['ventes', 'synthese', cle, requete],
    queryFn: () => client.ventes.synthese(requete),
    enabled: actif,
    placeholderData: (precedent) => precedent,
  });

  const titre = t('navigation.ventes');
  if (!perimetre.pays_actif)
    return (
      <Stack spacing={2}>
        <EnTetePage titre={titre} />
        <Alert severity="info">{t('ventes.choisirPays')}</Alert>
      </Stack>
    );
  const actions = gere && (
    <>
      <Button
        variant="outlined"
        startIcon={<CloudUploadRounded />}
        onClick={() => void navigate('/imports')}
      >
        {t('ventes.importer')}
      </Button>
      <Button variant="contained" startIcon={<AddRounded />} onClick={() => setSaisie(true)}>
        {t('ventes.saisir')}
      </Button>
    </>
  );
  const nbFiltres = Object.values(filtres).filter(Boolean).length;
  const o = options.data;
  const anneeActive = synthese.data?.annee ?? annee ?? o?.aujourdhui_annee;

  return (
    <Stack spacing={2}>
      <EnTetePage titre={titre} sousTitre={perimetre.pays_actif.nom} actions={actions} />
      {onglet === 'synthese' && (
        <Card>
          <Stack spacing={2} sx={{ p: 2 }}>
            <Box
              sx={{
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
                value={anneeActive ?? ''}
                onChange={(e) => {
                  setAnnee(Number(e.target.value));
                  setMoisFin(undefined);
                }}
                sx={{ minWidth: 120 }}
              >
                {(o?.annees ?? (anneeActive ? [anneeActive] : [])).map((a) => (
                  <MenuItem key={a} value={a}>
                    {a}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label={t('ventes.filtres.jusquau')}
                value={synthese.data?.mois_fin ?? ''}
                onChange={(e) => setMoisFin(Number(e.target.value))}
                sx={{ minWidth: 160 }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <MenuItem
                    key={m}
                    value={m}
                    disabled={anneeActive === o?.aujourdhui_annee && m > (o?.aujourdhui_mois ?? 12)}
                  >
                    {nomDuMois(
                      `${anneeActive ?? 2000}-${String(m).padStart(2, '0')}`,
                      i18n.language,
                      true,
                    ).replace(/\s?\d{4}$/, '')}
                  </MenuItem>
                ))}
              </TextField>
              {FILTRES_ID.map((f) => {
                const liste =
                  f === 'delegue'
                    ? (o?.delegues ?? []).map((d) => ({ id: d.id, libelle: d.nom }))
                    : f === 'produit'
                      ? (o?.produits ?? [])
                      : f === 'classe'
                        ? (o?.classes ?? [])
                        : f === 'reseau'
                          ? (o?.reseaux ?? [])
                          : (o?.zones ?? []);
                return (
                  <TextField
                    key={f}
                    select
                    size="small"
                    label={t(`ventes.filtres.${f}`)}
                    value={filtres[f] ?? ''}
                    onChange={(e) => setFiltres({ ...filtres, [f]: e.target.value || undefined })}
                  >
                    <MenuItem value="">{t('ventes.filtres.tous')}</MenuItem>
                    {liste.map((x) => (
                      <MenuItem key={x.id} value={x.id}>
                        {x.libelle}
                      </MenuItem>
                    ))}
                  </TextField>
                );
              })}
              <TextField
                select
                size="small"
                label={t('ventes.filtres.typeClient')}
                value={filtres.type_client ?? ''}
                onChange={(e) =>
                  setFiltres({
                    ...filtres,
                    type_client: (e.target.value || undefined) as TypeClientVente | undefined,
                  })
                }
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="">{t('ventes.filtres.tous')}</MenuItem>
                {TYPES.map((v) => (
                  <MenuItem key={v} value={v}>
                    {t(`ventes.types.${v}`)}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'span 2' } }}>
                <FiltreClient
                  valeur={filtres.client}
                  surChoix={(id) => setFiltres({ ...filtres, client: id })}
                />
              </Box>
              {nbFiltres > 0 && (
                <Button onClick={() => setFiltres({})}>
                  {t('ventes.filtres.reinitialiser', { count: nbFiltres })}
                </Button>
              )}
            </Box>
          </Stack>
        </Card>
      )}
      <Tabs value={onglet} onChange={(_, v: 'synthese' | 'lignes') => setOnglet(v)}>
        <Tab value="synthese" label={t('ventes.onglets.synthese')} />
        <Tab value="lignes" label={t('ventes.onglets.lignes')} />
      </Tabs>
      {onglet === 'synthese' ? (
        <Synthese
          donnees={synthese.data}
          erreur={synthese.isError ? synthese.error : null}
          rechargement={synthese.isFetching}
          reessayer={() => void synthese.refetch()}
          par={par}
          surPar={setPar}
          filtres={filtres}
          surFiltre={(f) => setFiltres({ ...filtres, ...f })}
          nominatif={perimetre.vue_consolidee || perimetre.roles.some((r) => r.endsWith('_siege'))}
          gere={gere}
        />
      ) : (
        <Lignes delegues={o?.delegues ?? []} gere={gere} cle={cle} annee={anneeActive} />
      )}
      <DialogueSaisieVente ouvert={saisie} surFermer={() => setSaisie(false)} />
    </Stack>
  );
}

/** Les chiffres clés : une rangée sur grand écran, deux par deux sur téléphone. */
function ChiffresCles({ telephone, children }: { telephone: boolean; children: ReactNode }) {
  if (!telephone) return <BarreChiffres>{children}</BarreChiffres>;
  return (
    <Card
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        '& > *': { borderLeft: 1, borderTop: 1, borderColor: 'divider', ml: '-1px', mt: '-1px' },
      }}
    >
      {children}
    </Card>
  );
}

/** Le filtre « client » : une recherche, car un pays compte des milliers de clients. */
function FiltreClient({
  valeur,
  surChoix,
}: {
  valeur: string | undefined;
  surChoix: (id: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [choisi, setChoisi] = useState<ClientVente | null>(null);
  // « Réinitialiser » vide le filtre : le champ se vide avec lui.
  const affiche = valeur ? choisi : null;
  return (
    <ChoixClient
      valeur={affiche}
      libelle={t('ventes.filtres.client')}
      requis={false}
      surChoix={(c) => {
        setChoisi(c);
        surChoix(c?.id);
      }}
    />
  );
}

function Synthese({
  donnees,
  erreur,
  rechargement,
  reessayer,
  par,
  surPar,
  filtres,
  surFiltre,
  nominatif,
  gere,
}: {
  donnees: SyntheseVentes | undefined;
  erreur: unknown;
  rechargement: boolean;
  reessayer: () => void;
  par: RegroupementVentes;
  surPar: (p: RegroupementVentes) => void;
  filtres: Filtres;
  surFiltre: (f: Filtres) => void;
  nominatif: boolean;
  gere: boolean;
}) {
  const { t, i18n } = useTranslation();
  const telephone = useMediaQuery(useTheme().breakpoints.down('sm'));
  if (erreur && !donnees) return <ErreurChargement erreur={erreur} reessayer={reessayer} />;
  if (!donnees)
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={72} />
        <Skeleton variant="rounded" height={280} />
      </Stack>
    );
  const d = donnees;
  const langue = i18n.language;
  const m = (v: number | string) => montant(v, langue, d.devise);
  // Sur téléphone, les gros chiffres de la barre s'abrègent (« 2,3 Md F CFA »).
  const mc = (v: number | string) => (telephone ? montantCompact(v, langue, d.devise) : m(v));
  const vide = d.ytd.lignes === 0 && d.ytd.precedent_montant_ttc === '0.00';
  const filtrer = (g: SyntheseVentes['ventilation'][number]) => {
    const id = par === 'type_client' ? g.cle : g.id;
    if (!id) return;
    surFiltre({ [par]: id } as Filtres);
  };
  const periode = nomDuMois(`${d.annee}-${String(d.mois_fin).padStart(2, '0')}`, langue, true);
  return (
    <Stack spacing={2} aria-busy={rechargement}>
      {rechargement && <LinearProgress />}
      {vide ? (
        <Card>
          <EtatVide
            titre={t('ventes.vide.titre')}
            texte={gere ? t('ventes.vide.gerer') : t('ventes.vide.lire')}
          />
        </Card>
      ) : (
        <>
          <ChiffresCles telephone={telephone}>
            <Chiffre
              libelle={t('ventes.chiffres.ytd', { periode })}
              valeur={mc(d.ytd.montant_ttc)}
              detail={`${evolution(d.ytd.evolution, langue)} ${t('ventes.chiffres.vsAnneePrecedente', { annee: d.annee - 1 })}`}
            />
            <Chiffre
              libelle={t('ventes.chiffres.anneePrecedente', { annee: d.annee - 1 })}
              valeur={mc(d.ytd.precedent_montant_ttc)}
            />
            <Chiffre
              libelle={t('ventes.chiffres.quantite')}
              valeur={nombre(d.ytd.quantite, langue)}
              detail={`${nombre(d.ytd.precedent_quantite, langue)} ${d.annee - 1}`}
            />
            <Chiffre libelle={t('ventes.chiffres.lignes')} valeur={nombre(d.ytd.lignes, langue)} />
          </ChiffresCles>
          <Card>
            <EnTeteCarte titre={t('ventes.mensuel.titre', { annee: d.annee })} />
            <Box sx={{ p: 2 }}>
              <GraphiqueVentes
                mensuel={d.mensuel}
                moisFin={d.mois_fin}
                annee={d.annee}
                devise={d.devise}
              />
            </Box>
            <TableContainer>
              <Table
                size="small"
                aria-label={t('ventes.mensuel.detail', { annee: d.annee })}
                sx={SERRE}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>{t('ventes.mensuel.mois')}</TableCell>
                    <TableCell align="right">{t('ventes.colonnes.ca')}</TableCell>
                    <TableCell align="right">{t('ventes.colonnes.quantite')}</TableCell>
                    <TableCell align="right">
                      {t('ventes.colonnes.precedent', { annee: d.annee - 1 })}
                    </TableCell>
                    <TableCell align="right">{t('ventes.colonnes.evolution')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.mensuel.slice(0, d.mois_fin).map((mm) => {
                    const prec = Number(mm.precedent_montant_ttc);
                    return (
                      <TableRow key={mm.mois}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {nomDuMois(mm.mois, langue, true)}
                        </TableCell>
                        <TableCell align="right">{m(mm.montant_ttc)}</TableCell>
                        <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                          {nombre(mm.quantite, langue)}
                        </TableCell>
                        <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                          {m(mm.precedent_montant_ttc)}
                        </TableCell>
                        <TableCell align="right">
                          <Evolution
                            valeur={prec ? ((Number(mm.montant_ttc) - prec) / prec) * 100 : null}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
          <Card>
            <EnTeteCarte
              titre={t('ventes.ventilation.titre')}
              action={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }} aria-hidden>
                    {t('ventes.ventilation.par')}
                  </Typography>
                  <TextField
                    select
                    size="small"
                    hiddenLabel
                    value={par}
                    onChange={(e) => surPar(e.target.value as RegroupementVentes)}
                    slotProps={{
                      select: { SelectDisplayProps: { 'aria-label': t('ventes.ventilation.par') } },
                    }}
                    sx={{ minWidth: 200 }}
                  >
                    {REGROUPEMENTS.map((r) => (
                      <MenuItem key={r} value={r}>
                        {t(`ventes.par.${r}`)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              }
            />
            {(par === 'delegue' || filtres.delegue) && nominatif && (
              <Alert severity="info" sx={{ m: 2, mb: 0 }}>
                {t('ventes.nominatif')}
              </Alert>
            )}
            <TableContainer>
              <Table size="small" aria-label={t('ventes.ventilation.titre')} sx={SERRE}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t(`ventes.par.${par}`)}</TableCell>
                    <TableCell align="right">{t('ventes.colonnes.ca')}</TableCell>
                    <TableCell sx={{ width: 140, display: { xs: 'none', sm: 'table-cell' } }}>
                      {t('ventes.colonnes.part')}
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {t('ventes.colonnes.quantite')}
                    </TableCell>
                    <TableCell align="right">{t('ventes.colonnes.evolution')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.ventilation.map((g) => {
                    const cliquable = par === 'type_client' ? !!g.cle : !!g.id;
                    return (
                      <TableRow key={g.cle || g.libelle} hover>
                        <TableCell>
                          {cliquable ? (
                            <Button
                              size="small"
                              color="inherit"
                              onClick={() => filtrer(g)}
                              title={t('ventes.ventilation.filtrer', { libelle: g.libelle })}
                              sx={{
                                fontWeight: 600,
                                textAlign: 'left',
                                textTransform: 'none',
                                minWidth: 0,
                                px: 0.5,
                              }}
                            >
                              {g.libelle}
                            </Button>
                          ) : (
                            g.libelle
                          )}
                        </TableCell>
                        <TableCell align="right">{m(g.montant_ttc)}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(100, g.part ?? 0)}
                              aria-hidden
                              sx={{ flex: 1, height: 6, borderRadius: 3 }}
                            />
                            <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'right' }}>
                              {g.part === null
                                ? '—'
                                : `${new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(g.part)} %`}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                          {nombre(g.quantite, langue)}
                        </TableCell>
                        <TableCell align="right">
                          <Evolution valeur={g.evolution} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </>
      )}
    </Stack>
  );
}

/** Les lignes mensuelles, une page à la fois ; l'administrateur pays les corrige ou les archive. */
function Lignes({
  delegues,
  gere,
  cle,
  annee,
}: {
  delegues: { id: string; nom: string }[];
  gere: boolean;
  cle: string;
  annee: number | undefined;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [mois, setMois] = useState('');
  const [delegue, setDelegue] = useState('');
  const [page, setPage] = useState(1);
  const [aCorriger, setACorriger] = useState<LigneVente | null>(null);
  const [aArchiver, setAArchiver] = useState<LigneVente | null>(null);
  const lignes = useQuery({
    queryKey: ['ventes', 'lignes', cle, mois, delegue, page],
    queryFn: () => client.ventes.lignes({ mois, delegue, page, taille: 20 }),
    placeholderData: (precedent) => precedent,
  });
  const d = lignes.data;
  return (
    <Card>
      <EnTeteCarte titre={t('ventes.lignes.titre')} />
      <Stack direction="row" spacing={1.5} sx={{ p: 2, flexWrap: 'wrap', rowGap: 1.5 }}>
        <TextField
          type="month"
          size="small"
          label={t('ventes.saisie.mois')}
          value={mois}
          onChange={(e) => {
            setMois(e.target.value);
            setPage(1);
          }}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: annee ? `${annee - 1}-01` : undefined },
          }}
        />
        <TextField
          select
          size="small"
          label={t('ventes.filtres.delegue')}
          value={delegue}
          onChange={(e) => {
            setDelegue(e.target.value);
            setPage(1);
          }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">{t('ventes.filtres.tous')}</MenuItem>
          {delegues.map((x) => (
            <MenuItem key={x.id} value={x.id}>
              {x.nom}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {lignes.isError && !d ? (
        <ErreurChargement erreur={lignes.error} reessayer={() => void lignes.refetch()} />
      ) : !d ? (
        <Skeleton variant="rounded" height={200} sx={{ m: 2 }} />
      ) : d.resultats.length === 0 ? (
        <EtatVide titre={t('ventes.lignes.aucune')} />
      ) : (
        <>
          <TableContainer>
            <Table size="small" aria-label={t('ventes.lignes.titre')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('ventes.saisie.mois')}</TableCell>
                  <TableCell>{t('ventes.filtres.delegue')}</TableCell>
                  <TableCell>{t('ventes.filtres.produit')}</TableCell>
                  <TableCell>{t('ventes.filtres.client')}</TableCell>
                  <TableCell align="right">{t('ventes.colonnes.quantite')}</TableCell>
                  <TableCell align="right">{t('ventes.colonnes.ca')}</TableCell>
                  <TableCell>{t('ventes.lignes.source')}</TableCell>
                  {gere && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {d.resultats.map((l) => (
                  <TableRow key={l.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {nomDuMois(l.mois, i18n.language, true)}
                    </TableCell>
                    <TableCell>{l.delegue.nom}</TableCell>
                    <TableCell>{l.produit.libelle}</TableCell>
                    <TableCell>{l.client.nom}</TableCell>
                    <TableCell align="right">{nombre(l.quantite, i18n.language)}</TableCell>
                    <TableCell align="right">{nombre(l.montant_ttc, i18n.language)}</TableCell>
                    <TableCell>{t(`ventes.sources.${l.source}`)}</TableCell>
                    {gere && (
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Button size="small" onClick={() => setACorriger(l)}>
                          {t('ventes.lignes.corriger')}
                        </Button>
                        <Button size="small" color="inherit" onClick={() => setAArchiver(l)}>
                          {t('ventes.lignes.archiver')}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {d.total > d.taille && (
            <Stack sx={{ alignItems: 'center', p: 1.5 }}>
              <Pagination
                count={Math.ceil(d.total / d.taille)}
                page={page}
                onChange={(_, p) => setPage(p)}
                aria-label={t('ventes.lignes.pagination')}
              />
            </Stack>
          )}
        </>
      )}
      <DialogueCorrectionVente ligne={aCorriger} surFermer={() => setACorriger(null)} />
      <DialogueArchivage ligne={aArchiver} surFermer={() => setAArchiver(null)} />
    </Card>
  );
}

function DialogueArchivage({
  ligne,
  surFermer,
}: {
  ligne: LigneVente | null;
  surFermer: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  return (
    <DialogueFormulaire
      ouvert={ligne !== null}
      titre={t('ventes.lignes.archiver')}
      aide={
        ligne
          ? t('ventes.lignes.archiverAide', {
              delegue: ligne.delegue.nom,
              produit: ligne.produit.libelle,
            })
          : ''
      }
      libelleValider={t('ventes.lignes.archiver')}
      surFermer={surFermer}
      surValider={async () => {
        if (!ligne) return;
        await client.ventes.archiver(ligne.id);
        await requetes.invalidateQueries({ queryKey: ['ventes'] });
      }}
    />
  );
}
