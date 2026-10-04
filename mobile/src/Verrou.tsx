import { marque } from '@innov/design';
import * as LocalAuthentication from 'expo-local-authentication';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alerte, Bouton, Logo } from './composants';
import { police } from './polices';
import { useSession } from './session';

/** Délai en arrière-plan au-delà duquel l'application se verrouille (SEC-004). */
export const DELAI_VERROU_MS = 5 * 60 * 1000;

/** Horloge remplaçable dans les tests (figer Date.now bloquerait React). */
export const horloge = { maintenant: () => Date.now() };

/**
 * Verrouillage local : après 5 minutes en arrière-plan, la session reste ouverte mais
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
        if (horloge.maintenant() - quitteeLe.current >= DELAI_VERROU_MS) {
          setVerrouille(true);
          void demanderDeverrouillage.current();
        }
        quitteeLe.current = null;
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
        <Text style={styles.texte}>{t('mobile.verrou.texte')}</Text>
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
