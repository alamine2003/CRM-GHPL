/**
 * Centre de notifications (NOT-001), selon la maquette 1.4.9 : lues et non lues, les plus
 * récentes d'abord ; une non lue a son fond teinté et sa pastille pleine. Toucher une
 * notification la marque lue et ouvre ce qu'elle attend (CA1). Sur la tablette, la liste se
 * groupe par semaine et les réglages de ce qui arrive en notification (NOT-005) sont à droite.
 */
import type { Notification } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alerte, Bouton, Carte, Icone, Texte, usePalette } from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { police } from './polices';
import { ListePreferences } from './Preferences';
import { messageErreur, useSession } from './session';
import {
  couleurNotification,
  semaineDeNotification,
  texteNotification,
  visiteDeNotification,
} from './textesNotifications';

/** Lundi (date locale, AAAA-MM-JJ) de la semaine d'un instant. */
function lundiDe(d: Date) {
  const l = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, '0')}-${String(l.getDate()).padStart(2, '0')}`;
}

export function EcranNotifications() {
  const { t, i18n } = useTranslation();
  const routeur = useRouter();
  const tablette = useTablette();
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

  // « lun. 12 octobre, 08:30 » : la date, puis l'heure, à l'heure du pays.
  const quand = (iso: string) => {
    const d = new Date(iso);
    const jour = new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      timeZone: fuseau,
    }).format(d);
    const heure = new Intl.DateTimeFormat(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: fuseau,
    }).format(d);
    return `${jour}, ${heure}`;
  };

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

  const nonLues = liste?.filter((n) => !n.lue_le).length ?? 0;
  const toutLu =
    nonLues > 0 ? (
      <Bouton
        variante="contour"
        petit
        libelle={t('notifications.toutVu')}
        onPress={() =>
          void client.notifications
            .toutesLues()
            .then((r) => setListe(r.notifications))
            .catch(() => undefined)
        }
        style={tablette ? undefined : { alignSelf: 'flex-start' }}
      />
    ) : null;

  const lignes = (l: Notification[]) => (
    <Carte marge={0} style={{ overflow: 'hidden' }}>
      {l.map((n, i) => (
        <Ligne
          key={n.id}
          notification={n}
          texte={texteNotification(n, t, i18n.language, fuseau)}
          quand={quand(n.cree_le)}
          chevron={tablette}
          derniere={i === l.length - 1}
          surAppui={() => ouvrir(n)}
        />
      ))}
    </Carte>
  );

  let contenu;
  if (erreur) contenu = <Alerte type="erreur">{erreur}</Alerte>;
  else if (!liste) contenu = <Texte variante="discret">{t('session.chargement')}</Texte>;
  else if (liste.length === 0)
    contenu = <Texte variante="discret">{t('notifications.aucune')}</Texte>;
  else if (!tablette) contenu = lignes(liste);
  else {
    // Tablette : « Cette semaine », « La semaine dernière », « Plus tôt ».
    const cette = lundiDe(new Date());
    const avant = new Date(`${cette}T12:00:00`);
    avant.setDate(avant.getDate() - 7);
    const derniere = lundiDe(avant);
    const groupes = [
      { cle: 'cetteSemaine', notifs: liste.filter((n) => lundiDe(new Date(n.cree_le)) >= cette) },
      {
        cle: 'semaineDerniere',
        notifs: liste.filter((n) => {
          const l = lundiDe(new Date(n.cree_le));
          return l < cette && l >= derniere;
        }),
      },
      { cle: 'plusTot', notifs: liste.filter((n) => lundiDe(new Date(n.cree_le)) < derniere) },
    ].filter((g) => g.notifs.length > 0);
    contenu = (
      <View style={styles.colonne}>
        {groupes.map((g) => (
          <View key={g.cle} style={{ gap: 10 }}>
            <Texte variante="libelle" accessibilityRole="header" style={{ paddingHorizontal: 4 }}>
              {t(`notifications.groupes.${g.cle}`)}
            </Texte>
            {lignes(g.notifs)}
          </View>
        ))}
      </View>
    );
  }

  return (
    <Ecran
      titre={t('notifications.centre')}
      surTitre={
        liste
          ? nonLues > 0
            ? t('notifications.nonLues', { count: nonLues })
            : t('notifications.toutLu')
          : undefined
      }
      retour
      enteteTablette={{ action: toutLu }}
      droite={
        tablette ? (
          <View style={{ padding: 24 }}>
            <ListePreferences
              titre={t('preferences.titreTablette')}
              aide={t('preferences.aideIci')}
            />
          </View>
        ) : undefined
      }
      largeurDroite={340}
    >
      {!tablette && toutLu}
      {contenu}
    </Ecran>
  );
}

/** Une notification (.li) : pastille de 10 px, texte en gras tant qu'elle n'est pas lue. */
function Ligne({
  notification: n,
  texte,
  quand,
  chevron,
  derniere,
  surAppui,
}: {
  notification: Notification;
  texte: string;
  quand: string;
  chevron: boolean;
  derniere: boolean;
  surAppui: () => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const couleur = couleurNotification(n, p);
  const lue = !!n.lue_le;
  const destination = !!(semaineDeNotification(n) || visiteDeNotification(n));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !lue }}
      accessibilityHint={destination ? t('notifications.voir') : undefined}
      onPress={surAppui}
      style={({ pressed }) => [
        styles.ligne,
        chevron && styles.ligneLarge,
        !lue && { backgroundColor: p.surface2 },
        !derniere && { borderBottomWidth: 1, borderBottomColor: p.ligne },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View
        style={[styles.pastille, { borderColor: couleur }, !lue && { backgroundColor: couleur }]}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[
            chevron ? styles.texteLarge : styles.texte,
            { color: p.texte, fontFamily: lue ? police.texte : police.texteFort },
          ]}
        >
          {texte}
        </Text>
        <Texte variante="libelle" style={{ marginTop: 2 }}>
          {lue ? quand : `${quand} · ${t('notifications.nonLue')}`}
        </Texte>
      </View>
      {chevron && destination && <Icone nom="chevron-right" taille={16} couleur={p.texteDiscret} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  colonne: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 20 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  ligneLarge: { paddingVertical: 16, paddingHorizontal: 20 },
  pastille: { width: 10, height: 10, marginTop: 5, borderRadius: 5, borderWidth: 2 },
  texte: { fontSize: 14.5, lineHeight: 20 },
  texteLarge: { fontSize: 15, lineHeight: 21 },
});
