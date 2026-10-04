import type { Perimetre } from '@innov/api-client';
import ApartmentRounded from '@mui/icons-material/ApartmentRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import BarChartRounded from '@mui/icons-material/BarChartRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import CompareArrowsRounded from '@mui/icons-material/CompareArrowsRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import MedicationRounded from '@mui/icons-material/MedicationRounded';
import MonitorHeartRounded from '@mui/icons-material/MonitorHeartRounded';
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import TrackChangesRounded from '@mui/icons-material/TrackChangesRounded';
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
}

const peut = (action: string) => (p: Perimetre) => p.actions.includes(action);
export const estSiege = (p: Perimetre) =>
  p.roles.some((r) => r === 'admin_siege' || r === 'direction_siege');

/** Entrées de navigation ; celles d'une version future sont regroupées sous « À venir », inactives. */
export const ENTREES: Entree[] = [
  { cle: 'accueil', icone: <HomeRounded />, section: 'activite', chemin: '/' },
  { cle: 'visites', icone: <FactCheckRounded />, section: 'activite' },
  { cle: 'planning', icone: <CalendarMonthRounded />, section: 'activite' },
  {
    cle: 'prospects',
    icone: <PeopleAltRounded />,
    section: 'activite',
    chemin: '/prospects',
    visible: peut('prospects.lire'),
  },
  {
    cle: 'etablissements',
    icone: <ApartmentRounded />,
    section: 'activite',
    chemin: '/etablissements',
    visible: peut('prospects.lire'),
  },
  {
    cle: 'ciblage',
    icone: <TrackChangesRounded />,
    section: 'activite',
    chemin: '/ciblage',
    visible: peut('cibles.lire'),
  },
  {
    // PRP-014 : le délégué y suit ses propositions ; le superviseur et l'administrateur pays
    // les tranchent.
    cle: 'propositions',
    icone: <EditNoteRounded />,
    section: 'activite',
    chemin: '/propositions',
    visible: (p) => peut('propositions.creer')(p) || peut('propositions.trancher')(p),
  },
  { cle: 'pilotage', icone: <BarChartRounded />, section: 'activite' },
  {
    cle: 'organisation',
    icone: <AccountTreeRounded />,
    section: 'administration',
    chemin: '/organisation',
    visible: peut('organisation.lire'),
  },
  {
    cle: 'referentiels',
    icone: <MedicationRounded />,
    section: 'administration',
    chemin: '/referentiels',
    // Catalogue de l'encadrement et de l'administration ; le délégué voit ses produits
    // sur le téléphone (« Mes produits »).
    visible: (p) => peut('referentiels.lire')(p) && peut('organisation.lire')(p),
  },
  {
    cle: 'doublons',
    icone: <CompareArrowsRounded />,
    section: 'administration',
    chemin: '/doublons',
    visible: peut('prospects.gerer'),
  },
  {
    cle: 'imports',
    icone: <CloudUploadRounded />,
    section: 'administration',
    chemin: '/imports',
    visible: peut('imports.gerer'),
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
  {
    cle: 'exploitation',
    icone: <MonitorHeartRounded />,
    section: 'administration',
    chemin: '/exploitation',
    visible: peut('exploitation.lire'),
  },
];
