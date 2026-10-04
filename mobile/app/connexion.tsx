import { marque } from '@innov/design';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alerte, Bouton, Champ, Logo, Texte, usePalette } from '../src/composants';
import { police } from '../src/polices';
import { messageErreur, useSession } from '../src/session';

/** Connexion du délégué (USR-001, SEC-002) et demande de lien (USR-005). */
export default function Connexion() {
  const { t } = useTranslation();
  const p = usePalette();
  const marges = useSafeAreaInsets();
  const { etat, connexion, client } = useSession();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [modeOubli, setModeOubli] = useState(false);

  if (etat.statut === 'connecte') return <Redirect href="/" />;

  async function seConnecter() {
    setErreur(null);
    setEnvoi(true);
    try {
      await connexion(identifiant, motDePasse);
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setMotDePasse('');
    } finally {
      setEnvoi(false);
    }
  }

  async function demanderLien() {
    setErreur(null);
    setEnvoi(true);
    try {
      await client.demanderReinitialisation(identifiant);
      setInfo(t('oubli.envoye'));
      setModeOubli(false);
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: marque.bleuMarine }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={[styles.hero, { paddingTop: marges.top + 32 }]}>
          <View style={styles.marque}>
            <Logo taille={44} />
            <View>
              <Text style={styles.produit}>{t('commun.produit')}</Text>
              <Text style={styles.organisation}>{t('marque.organisation')}</Text>
            </View>
          </View>
          <Text style={styles.bienvenue}>{t('mobile.bienvenue')}</Text>
          <Text style={styles.accroche}>{t('mobile.sousTitreConnexion')}</Text>
        </View>

        <View
          style={[styles.feuille, { backgroundColor: p.fond, paddingBottom: marges.bottom + 24 }]}
        >
          <Texte accessibilityRole="header" variante="titre">
            {modeOubli ? t('oubli.titre') : t('connexion.titre')}
          </Texte>
          {etat.statut === 'anonyme' && etat.sessionExpiree && !erreur && (
            <Alerte type="info">{t('session.expiree')}</Alerte>
          )}
          {info && <Alerte type="succes">{info}</Alerte>}
          {erreur && <Alerte type="erreur">{erreur}</Alerte>}
          {modeOubli && <Texte variante="discret">{t('oubli.explication')}</Texte>}
          <Champ
            libelle={modeOubli ? t('oubli.identifiant') : t('connexion.identifiant')}
            placeholder={t('connexion.aideIdentifiant')}
            value={identifiant}
            onChangeText={setIdentifiant}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
          />
          {!modeOubli && (
            <View style={{ gap: 8 }}>
              <Champ
                libelle={t('connexion.motDePasse')}
                value={motDePasse}
                onChangeText={setMotDePasse}
                secureTextEntry={!visible}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setVisible((v) => !v)}
                style={{ alignSelf: 'flex-end', paddingVertical: 4 }}
              >
                <Text style={[styles.lien, { color: p.info }]}>
                  {visible ? t('connexion.masquer') : t('connexion.afficher')}
                </Text>
              </Pressable>
            </View>
          )}
          <Bouton
            libelle={
              modeOubli
                ? t('oubli.envoyer')
                : envoi
                  ? t('connexion.enCours')
                  : t('connexion.seConnecter')
            }
            chargement={envoi}
            onPress={() => void (modeOubli ? demanderLien() : seConnecter())}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setModeOubli((m) => !m);
              setErreur(null);
            }}
            style={{ alignSelf: 'center', padding: 10 }}
          >
            <Text style={[styles.lien, { color: p.info }]}>
              {modeOubli ? t('oubli.retour') : t('connexion.oublie')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 24, paddingBottom: 40, gap: 6 },
  marque: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
  produit: { color: '#FFFFFF', fontFamily: police.titreFort, fontSize: 18 },
  organisation: { color: '#B9C4E8', fontFamily: police.texte, fontSize: 12 },
  bienvenue: { color: '#FFFFFF', fontFamily: police.titreFort, fontSize: 30 },
  accroche: { color: '#B9C4E8', fontFamily: police.texte, fontSize: 15, lineHeight: 21 },
  feuille: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 16,
  },
  lien: { fontFamily: police.texteFort, fontSize: 14 },
});
