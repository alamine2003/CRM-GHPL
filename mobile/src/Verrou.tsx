import { marque } from '@innov/design';
import * as LocalAuthentication from 'expo-local-authentication';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Programme } from '@innov/api-client';
import { lire } from './baseLocale';
import { Alerte, Bouton, Icone } from './composants';
import { useTablette } from './disposition';
import { CLE_PROGRAMME } from './Execution';
import { police } from './polices';
import { useSession } from './session';

/** Délai par défaut en arrière-plan au-delà duquel l'application se verrouille (SEC-004) ;
 * le pays le règle de 5 à 30 minutes (DC-59), lu avec le programme gardé sur le téléphone. */
export const DELAI_VERROU_MS = 15 * 60 * 1000;

async function delaiDuPays(): Promise<number> {
  const programme = await lire<Partial<Programme>>(CLE_PROGRAMME).catch(() => null);
  const minutes = programme?.valeur?.verrouillage_minutes;
  return typeof minutes === 'number' && minutes > 0 ? minutes * 60 * 1000 : DELAI_VERROU_MS;
}

/** Horloge remplaçable dans les tests (figer Date.now bloquerait React). */
export const horloge = { maintenant: () => Date.now() };

/**
 * Verrouillage local : après le délai du pays en arrière-plan (15 minutes par défaut), la session reste ouverte mais
 * l'écran demande la biométrie ou le code du téléphone. Un téléphone sans aucune
 * protection ne peut pas déverrouiller : il faut se reconnecter.
 */
export function Verrou({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const tablette = useTablette();
  const marges = useSafeAreaInsets();
  const { etat, deconnexion } = useSession();
  const connecte = etat.statut === 'connecte';
  const [verrouille, setVerrouille] = useState(false);
  const [sansProtection, setSansProtection] = useState(false);
  // 0.9.8 : l'écran dit le délai réel du pays, pas un délai fixe.
  const [minutes, setMinutes] = useState(DELAI_VERROU_MS / 60000);
  const quitteeLe = useRef<number | null>(null);

  const deverrouiller = useCallback(async () => {
    const niveau = await LocalAuthentication.getEnrolledLevelAsync();
    if (niveau === LocalAuthentication.SecurityLevel.NONE) {
      setSansProtection(true);
      return;
    }
    const resultat = await LocalAuthentication.authenticateAsync({
      promptMessage: t('mobile.verrou.invite'),
    });
    if (resultat.success) setVerrouille(false);
  }, [t]);
  // Le gestionnaire d'AppState est abonné une fois : il lit la dernière version par référence.
  const demanderDeverrouillage = useRef(deverrouiller);
  useEffect(() => {
    demanderDeverrouillage.current = deverrouiller;
  }, [deverrouiller]);

  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (statut) => {
      if (statut === 'background') quitteeLe.current = horloge.maintenant();
      else if (statut === 'active' && quitteeLe.current !== null) {
        const absence = horloge.maintenant() - quitteeLe.current;
        quitteeLe.current = null;
        void delaiDuPays().then((delai) => {
          if (absence < delai) return;
          setMinutes(Math.round(delai / 60000));
          setVerrouille(true);
          void demanderDeverrouillage.current();
        });
      }
    });
    return () => abonnement.remove();
  }, []);

  if (!verrouille || !connecte) return children;

  // Maquette 1.5.3 : un écran marine plein, centré, avec le filet orange en haut.
  const quitter = () => {
    setVerrouille(false);
    setSansProtection(false);
    void deconnexion();
  };
  return (
    <View style={[styles.ecran, { paddingTop: marges.top, paddingBottom: marges.bottom }]}>
      <View style={[styles.filet, { top: marges.top }]} />
      <View style={tablette ? styles.corpsLarge : styles.corps}>
        <View style={[styles.icone, tablette && styles.iconeLarge]}>
          <Icone nom="lock" taille={tablette ? 38 : 32} couleur="#FFFFFF" />
        </View>
        <View>
          <Text
            accessibilityRole="header"
            style={[styles.titre, tablette && styles.titreLarge, { textAlign: 'center' }]}
          >
            {t('mobile.verrou.titre')}
          </Text>
          <Text style={[styles.texte, tablette && styles.texteLarge]}>
            {t('mobile.verrou.texte', { minutes })}
          </Text>
        </View>
        {sansProtection ? (
          <View style={styles.pile}>
            <Alerte type="info">{t('mobile.verrou.sansProtection')}</Alerte>
            <Bouton
              variante="clair"
              libelle={t('session.deconnexion')}
              style={tablette ? { minWidth: 280, alignSelf: 'center' } : undefined}
              onPress={quitter}
            />
          </View>
        ) : (
          <>
            <Bouton
              variante="clair"
              libelle={t('mobile.verrou.deverrouiller')}
              style={tablette ? { minWidth: 280 } : { alignSelf: 'stretch' }}
              onPress={() => void deverrouiller()}
            />
            <Text style={styles.note}>{t('mobile.verrou.note')}</Text>
            <Bouton
              variante="clairContour"
              petit
              libelle={t('session.deconnexion')}
              onPress={quitter}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: {
    flex: 1,
    backgroundColor: marque.bleuMarine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filet: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: marque.orange },
  corps: {
    alignSelf: 'stretch',
    paddingHorizontal: 28,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 28,
  },
  corpsLarge: { width: 440, maxWidth: '100%', alignItems: 'center', gap: 30 },
  pile: { alignSelf: 'stretch', gap: 12, alignItems: 'center' },
  icone: {
    width: 72,
    height: 72,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconeLarge: { width: 84, height: 84 },
  titre: {
    color: '#FFFFFF',
    fontFamily: police.titreFort,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  titreLarge: { fontSize: 34, lineHeight: 40, letterSpacing: -0.7 },
  texte: {
    color: '#C9D2EC',
    fontFamily: police.texte,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 10,
  },
  texteLarge: { fontSize: 17, lineHeight: 26, marginTop: 12 },
  note: { color: '#8F9CC7', fontFamily: police.texte, fontSize: 13, textAlign: 'center' },
});
