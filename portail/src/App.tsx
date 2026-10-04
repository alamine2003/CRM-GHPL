import type { Moi, Perimetre } from '@innov/api-client';
import { Box, CircularProgress, Skeleton, Stack } from '@mui/material';
import { lazy, type ReactNode, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import CadreApplication from './composants/CadreApplication';
import { LimiteErreur } from './composants/Erreurs';
import { ENTREES } from './composants/navigation';
import { useSession } from './contexteSession';
import Accueil from './pages/Accueil';
import ActivationRequise from './pages/ActivationRequise';
import Connexion from './pages/Connexion';
import Introuvable from './pages/Introuvable';
import Oubli from './pages/Oubli';
import Reinitialisation from './pages/Reinitialisation';

// Les pages d'administration sont chargées à la demande : la connexion et l'accueil,
// utilisés par tous, restent dans le paquet initial (téléphones et réseaux lents).
const Equipe = lazy(() => import('./pages/Equipe'));
const Exploitation = lazy(() => import('./pages/Exploitation'));
const Organisation = lazy(() => import('./pages/Organisation'));
const Parametres = lazy(() => import('./pages/Parametres'));
const PaysPage = lazy(() => import('./pages/PaysPage'));
const Profil = lazy(() => import('./pages/Profil'));
const Referentiels = lazy(() => import('./pages/Referentiels'));
const Prospects = lazy(() => import('./pages/Prospects'));
const Etablissements = lazy(() => import('./pages/Etablissements'));
const Imports = lazy(() => import('./pages/Imports'));
const Ciblage = lazy(() => import('./pages/Ciblage'));
const Doublons = lazy(() => import('./pages/Doublons'));
const Propositions = lazy(() => import('./pages/Propositions'));

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
  '/prospects': { titre: 'navigation.prospects', rendu: (_, p) => <Prospects perimetre={p} /> },
  '/etablissements': {
    titre: 'navigation.etablissements',
    rendu: (_, p) => <Etablissements perimetre={p} />,
  },
  '/referentiels': {
    titre: 'navigation.referentiels',
    rendu: (_, p) => <Referentiels perimetre={p} />,
  },
  '/ciblage': { titre: 'navigation.ciblage', rendu: (_, p) => <Ciblage perimetre={p} /> },
  '/doublons': { titre: 'navigation.doublons', rendu: (_, p) => <Doublons perimetre={p} /> },
  '/propositions': {
    titre: 'navigation.propositions',
    rendu: (_, p) => <Propositions perimetre={p} />,
  },
  '/imports': { titre: 'navigation.imports', rendu: (_, p) => <Imports perimetre={p} /> },
  '/pays': { titre: 'navigation.pays', rendu: (_, p) => <PaysPage perimetre={p} /> },
  '/profil': {
    titre: 'navigation.profil',
    rendu: (u, p) => <Profil utilisateur={u} perimetre={p} />,
  },
  '/exploitation': { titre: 'navigation.exploitation', rendu: () => <Exploitation /> },
};

function ChargementPage() {
  return (
    <Stack spacing={2} aria-busy="true">
      <Skeleton variant="rounded" height={56} width="40%" />
      <Skeleton variant="rounded" height={160} />
      <Skeleton variant="rounded" height={240} />
    </Stack>
  );
}

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
  if (etat.doubleAuthAActiver) return <ActivationRequise />;
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
        <Suspense fallback={<ChargementPage />}>
          {page ? page.rendu(utilisateur, perimetre) : <Introuvable />}
        </Suspense>
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
