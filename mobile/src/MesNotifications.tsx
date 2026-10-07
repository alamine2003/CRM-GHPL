/**
 * Notifications non lues sur l'accueil (prd.md §18, 0.3.3) : « Votre planning de la semaine n
 * est approuvé » (PLN-012 CA2). Toucher une notification ouvre la semaine et la marque lue ;
 * « Toutes les notifications » mène au centre (NOT-001, 0.3.8). Le push arrive en 0.8.5.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Notification } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Carte, Texte, usePalette } from './composants';
import { police } from './polices';
import { useSession } from './session';
import {
  iconeNotification,
  semaineDeNotification,
  texteNotification,
  visiteDeNotification,
} from './textesNotifications';

export function MesNotifications() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const { client, etat } = useSession();
  const [non_lues, setNonLues] = useState<Notification[]>([]);
  const lecteur =
    etat.statut === 'connecte' && etat.perimetre.actions.includes('notifications.lire');
  const fuseau = etat.statut === 'connecte' ? etat.perimetre.pays_actif?.fuseau : undefined;

  useEffect(() => {
    let actif = true;
    if (!lecteur) return;
    client.notifications
      .liste()
      .then((resume) => {
        if (actif) setNonLues(resume.notifications.filter((n) => !n.lue_le));
      })
      // Sans réseau, l'accueil se passe de notifications.
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [lecteur, client]);

  if (non_lues.length === 0) return null;
  function ouvrir(n: Notification) {
    setNonLues((liste) => liste.filter((x) => x.id !== n.id));
    void client.notifications.lue(n.id).catch(() => undefined);
    const semaine = semaineDeNotification(n);
    const visite = visiteDeNotification(n);
    if (visite) routeur.push({ pathname: '/rapport/[id]', params: { id: visite } });
    else if (semaine) routeur.push({ pathname: '/semaine', params: { jour: semaine } });
  }

  return (
    <Carte
      style={{
        borderLeftWidth: 3,
        borderLeftColor: non_lues.some(
          (n) => n.type === 'revision_demandee' || n.type === 'correction_demandee',
        )
          ? p.attention
          : p.succes,
      }}
    >
      <View style={styles.titre}>
        <Texte variante="sousTitre" style={{ flex: 1 }}>
          {t('notifications.titre', { count: non_lues.length })}
        </Texte>
        <Pressable
          accessibilityRole="link"
          onPress={() => routeur.push('/notifications')}
          style={styles.toutVu}
        >
          <Text style={[styles.toutVuTexte, { color: p.texte }]}>
            {t('notifications.toutVoir')}
          </Text>
        </Pressable>
      </View>
      {non_lues.map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          accessibilityHint={
            semaineDeNotification(n) || visiteDeNotification(n)
              ? t('notifications.voir')
              : undefined
          }
          onPress={() => ouvrir(n)}
          style={({ pressed }) => [
            styles.ligne,
            { borderTopColor: p.ligne },
            pressed && { opacity: 0.7 },
          ]}
        >
          <MaterialIcons
            name={iconeNotification(n, p).nom}
            size={22}
            color={iconeNotification(n, p).couleur}
          />
          <Text style={[styles.texte, { color: p.texte }]}>
            {texteNotification(n, t, i18n.language, fuseau)}
          </Text>
          <MaterialIcons name="chevron-right" size={22} color={p.texteDiscret} />
        </Pressable>
      ))}
    </Carte>
  );
}

const styles = StyleSheet.create({
  titre: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  toutVu: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  toutVuTexte: { fontFamily: police.texteFort, fontSize: 14 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  texte: { flex: 1, fontFamily: police.texteFort, fontSize: 15 },
});
