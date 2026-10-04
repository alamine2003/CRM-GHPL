import { Box, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router';
import EnTete from './EnTete';
import Accueil from './pages/Accueil';
import Connexion from './pages/Connexion';
import Oubli from './pages/Oubli';
import Reinitialisation from './pages/Reinitialisation';
import { useSession } from './contexteSession';

function Protegee() {
  const { t } = useTranslation();
  const { etat } = useSession();
  if (etat.statut === 'chargement') {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
        <CircularProgress aria-label={t('session.chargement')} />
      </Box>
    );
  }
  if (etat.statut === 'anonyme') return <Navigate to="/connexion" replace />;
  return <Accueil utilisateur={etat.utilisateur} />;
}

export default function App() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <EnTete />
      <Routes>
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/mot-de-passe-oublie" element={<Oubli />} />
        <Route path="/reinitialisation" element={<Reinitialisation />} />
        <Route path="*" element={<Protegee />} />
      </Routes>
    </Box>
  );
}
