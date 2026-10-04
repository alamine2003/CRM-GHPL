import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Alerte, Bouton, Champ, Entete, usePalette } from '../src/composants';
import { messageErreur, useSession } from '../src/session';

/** Connexion du délégué (USR-001, SEC-002). */
export default function Connexion() {
  const { t } = useTranslation();
  const p = usePalette();
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
      style={{ flex: 1, backgroundColor: p.fond }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Entete sousTitre={t('commun.sousTitre')} />
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: 26, fontWeight: '700', color: p.texte }}
        >
          {modeOubli ? t('oubli.titre') : t('connexion.titre')}
        </Text>
        {etat.statut === 'anonyme' && etat.sessionExpiree && !erreur && (
          <Alerte type="info">{t('session.expiree')}</Alerte>
        )}
        {info && <Alerte type="succes">{info}</Alerte>}
        {erreur && <Alerte type="erreur">{erreur}</Alerte>}
        {modeOubli && <Text style={{ color: p.texteSecondaire }}>{t('oubli.explication')}</Text>}
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
          <View style={{ gap: 6 }}>
            <Champ
              libelle={t('connexion.motDePasse')}
              value={motDePasse}
              onChangeText={setMotDePasse}
              secureTextEntry={!visible}
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
            />
            <Pressable accessibilityRole="button" onPress={() => setVisible((v) => !v)}>
              <Text style={{ color: p.info }}>
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
          style={{ alignSelf: 'center', padding: 8 }}
        >
          <Text style={{ color: p.info, fontWeight: '600' }}>
            {modeOubli ? t('oubli.retour') : t('connexion.oublie')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
