import type { Objectif, Objectifs as DonneesObjectifs } from '@innov/api-client';
import AddRounded from '@mui/icons-material/AddRounded';
import {
  Box,
  Button,
  Card,
  Divider,
  FormControlLabel,
  LinearProgress,
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
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import { EnTetePage, Etiquette, EtatVide } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useSession } from '../contexteSession';

/**
 * Objectifs par réseau (DSH-009, 0.7.6) : chaque objectif dit sa période, son réseau, son
 * indicateur et sa cible (CA1), et son avancement : le réalisé contre l'attendu à ce jour, au
 * prorata du temps écoulé, « en avance » ou « en retard » (CA2). Le DM du réseau et
 * l'administrateur pays les fixent ; l'encadrement les lit.
 */
export default function Objectifs() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [tous, setTous] = useState(false);
  const [edition, setEdition] = useState<Objectif | 'nouveau' | null>(null);
  const [aArchiver, setAArchiver] = useState<Objectif | null>(null);
  // Sur téléphone, une carte par objectif : le tableau déborderait et cacherait l'état.
  const telephone = useMediaQuery(useTheme().breakpoints.down('sm'));
  const donnees = useQuery({
    queryKey: ['objectifs', tous],
    queryFn: () => client.pilotage.objectifs(tous),
  });
  const titre = t('navigation.objectifs');
  if (donnees.isError)
    return (
      <Stack spacing={2.5}>
        <EnTetePage titre={titre} />
        <ErreurChargement erreur={donnees.error} reessayer={() => void donnees.refetch()} />
      </Stack>
    );
  if (!donnees.data)
    return (
      <Stack spacing={2.5}>
        <EnTetePage titre={titre} />
        <Skeleton variant="rounded" height={240} />
      </Stack>
    );
  const d = donnees.data;
  const jour = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const date = (iso: string) => jour.format(new Date(`${iso}T12:00:00`));
  const rafraichir = () => requetes.invalidateQueries({ queryKey: ['objectifs'] });
  return (
    <Stack spacing={2.5}>
      <EnTetePage
        titre={titre}
        sousTitre={t('objectifs.sousTitre')}
        actions={
          d.reseaux_geres.length > 0 && (
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              onClick={() => setEdition('nouveau')}
            >
              {t('objectifs.nouveau')}
            </Button>
          )
        }
      />
      <FormControlLabel
        control={<Switch checked={tous} onChange={(e) => setTous(e.target.checked)} />}
        label={t('objectifs.tous')}
      />
      {d.objectifs.length === 0 ? (
        <Card>
          <EtatVide
            titre={t('objectifs.aucun')}
            texte={d.reseaux_geres.length ? t('objectifs.aucunGerer') : t('objectifs.aucunLire')}
          />
        </Card>
      ) : telephone ? (
        <Card>
          {d.objectifs.map((o, i) => (
            <Fragment key={o.id}>
              {i > 0 && <Divider />}
              <Stack spacing={1} sx={{ p: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Libelle objectif={o} />
                  </Box>
                  <Etiquette ton={TON_ETAT[o.suivi.etat]}>
                    {t(`objectifs.etats.${o.suivi.etat}`)}
                  </Etiquette>
                </Stack>
                <Typography variant="body2">
                  {t('objectifs.periode', { debut: date(o.debut), fin: date(o.fin) })}
                </Typography>
                <Avancement objectif={o} />
                <Actions
                  objectif={o}
                  modifier={() => setEdition(o)}
                  archiver={() => setAArchiver(o)}
                />
              </Stack>
            </Fragment>
          ))}
        </Card>
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={titre}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('objectifs.colonnes.objectif')}</TableCell>
                  <TableCell>{t('objectifs.colonnes.periode')}</TableCell>
                  <TableCell sx={{ minWidth: 220 }}>{t('objectifs.colonnes.avancement')}</TableCell>
                  <TableCell>{t('objectifs.colonnes.etat')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {d.objectifs.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Libelle objectif={o} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {t('objectifs.periode', { debut: date(o.debut), fin: date(o.fin) })}
                    </TableCell>
                    <TableCell>
                      <Avancement objectif={o} />
                    </TableCell>
                    <TableCell>
                      <Etiquette ton={TON_ETAT[o.suivi.etat]}>
                        {t(`objectifs.etats.${o.suivi.etat}`)}
                      </Etiquette>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Actions
                        objectif={o}
                        modifier={() => setEdition(o)}
                        archiver={() => setAArchiver(o)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('objectifs.note')}
      </Typography>
      {edition && (
        <DialogueObjectif
          donnees={d}
          objectif={edition === 'nouveau' ? null : edition}
          fermer={() => setEdition(null)}
          enregistre={rafraichir}
        />
      )}
      {aArchiver && (
        <DialogueFormulaire
          ouvert
          titre={t('objectifs.archiverTitre')}
          aide={t('objectifs.archiverAide')}
          libelleValider={t('objectifs.archiver')}
          surFermer={() => setAArchiver(null)}
          surValider={async () => {
            await client.pilotage.archiverObjectif(aArchiver.id);
            await rafraichir();
          }}
        />
      )}
    </Stack>
  );
}

const TON_ETAT = {
  atteint: 'success',
  en_avance: 'success',
  en_retard: 'warning',
  non_atteint: 'error',
  a_venir: 'neutre',
} as const;

function Libelle({ objectif: o }: { objectif: Objectif }) {
  const { t } = useTranslation();
  return (
    <>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {o.reseau.libelle}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {t(`objectifs.indicateurs.${o.indicateur}`, {
          cible: o.cible,
          produit: o.produit?.libelle ?? '',
        })}
      </Typography>
    </>
  );
}

function Avancement({ objectif: o }: { objectif: Objectif }) {
  const { t } = useTranslation();
  const unite = o.indicateur === 'couverture_ab' ? ' %' : '';
  const part = (n: number) => Math.min(100, (n / o.cible) * 100);
  return (
    <Box>
      <Box sx={{ position: 'relative', mb: 0.5 }}>
        <LinearProgress
          variant="determinate"
          value={part(o.suivi.realise)}
          color={
            o.suivi.etat === 'en_retard' || o.suivi.etat === 'non_atteint' ? 'warning' : 'primary'
          }
          sx={{ height: 8, borderRadius: 1 }}
          aria-label={t('objectifs.realiseSur', {
            realise: o.suivi.realise,
            cible: o.cible,
            unite,
          })}
        />
        {/* L'attendu à ce jour : un repère sur la barre. */}
        {o.suivi.etat !== 'a_venir' && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: -3,
              bottom: -3,
              left: `${part(o.suivi.attendu)}%`,
              width: 2,
              bgcolor: 'text.primary',
            }}
          />
        )}
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {t('objectifs.realiseSur', { realise: o.suivi.realise, cible: o.cible, unite })}
        {o.suivi.etat !== 'a_venir' &&
          ` · ${t('objectifs.attendu', { attendu: o.suivi.attendu, unite })}`}
      </Typography>
    </Box>
  );
}

function Actions({
  objectif,
  modifier,
  archiver,
}: {
  objectif: Objectif;
  modifier: () => void;
  archiver: () => void;
}) {
  const { t } = useTranslation();
  if (!objectif.gerable) return null;
  return (
    <Box>
      <Button size="small" onClick={modifier}>
        {t('objectifs.modifier')}
      </Button>
      <Button size="small" color="inherit" onClick={archiver}>
        {t('objectifs.archiver')}
      </Button>
    </Box>
  );
}

function DialogueObjectif({
  donnees,
  objectif,
  fermer,
  enregistre,
}: {
  donnees: DonneesObjectifs;
  objectif: Objectif | null;
  fermer: () => void;
  enregistre: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [reseau, setReseau] = useState(objectif?.reseau.id ?? donnees.reseaux_geres[0]?.id ?? '');
  const [indicateur, setIndicateur] = useState<string>(objectif?.indicateur ?? 'visites');
  const [produit, setProduit] = useState(objectif?.produit?.id ?? '');
  const [debut, setDebut] = useState(objectif?.debut ?? donnees.aujourdhui);
  const [fin, setFin] = useState(objectif?.fin ?? '');
  const [cible, setCible] = useState(objectif ? String(objectif.cible) : '');
  const produits = donnees.portefeuilles.find((p) => p.reseau === reseau)?.produits ?? [];
  const invalide =
    !reseau ||
    !debut ||
    !fin ||
    !(Number(cible) >= 1) ||
    (indicateur === 'presentations' && !produit);
  return (
    <DialogueFormulaire
      ouvert
      titre={objectif ? t('objectifs.modifierTitre') : t('objectifs.nouveau')}
      aide={t('objectifs.aide')}
      surFermer={fermer}
      invalide={invalide}
      surValider={async () => {
        if (objectif)
          await client.pilotage.modifierObjectif(objectif.id, { debut, fin, cible: Number(cible) });
        else
          await client.pilotage.creerObjectif({
            reseau,
            indicateur: indicateur as 'visites',
            produit: indicateur === 'presentations' ? produit : null,
            debut,
            fin,
            cible: Number(cible),
          });
        await enregistre();
      }}
    >
      <TextField
        select
        label={t('objectifs.champs.reseau')}
        value={reseau}
        disabled={!!objectif}
        onChange={(e) => setReseau(e.target.value)}
      >
        {donnees.reseaux_geres.map((r) => (
          <MenuItem key={r.id} value={r.id}>
            {r.libelle}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label={t('objectifs.champs.indicateur')}
        value={indicateur}
        disabled={!!objectif}
        onChange={(e) => setIndicateur(e.target.value)}
      >
        {(['visites', 'couverture_ab', 'presentations'] as const).map((i) => (
          <MenuItem key={i} value={i}>
            {t(`objectifs.choix.${i}`)}
          </MenuItem>
        ))}
      </TextField>
      {indicateur === 'presentations' && (
        <TextField
          select
          label={t('objectifs.champs.produit')}
          value={produit}
          disabled={!!objectif}
          onChange={(e) => setProduit(e.target.value)}
          helperText={produits.length ? undefined : t('objectifs.sansPortefeuille')}
        >
          {produits.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.libelle}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Stack direction="row" spacing={1.5}>
        <TextField
          type="date"
          label={t('objectifs.champs.debut')}
          value={debut}
          onChange={(e) => setDebut(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
        <TextField
          type="date"
          label={t('objectifs.champs.fin')}
          value={fin}
          onChange={(e) => setFin(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
      </Stack>
      <TextField
        type="number"
        label={t(
          indicateur === 'couverture_ab'
            ? 'objectifs.champs.ciblePourcent'
            : 'objectifs.champs.cible',
        )}
        value={cible}
        onChange={(e) => setCible(e.target.value)}
        slotProps={{ htmlInput: { min: 1, max: indicateur === 'couverture_ab' ? 100 : undefined } }}
      />
    </DialogueFormulaire>
  );
}
