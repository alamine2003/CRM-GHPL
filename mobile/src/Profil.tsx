/**
 * Mon profil, selon la maquette 1.5.0 : qui je suis, les données gardées pour travailler sans
 * réseau (OFF-001, OFF-003), la langue de l'interface (USR-004), l'appareil enregistré
 * (USR-006) et la déconnexion. Sur la tablette, le compte, la langue et l'appareil à gauche, les
 * données hors connexion à droite.
 */
import { LANGUES, type Langue } from '@innov/i18n';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { identifiantInstallation } from './appareil';
import { Bouton, Carte, Lien, Ligne, Segments, Texte, usePalette } from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { Avatar } from './Fiches';
import { MesProduits } from './MesProduits';
import { MonPoste } from './MonPoste';
import { police } from './polices';
import { CartePreferences } from './Preferences';
import { useSession } from './session';
import { CarteSynchro, StatutSynchro } from './Synchronisation';
import { adresseConfidentialite, VERSION_APP } from './version';

export function EcranProfil() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const tablette = useTablette();
  const { etat, deconnexion, changerLangue } = useSession();
  const langue = i18n.language as Langue;
  const [installation, setInstallation] = useState('');
  useEffect(() => {
    void identifiantInstallation().then(setInstallation);
  }, []);
  const connecte = etat.statut === 'connecte' ? etat : null;
  const u = connecte?.utilisateur;
  const nom = u ? `${u.prenom} ${u.nom}` : '';
  const pays = connecte?.perimetre.pays_actif?.nom ?? t('session.siege');
  const roles = connecte?.perimetre.roles.map((r) => t(`roles.${r}`)) ?? [];

  const deconnecter = (
    <Bouton
      variante="contour"
      petit={tablette}
      libelle={t('session.deconnexion')}
      onPress={() => void deconnexion()}
    />
  );

  const identite = (
    <Carte style={tablette ? styles.identiteLarge : styles.identite}>
      <Avatar prenom={u?.prenom} nom={u?.nom ?? ''} taille={64} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[tablette ? styles.nomLarge : styles.nom, { color: p.texte }]}>{nom}</Text>
        {tablette ? (
          <Texte variante="libelle" style={{ fontSize: 14 }}>
            {[roles[0], pays, u?.identifiant].filter(Boolean).join(' · ')}
          </Texte>
        ) : (
          <>
            <Texte variante="libelle">{[roles[0], pays].filter(Boolean).join(' · ')}</Texte>
            <Texte variante="libelle">{u?.identifiant}</Texte>
          </>
        )}
      </View>
      {tablette && <StatutSynchro />}
    </Carte>
  );

  const langueCarte = (
    <Carte marge={0}>
      <Texte variante="sousTitre" accessibilityRole="header" style={styles.titreCarte}>
        {t('profilPage.langueTitre')}
      </Texte>
      <View style={[styles.corps, tablette && { maxWidth: 320 }]}>
        <Segments
          libelle={t('profilPage.langueTitre')}
          options={LANGUES.map((code) => ({ cle: code, libelle: t(`commun.langues.${code}`) }))}
          valeur={langue}
          surChoix={(code) => void changerLangue(code)}
        />
      </View>
    </Carte>
  );

  const appareil = (
    <Carte marge={0}>
      <Texte variante="sousTitre" accessibilityRole="header" style={styles.titreCarte}>
        {t(tablette ? 'mobile.cetteTablette' : 'mobile.ceTelephone')}
      </Texte>
      <Ligne libelle={t('accueil.versionClient')} valeur={VERSION_APP} />
      <Ligne
        libelle={t('mobile.identifiantInstallation')}
        valeur={installation ? `${installation.slice(0, 8)}…` : '—'}
      />
      <View style={[styles.corps, { paddingTop: 12, gap: 8 }]}>
        <Texte variante="libelle">{t('mobile.telephoneAide')}</Texte>
        <Lien
          libelle={t('confidentialite.lien')}
          onPress={() => void Linking.openURL(adresseConfidentialite(langue))}
        />
      </View>
    </Carte>
  );

  if (tablette) {
    return (
      <Ecran
        titre={t('profilPage.titre')}
        surTitre={nom}
        enteteTablette={{
          surTitre: [nom, pays].filter(Boolean).join(' · '),
          action: deconnecter,
        }}
      >
        {identite}
        <View style={styles.colonnes}>
          <View style={styles.colonne}>
            <Carte marge={0}>
              <Texte variante="sousTitre" accessibilityRole="header" style={styles.titreCarte}>
                {t('profilPage.compte')}
              </Texte>
              <Ligne libelle={t('profil.identifiant')} valeur={u?.identifiant ?? '—'} />
              <Ligne
                libelle={t('profil.courriel')}
                valeur={u?.courriel || t('profil.nonRenseigne')}
              />
              <Ligne libelle={t('profil.perimetre')} valeur={pays} />
              <Ligne libelle={t('profil.roles')} valeur={roles.join(', ') || '—'} derniere />
            </Carte>
            {langueCarte}
            {appareil}
            <MonPoste />
            <MesProduits />
          </View>
          <View style={styles.colonne}>
            <CarteSynchro tablette />
          </View>
        </View>
      </Ecran>
    );
  }

  return (
    <Ecran titre={t('profilPage.titre')} surTitre={nom}>
      {identite}
      <CarteSynchro />
      {langueCarte}
      {appareil}
      <MonPoste />
      <MesProduits />
      <CartePreferences />
      {deconnecter}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  identite: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identiteLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  nom: { fontFamily: police.titre, fontSize: 18, lineHeight: 24 },
  nomLarge: { fontFamily: police.titreFort, fontSize: 22, lineHeight: 28 },
  titreCarte: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 4 },
  corps: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 6 },
  colonnes: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  colonne: { flex: 1, minWidth: 0, gap: 16 },
});
