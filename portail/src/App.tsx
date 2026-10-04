import type { Moi, Perimetre } from '@innov/api-client';
import { Box, CircularProgress } from '@mui/material';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import CadreApplication from './composants/CadreApplication';
import { LimiteErreur } from './composants/Erreurs';
import { ENTREES } from './composants/navigation';
import { useSession } from './contexteSession';
import Accueil from './pages/Accueil';
import Connexion from './pages/Connexion';
import Equipe from './pages/Equipe';
import Exploitation from './pages/Exploitation';
import Introuvable from './pages/Introuvable';
import Organisation from './pages/Organisation';
import Oubli from './pages/Oubli';
import Parametres from './pages/Parametres';
import PaysPage from './pages/PaysPage';
import Profil from './pages/Profil';
import Reinitialisation from './pages/Reinitialisation';

type Rendu = (utilisateur: Moi, perimetre: Perimetre) => ReactNode;

/** Pages connectées ; leur visibilité suit celle de la navigation (le serveur reste juge). */
const PAGES: Record<string, { titre: string; rendu: Rendu }> = {
  '/': { titre: 'navigation.accueil', rendu: (u, p) => <Accueil utilisateur={u} perimetre={p} /> },
  '/organisation': {
    titre: 'navigation.organisation',
    rendu: (_, p) => <Organisation perimetre={p} />,
  },
  '/equipe': { titre: 'navigation.equipe', rendu: (_, p) => <Equipe perimetre={p} /> },
  '/parametres': { titre: 'navigation.parametres', rendu: (_, p) => <Parametres perimetre={p} /> },
  '/pays': { titre: 'navigation.pays', rendu: (_, p) => <PaysPage perimetre={p} /> },
  '/profil': {
    titre: 'navigation.profil',
    rendu: (u, p) => <Profil utilisateur={u} perimetre={p} />,
  },
  '/exploitation': { titre: 'navigation.exploitation', rendu: () => <Exploitation /> },
};

function Protegee() {
  const { t } = useTranslation();
  const { etat } = useSession();
  const { pathname } = useLocation();
  if (etat.statut === 'chargement') {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <CircularProgress color="secondary" aria-label={t('session.chargement')} />
      </Box>
    );
  }
  if (etat.statut === 'anonyme') return <Navigate to="/connexion" replace />;
  const { utilisateur, perimetre } = etat;
  const page = PAGES[pathname];
  const entree = ENTREES.find((e) => e.chemin === pathname);
  // Une page connue mais non permise renvoie à l'accueil ; une adresse inconnue affiche 404.
  if (page && entree?.visible && !entree.visible(perimetre)) return <Navigate to="/" replace />;
  return (
    <CadreApplication
      utilisateur={utilisateur}
      perimetre={perimetre}
      titre={t(page ? page.titre : 'erreurs.introuvableTitre')}
    >
      {/* Une page qui plante n'emporte pas le cadre : la navigation reste utilisable. */}
      <LimiteErreur key={pathname}>
        {page ? page.rendu(utilisateur, perimetre) : <Introuvable />}
      </LimiteErreur>
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
