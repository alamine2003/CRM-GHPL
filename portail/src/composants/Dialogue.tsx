import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifier } from '../contexteNotifications';
import { messageErreur } from '../contexteSession';

/**
 * Dialogue de formulaire : affiche l'erreur du serveur (déjà traduite) et ne se ferme
 * qu'après un enregistrement réussi.
 */
export default function DialogueFormulaire({
  ouvert,
  titre,
  aide,
  libelleValider,
  surFermer,
  surValider,
  invalide = false,
  children,
}: {
  ouvert: boolean;
  titre: string;
  aide?: string;
  libelleValider?: string;
  surFermer: () => void;
  surValider: () => Promise<unknown>;
  invalide?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const notifier = useNotifier();
  // Sur téléphone, le formulaire occupe tout l'écran : champs plus larges, clavier mieux géré.
  // Une simple confirmation, sans champ, reste une boîte centrée.
  const telephone = !useMediaQuery(useTheme().breakpoints.up('sm')) && !!children;

  async function valider(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await surValider();
      notifier(t('commun.enregistre'));
      surFermer();
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Dialog
      open={ouvert}
      onClose={surFermer}
      fullWidth
      fullScreen={telephone}
      maxWidth="xs"
      slotProps={{ paper: { component: 'form', onSubmit: valider } }}
    >
      <DialogTitle sx={{ fontFamily: 'h6.fontFamily', fontWeight: 700 }}>{titre}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {aide && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {aide}
            </Typography>
          )}
          {children}
          {erreur && (
            <Alert severity="error" role="alert">
              {erreur}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={surFermer} color="inherit">
          {t('commun.annuler')}
        </Button>
        <Button type="submit" variant="contained" disabled={invalide || envoi}>
          {libelleValider ?? t('commun.enregistrer')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
