import type { Moi, Perimetre } from '@innov/api-client';
import { LANGUES } from '@innov/i18n';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EnTeteCarte, EnTetePage, Ligne } from '../composants/Elements';
import { ChoixApparence } from '../composants/Apparence';
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
    <Stack spacing={2}>
      <EnTetePage titre={t('profilPage.titre')} />
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
          alignItems: 'start',
        }}
      >
        <Card sx={{ minWidth: 0 }}>
          <EnTeteCarte titre={`${utilisateur.prenom} ${utilisateur.nom}`} />
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, py: 0.5 }}>
            <Box>
              <Ligne libelle={t('profil.identifiant')} valeur={utilisateur.identifiant} />
              <Ligne
                libelle={t('profil.courriel')}
                valeur={utilisateur.courriel || t('profil.nonRenseigne')}
              />
              <Ligne
                libelle={t('profilPage.paysPrincipal')}
                valeur={utilisateur.pays_principal?.nom ?? t('session.siege')}
              />
              <Ligne
                libelle={t('profilPage.mesRoles')}
                valeur={
                  perimetre.roles.length
                    ? perimetre.roles.map((r) => t(`roles.${r}`)).join(', ')
                    : t('roles.aucun')
                }
              />
            </Box>
          </CardContent>
        </Card>
        <Stack spacing={2}>
          <Card>
            <EnTeteCarte
              titre={t('profilPage.langueTitre')}
            />
            <CardContent>
              <ToggleButtonGroup
                exclusive
                value={i18n.language}
                onChange={(_, langue: string | null) => langue && void changerLangue(langue)}
                sx={{ '& .MuiToggleButton-root': { px: 2 } }}
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
          <Card>
            <EnTeteCarte
              titre={t('apparence.titre')}
            />
            <CardContent>
              <ChoixApparence />
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
                {t('apparence.aide')}
              </Typography>
            </CardContent>
          </Card>
          <Card component="form" onSubmit={changerMotDePasse}>
            <EnTeteCarte
              titre={t('profilPage.motDePasse')}
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
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
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
