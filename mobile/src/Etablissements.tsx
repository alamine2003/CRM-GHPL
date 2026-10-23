import type { Etablissement } from '@innov/api-client';
import { rayon } from '@innov/design';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Etiquette, Texte, usePalette } from './composants';
import { police } from './polices';

export function Pilule({
  libelle,
  actif,
  onPress,
  rang,
  marque,
}: {
  libelle: string;
  actif: boolean;
  onPress: () => void;
  /** Rang de présentation, en carré orange devant le libellé (produits du rapport). */
  rang?: number;
  /** Devant le libellé : le carré du potentiel (filtres des prospects). */
  marque?: ReactNode;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={rang ? `${rang}. ${libelle}` : libelle}
      onPress={onPress}
      style={[
        styles.pilule,
        actif
          ? { backgroundColor: p.accentPlein, borderColor: p.accentPlein }
          : { borderColor: p.ligne, backgroundColor: p.surface },
      ]}
    >
      {rang ? (
        <View style={[styles.rang, { backgroundColor: p.orange }]}>
          <Text style={styles.rangTexte}>{rang}</Text>
        </View>
      ) : null}
      {marque}
      <Text style={[styles.piluleTexte, { color: actif ? p.accentTexte : p.texte }]}>
        {libelle}
      </Text>
    </Pressable>
  );
}

export function LigneEtablissement({ etablissement }: { etablissement: Etablissement }) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <View style={[styles.ligne, { borderColor: p.ligne }]}>
      <View style={{ flex: 1 }}>
        <Texte variante="fort">{etablissement.nom}</Texte>
        <Texte variante="discret">
          {[etablissement.type_libelle, etablissement.secteur.libelle].join(' · ')}
        </Texte>
      </View>
      {etablissement.statut === 'a_valider' && (
        <Etiquette>{t('prospect.statuts.a_valider')}</Etiquette>
      )}
      <MaterialIcons
        name={etablissement.a_coordonnees ? 'gps-fixed' : 'location-off'}
        size={18}
        color={etablissement.a_coordonnees ? '#1E9E6A' : '#C2410C'}
        accessibilityLabel={
          etablissement.a_coordonnees
            ? t('etablissement.champs.position')
            : t('etablissement.sansGps')
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pilules: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // .pill de la maquette : 44 px, texte de 14.
  pilule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: rayon,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  piluleTexte: { fontFamily: police.texteMoyen, fontSize: 14, lineHeight: 20 },
  rang: { width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  rangTexte: { color: '#151B30', fontFamily: police.titreFort, fontSize: 12 },
});
