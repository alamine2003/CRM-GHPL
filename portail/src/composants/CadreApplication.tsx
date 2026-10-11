import type { Moi, Perimetre } from '@innov/api-client';
import {
  barreLaterale,
  hauteurBarre,
  largeurBarreLaterale,
  largeurContenu,
  marque,
} from '@innov/design';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import {
  Avatar,
  Box,
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
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienNavigation, useLocation } from 'react-router';
import { useSession } from '../contexteSession';
import BanniereHorsLigne from './BanniereHorsLigne';
import ChoixLangue from './ChoixLangue';
import { initiales } from './initiales';
import Logo from './Logo';
import { ENTREES, type Entree } from './navigation';
import SelecteurPays from './SelecteurPays';
import { BasculeApparence } from './Apparence';
import { Cloche } from './Cloche';
import { FiletDemonstration, MentionDemonstration } from './BandeauDemonstration';
import { useDemonstration } from './demonstration';

function EntreeNavigation({
  entree: { cle, icone, chemin },
  courant,
  surNavigation,
}: {
  entree: Entree;
  courant: boolean;
  surNavigation?: () => void;
}) {
  const { t } = useTranslation();
  const actif = chemin !== undefined;
  return (
    <ListItemButton
      {...(actif ? { component: LienNavigation, to: chemin, onClick: surNavigation } : {})}
      selected={courant}
      disabled={!actif}
      aria-current={courant ? 'page' : undefined}
      sx={{
        color: barreLaterale.texte,
        minHeight: 36,
        py: 0.5,
        px: 1.25,
        '&.Mui-selected, &.Mui-selected:hover': {
          bgcolor: barreLaterale.actif,
          color: '#FFFFFF',
          boxShadow: `inset 3px 0 0 ${marque.orange}`,
        },
        '&:hover': { bgcolor: barreLaterale.survol },
        '&.Mui-disabled': { opacity: 0.55 },
      }}
    >
      <ListItemIcon sx={{ color: 'inherit', minWidth: 30, '& svg': { fontSize: 18 } }}>
        {icone}
      </ListItemIcon>
      <ListItemText
        primary={t(`navigation.${cle}`)}
        slotProps={{ primary: { sx: { fontWeight: 500, fontSize: 13.5 }, noWrap: true } }}
      />
    </ListItemButton>
  );
}

/** Rubriques livrées par section, puis les rubriques à venir, sans numéro de version. */
const GROUPES = ['activite', 'administration', 'aVenir'] as const;

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
        p: '12px 10px',
        gap: 0.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 0.75, pb: 2, pt: 0.25 }}>
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
        {GROUPES.map((groupe) => {
          const entrees = ENTREES.filter(
            (e) =>
              (groupe === 'aVenir'
                ? e.chemin === undefined
                : e.section === groupe && e.chemin !== undefined) &&
              (!e.visible || e.visible(perimetre)),
          );
          if (!entrees.length) return null;
          return (
            <Box key={groupe} sx={{ mb: 1.5 }}>
              <Typography
                variant="overline"
                component="p"
                sx={{ px: 1.25, pb: 0.25, color: barreLaterale.texteDiscret }}
              >
                {t(`navigation.sections.${groupe}`)}
              </Typography>
              <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {entrees.map((entree) => (
                  <EntreeNavigation
                    key={entree.cle}
                    entree={entree}
                    courant={
                      entree.chemin === pathname ||
                      (entree.chemin !== '/' && pathname.startsWith(`${entree.chemin}/`))
                    }
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
          pt: 1.25,
          px: 0.75,
          borderTop: `1px solid ${barreLaterale.separateur}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
        }}
      >
        <Avatar
          sx={{
            width: 28,
            height: 28,
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
          sx={{ p: 0.25, borderRadius: '50%' }}
        >
          <Avatar
            sx={{ width: 28, height: 28, fontSize: 11, fontWeight: 700, bgcolor: 'primary.main' }}
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
          {t('navigation.profil')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAncre(null);
            void deconnexion();
          }}
        >
          {t('session.deconnexion')}
        </MenuItem>
      </Menu>
    </>
  );
}

/**
 * Cadre des pages connectées : barre latérale marine et barre du haut de 48 px. Le titre de la
 * page n'est pas répété dans la barre : il ouvre le contenu (docs/design.md).
 */
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
  const demonstration = useDemonstration();

  useEffect(() => {
    document.title = `${titre} · ${t('commun.produit')}`;
  }, [titre, t]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {demonstration && <FiletDemonstration />}
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
            height: hauteurBarre,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: { xs: 1, sm: 2, md: 3 },
            bgcolor: 'background.paper',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          {!large && (
            <IconButton aria-label={t('navigation.menu')} onClick={() => setTiroir(true)}>
              <MenuRounded />
            </IconButton>
          )}
          {!large && <Logo taille={24} />}
          <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
            {demonstration && <MentionDemonstration />}
          </Box>
          <SelecteurPays perimetre={perimetre} />
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <ChoixLangue />
          </Box>
          {perimetre.actions.includes('notifications.lire') && <Cloche />}
          <BasculeApparence />
          <MenuUtilisateur utilisateur={utilisateur} />
        </Box>
        <BanniereHorsLigne />
        <Box
          component="main"
          sx={{
            px: { xs: 2, md: 3 },
            pt: { xs: 2, md: 2.5 },
            pb: 4,
            maxWidth: largeurContenu,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
