import type { Perimetre } from '@innov/api-client';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import BarChartRounded from '@mui/icons-material/BarChartRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import type { ReactNode } from 'react';

export type Section = 'activite' | 'administration';

export interface Entree {
  cle: string;
  icone: ReactNode;
  section: Section;
  /** Chemin de la page livrée ; absent pour une rubrique d'une version future. */
  chemin?: string;
  /** Qui voit la rubrique (le serveur reste seul juge des données). */
  visible?: (p: Perimetre) => boolean;
  version?: string;
}

const peut = (action: string) => (p: Perimetre) => p.actions.includes(action);
export const estSiege = (p: Perimetre) =>
  p.roles.some((r) => r === 'admin_siege' || r === 'direction_siege');

/** Entrées de navigation ; celles d'une version future sont visibles mais inactives. */
export const ENTREES: Entree[] = [
  { cle: 'accueil', icone: <HomeRounded />, section: 'activite', chemin: '/' },
  { cle: 'visites', icone: <FactCheckRounded />, section: 'activite', version: '0.4.1' },
  { cle: 'planning', icone: <CalendarMonthRounded />, section: 'activite', version: '0.2.1' },
  { cle: 'prospects', icone: <PeopleAltRounded />, section: 'activite', version: '0.1.2' },
  { cle: 'pilotage', icone: <BarChartRounded />, section: 'activite', version: '0.7.1' },
  {
    cle: 'organisation',
    icone: <AccountTreeRounded />,
    section: 'administration',
    chemin: '/organisation',
    visible: peut('organisation.lire'),
  },
  {
    cle: 'equipe',
    icone: <GroupsRounded />,
    section: 'administration',
    chemin: '/equipe',
    visible: peut('utilisateurs.lire'),
  },
  {
    cle: 'parametres',
    icone: <SettingsRounded />,
    section: 'administration',
    chemin: '/parametres',
    visible: peut('parametres.lire'),
  },
  {
    cle: 'pays',
    icone: <PublicRounded />,
    section: 'administration',
    chemin: '/pays',
    visible: estSiege,
  },
];
