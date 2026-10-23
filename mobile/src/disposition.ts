import { useWindowDimensions } from 'react-native';

/** Largeur à partir de laquelle l'application prend la disposition tablette (maquette 1180 × 820). */
export const LARGEUR_TABLETTE = 900;

/** Tablette (barre latérale, deux volets) ou téléphone (onglets en bas, une colonne). */
export function useTablette() {
  return useWindowDimensions().width >= LARGEUR_TABLETTE;
}
