/**
 * Notifications non lues sur l'accueil (prd.md §18, 0.3.3) : « Votre planning de la semaine n
 * est approuvé » (PLN-012 CA2). Toucher une notification ouvre la semaine et la marque lue ;
 * le centre complet, avec le push, arrive en 0.3.8.
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

export function MesNotifications() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const { client, etat } = useSession();
  const [non_lues, setNonLues] = useState<Notification[]>([]);
  const lecteur =
    etat.statut === 'connecte' && etat.perimetre.actions.includes('notifications.lire');

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
  const jour = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(
          new Date(`${iso}T12:00:00`),
        )
      : '';

  function ouvrir(n: Notification) {
    setNonLues((liste) => liste.filter((x) => x.id !== n.id));
    void client.notifications.lue(n.id).catch(() => undefined);
    // Un planning à décider se décide au portail ; ici, la notification se marque lue.
    if (n.donnees.semaine && n.type !== 'planning_soumis') {
      routeur.push({ pathname: '/semaine', params: { jour: n.donnees.semaine } });
    }
  }

  return (
    <Carte
      style={{
        borderLeftWidth: 3,
        borderLeftColor: non_lues.some((n) => n.type === 'revision_demandee')
          ? p.attention
          : p.succes,
      }}
    >
      <View style={styles.titre}>
        <Texte variante="sousTitre" style={{ flex: 1 }}>
          {t('notifications.titre', { count: non_lues.length })}
        </Texte>
        {non_lues.length > 1 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setNonLues([]);
              void client.notifications.toutesLues().catch(() => undefined);
            }}
            style={styles.toutVu}
          >
            <Text style={[styles.toutVuTexte, { color: p.texte }]}>
              {t('notifications.toutVu')}
            </Text>
          </Pressable>
        )}
      </View>
      {non_lues.map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          accessibilityHint={n.donnees.semaine ? t('notifications.voir') : undefined}
          onPress={() => ouvrir(n)}
          style={({ pressed }) => [
            styles.ligne,
            { borderTopColor: p.ligne },
            pressed && { opacity: 0.7 },
          ]}
        >
          <MaterialIcons
            name={
              n.type === 'revision_demandee'
                ? 'rate-review'
                : n.type === 'remplacement_attribue'
                  ? 'swap-horiz'
                  : 'check-circle'
            }
            size={22}
            color={
              n.type === 'revision_demandee'
                ? p.attention
                : n.type === 'remplacement_attribue'
                  ? p.info
                  : p.succes
            }
          />
          <Text style={[styles.texte, { color: p.texte }]}>
            {t(`notifications.${n.type}`, {
              numero: n.donnees.numero_semaine,
              nom: n.donnees.nom,
              debut: jour(n.donnees.debut),
              fin: jour(n.donnees.fin),
              suite:
                n.donnees.motif === 'modification'
                  ? t('notifications.versionModification', { version: n.donnees.version })
                  : n.donnees.version && n.donnees.version > 1
                    ? t('notifications.version', { version: n.donnees.version })
                    : '',
            })}
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
