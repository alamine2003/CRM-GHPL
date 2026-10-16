import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { installationConnue } from '../src/appareil';
import {
  Alerte,
  Bouton,
  Champ,
  Icone,
  Lien,
  Logo,
  Statut,
  Texte,
  usePalette,
} from '../src/composants';
import { FiletDemonstration, MentionDemonstration } from '../src/Demonstration';
import { useTablette } from '../src/disposition';
import { police } from '../src/polices';
import { messageErreur, useSession } from '../src/session';
import { RAYON, surMarine } from '../src/theme';
import { adresseConfidentialite } from '../src/version';

type Mode = 'connexion' | 'oubli' | 'code';

/**
 * Connexion du délégué (USR-001, SEC-002), code à usage unique (SEC-003) et demande de lien
 * (USR-005), selon la maquette 1.4.0 : une page blanche sur le téléphone ; sur la tablette, un
 * volet marine à gauche (la marque, une accroche) et le formulaire à droite.
 */
export default function Connexion() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const tablette = useTablette();
  const marges = useSafeAreaInsets();
  const { etat, connexion, validerCode, client } = useSession();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [mode, setMode] = useState<Mode>('connexion');
  const [jetonEtape, setJetonEtape] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [secours, setSecours] = useState(false);
  const [connu, setConnu] = useState(false);

  useEffect(() => {
    void installationConnue().then(setConnu);
  }, []);

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
        setMode('code');
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
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }

  const changer = (suivant: Mode) => {
    setErreur(null);
    setInfo(null);
    if (suivant === 'connexion') setJetonEtape(null);
    setMode(suivant);
  };

  const titre =
    mode === 'oubli' ? t('oubli.titre') : mode === 'code' ? t('code.titre') : t('mobile.bienvenue');
  const explication =
    mode === 'oubli'
      ? t('oubli.explication')
      : mode === 'code'
        ? secours
          ? t('code.explicationSecours')
          : t('code.explication')
        : t('mobile.sousTitreConnexion');

  const messages = (
    <>
      {mode === 'connexion' && etat.statut === 'anonyme' && etat.doubleAuthRequise && !erreur && (
        <Alerte type="info">{t('mobile.doubleAuthPortail')}</Alerte>
      )}
      {mode === 'connexion' && etat.statut === 'anonyme' && etat.effacement && !erreur && (
        <Alerte type="attention">{t('mobile.effacement')}</Alerte>
      )}
      {mode === 'connexion' && etat.statut === 'anonyme' && etat.sessionExpiree && !erreur && (
        <Alerte type="info">{t('session.expiree')}</Alerte>
      )}
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
    </>
  );

  const formulaire =
    mode === 'code' ? (
      <>
        {messages}
        {secours ? (
          <Champ
            libelle={t('code.champSecours')}
            value={code}
            onChangeText={(v) => setCode(v.trim().slice(0, 20))}
            autoCapitalize="none"
            autoFocus
          />
        ) : (
          <CasesCode valeur={code} surChangement={setCode} tablette={tablette} />
        )}
        <Bouton libelle={t('code.valider')} chargement={envoi} onPress={() => void envoyerCode()} />
        <View style={tablette ? styles.liensTablette : styles.liensTelephone}>
          <Lien
            libelle={secours ? t('code.application') : t('code.secours')}
            onPress={() => {
              setSecours((v) => !v);
              setCode('');
            }}
          />
          <Lien libelle={t('code.retour')} discret onPress={() => changer('connexion')} />
        </View>
      </>
    ) : mode === 'oubli' ? (
      <>
        {messages}
        <Champ
          libelle={t('oubli.identifiant')}
          value={identifiant}
          onChangeText={setIdentifiant}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
        />
        <Bouton
          libelle={t('oubli.envoyer')}
          chargement={envoi}
          onPress={() => void demanderLien()}
        />
        {info && (
          <Alerte type="succes" icone="check">
            {info}
          </Alerte>
        )}
        <View style={tablette ? undefined : { alignItems: 'center' }}>
          <Lien libelle={t('oubli.retour')} onPress={() => changer('connexion')} />
        </View>
      </>
    ) : (
      <>
        {messages}
        <View style={{ gap: 18 }}>
          <Champ
            libelle={t('mobile.connexion.courriel')}
            value={identifiant}
            onChangeText={setIdentifiant}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            keyboardType="email-address"
            textContentType="username"
          />
          <Champ
            libelle={t('connexion.motDePasse')}
            action={
              <Lien libelle={t('connexion.oublie')} taille={13} onPress={() => changer('oubli')} />
            }
            value={motDePasse}
            onChangeText={setMotDePasse}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
          />
          <Bouton
            libelle={envoi ? t('connexion.enCours') : t('connexion.seConnecter')}
            chargement={envoi}
            onPress={() => void seConnecter()}
            style={{ marginTop: 6 }}
          />
        </View>
      </>
    );

  const appareil = mode === 'connexion' && (
    <View style={[styles.appareil, { backgroundColor: p.surface2, borderColor: p.ligne }]}>
      <View style={styles.entreDeux}>
        <Texte variante="libelle">
          {t(tablette ? 'mobile.connexion.appareilTablette' : 'mobile.connexion.appareilTelephone')}
        </Texte>
        {connu && (
          <Statut ton="ok">
            {t(tablette ? 'mobile.connexion.enregistree' : 'mobile.connexion.enregistre')}
          </Statut>
        )}
      </View>
      <Text style={[styles.noteAppareil, { color: p.texteSecondaire }]}>
        {t(tablette ? 'mobile.connexion.noteTablette' : 'mobile.connexion.noteTelephone')}
      </Text>
    </View>
  );

  const confidentialite = (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(adresseConfidentialite(i18n.language))}
      hitSlop={8}
    >
      <Text style={[styles.pied, { color: p.texteSecondaire, textDecorationLine: 'underline' }]}>
        {t('confidentialite.lien')}
      </Text>
    </Pressable>
  );

  const entete = (
    <View>
      <Text
        accessibilityRole="header"
        style={[
          styles.titre,
          { color: p.texte },
          !tablette &&
            mode === 'connexion' && { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
        ]}
      >
        {titre}
      </Text>
      <Text style={[styles.explication, { color: p.texteSecondaire }]}>{explication}</Text>
    </View>
  );

  if (tablette) {
    const accroche =
      mode === 'oubli'
        ? [t('mobile.connexion.oubliAccroche'), t('mobile.connexion.oubliTexte')]
        : mode === 'code'
          ? [t('mobile.connexion.codeAccroche'), t('mobile.connexion.codeTexte')]
          : [t('mobile.connexion.accroche'), t('mobile.connexion.accrocheTexte')];
    return (
      <KeyboardAvoidingView
        style={[styles.rangee, { backgroundColor: p.surface }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.volet, { backgroundColor: p.marine, paddingTop: 56 + marges.top }]}>
          <View style={[styles.filetOrange, { backgroundColor: p.orange }]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Logo taille={56} mot={26} surMarine />
            <MentionDemonstration />
          </View>
          <View style={{ marginTop: 72 }}>
            <Text
              style={[styles.accroche, mode !== 'connexion' && { fontSize: 38, lineHeight: 44 }]}
            >
              {accroche[0]}
            </Text>
            <Text style={styles.accrocheTexte}>{accroche[1]}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {mode === 'connexion' && (
            <View style={{ gap: 12 }}>
              {[t('mobile.connexion.atoutHorsLigne'), t('mobile.connexion.atoutChiffre')].map(
                (a) => (
                  <View key={a} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 8, height: 8, backgroundColor: p.orange }} />
                    <Text style={styles.atout}>{a}</Text>
                  </View>
                ),
              )}
            </View>
          )}
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.centreTablette}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{ width: mode === 'connexion' ? 400 : 420, gap: mode === 'connexion' ? 28 : 24 }}
          >
            {entete}
            {formulaire}
            {appareil}
            <View style={{ alignItems: 'center' }}>{confidentialite}</View>
          </View>
        </ScrollView>
        <FiletDemonstration />
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ height: marges.top, backgroundColor: p.surface }} />
      <View style={[styles.filet, { backgroundColor: p.orange }]} />
      <ScrollView
        contentContainerStyle={[
          styles.page,
          mode === 'connexion' ? styles.pageConnexion : styles.pageSecondaire,
          { paddingBottom: 24 + marges.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {mode === 'connexion' ? (
          <View style={{ gap: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Logo taille={52} mot={24} sansCadre />
              <MentionDemonstration />
            </View>
            {entete}
          </View>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('oubli.retour')}
              onPress={() => changer('connexion')}
              style={styles.retour}
            >
              <Icone nom="arrow-left" />
            </Pressable>
            {entete}
          </>
        )}
        <View style={{ gap: mode === 'connexion' ? 18 : 24 }}>{formulaire}</View>
        <View style={{ flex: 1 }} />
        {appareil}
        {mode === 'connexion' && (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Texte variante="libelle">{t('mobile.connexion.pied')}</Texte>
            {confidentialite}
          </View>
        )}
      </ScrollView>
      <FiletDemonstration />
    </KeyboardAvoidingView>
  );
}

/** Six cases pour le code à usage unique (maquette « Vérification en deux étapes »). */
function CasesCode({
  valeur,
  surChangement,
  tablette,
}: {
  valeur: string;
  surChangement: (v: string) => void;
  tablette: boolean;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const champ = useRef<TextInput>(null);
  const actif = Math.min(valeur.length, 5);
  return (
    <View style={{ gap: 6 }}>
      <Texte variante="libelle">{t('code.champ')}</Texte>
      <Pressable
        accessibilityRole="none"
        accessibilityLabel={t('mobile.connexion.codeCases')}
        onPress={() => champ.current?.focus()}
        style={{ flexDirection: 'row', gap: tablette ? 10 : 8 }}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <View
            key={i}
            style={[
              styles.case,
              { backgroundColor: p.surface, borderColor: i === actif ? p.marine : p.ligne },
              i === actif && { borderWidth: 2 },
            ]}
          >
            <Text style={[styles.chiffre, { color: p.texte }]}>{valeur[i] ?? ''}</Text>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={champ}
        accessibilityLabel={t('code.champ')}
        value={valeur}
        onChangeText={(v) => surChangement(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        maxLength={6}
        style={styles.champCache}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rangee: { flex: 1, flexDirection: 'row' },
  filet: { height: 3 },
  page: { flexGrow: 1, paddingHorizontal: 24 },
  pageConnexion: { paddingTop: 56, gap: 32 },
  pageSecondaire: { paddingTop: 20, gap: 24 },
  retour: { width: 40, height: 40, marginLeft: -8, alignItems: 'center', justifyContent: 'center' },
  titre: { fontFamily: police.titreFort, fontSize: 28, lineHeight: 34, letterSpacing: -0.56 },
  explication: { fontFamily: police.texte, fontSize: 16, lineHeight: 24, marginTop: 6 },
  entreDeux: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appareil: {
    borderWidth: 1,
    borderRadius: RAYON,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  noteAppareil: { fontFamily: police.texte, fontSize: 13, lineHeight: 18 },
  pied: { fontFamily: police.texteMoyen, fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  liensTelephone: { alignItems: 'center', gap: 14 },
  liensTablette: { flexDirection: 'row', justifyContent: 'space-between' },
  volet: { width: 520, paddingHorizontal: 56, paddingBottom: 40, gap: 28 },
  filetOrange: { position: 'absolute', left: 0, right: 0, top: 0, height: 3 },
  accroche: {
    color: surMarine.texte,
    fontFamily: police.titreFort,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.8,
  },
  accrocheTexte: {
    color: surMarine.doux,
    fontFamily: police.texte,
    fontSize: 17,
    lineHeight: 26,
    marginTop: 18,
  },
  atout: { color: surMarine.doux, fontFamily: police.texte, fontSize: 14, lineHeight: 20 },
  centreTablette: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  case: {
    flex: 1,
    height: 56,
    borderWidth: 1,
    borderRadius: RAYON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chiffre: { fontFamily: police.titreFort, fontSize: 24 },
  champCache: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
