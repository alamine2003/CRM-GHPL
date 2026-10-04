import type { Moi, Perimetre } from '@innov/api-client';
import { barreLaterale, largeurBarreLaterale, marque } from '@innov/design';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import BarChartRounded from '@mui/icons-material/BarChartRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import {
  Avatar,
  Box,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienNavigation, useLocation } from 'react-router';
import { useSession } from '../contexteSession';
import ChoixLangue from './ChoixLangue';
import { initiales } from './initiales';
import Logo from './Logo';
import SelecteurPays from './SelecteurPays';

interface Entree {
  cle: string;
  icone: ReactNode;
  /** Chemin de la page livrée ; absent pour une rubrique d'une version future. */
  chemin?: string;
  /** Action exigée pour voir la rubrique (le serveur reste seul juge). */
  action?: string;
  version?: string;
}

/** Entrées de navigation ; celles d'une version future sont visibles mais inactives. */
const ENTREES: Entree[] = [
  { cle: 'accueil', icone: <HomeRounded />, chemin: '/' },
  {
    cle: 'organisation',
    icone: <AccountTreeRounded />,
    chemin: '/organisation',
    action: 'organisation.lire',
  },
  { cle: 'visites', icone: <FactCheckRounded />, version: '0.4.1' },
  { cle: 'planning', icone: <CalendarMonthRounded />, version: '0.2.1' },
  { cle: 'prospects', icone: <PeopleAltRounded />, version: '0.1.2' },
  { cle: 'pilotage', icone: <BarChartRounded />, version: '0.7.1' },
  { cle: 'equipe', icone: <GroupsRounded />, version: '0.0.6' },
  { cle: 'parametres', icone: <SettingsRounded />, version: '0.0.6' },
];

function BarreLaterale({
  utilisateur,
  perimetre,
  surNavigation,
}: {
  utilisateur: Moi;
  perimetre: Perimetre;
  surNavigation?: () => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { deconnexion } = useSession();
  const theme = useTheme();
  const fond = theme.palette.mode === 'dark' ? barreLaterale.fondSombre : barreLaterale.fond;

  return (
    <Box
      component="nav"
      aria-label={t('navigation.menu')}
      sx={{
        width: largeurBarreLaterale,
        height: '100%',
        bgcolor: fond,
        color: barreLaterale.texte,
        display: 'flex',
        flexDirection: 'column',
        p: '18px 14px',
        gap: 0.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1, pb: 2.25 }}>
        <Logo />
        <Box sx={{ lineHeight: 1.1, minWidth: 0 }}>
          <Typography sx={{ color: '#FFFFFF', fontWeight: 700 }} noWrap>
            {t('commun.produit')}
          </Typography>
          <Typography variant="caption" sx={{ color: barreLaterale.texteDiscret }} noWrap>
            {perimetre.pays_actif?.nom ??
              (perimetre.vue_consolidee ? t('pays.consolide') : t('session.siege'))}
          </Typography>
        </Box>
      </Box>

      <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {ENTREES.filter((e) => !e.action || perimetre.actions.includes(e.action)).map(
          ({ cle, icone, chemin, version }) => {
            const actif = chemin !== undefined;
            const courant = chemin === pathname;
            const bouton = (
              <ListItemButton
                key={cle}
                {...(actif
                  ? { component: LienNavigation, to: chemin, onClick: surNavigation }
                  : {})}
                selected={courant}
                disabled={!actif}
                aria-current={courant ? 'page' : undefined}
                sx={{
                  color: barreLaterale.texte,
                  py: 1.1,
                  '&.Mui-selected, &.Mui-selected:hover': {
                    bgcolor: barreLaterale.actif,
                    color: '#FFFFFF',
                    boxShadow: `inset 3px 0 0 ${marque.orange}`,
                  },
                  '&:hover': { bgcolor: barreLaterale.survol },
                  '&.Mui-disabled': { opacity: 0.55 },
                }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}>{icone}</ListItemIcon>
                <ListItemText
                  primary={t(`navigation.${cle}`)}
                  slotProps={{ primary: { sx: { fontWeight: 500, fontSize: 14 } } }}
                />
                {!actif && (
                  <Chip
                    size="small"
                    label={version}
                    sx={{
                      height: 20,
                      fontSize: 11,
                      bgcolor: 'rgba(255,255,255,.08)',
                      color: barreLaterale.texteDiscret,
                    }}
                  />
                )}
              </ListItemButton>
            );
            return actif ? (
              bouton
            ) : (
              <Tooltip
                key={cle}
                title={t('navigation.disponibleEn', { version })}
                placement="right"
              >
                <span>{bouton}</span>
              </Tooltip>
            );
          },
        )}
      </List>

      <Box
        sx={{
          mt: 'auto',
          pt: 1.5,
          px: 1,
          borderTop: `1px solid ${barreLaterale.separateur}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
        }}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: barreLaterale.avatar,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {initiales(utilisateur.prenom, utilisateur.nom)}
        </Avatar>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography sx={{ color: '#FFFFFF', fontWeight: 600, fontSize: 13 }} noWrap>
            {utilisateur.prenom} {utilisateur.nom}
          </Typography>
          <Typography variant="caption" sx={{ color: barreLaterale.texteDiscret }} noWrap>
            {utilisateur.identifiant}
          </Typography>
        </Box>
        <Tooltip title={t('session.deconnexion')}>
          <IconButton
            aria-label={t('session.deconnexion')}
            onClick={() => void deconnexion()}
            size="small"
            sx={{ color: barreLaterale.texte }}
          >
            <LogoutRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

/** Cadre des pages connectées : barre latérale bleu marine et barre supérieure. */
export default function CadreApplication({
  utilisateur,
  perimetre,
  titre,
  children,
}: {
  utilisateur: Moi;
  perimetre: Perimetre;
  titre: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const large = useMediaQuery(theme.breakpoints.up('md'));
  const [tiroir, setTiroir] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {large ? (
        <Box sx={{ position: 'sticky', top: 0, height: '100vh', flex: 'none' }}>
          <BarreLaterale utilisateur={utilisateur} perimetre={perimetre} />
        </Box>
      ) : (
        <Drawer open={tiroir} onClose={() => setTiroir(false)}>
          <BarreLaterale
            utilisateur={utilisateur}
            perimetre={perimetre}
            surNavigation={() => setTiroir(false)}
          />
        </Drawer>
      )}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: { xs: 2, md: 3.5 },
            py: 1.5,
            bgcolor: 'background.paper',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          {!large && (
            <IconButton
              aria-label={t('navigation.menu')}
              onClick={() => setTiroir(true)}
              edge="start"
            >
              <MenuRounded />
            </IconButton>
          )}
          {!large && <Logo taille={28} />}
          <Typography variant="h6" component="p" noWrap sx={{ flexGrow: 1 }}>
            {titre}
          </Typography>
          <SelecteurPays perimetre={perimetre} />
          <ChoixLangue />
        </Box>
        <Box
          component="main"
          sx={{ px: { xs: 2, md: 3.5 }, py: { xs: 2.5, md: 3 }, maxWidth: 1240 }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
