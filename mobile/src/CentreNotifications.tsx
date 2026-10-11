/**
 * Centre de notifications au téléphone (NOT-001) : lues et non lues, les plus récentes
 * d'abord ; toucher une notification la marque lue et ouvre la semaine qu'elle concerne (CA1).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Notification } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alerte, Bouton, Carte, Texte, usePalette } from './composants';
import { police } from './polices';
import { messageErreur, useSession } from './session';
import {
  iconeNotification,
  semaineDeNotification,
  texteNotification,
  visiteDeNotification,
} from './textesNotifications';

export function CentreNotifications() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const { client, etat } = useSession();
  const fuseau = etat.statut === 'connecte' ? etat.perimetre.pays_actif?.fuseau : undefined;
  const [liste, setListe] = useState<Notification[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(
    () =>
      client.notifications
        .centre()
        .then((r) => {
          setListe(r.notifications);
          setErreur(null);
        })
        .catch((e: unknown) => setErreur(messageErreur(e, t('erreurs.reseau')))),
    [client, t],
  );

  useEffect(() => {
    let actif = true;
    void Promise.resolve().then(() => {
      if (actif) void charger();
    });
    return () => {
      actif = false;
    };
  }, [charger]);

  const quand = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: fuseau,
    }).format(new Date(iso));

  function ouvrir(n: Notification) {
    if (!n.lue_le) {
      setListe(
        (l) => l?.map((x) => (x.id === n.id ? { ...x, lue_le: new Date().toISOString() } : x)) ?? l,
      );
      void client.notifications.lue(n.id).catch(() => undefined);
    }
    const semaine = semaineDeNotification(n);
    const visite = visiteDeNotification(n);
    if (visite) routeur.push({ pathname: '/rapport/[id]', params: { id: visite } });
    else if (semaine) routeur.push({ pathname: '/semaine', params: { jour: semaine } });
  }

  if (erreur) return <Alerte type="erreur">{erreur}</Alerte>;
  if (!liste) return <Texte variante="discret">{t('session.chargement')}</Texte>;
  if (liste.length === 0) return <Texte variante="discret">{t('notifications.aucune')}</Texte>;
  const nonLues = liste.filter((n) => !n.lue_le).length;
  return (
    <View style={{ gap: 12 }}>
      {nonLues > 0 && (
        <Bouton
          secondaire
          libelle={t('notifications.toutVu')}
          onPress={() =>
            void client.notifications
              .toutesLues()
              .then((r) => setListe(r.notifications))
              .catch(() => undefined)
          }
        />
      )}
      <Carte style={{ paddingVertical: 4 }}>
        {liste.map((n, i) => {
          const icone = iconeNotification(n, p);
          return (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityState={{ selected: !n.lue_le }}
              accessibilityHint={
                semaineDeNotification(n) || visiteDeNotification(n)
                  ? t('notifications.voir')
                  : undefined
              }
              onPress={() => ouvrir(n)}
              style={({ pressed }) => [
                styles.ligne,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.ligne },
                pressed && { opacity: 0.7 },
              ]}
            >
              <MaterialIcons
                name={icone.nom}
                size={22}
                color={icone.couleur}
                style={styles.icone}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={[
                    styles.texte,
                    { color: p.texte, fontFamily: n.lue_le ? police.texte : police.texteFort },
                  ]}
                >
                  {texteNotification(n, t, i18n.language, fuseau)}
                </Text>
                <Texte variante="discret">
                  {quand(n.cree_le)}
                  {n.lue_le ? '' : ` · ${t('notifications.nonLue')}`}
                </Texte>
              </View>
              {!n.lue_le && <View style={[styles.point, { backgroundColor: p.info }]} />}
            </Pressable>
          );
        })}
      </Carte>
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  icone: { marginTop: 1 },
  texte: { fontSize: 15, lineHeight: 21 },
  point: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
});
