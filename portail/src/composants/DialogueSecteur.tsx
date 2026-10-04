import type { Secteur, Zone } from '@innov/api-client';
import AddRounded from '@mui/icons-material/AddRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

/**
 * Fiche d'un secteur (ORG-003) : sa zone, qu'on peut changer (secteurs repris d'un import
 * dans « À répartir »), et ses localités, choisies ensuite sur les fiches prospects et
 * établissements.
 */
export default function DialogueSecteur({
  secteur,
  zones,
  gerer,
  surFermer,
}: {
  secteur: Secteur;
  zones: Zone[];
  gerer: boolean;
  surFermer: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const [zone, setZone] = useState(secteur.zone);
  const [libelle, setLibelle] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const localites = useQuery({
    queryKey: ['organisation', 'localites', secteur.id],
    queryFn: () => client.organisation.localites(secteur.id),
  });
  const actives = (localites.data ?? []).filter((l) => !l.archive);

  async function executer(action: () => Promise<unknown>, message: string) {
    setErreur(null);
    try {
      await action();
      notifier(message);
      void requetes.invalidateQueries({ queryKey: ['organisation'] });
      void requetes.invalidateQueries({ queryKey: ['etablissements'] });
      return true;
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
      return false;
    }
  }

  async function ajouter(evenement: FormEvent) {
    evenement.preventDefault();
    if (!libelle.trim()) return;
    if (
      await executer(
        () => client.organisation.creerLocalite(secteur.id, libelle.trim()),
        t('commun.enregistre'),
      )
    )
      setLibelle('');
  }

  return (
    <Dialog open onClose={surFermer} maxWidth="sm" fullWidth>
      <DialogTitle>
        {secteur.libelle}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {secteur.zone_libelle}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          {erreur && <Alert severity="error">{erreur}</Alert>}
          {gerer && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                select
                size="small"
                label={t('organisation.champs.zone')}
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                fullWidth
              >
                {zones
                  .filter((z) => !z.archive || z.id === secteur.zone)
                  .map((z) => (
                    <MenuItem key={z.id} value={z.id}>
                      {z.libelle}
                    </MenuItem>
                  ))}
              </TextField>
              <Button
                variant="outlined"
                disabled={zone === secteur.zone}
                onClick={() =>
                  void executer(
                    () => client.organisation.modifierSecteur(secteur.id, { zone }),
                    t('organisation.secteur.deplace'),
                  )
                }
              >
                {t('organisation.secteur.deplacer')}
              </Button>
            </Stack>
          )}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('organisation.secteur.localites', { count: actives.length })}
            </Typography>
            {localites.isLoading ? (
              <Skeleton variant="rounded" height={40} />
            ) : actives.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('organisation.secteur.aucuneLocalite')}
              </Typography>
            ) : (
              <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
                {actives.map((l) => (
                  <Chip
                    key={l.id}
                    icon={<PlaceRounded />}
                    label={l.libelle}
                    onDelete={
                      gerer
                        ? () =>
                            void executer(
                              () => client.organisation.archiver('localites', l.id),
                              t('organisation.secteur.localiteArchivee'),
                            )
                        : undefined
                    }
                  />
                ))}
              </Stack>
            )}
          </Box>
          {gerer && (
            <Stack component="form" direction="row" spacing={1} onSubmit={ajouter}>
              <TextField
                size="small"
                label={t('organisation.secteur.nouvelleLocalite')}
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                fullWidth
              />
              <Button type="submit" startIcon={<AddRounded />} disabled={!libelle.trim()}>
                {t('organisation.secteur.ajouter')}
              </Button>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={surFermer}>{t('commun.fermer')}</Button>
      </DialogActions>
    </Dialog>
  );
}
