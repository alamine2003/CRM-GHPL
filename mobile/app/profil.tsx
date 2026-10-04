import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { marque, zoneTactileMin } from '@innov/design';
import { LANGUES, type Langue } from '@innov/i18n';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { identifiantInstallation } from '../src/appareil';
import { Bouton, Carte, Ligne, Texte, usePalette } from '../src/composants';
import { Ecran } from '../src/Ecran';
import { police } from '../src/polices';
import { useSession } from '../src/session';
import { VERSION_APP } from '../src/version';

/** Profil : compte, langue mémorisée (USR-004), téléphone enregistré (USR-006), déconnexion. */
export default function Profil() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { etat, deconnexion, changerLangue } = useSession();
  const langue = i18n.language as Langue;
  const [installation, setInstallation] = useState('');
  useEffect(() => {
    void identifiantInstallation().then(setInstallation);
  }, []);
  const connecte = etat.statut === 'connecte' ? etat : null;
  const u = connecte?.utilisateur;

  return (
    <Ecran titre={t('navigation.profil')} surTitre={u ? `${u.prenom} ${u.nom}` : undefined}>
      <Carte>
        <Ligne libelle={t('profil.identifiant')} valeur={u?.identifiant ?? '—'} />
        <Ligne libelle={t('profil.courriel')} valeur={u?.courriel || t('profil.nonRenseigne')} />
        <Ligne
          libelle={t('profil.perimetre')}
          valeur={connecte?.perimetre.pays_actif?.nom ?? t('session.siege')}
        />
        <Ligne
          libelle={t('roles.titre')}
          valeur={connecte?.perimetre.roles.map((r) => t(`roles.${r}`)).join(', ') || '—'}
          derniere
        />
      </Carte>

      <Carte>
        <Texte variante="libelle" style={{ marginBottom: 10 }}>
          {t('profilPage.langueTitre')}
        </Texte>
        <View style={styles.langues}>
          {LANGUES.map((code) => {
            const actif = code === langue;
            return (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
                onPress={() => void changerLangue(code)}
                style={[
                  styles.langue,
                  { borderColor: actif ? marque.bleuMarine : p.ligne },
                  actif && { backgroundColor: marque.bleuMarine },
                ]}
              >
                <Text style={{ color: actif ? '#FFFFFF' : p.texte, fontFamily: police.texteFort }}>
                  {t(`commun.langues.${code}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Texte variante="discret" style={{ marginTop: 10 }}>
          {t('profilPage.langueAide')}
        </Texte>
      </Carte>

      <Carte>
        <View style={styles.titreTelephone}>
          <MaterialIcons
            name={Platform.OS === 'ios' ? 'phone-iphone' : 'phone-android'}
            size={20}
            color={marque.orange}
          />
          <Texte variante="fort">{t('mobile.ceTelephone')}</Texte>
        </View>
        <Ligne libelle={t('accueil.versionClient')} valeur={VERSION_APP} />
        <Ligne libelle="ID" valeur={installation ? `${installation.slice(0, 8)}…` : '—'} derniere />
        <Texte variante="discret" style={{ marginTop: 8 }}>
          {t('mobile.telephoneAide')}
        </Texte>
      </Carte>

      <Bouton libelle={t('session.deconnexion')} secondaire onPress={() => void deconnexion()} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  langues: { flexDirection: 'row', gap: 8 },
  langue: {
    minHeight: zoneTactileMin,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  titreTelephone: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
});
