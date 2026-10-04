import { marque, rayon } from '@innov/design';
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
import { FiletDemonstration, MentionDemonstration } from '../src/Demonstration';
import { police } from '../src/polices';
import { messageErreur, useSession } from '../src/session';

/** Connexion du délégué (USR-001, SEC-002), code à usage unique (SEC-003) et demande de lien (USR-005). */
export default function Connexion() {
  const { t } = useTranslation();
  const p = usePalette();
  const marges = useSafeAreaInsets();
  const { etat, connexion, validerCode, client } = useSession();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [modeOubli, setModeOubli] = useState(false);
  const [jetonEtape, setJetonEtape] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [secours, setSecours] = useState(false);

  if (etat.statut === 'connecte') return <Redirect href="/" />;

  async function seConnecter() {
    setErreur(null);
    setEnvoi(true);
    try {
      const etape = await connexion(identifiant, motDePasse);
      setMotDePasse('');
      if (etape) {
        setJetonEtape(etape);
        setCode('');
      }
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setMotDePasse('');
    } finally {
      setEnvoi(false);
    }
  }

  async function envoyerCode() {
    if (!jetonEtape) return;
    setErreur(null);
    setEnvoi(true);
    try {
      await validerCode(jetonEtape, code);
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setCode('');
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
        <View style={[styles.hero, { paddingTop: marges.top + 20 }]}>
          <View style={styles.marque}>
            <Logo taille={32} />
            <View style={{ flex: 1 }}>
              <Text style={styles.produit}>{t('commun.produit')}</Text>
              <Text style={styles.organisation}>{t('marque.organisation')}</Text>
            </View>
            <MentionDemonstration />
          </View>
          <Text style={styles.bienvenue}>{t('mobile.bienvenue')}</Text>
          <Text style={styles.accroche}>{t('mobile.sousTitreConnexion')}</Text>
        </View>

        <View
          style={[styles.feuille, { backgroundColor: p.fond, paddingBottom: marges.bottom + 24 }]}
        >
          {jetonEtape ? (
            <>
              <Texte accessibilityRole="header" variante="titre">
                {t('code.titre')}
              </Texte>
              {erreur && <Alerte type="erreur">{erreur}</Alerte>}
              <Texte variante="discret">
                {secours ? t('code.explicationSecours') : t('code.explication')}
              </Texte>
              <Champ
                libelle={secours ? t('code.champSecours') : t('code.champ')}
                value={code}
                onChangeText={(v) =>
                  setCode(secours ? v.trim().slice(0, 20) : v.replace(/\D/g, '').slice(0, 6))
                }
                keyboardType={secours ? 'default' : 'number-pad'}
                autoCapitalize="none"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                autoFocus
                style={[
                  styles.code,
                  { borderColor: p.ligne, color: p.texte, backgroundColor: p.surface2 },
                ]}
              />
              <Bouton
                libelle={t('code.valider')}
                chargement={envoi}
                onPress={() => void envoyerCode()}
              />
              <View style={styles.liens}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setJetonEtape(null);
                    setErreur(null);
                  }}
                  style={{ padding: 10 }}
                >
                  <Text style={[styles.lien, { color: p.texteDiscret }]}>{t('code.retour')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setSecours((v) => !v);
                    setCode('');
                  }}
                  style={{ padding: 10 }}
                >
                  <Text style={[styles.lien, { color: marque.bleuMarine }]}>
                    {secours ? t('code.application') : t('code.secours')}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Texte accessibilityRole="header" variante="titre">
                {modeOubli ? t('oubli.titre') : t('connexion.titre')}
              </Texte>
              {etat.statut === 'anonyme' && etat.doubleAuthRequise && !erreur && (
                <Alerte type="info">{t('mobile.doubleAuthPortail')}</Alerte>
              )}
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
                    <Text style={[styles.lien, { color: marque.bleuMarine }]}>
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
                <Text style={[styles.lien, { color: marque.bleuMarine }]}>
                  {modeOubli ? t('oubli.retour') : t('connexion.oublie')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
      <FiletDemonstration />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingBottom: 24, gap: 4 },
  marque: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  produit: { color: '#FFFFFF', fontFamily: police.titre, fontSize: 16 },
  organisation: { color: '#B9C4E8', fontFamily: police.texte, fontSize: 12 },
  bienvenue: { color: '#FFFFFF', fontFamily: police.titre, fontSize: 22, lineHeight: 28 },
  accroche: { color: '#B9C4E8', fontFamily: police.texte, fontSize: 14, lineHeight: 20 },
  feuille: { flex: 1, paddingHorizontal: 16, paddingTop: 24, gap: 16 },
  lien: { fontFamily: police.texteFort, fontSize: 14 },
  liens: { flexDirection: 'row', justifyContent: 'space-between' },
  code: {
    borderWidth: 1,
    borderRadius: rayon,
    paddingVertical: 12,
    fontFamily: 'monospace',
    fontSize: 28,
    letterSpacing: 10,
    textAlign: 'center',
  },
});
