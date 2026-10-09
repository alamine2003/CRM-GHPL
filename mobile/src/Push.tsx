/**
 * NOT-002 (0.8.5) : notifications push. Connecté, le téléphone demande l'autorisation, puis donne
 * son adresse Expo au serveur ; toucher une notification ouvre l'objet concerné, y compris quand
 * l'application était fermée (CA1). Le texte affiché vient du serveur, sans nom ni donnée de
 * santé (CA2) ; seules les données jointes (identifiants, dates) servent à ouvrir l'objet.
 */
import type { Notification as NotificationApi } from '@innov/api-client';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useSession } from './session';
import { semaineDeNotification, visiteDeNotification } from './textesNotifications';

/** Les données jointes au push par le serveur (`apps/notifications/push.py`). */
export type DonneesPush = {
  notification?: string;
  type?: NotificationApi['type'];
  semaine?: string;
  visite?: string;
};

/** Où ouvrir la notification : le rapport à reprendre, la semaine, sinon le centre. */
export function destinationPush(d: DonneesPush) {
  const n = { type: d.type, donnees: d } as unknown as NotificationApi;
  const visite = d.type ? visiteDeNotification(n) : undefined;
  if (visite) return { pathname: '/rapport/[id]', params: { id: visite } } as const;
  const semaine = d.type ? semaineDeNotification(n) : undefined;
  if (semaine) return { pathname: '/semaine', params: { jour: semaine } } as const;
  return { pathname: '/notifications' } as const;
}

// Application ouverte : la notification s'affiche quand même, en bandeau.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Sans affichage : inscrit l'adresse push et ouvre l'objet d'une notification touchée. */
export function Push() {
  const { client, etat } = useSession();
  const routeur = useRouter();
  const connecte = etat.statut === 'connecte';
  const ouverte = useRef<string | null>(null);

  useEffect(() => {
    if (!connecte || Platform.OS === 'web') return;
    let actif = true;
    const ouvrir = (reponse: Notifications.NotificationResponse | null) => {
      if (!reponse || !actif) return;
      const id = reponse.notification.request.identifier;
      if (ouverte.current === id) return; // déjà ouverte (démarrage puis écouteur)
      ouverte.current = id;
      const d = (reponse.notification.request.content.data ?? {}) as DonneesPush;
      if (d.notification) void client.notifications.lue(d.notification).catch(() => undefined);
      routeur.push(destinationPush(d));
    };
    void (async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;
        const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)
          ?.projectId;
        const { data } = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        await client.push.enregistrer(data);
      } catch {
        // Sans réseau ou sans service push (émulateur) : le centre de notifications suffit.
      }
    })();
    // CA1 : l'application fermée, le toucher l'a ouverte ; on va à l'objet.
    void Notifications.getLastNotificationResponseAsync().then(ouvrir);
    const abonnement = Notifications.addNotificationResponseReceivedListener(ouvrir);
    return () => {
      actif = false;
      abonnement.remove();
    };
  }, [client, connecte, routeur]);
  return null;
}
