import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
} from '@expo-google-fonts/dm-sans';
import {
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

/** Polices de la maquette INNOV CRM, embarquées dans l'application (aucun appel réseau). */
export const POLICES = {
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
};

export const police = {
  titre: 'PlusJakartaSans_700Bold',
  titreFort: 'PlusJakartaSans_800ExtraBold',
  texte: 'DMSans_400Regular',
  texteMoyen: 'DMSans_500Medium',
  texteFort: 'DMSans_600SemiBold',
} as const;
