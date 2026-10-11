import { marque } from '@innov/design';
import * as LocalAuthentication from 'expo-local-authentication';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Programme } from '@innov/api-client';
import { lire } from './baseLocale';
import { Alerte, Bouton, Logo } from './composants';
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
  return (
    <View
      style={[styles.ecran, { paddingTop: marges.top + 64, paddingBottom: marges.bottom + 24 }]}
    >
      <View style={styles.centre}>
        <Logo taille={56} />
        <Text accessibilityRole="header" style={styles.titre}>
          {t('mobile.verrou.titre')}
        </Text>
        <Text style={styles.texte}>{t('mobile.verrou.texte', { minutes })}</Text>
      </View>
      <View style={{ gap: 12 }}>
        {sansProtection ? (
          <>
            <Alerte type="info">{t('mobile.verrou.sansProtection')}</Alerte>
            <Bouton
              libelle={t('session.deconnexion')}
              onPress={() => {
                setVerrouille(false);
                setSansProtection(false);
                void deconnexion();
              }}
            />
          </>
        ) : (
          <>
            <Bouton
              libelle={t('mobile.verrou.deverrouiller')}
              onPress={() => void deverrouiller()}
            />
            <Bouton
              secondaire
              libelle={t('session.deconnexion')}
              onPress={() => {
                setVerrouille(false);
                void deconnexion();
              }}
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
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  centre: { alignItems: 'center', gap: 14 },
  titre: { color: '#FFFFFF', fontFamily: police.titreFort, fontSize: 26, textAlign: 'center' },
  texte: {
    color: '#B9C4E8',
    fontFamily: police.texte,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
});
