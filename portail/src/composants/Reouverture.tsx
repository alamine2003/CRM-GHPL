import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

/**
 * Le superviseur rouvre la rédaction d'un planning fermé le lundi 0 h (décision du 6 octobre
 * 2026), après confirmation : le délégué en est prévenu et la réouverture reste inscrite.
 */
export function BoutonRouvrir({
  delegue,
  semaine,
  variante = 'contained',
}: {
  delegue: { id: string; prenom: string; nom: string };
  semaine: string;
  variante?: 'contained' | 'outlined';
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const nom = `${delegue.prenom} ${delegue.nom}`;

  async function rouvrir() {
    setEnvoi(true);
    try {
      await client.plannings.rouvrir(delegue.id, semaine);
      notifier(t('fermeture.rouvertSucces', { nom }));
      setConfirmer(false);
      for (const cle of ['plannings-fermes', 'plannings-a-valider', 'planning-consultation'])
        await requetes.invalidateQueries({ queryKey: [cle] });
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
    setEnvoi(false);
  }

  return (
    <>
      <Button
        variant={variante}
        startIcon={<LockOpenRounded />}
        onClick={() => setConfirmer(true)}
        sx={{ flex: 'none' }}
      >
        {t('fermeture.rouvrir')}
      </Button>
      {confirmer && (
        <Dialog open onClose={() => !envoi && setConfirmer(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('fermeture.rouvrir')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{t('fermeture.rouvrirConfirmation', { nom })}</Typography>
          </DialogContent>
          <DialogActions>
            <Button disabled={envoi} onClick={() => setConfirmer(false)}>
              {t('soumission.annuler')}
            </Button>
            <Button variant="contained" disabled={envoi} onClick={() => void rouvrir()}>
              {t('fermeture.rouvrirConfirmer')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
