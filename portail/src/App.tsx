import { Box, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router';
import CadreApplication from './composants/CadreApplication';
import { useSession } from './contexteSession';
import Accueil from './pages/Accueil';
import Connexion from './pages/Connexion';
import Oubli from './pages/Oubli';
import Reinitialisation from './pages/Reinitialisation';

function Protegee() {
  const { t } = useTranslation();
  const { etat } = useSession();
  if (etat.statut === 'chargement') {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <CircularProgress color="secondary" aria-label={t('session.chargement')} />
      </Box>
    );
  }
  if (etat.statut === 'anonyme') return <Navigate to="/connexion" replace />;
  return (
    <CadreApplication
      utilisateur={etat.utilisateur}
      perimetre={etat.perimetre}
      titre={t('navigation.accueil')}
    >
      <Accueil utilisateur={etat.utilisateur} perimetre={etat.perimetre} />
    </CadreApplication>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Connexion />} />
      <Route path="/mot-de-passe-oublie" element={<Oubli />} />
      <Route path="/reinitialisation" element={<Reinitialisation />} />
      <Route path="*" element={<Protegee />} />
    </Routes>
  );
}
