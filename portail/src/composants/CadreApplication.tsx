import type { Moi, Perimetre } from '@innov/api-client';
import { barreLaterale, largeurBarreLaterale, marque } from '@innov/design';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import {
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienNavigation, useLocation } from 'react-router';
import { useSession } from '../contexteSession';
import BanniereHorsLigne from './BanniereHorsLigne';
import ChoixLangue from './ChoixLangue';
import { initiales } from './initiales';
import Logo from './Logo';
import { ENTREES, type Entree } from './navigation';
import SelecteurPays from './SelecteurPays';

function EntreeNavigation({
  entree: { cle, icone, chemin, version },
  courant,
  surNavigation,
}: {
  entree: Entree;
  courant: boolean;
  surNavigation?: () => void;
}) {
  const { t } = useTranslation();
  const actif = chemin !== undefined;
  const bouton = (
    <ListItemButton
      {...(actif ? { component: LienNavigation, to: chemin, onClick: surNavigation } : {})}
      selected={courant}
      disabled={!actif}
      aria-current={courant ? 'page' : undefined}
      sx={{
        color: barreLaterale.texte,
        py: 0.9,
        '&.Mui-selected, &.Mui-selected:hover': {
          bgcolor: barreLaterale.actif,
          color: '#FFFFFF',
          boxShadow: `inset 3px 0 0 ${marque.orange}`,
        },
        '&:hover': { bgcolor: barreLaterale.survol },
        '&.Mui-disabled': { opacity: 0.5 },
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
    <Tooltip title={t('navigation.disponibleEn', { version })} placement="right">
      <span>{bouton}</span>
    </Tooltip>
  );
}

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

      <Box sx={{ overflowY: 'auto', flexGrow: 1, mx: -0.5, px: 0.5 }}>
        {(['activite', 'administration'] as const).map((section) => {
          const entrees = ENTREES.filter(
            (e) => e.section === section && (!e.visible || e.visible(perimetre)),
          );
          if (!entrees.length) return null;
          return (
            <Box key={section} sx={{ mb: 1.5 }}>
              <Typography
                variant="overline"
                component="p"
                sx={{ px: 1.5, color: barreLaterale.texteDiscret, fontSize: 10.5, opacity: 0.8 }}
              >
                {t(`navigation.sections.${section}`)}
              </Typography>
              <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {entrees.map((entree) => (
                  <EntreeNavigation
                    key={entree.cle}
                    entree={entree}
                    courant={entree.chemin === pathname}
                    surNavigation={surNavigation}
                  />
                ))}
              </List>
            </Box>
          );
        })}
      </Box>

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
        <Box
          component={LienNavigation}
          to="/profil"
          onClick={surNavigation}
          aria-label={t('navigation.profil')}
          sx={{ minWidth: 0, flexGrow: 1, textDecoration: 'none', borderRadius: 1 }}
        >
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

function MenuUtilisateur({ utilisateur }: { utilisateur: Moi }) {
  const { t } = useTranslation();
  const { deconnexion } = useSession();
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title={t('navigation.profil')}>
        <IconButton
          aria-label={t('navigation.profil')}
          onClick={(e) => setAncre(e.currentTarget)}
          sx={{ p: 0.25 }}
        >
          <Avatar
            sx={{ width: 34, height: 34, fontSize: 12, fontWeight: 700, bgcolor: 'secondary.main' }}
          >
            {initiales(utilisateur.prenom, utilisateur.nom)}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={ancre}
        open={Boolean(ancre)}
        onClose={() => setAncre(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>
            {utilisateur.prenom} {utilisateur.nom}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {utilisateur.identifiant}
          </Typography>
        </Box>
        <Divider />
        <MenuItem component={LienNavigation} to="/profil" onClick={() => setAncre(null)}>
          <ListItemIcon>
            <PersonRounded fontSize="small" />
          </ListItemIcon>
          {t('navigation.profil')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAncre(null);
            void deconnexion();
          }}
        >
          <ListItemIcon>
            <LogoutRounded fontSize="small" />
          </ListItemIcon>
          {t('session.deconnexion')}
        </MenuItem>
      </Menu>
    </>
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
          <MenuUtilisateur utilisateur={utilisateur} />
        </Box>
        <BanniereHorsLigne />
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
