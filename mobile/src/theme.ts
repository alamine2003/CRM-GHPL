import type { Palette } from '@innov/design';

/**
 * Jetons de l'application mobile, repris à l'identique de la maquette « CRM GHPL – Écrans
 * mobile et tablette » (1.4.0, `app.css`) : direction « registre » (marine, orange réservé à ce
 * qui compte, filets, pas d'ombre), statuts plus sombres pour le contraste. Le portail garde ceux
 * de `@innov/design`.
 */
export interface Theme extends Palette {
  /** Marine de la marque : bandeau « prochaine visite », potentiel B, segment actif. */
  marine: string;
  marine2: string;
  orange: string;
  /** Liens et actions en texte (le marine devient illisible en sombre). */
  lien: string;
  /** Bouton principal et son texte. */
  bouton: string;
  boutonTexte: string;
  /** Barre latérale de la tablette. */
  rail: string;
  /** Bandeau marine (« prochaine visite ») : un ton plus clair en sombre. */
  bandeau: string;
  /** Fond du potentiel B. */
  potentielB: string;
  /** Remplissage des barres, histogrammes et segments actifs. */
  accentPlein: string;
  /** Texte sur `accentPlein`. */
  accentTexte: string;
  sombre: boolean;
}

export const themeClair: Theme = {
  fond: '#F4F5F8',
  surface: '#FFFFFF',
  surface2: '#F8F9FB',
  ligne: '#E2E5EB',
  texte: '#151B30',
  texteSecondaire: '#4F5871',
  texteDiscret: '#6A7288',
  succes: '#137A52',
  succesDoux: '#DFF5EA',
  attention: '#8A5A00',
  attentionDoux: '#FFF1D6',
  erreur: '#B3321F',
  erreurDoux: '#FBE3E3',
  info: '#1F5BC8',
  infoDoux: '#E3ECFC',
  orangeDoux: '#FDE8DA',
  marine: '#1B2A5B',
  marine2: '#243776',
  orange: '#F26B1D',
  lien: '#1B2A5B',
  bouton: '#1B2A5B',
  boutonTexte: '#FFFFFF',
  rail: '#1B2A5B',
  bandeau: '#1B2A5B',
  potentielB: '#1B2A5B',
  accentPlein: '#1B2A5B',
  accentTexte: '#FFFFFF',
  sombre: false,
};

export const themeSombre: Theme = {
  fond: '#0E1322',
  surface: '#161C33',
  surface2: '#1B2340',
  ligne: '#2A3352',
  texte: '#EEF1FA',
  texteSecondaire: '#B3BBD6',
  texteDiscret: '#8D97B8',
  succes: '#4CC590',
  succesDoux: '#153A2C',
  attention: '#F0B445',
  attentionDoux: '#3C2E10',
  erreur: '#F08A7C',
  erreurDoux: '#42201F',
  info: '#8FB3F5',
  infoDoux: '#1B2A4E',
  orangeDoux: '#3D2416',
  marine: '#1B2A5B',
  marine2: '#243776',
  orange: '#F26B1D',
  lien: '#9DB0F0',
  bouton: '#EEF1FA',
  boutonTexte: '#0F1A3D',
  rail: '#0B1128',
  bandeau: '#1F2C5E',
  potentielB: '#33457F',
  accentPlein: '#9DB0F0',
  accentTexte: '#0F1A3D',
  sombre: true,
};

/** Textes clairs posés sur le marine (rail, bandeau, volet de connexion). */
export const surMarine = {
  texte: '#FFFFFF',
  discret: '#B9C3E6',
  doux: '#C9D2EC',
  actif: 'rgba(255,255,255,.09)',
  contour: 'rgba(255,255,255,.35)',
} as const;

/** Rayon unique des surfaces, champs et boutons ; 4 pour les puces. */
export const RAYON = 6;
