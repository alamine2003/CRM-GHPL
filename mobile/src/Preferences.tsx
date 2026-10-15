/**
 * NOT-005 (0.8.6) : les notifications que la personne reçoit sur ce téléphone. Chacune se coupe
 * ou se rétablit ; les obligatoires (révision, correction, escalade, et celles du pays) restent.
 * Le centre de notifications, lui, les garde toutes. Maquette 1.4.9 : la liste se pose dans une
 * carte (Profil) ou dans le volet droit du centre de notifications (tablette).
 */
import type { PreferenceNotification } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Carte, Interrupteur, Texte, usePalette } from './composants';
import { useTablette } from './disposition';
import { police } from './polices';
import { messageErreur, useSession } from './session';

export function CartePreferences() {
  const { t } = useTranslation();
  const tablette = useTablette();
  return (
    <Carte>
      <ListePreferences
        titre={t(tablette ? 'preferences.titreTablette' : 'preferences.titre')}
        aide={t('preferences.aide')}
      />
    </Carte>
  );
}

/** Titre, aide, puis une ligne par type de notification avec son interrupteur. */
export function ListePreferences({ titre, aide }: { titre: string; aide: string }) {
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
    <View style={{ gap: 8 }}>
      <Texte variante="sousTitre" accessibilityRole="header">
        {titre}
      </Texte>
      <Texte variante="libelle">{aide}</Texte>
      {erreur && <Texte variante="discret">{erreur}</Texte>}
      <View>
        {liste?.map((x, i) => (
          <View
            key={x.type}
            style={[
              styles.ligne,
              i < liste.length - 1 && { borderBottomWidth: 1, borderBottomColor: p.ligne },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.nom, { color: p.texte }]}>
                {t(`preferences.types.${x.type}`)}
              </Text>
              {x.obligatoire && <Texte variante="discret">{t('preferences.obligatoire')}</Texte>}
            </View>
            <Interrupteur
              libelle={t(`preferences.types.${x.type}`)}
              aide={x.obligatoire ? t('preferences.obligatoireAide') : undefined}
              valeur={x.push}
              desactive={x.obligatoire}
              surChangement={(push) => basculer(x.type, push)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
  },
  nom: { fontFamily: police.texteFort, fontSize: 14, lineHeight: 20 },
});
