/**
 * Jetons de design d'INNOV CRM, repris de la maquette validée (DC-44).
 * Portail et application mobile lisent leurs couleurs ici : aucune couleur en dur ailleurs.
 */

export const marque = {
  bleuMarine: '#1B2A5B',
  bleuMarine2: '#243776',
  bleuMarine3: '#0F1A3D',
  orange: '#F26B1D',
  orangeClair: '#FF9A4D',
  /** Bleu de la marque lisible sur fond sombre (liens, focus en thème sombre). */
  bleuClair: '#9DB0F0',
} as const;

/** Barre latérale du portail (maquette INNOV CRM). */
export const barreLaterale = {
  fond: '#1B2A5B',
  fondSombre: '#0B1128',
  texte: '#C9D2EC',
  texteDiscret: '#8F9CC7',
  survol: 'rgba(255,255,255,.06)',
  actif: 'rgba(255,255,255,.10)',
  separateur: 'rgba(255,255,255,.10)',
  avatar: '#3B4E8F',
} as const;

/** Dégradé du logo « IC ». */
export const degradeLogo = [marque.orange, marque.orangeClair] as const;

/** Ombres des cartes (maquette INNOV CRM). */
export const ombres = {
  carte: '0 1px 2px rgba(20,30,70,.06), 0 4px 14px rgba(20,30,70,.05)',
  carteSombre: '0 1px 2px rgba(0,0,0,.4)',
  telephone: '0 20px 50px rgba(10,20,60,.35)',
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
export const largeurBarreLaterale = 236;
/** Taille minimale d'une zone tactile, en pixels (NFR-009). */
export const zoneTactileMin = 44;
