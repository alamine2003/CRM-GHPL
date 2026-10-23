import type { ObjectifVente, ObjectifsVentes } from '@innov/api-client';
import AddRounded from '@mui/icons-material/AddRounded';
import {
  Button,
  Card,
  FormControlLabel,
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
import { useSession } from '../contexteSession';
import DialogueFormulaire from './Dialogue';
import { Chiffre, ChiffresCles, EnTeteCarte, Etiquette, EtatVide } from './Elements';
import { ErreurChargement } from './Erreurs';
import { montant, montantCompact, nomDuMois } from './formatsVentes';

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
}: {
  annee: number | undefined;
  moisFin: number | undefined;
  cle: string;
  gere: boolean;
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
  const m = (v: string) =>
    telephone ? montantCompact(v, i18n.language, d.devise) : montant(v, i18n.language, d.devise);
  const bouton = gere && (
    <Button
      size="small"
      startIcon={<AddRounded />}
      sx={{ whiteSpace: 'nowrap' }}
      onClick={() => setAFixer('nouveau')}
    >
      {t('ventes.objectifs.fixer')}
    </Button>
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
                    {t('ventes.filtres.produit')}
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
                        {o.produit?.libelle ?? t('ventes.objectifs.toutLeReseau')}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {o.produit?.libelle ?? t('ventes.objectifs.toutLeReseau')}
                    </TableCell>
                    <TableCell align="right">{m(o.cible)}</TableCell>
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
                    {gere && (
                      <TableCell align="right">
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          sx={{ alignItems: 'flex-end' }}
                        >
                          <Button size="small" onClick={() => setAFixer(o)}>
                            {t('ventes.objectifs.corriger')}
                          </Button>
                          <Button size="small" color="inherit" onClick={() => setAArchiver(o)}>
                            {t('ventes.objectifs.archiver')}
                          </Button>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
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
  const [produit, setProduit] = useState('');
  const [annee, setAnnee] = useState(String(donnees.annee));
  const [cible, setCible] = useState(existant ? String(Number(existant.cible)) : '');
  const [parMois, setParMois] = useState(existant?.repartition_libre ?? false);
  const [mois, setMois] = useState<string[]>(
    existant ? existant.mois.map((v) => String(Number(v))) : MOIS.map(() => ''),
  );
  const produits = donnees.reseaux_gerables.find((r) => r.id === reseau)?.produits ?? [];
  const total = somme(mois);
  const complet = existant
    ? parMois
      ? total > 0
      : Number(cible) > 0
    : reseau && annee && (parMois ? total > 0 : Number(cible) > 0);

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
        produit: produit || null,
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
          {existant.produit?.libelle ?? t('ventes.objectifs.toutLeReseau')} · {existant.annee}
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
              setProduit('');
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
            label={t('ventes.filtres.produit')}
            value={produit}
            disabled={!reseau}
            onChange={(e) => setProduit(e.target.value)}
          >
            <MenuItem value="">{t('ventes.objectifs.toutLeReseau')}</MenuItem>
            {produits.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.libelle}
              </MenuItem>
            ))}
          </TextField>
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
              produit: objectif.produit?.libelle ?? t('ventes.objectifs.toutLeReseau'),
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
