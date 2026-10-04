/**
 * Jetons de design d'INNOV CRM, repris de la maquette validée (DC-44).
 * Portail et application mobile lisent leurs couleurs ici : aucune couleur en dur ailleurs.
 */

export const marque = {
  bleuMarine: '#1B2A5B',
  bleuMarine2: '#243776',
  bleuMarine3: '#0F1A3D',
  orange: '#F26B1D',
} as const;

export interface Palette {
  fond: string;
  surface: string;
  surface2: string;
  ligne: string;
  texte: string;
  texteSecondaire: string;
  texteDiscret: string;
  succes: string;
  succesDoux: string;
  attention: string;
  attentionDoux: string;
  erreur: string;
  erreurDoux: string;
  info: string;
  infoDoux: string;
  orangeDoux: string;
}

export const paletteClaire: Palette = {
  fond: '#F4F6FA',
  surface: '#FFFFFF',
  surface2: '#F8FAFD',
  ligne: '#E2E7F0',
  texte: '#18203A',
  texteSecondaire: '#5C6684',
  texteDiscret: '#8B94AD',
  succes: '#1E9E6A',
  succesDoux: '#DFF5EA',
  attention: '#D98E04',
  attentionDoux: '#FFF1D6',
  erreur: '#D64545',
  erreurDoux: '#FBE3E3',
  info: '#2F6FE4',
  infoDoux: '#E3ECFC',
  orangeDoux: '#FDE8DA',
};

export const paletteSombre: Palette = {
  fond: '#0F1424',
  surface: '#171D33',
  surface2: '#1D2440',
  ligne: '#2A3352',
  texte: '#EEF1FA',
  texteSecondaire: '#A5AECB',
  texteDiscret: '#7B85A6',
  succes: '#1E9E6A',
  succesDoux: '#153A2C',
  attention: '#D98E04',
  attentionDoux: '#3C2E10',
  erreur: '#D64545',
  erreurDoux: '#42201F',
  info: '#2F6FE4',
  infoDoux: '#1B2A4E',
  orangeDoux: '#3D2416',
};

export const typographie = {
  titres: '"Plus Jakarta Sans", system-ui, sans-serif',
  texte: '"DM Sans", system-ui, sans-serif',
} as const;

export const rayon = 10;
/** Taille minimale d'une zone tactile, en pixels (NFR-009). */
export const zoneTactileMin = 44;
