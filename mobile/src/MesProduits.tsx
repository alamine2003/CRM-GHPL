import type { Portefeuille } from '@innov/api-client';
import { marque } from '@innov/design';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Carte, Texte, usePalette } from './composants';
import { police } from './polices';
import { useSession } from './session';

const APERCU = 8;

/**
 * Produits du portefeuille des réseaux de l'utilisateur (ORG-004) : ce sont les seuls que
 * le rapport de visite lui proposera (RG-033).
 */
export function MesProduits() {
  const { t } = useTranslation();
  const p = usePalette();
  const { client } = useSession();
  const [portefeuilles, setPortefeuilles] = useState<Portefeuille[] | null>(null);
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  useEffect(() => {
    let actif = true;
    client.referentiel
      .monPortefeuille()
      .then((liste) => actif && setPortefeuilles(liste))
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [client]);

  if (!portefeuilles || portefeuilles.length === 0) return null;
  const total = new Set(portefeuilles.flatMap((x) => x.produits.map((pr) => pr.id))).size;

  return (
    <Carte>
      <View style={styles.titre}>
        <View style={[styles.icone, { backgroundColor: p.orangeDoux }]}>
          <MaterialIcons name="medication" size={20} color={marque.orange} />
        </View>
        <View style={{ flex: 1 }}>
          <Texte variante="sousTitre">{t('referentiel.mesProduits.titre')}</Texte>
          <Texte variante="discret">{t('referentiel.mesProduits.texte')}</Texte>
        </View>
        <View style={[styles.compteur, { backgroundColor: marque.orange }]}>
          <Text style={styles.compteurTexte}>{total}</Text>
        </View>
      </View>
      {total === 0 && <Texte variante="discret">{t('referentiel.mesProduits.vide')}</Texte>}
      {portefeuilles.map(({ reseau, produits }) => {
        const ouvert = ouverts.has(reseau.id);
        const visibles = ouvert ? produits : produits.slice(0, APERCU);
        return (
          <View key={reseau.id} style={{ gap: 8 }}>
            <Texte variante="libelle">
              {t('referentiel.mesProduits.reseau', {
                reseau: reseau.libelle,
                nombre: t('referentiel.produit.nombre', { count: produits.length }),
              })}
            </Texte>
            <View style={styles.pastilles}>
              {visibles.map((produit) => (
                <View
                  key={produit.id}
                  style={[styles.pastille, { borderColor: p.ligne, backgroundColor: p.surface2 }]}
                >
                  <Text style={[styles.pastilleTexte, { color: p.texte }]}>{produit.libelle}</Text>
                </View>
              ))}
              {produits.length > APERCU && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setOuverts((avant) => {
                      const apres = new Set(avant);
                      if (apres.has(reseau.id)) apres.delete(reseau.id);
                      else apres.add(reseau.id);
                      return apres;
                    })
                  }
                  style={[styles.pastille, { borderColor: marque.orange }]}
                >
                  <Text style={[styles.pastilleTexte, { color: marque.orange }]}>
                    {ouvert
                      ? t('commun.fermer')
                      : t('referentiel.portefeuille.plus', { count: produits.length - APERCU })}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </Carte>
  );
}

const styles = StyleSheet.create({
  titre: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icone: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compteur: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  compteurTexte: { color: '#FFFFFF', fontFamily: police.titreFort, fontSize: 14 },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pastille: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pastilleTexte: { fontFamily: police.texte, fontSize: 13 },
});
