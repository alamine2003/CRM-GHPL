import type { ObjectifVente, ObjectifsVentes } from '@innov/api-client';
import AddRounded from '@mui/icons-material/AddRounded';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded';
import {
  Button,
  Card,
  FormControlLabel,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
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
import { Chiffre, ChiffresCles, EnTeteCarte, Etiquette, EtatVide } from './Elements';
import { ErreurChargement } from './Erreurs';
import { montant, montantCompact, nomDuMois } from './formatsVentes';
import GraphiqueObjectif from './GraphiqueObjectif';

/** Cellules plus serrées sur téléphone : rien ne doit déborder du cadre. */
const SERRE = { '& .MuiTableCell-root': { px: { xs: 1, sm: 2 } } };
const TON_ETAT = {
  atteint: 'success',
  en_avance: 'success',
  en_retard: 'warning',
  non_atteint: 'error',
  a_venir: 'neutre',
} as const;

/** « 12,3 % » ; vide, « — ». */
function pourcent(valeur: number | null, langue: string): string {
  if (valeur === null) return '—';
  return `${new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(valeur)} %`;
}

/**
 * Onglet « Objectifs » : la cible de l'année de chaque réseau (et de ses produits) face au cumul
 * de l'année (YTD) et à l'attendu à la fin du mois choisi. L'administrateur pays les fixe.
 */
export default function ObjectifsVentesOnglet({
  annee,
  moisFin,
  cle,
  gere,
  exporte = false,
}: {
  annee: number | undefined;
  moisFin: number | undefined;
  cle: string;
  gere: boolean;
  exporte?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const telephone = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [aFixer, setAFixer] = useState<ObjectifVente | 'nouveau' | null>(null);
  const [aArchiver, setAArchiver] = useState<ObjectifVente | null>(null);
  const objectifs = useQuery({
    queryKey: ['ventes', 'objectifs', cle, annee, moisFin],
    queryFn: () => client.ventes.objectifs({ annee, mois_fin: moisFin }),
    placeholderData: (precedent) => precedent,
  });
  const d = objectifs.data;
  if (objectifs.isError && !d)
    return <ErreurChargement erreur={objectifs.error} reessayer={() => void objectifs.refetch()} />;
  if (!d) return <Skeleton variant="rounded" height={220} />;
  const portee = (o: ObjectifVente) =>
    o.produit?.libelle ??
    (o.delegue
      ? t('ventes.objectifs.duDelegue', { nom: o.delegue.nom })
      : t('ventes.objectifs.toutLeReseau'));
  const m = (v: string) =>
    telephone ? montantCompact(v, i18n.language, d.devise) : montant(v, i18n.language, d.devise);
  const bouton = (gere || (exporte && d.objectifs.length > 0)) && (
    <Stack direction="row" spacing={1}>
      {exporte && d.objectifs.length > 0 && (
        <ExportObjectifs annee={d.annee} moisFin={d.mois_fin} compact={telephone} />
      )}
      {gere &&
        (telephone ? (
          <IconButton
            size="small"
            color="primary"
            aria-label={t('ventes.objectifs.fixer')}
            onClick={() => setAFixer('nouveau')}
          >
            <AddRounded fontSize="small" />
          </IconButton>
        ) : (
          <Button
            size="small"
            startIcon={<AddRounded />}
            sx={{ whiteSpace: 'nowrap' }}
            onClick={() => setAFixer('nouveau')}
          >
            {t('ventes.objectifs.fixer')}
          </Button>
        ))}
    </Stack>
  );
  return (
    <Stack spacing={2}>
      {d.total && (
        <ChiffresCles telephone={telephone}>
          <Chiffre libelle={t('ventes.objectifs.cibleAnnee')} valeur={m(d.total.cible)} />
          <Chiffre
            libelle={t('ventes.objectifs.attendu', {
              mois: nomDuMois(`${d.annee}-${String(d.mois_fin).padStart(2, '0')}`, i18n.language),
            })}
            valeur={m(d.total.attendu)}
          />
          <Chiffre libelle={t('ventes.objectifs.realise')} valeur={m(d.total.realise)} />
          <Chiffre
            libelle={t('ventes.objectifs.tauxAttendu')}
            valeur={pourcent(d.total.taux_attendu, i18n.language)}
            ton={(d.total.taux_attendu ?? 0) >= 100 ? 'success' : 'warning'}
          />
        </ChiffresCles>
      )}
      <Card>
        <EnTeteCarte titre={t('ventes.objectifs.titre', { annee: d.annee })} action={bouton} />
        {d.objectifs.length === 0 ? (
          <EtatVide
            titre={t('ventes.objectifs.aucun', { annee: d.annee })}
            texte={gere ? t('ventes.objectifs.aucunAide') : undefined}
          />
        ) : (
          <TableContainer>
            <Table
              size="small"
              aria-label={t('ventes.objectifs.titre', { annee: d.annee })}
              sx={SERRE}
            >
              <TableHead>
                <TableRow>
                  <TableCell>{t('ventes.filtres.reseau')}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {t('ventes.objectifs.portee')}
                  </TableCell>
                  <TableCell align="right">{t('ventes.objectifs.cible')}</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {t('ventes.objectifs.attenduCourt')}
                  </TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {t('ventes.objectifs.realise')}
                  </TableCell>
                  <TableCell align="right">{t('ventes.objectifs.tauxCible')}</TableCell>
                  <TableCell>{t('ventes.objectifs.etat')}</TableCell>
                  {gere && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {d.objectifs.map((o) => (
                  <TableRow key={o.id} hover>
                    <TableCell>
                      {o.reseau.libelle}
                      <Typography
                        variant="caption"
                        component="span"
                        sx={{ display: { xs: 'block', sm: 'none' }, color: 'text.secondary' }}
                      >
                        {portee(o)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {portee(o)}
                    </TableCell>
                    <TableCell align="right">
                      {m(o.cible)}
                      {o.cible_deleguee !== null && (
                        <Typography
                          variant="caption"
                          component="span"
                          sx={{
                            display: 'block',
                            color: 'text.secondary',
                            maxWidth: 200,
                            ml: 'auto',
                          }}
                        >
                          {t('ventes.objectifs.dontDelegues', { montant: m(o.cible_deleguee) })}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {m(o.attendu)}
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {m(o.realise)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {pourcent(o.taux_cible, i18n.language)}
                    </TableCell>
                    <TableCell>
                      <Etiquette ton={TON_ETAT[o.etat]}>
                        {t(`ventes.objectifs.etats.${o.etat}`)}
                      </Etiquette>
                    </TableCell>
                    {gere && !o.modifiable && <TableCell />}
                    {gere && o.modifiable && (
                      <TableCell align="right">
                        {telephone ? (
                          // Sur téléphone, deux icônes : le tableau tient dans l'écran.
                          <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                            <IconButton
                              size="small"
                              aria-label={t('ventes.objectifs.corriger')}
                              onClick={() => setAFixer(o)}
                            >
                              <EditOutlined fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              aria-label={t('ventes.objectifs.archiver')}
                              onClick={() => setAArchiver(o)}
                            >
                              <ArchiveOutlined fontSize="small" />
                            </IconButton>
                          </Stack>
                        ) : (
                          <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                            <Button size="small" onClick={() => setAFixer(o)}>
                              {t('ventes.objectifs.corriger')}
                            </Button>
                            <Button size="small" color="inherit" onClick={() => setAArchiver(o)}>
                              {t('ventes.objectifs.archiver')}
                            </Button>
                          </Stack>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
      {d.objectifs.length > 0 && (
        <CourbeObjectifs donnees={d} portee={portee} telephone={telephone} />
      )}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {t('ventes.objectifs.note')}
      </Typography>
      <DialogueObjectif donnees={d} objectif={aFixer} surFermer={() => setAFixer(null)} />
      <DialogueArchivageObjectif objectif={aArchiver} surFermer={() => setAArchiver(null)} />
    </Stack>
  );
}

/** Somme de douze montants saisis (les cases vides comptent zéro). */
function somme(mois: string[]): number {
  return mois.reduce((s, v) => s + (Number(v.replace(',', '.').replace(/\s/g, '')) || 0), 0);
}

const MOIS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

/** Le formulaire se réinitialise à chaque ouverture : la clé suit l'objectif ouvert. */
function DialogueObjectif({
  donnees,
  objectif,
  surFermer,
}: {
  donnees: ObjectifsVentes;
  objectif: ObjectifVente | 'nouveau' | null;
  surFermer: () => void;
}) {
  const existant = objectif && objectif !== 'nouveau' ? objectif : null;
  return (
    <FormulaireObjectif
      key={existant?.id ?? (objectif ? 'nouveau' : 'ferme')}
      donnees={donnees}
      existant={existant}
      ouvert={objectif !== null}
      surFermer={surFermer}
    />
  );
}

function FormulaireObjectif({
  donnees,
  existant,
  ouvert,
  surFermer,
}: {
  donnees: ObjectifsVentes;
  existant: ObjectifVente | null;
  ouvert: boolean;
  surFermer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [reseau, setReseau] = useState('');
  const [portee, setPortee] = useState<'reseau' | 'produit' | 'delegue'>('reseau');
  const [produit, setProduit] = useState('');
  const [delegue, setDelegue] = useState('');
  const [annee, setAnnee] = useState(String(donnees.annee));
  const [cible, setCible] = useState(existant ? String(Number(existant.cible)) : '');
  const [parMois, setParMois] = useState(existant?.repartition_libre ?? false);
  const [mois, setMois] = useState<string[]>(
    existant ? existant.mois.map((v) => String(Number(v))) : MOIS.map(() => ''),
  );
  const choisi = donnees.reseaux_gerables.find((r) => r.id === reseau);
  const produits = choisi?.produits ?? [];
  const delegues = choisi?.delegues ?? [];
  const total = somme(mois);
  const montantOk = parMois ? total > 0 : Number(cible) > 0;
  const porteeOk = portee === 'reseau' || (portee === 'produit' ? !!produit : !!delegue);
  const complet = existant ? montantOk : reseau && annee && porteeOk && montantOk;

  function activerParMois(actif: boolean) {
    // Au premier passage, on répartit la cible déjà saisie à parts égales, à ajuster ensuite.
    if (actif && total === 0 && Number(cible) > 0)
      setMois(MOIS.map(() => String(Math.round((Number(cible) / 12) * 100) / 100)));
    setParMois(actif);
  }

  async function valider() {
    const corps = parMois ? { mois } : { cible };
    if (existant) await client.ventes.corrigerObjectif(existant.id, corps);
    else
      await client.ventes.fixerObjectif({
        reseau,
        produit: portee === 'produit' ? produit : null,
        delegue: portee === 'delegue' ? delegue : null,
        annee: Number(annee),
        ...corps,
      });
    await requetes.invalidateQueries({ queryKey: ['ventes', 'objectifs'] });
  }

  return (
    <DialogueFormulaire
      ouvert={ouvert}
      titre={existant ? t('ventes.objectifs.corriger') : t('ventes.objectifs.fixer')}
      aide={t('ventes.objectifs.formAide', { devise: donnees.devise })}
      libelleValider={t('ventes.objectifs.enregistrer')}
      surFermer={surFermer}
      surValider={valider}
      invalide={!complet}
    >
      {existant ? (
        <Typography sx={{ fontWeight: 600 }}>
          {existant.reseau.libelle} ·{' '}
          {existant.produit?.libelle ??
            (existant.delegue
              ? t('ventes.objectifs.duDelegue', { nom: existant.delegue.nom })
              : t('ventes.objectifs.toutLeReseau'))}{' '}
          · {existant.annee}
        </Typography>
      ) : (
        <>
          <TextField
            select
            required
            label={t('ventes.filtres.reseau')}
            value={reseau}
            onChange={(e) => {
              setReseau(e.target.value);
              setPortee('reseau');
              setProduit('');
              setDelegue('');
            }}
          >
            {donnees.reseaux_gerables.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.libelle}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t('ventes.objectifs.portee')}
            value={portee}
            disabled={!reseau}
            onChange={(e) => {
              setPortee(e.target.value as 'reseau' | 'produit' | 'delegue');
              setProduit('');
              setDelegue('');
            }}
          >
            <MenuItem value="reseau">{t('ventes.objectifs.toutLeReseau')}</MenuItem>
            <MenuItem value="produit" disabled={produits.length === 0}>
              {t('ventes.objectifs.unProduit')}
            </MenuItem>
            <MenuItem value="delegue" disabled={delegues.length === 0}>
              {t('ventes.objectifs.unDelegue')}
            </MenuItem>
          </TextField>
          {portee === 'produit' && (
            <TextField
              select
              required
              label={t('ventes.filtres.produit')}
              value={produit}
              onChange={(e) => setProduit(e.target.value)}
            >
              {produits.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.libelle}
                </MenuItem>
              ))}
            </TextField>
          )}
          {portee === 'delegue' && (
            <TextField
              select
              required
              label={t('ventes.filtres.delegue')}
              value={delegue}
              onChange={(e) => setDelegue(e.target.value)}
            >
              {delegues.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.nom}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            required
            type="number"
            label={t('ventes.objectifs.annee')}
            value={annee}
            onChange={(e) => setAnnee(e.target.value)}
            slotProps={{ htmlInput: { min: 2000, max: 2100 } }}
          />
        </>
      )}
      {!parMois && (
        <TextField
          required
          type="number"
          label={t('ventes.objectifs.cibleAnneeDevise', { devise: donnees.devise })}
          value={cible}
          onChange={(e) => setCible(e.target.value)}
          slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
          helperText={t('ventes.objectifs.partsEgales')}
        />
      )}
      <FormControlLabel
        control={<Switch checked={parMois} onChange={(e) => activerParMois(e.target.checked)} />}
        label={t('ventes.objectifs.parMois')}
      />
      {parMois && (
        <Stack spacing={1.5}>
          <Stack
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
              gap: 1.5,
            }}
          >
            {MOIS.map((mm, i) => (
              <TextField
                key={mm}
                size="small"
                type="number"
                label={nomDuMois(`${donnees.annee}-${mm}`, i18n.language)}
                value={mois[i]}
                onChange={(e) => setMois(mois.map((v, j) => (j === i ? e.target.value : v)))}
                slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
              />
            ))}
          </Stack>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('ventes.objectifs.sommeMois', {
              somme: montant(total, i18n.language, donnees.devise),
            })}
          </Typography>
        </Stack>
      )}
    </DialogueFormulaire>
  );
}

function DialogueArchivageObjectif({
  objectif,
  surFermer,
}: {
  objectif: ObjectifVente | null;
  surFermer: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  return (
    <DialogueFormulaire
      ouvert={objectif !== null}
      titre={t('ventes.objectifs.archiver')}
      aide={
        objectif
          ? t('ventes.objectifs.archiverAide', {
              reseau: objectif.reseau.libelle,
              produit:
                objectif.produit?.libelle ??
                (objectif.delegue
                  ? t('ventes.objectifs.duDelegue', { nom: objectif.delegue.nom })
                  : t('ventes.objectifs.toutLeReseau')),
              annee: objectif.annee,
            })
          : ''
      }
      libelleValider={t('ventes.objectifs.archiver')}
      surFermer={surFermer}
      surValider={async () => {
        if (!objectif) return;
        await client.ventes.archiverObjectif(objectif.id);
        await requetes.invalidateQueries({ queryKey: ['ventes', 'objectifs'] });
      }}
    />
  );
}

/** La courbe cible / réalisé d'un objectif choisi, ou du total des réseaux (par défaut). */
function CourbeObjectifs({
  donnees,
  portee,
  telephone,
}: {
  donnees: ObjectifsVentes;
  portee: (o: ObjectifVente) => string;
  telephone: boolean;
}) {
  const { t } = useTranslation();
  const [choix, setChoix] = useState('total');
  const reseaux = donnees.objectifs.filter((o) => !o.produit && !o.delegue);
  const options = [
    ...(reseaux.length ? [{ id: 'total', libelle: t('ventes.objectifs.totalReseaux') }] : []),
    ...donnees.objectifs.map((o) => ({ id: o.id, libelle: `${o.reseau.libelle} · ${portee(o)}` })),
  ];
  const valeur = options.some((o) => o.id === choix) ? choix : (options[0]?.id ?? '');
  const choisi = donnees.objectifs.find((o) => o.id === valeur);
  const additionner = (cle: 'mois' | 'realise_mois') =>
    Array.from({ length: 12 }, (_, i) => reseaux.reduce((s, o) => s + Number(o[cle][i]), 0));
  const serie = choisi
    ? {
        libelle: `${choisi.reseau.libelle} · ${portee(choisi)}`,
        cible: choisi.mois.map(Number),
        realise: choisi.realise_mois.map(Number),
      }
    : {
        libelle: t('ventes.objectifs.totalReseaux'),
        cible: additionner('mois'),
        realise: additionner('realise_mois'),
      };
  return (
    <Card>
      <EnTeteCarte
        titre={t('ventes.objectifs.courbe')}
        action={
          <TextField
            select
            size="small"
            label={t('ventes.objectifs.courbeDe')}
            value={valeur}
            onChange={(e) => setChoix(e.target.value)}
            sx={{ minWidth: telephone ? 160 : 260, maxWidth: telephone ? 200 : 360 }}
          >
            {options.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {o.libelle}
              </MenuItem>
            ))}
          </TextField>
        }
      />
      <GraphiqueObjectif
        libelle={serie.libelle}
        cible={serie.cible}
        realise={serie.realise}
        moisFin={donnees.mois_fin}
        annee={donnees.annee}
        devise={donnees.devise}
      />
    </Card>
  );
}

/** 1.8.0 : exporter le tableau des objectifs (CSV ou Excel) ; le serveur l'inscrit à l'audit. */
function ExportObjectifs({
  annee,
  moisFin,
  compact = false,
}: {
  annee: number;
  moisFin: number;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function exporter(fichier: 'xlsx' | 'csv') {
    setAncre(null);
    setEnvoi(true);
    try {
      const blob = await client.ventes.exporterObjectifs({ annee, mois_fin: moisFin, fichier });
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = `objectifs-ventes-${annee}-${String(moisFin).padStart(2, '0')}.${fichier}`;
      lien.click();
      URL.revokeObjectURL(lien.href);
      notifier(t('ventes.export.fait'));
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      {compact ? (
        <IconButton
          size="small"
          disabled={envoi}
          aria-haspopup="menu"
          aria-label={t('ventes.export.bouton')}
          onClick={(e) => setAncre(e.currentTarget)}
        >
          <FileDownloadRounded fontSize="small" />
        </IconButton>
      ) : (
        <Button
          size="small"
          startIcon={<FileDownloadRounded />}
          disabled={envoi}
          aria-haspopup="menu"
          sx={{ whiteSpace: 'nowrap' }}
          onClick={(e) => setAncre(e.currentTarget)}
        >
          {envoi ? t('ventes.export.enCours') : t('ventes.export.bouton')}
        </Button>
      )}
      <Menu anchorEl={ancre} open={!!ancre} onClose={() => setAncre(null)}>
        {(['xlsx', 'csv'] as const).map((fichier) => (
          <MenuItem key={fichier} onClick={() => void exporter(fichier)}>
            <ListItemText
              primary={t('ventes.objectifs.exporter')}
              secondary={t(`ventes.export.${fichier}`)}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
