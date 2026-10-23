import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

/** Polices de la maquette, embarquées dans l'application (aucun appel réseau). */
export const POLICES = {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
};

export const police = {
  titreMoyen: 'PlusJakartaSans_600SemiBold',
  titre: 'PlusJakartaSans_700Bold',
  titreFort: 'PlusJakartaSans_800ExtraBold',
  texte: 'DMSans_400Regular',
  texteMoyen: 'DMSans_500Medium',
  texteFort: 'DMSans_600SemiBold',
  texteGras: 'DMSans_700Bold',
} as const;
