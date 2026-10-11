import type { Portefeuille } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Carte, Texte, useLien } from './composants';
import { police } from './polices';
import { useSession } from './session';

const APERCU = 8;

/**
 * Produits du portefeuille des réseaux de l'utilisateur (ORG-004) : ce sont les seuls que
 * le rapport de visite lui proposera (RG-033).
 */
export function MesProduits() {
  const { t } = useTranslation();
  const lien = useLien();
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
        <Texte variante="sousTitre" style={{ flex: 1 }}>
          {t('referentiel.mesProduits.titre')}
        </Texte>
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
            <Texte>{visibles.map((produit) => produit.libelle).join(', ')}</Texte>
            <View>
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
                  style={styles.plus}
                >
                  <Text style={[styles.plusTexte, { color: lien }]}>
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
  titre: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  plus: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  plusTexte: { fontFamily: police.texteFort, fontSize: 14 },
});
