/**
 * NOT-005 (0.8.6) : les notifications que la personne reçoit sur ce téléphone. Chacune se coupe
 * ou se rétablit ; les obligatoires (révision, correction, escalade, et celles du pays) restent.
 * Le centre de notifications, lui, les garde toutes.
 */
import type { PreferenceNotification } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';
import { Carte, Etiquette, Texte, usePalette } from './composants';
import { messageErreur, useSession } from './session';

export function CartePreferences() {
  const { t } = useTranslation();
  const p = usePalette();
  const { client } = useSession();
  const [liste, setListe] = useState<PreferenceNotification[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    client.preferences
      .lire()
      .then((l) => actif && setListe(l))
      .catch(() => actif && setErreur(t('preferences.sansReseau')));
    return () => {
      actif = false;
    };
  }, [client, t]);

  if (liste?.length === 0) return null;

  const basculer = (type: string, push: boolean) => {
    if (!liste) return;
    const avant = liste;
    const suite = liste.map((x) => (x.type === type ? { ...x, push } : x));
    setListe(suite);
    setErreur(null);
    const coupes = suite.filter((x) => !x.push && !x.obligatoire).map((x) => x.type);
    client.preferences
      .changer(coupes)
      .then(setListe)
      .catch((e) => {
        setListe(avant);
        setErreur(messageErreur(e, t('preferences.sansReseau')));
      });
  };

  return (
    <Carte>
      <Texte variante="sousTitre" style={{ marginBottom: 6 }}>
        {t('preferences.titre')}
      </Texte>
      <Texte variante="discret" style={{ marginBottom: 8 }}>
        {t('preferences.aide')}
      </Texte>
      {erreur && (
        <Texte variante="discret" style={{ marginBottom: 8 }}>
          {erreur}
        </Texte>
      )}
      {liste?.map((x, i) => (
        <View
          key={x.type}
          style={[
            styles.ligne,
            { borderBottomColor: p.ligne },
            i === liste.length - 1 && { borderBottomWidth: 0 },
          ]}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Texte>{t(`preferences.types.${x.type}`)}</Texte>
            {x.obligatoire && (
              <View style={{ flexDirection: 'row' }}>
                <Etiquette ton="neutre">{t('preferences.obligatoire')}</Etiquette>
              </View>
            )}
          </View>
          <Switch
            accessibilityLabel={t(`preferences.types.${x.type}`)}
            accessibilityHint={x.obligatoire ? t('preferences.obligatoireAide') : undefined}
            value={x.push}
            disabled={x.obligatoire}
            onValueChange={(push) => basculer(x.type, push)}
            // Coupée, la piste reste visible (gris) ; le bouton est blanc dans les deux états.
            trackColor={{ false: p.texteSecondaire, true: p.succes }}
            thumbColor="#FFFFFF"
          />
        </View>
      ))}
    </Carte>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
