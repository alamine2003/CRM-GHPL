/**
 * Jetons de design d'INNOV CRM, direction « registre » (docs/design.md, 0.1.8).
 * Portail et application mobile lisent leurs couleurs ici : aucune couleur en dur ailleurs.
 * Encre marine pour la structure, orange réservé à « là où vous êtes et ce qui compte »,
 * fond papier, surfaces blanches séparées par des filets, sans ombre portée.
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
  actif: 'rgba(255,255,255,.08)',
  separateur: 'rgba(255,255,255,.10)',
  avatar: '#33457F',
} as const;

/** Ombre des seuls éléments flottants (menus, dialogues) ; aucune ombre sur les surfaces. */
export const ombreFlottante = '0 8px 24px rgba(15,26,61,.14)';

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
  fond: '#F5F6F8',
  surface: '#FFFFFF',
  surface2: '#F9FAFB',
  ligne: '#E2E5EB',
  texte: '#151B30',
  texteSecondaire: '#596178',
  texteDiscret: '#8A91A5',
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

/** Échelle typographique (docs/design.md §2) : taille / interligne en pixels. */
export const echelle = {
  titrePage: { taille: 20, interligne: 28, graisse: 700 },
  titreSection: { taille: 15, interligne: 22, graisse: 700 },
  texte: { taille: 14, interligne: 20, graisse: 400 },
  libelle: { taille: 12.5, interligne: 18, graisse: 500 },
  chiffre: { taille: 20, interligne: 24, graisse: 700 },
} as const;

/** Arrondi des boutons, champs et surfaces ; les puces prennent `rayonPuce`. */
export const rayon = 6;
export const rayonPuce = 4;
export const largeurBarreLaterale = 224;
/** Hauteur de la barre du haut du portail. */
export const hauteurBarre = 48;
/** Largeur maximale du contenu du portail. */
export const largeurContenu = 1280;
/** Taille minimale d'une zone tactile, en pixels (NFR-009). */
export const zoneTactileMin = 44;
