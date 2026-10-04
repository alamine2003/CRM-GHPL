import type { Moi, Perimetre } from '@innov/api-client';
import { LANGUES } from '@innov/i18n';
import LockRounded from '@mui/icons-material/LockRounded';
import TranslateRounded from '@mui/icons-material/TranslateRounded';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EnTeteCarte, EnTetePage, Ligne, PastilleIcone } from '../composants/Elements';
import { initiales } from '../composants/initiales';
import { CarteActivite, CarteDoubleAuth, CarteSessions } from '../composants/SecuriteCompte';
import { messageErreur, useSession } from '../contexteSession';

export default function Profil({
  utilisateur,
  perimetre,
}: {
  utilisateur: Moi;
  perimetre: Perimetre;
}) {
  const { t, i18n } = useTranslation();
  const { client, changerLangue } = useSession();
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; texte: string } | null>(null);

  async function changerMotDePasse(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await client.changerMotDePasse(actuel, nouveau);
      setActuel('');
      setNouveau('');
      setMessage({ type: 'success', texte: t('profilPage.change') });
    } catch (erreur) {
      setMessage({ type: 'error', texte: messageErreur(erreur, t('erreurs.reseau')) });
    }
  }

  return (
    <Stack spacing={2.5}>
      <EnTetePage titre={t('profilPage.titre')} sousTitre={t('profilPage.sousTitre')} />
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          alignItems: 'start',
        }}
      >
        <Card>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Avatar sx={{ width: 56, height: 56, bgcolor: 'secondary.main', fontWeight: 800 }}>
                {initiales(utilisateur.prenom, utilisateur.nom)}
              </Avatar>
              <Box>
                <Typography variant="h5" component="h2">
                  {utilisateur.prenom} {utilisateur.nom}
                </Typography>
                <Typography sx={{ color: 'text.secondary' }}>{utilisateur.identifiant}</Typography>
              </Box>
            </Stack>
            <Divider />
            <Box>
              <Ligne
                libelle={t('profil.courriel')}
                valeur={utilisateur.courriel || t('profil.nonRenseigne')}
              />
              <Ligne
                libelle={t('profilPage.paysPrincipal')}
                valeur={utilisateur.pays_principal?.nom ?? t('session.siege')}
              />
            </Box>
            <Box>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                {t('profilPage.mesRoles')}
              </Typography>
              <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
                {perimetre.roles.length ? (
                  perimetre.roles.map((r) => (
                    <Chip key={r} size="small" color="primary" label={t(`roles.${r}`)} />
                  ))
                ) : (
                  <Typography variant="body2">{t('roles.aucun')}</Typography>
                )}
              </Stack>
            </Box>
          </CardContent>
        </Card>
        <Stack spacing={2}>
          <Card>
            <EnTeteCarte
              titre={t('profilPage.langueTitre')}
              action={<PastilleIcone icone={<TranslateRounded />} ton="info" taille={32} />}
            />
            <CardContent>
              <ToggleButtonGroup
                exclusive
                value={i18n.language}
                onChange={(_, langue: string | null) => langue && void changerLangue(langue)}
                sx={{
                  '& .MuiToggleButton-root': { textTransform: 'none', px: 2.5, fontWeight: 600 },
                }}
              >
                {LANGUES.map((code) => (
                  <ToggleButton key={code} value={code}>
                    {t(`commun.langues.${code}`)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
                {t('profilPage.langueAide')}
              </Typography>
            </CardContent>
          </Card>
          <Card component="form" onSubmit={changerMotDePasse}>
            <EnTeteCarte
              titre={t('profilPage.motDePasse')}
              action={<PastilleIcone icone={<LockRounded />} ton="secondary" taille={32} />}
            />
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                type="password"
                label={t('profilPage.actuel')}
                value={actuel}
                onChange={(e) => setActuel(e.target.value)}
                autoComplete="current-password"
                required
              />
              <TextField
                type="password"
                label={t('profilPage.nouveau')}
                helperText={t('reinitialisation.explication')}
                value={nouveau}
                onChange={(e) => setNouveau(e.target.value)}
                autoComplete="new-password"
                required
              />
              {message && (
                <Alert severity={message.type} role="alert">
                  {message.texte}
                </Alert>
              )}
              <Button
                type="submit"
                variant="contained"
                disabled={!actuel || !nouveau}
                sx={{ alignSelf: 'flex-start' }}
              >
                {t('commun.enregistrer')}
              </Button>
            </CardContent>
          </Card>
        </Stack>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          alignItems: 'start',
        }}
      >
        <Stack spacing={2}>
          <CarteDoubleAuth />
          <CarteSessions />
        </Stack>
        <CarteActivite />
      </Box>
    </Stack>
  );
}
