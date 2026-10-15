/**
 * Nouvel établissement (PRP-003), selon la maquette 1.4.5 : le délégué, devant la porte,
 * enregistre le lieu et sa position de référence, qui servira au contrôle de distance des
 * visites. La fiche est « à valider » ; il peut l'utiliser tout de suite.
 *
 * Ouvert depuis « Nouveau prospect », l'écran rend l'établissement créé à la saisie qui l'a
 * demandé ; ouvert depuis l'onglet, il mène à la fiche du lieu.
 */
import type { Etablissement, SaisieEtablissement, SecteurSaisie } from '@innov/api-client';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Alerte, Bouton, Carte, Champ, Ligne, ListeDeroulante, Statut, Texte } from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { annoncerFiche } from './Fiches';
import { messageErreur, useSession } from './session';

// ---------------------------------------------------------------------------------------------
// L'établissement créé, rendu à l'écran qui l'a demandé (« Nouveau prospect »)

let cree: Etablissement | null = null;
const abonnes = new Set<() => void>();

/** S'abonne aux créations ; `surCree` reçoit l'établissement une seule fois. */
export function suivreEtablissementCree(surCree: (e: Etablissement) => void) {
  const f = () => {
    if (!cree) return;
    const e = cree;
    cree = null;
    surCree(e);
  };
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

function rendre(e: Etablissement) {
  cree = e;
  abonnes.forEach((f) => f());
}

/** Lat./long. lisibles : « 14,6928 », « −17,4467 ». */
function coordonnee(x: number, langue: string) {
  return new Intl.NumberFormat(langue, { maximumFractionDigits: 4 }).format(x);
}

export function EcranNouvelEtablissement({ pour }: { pour?: 'prospect' }) {
  const { t, i18n } = useTranslation();
  const routeur = useRouter();
  const tablette = useTablette();
  const { client } = useSession();
  const [types, setTypes] = useState<{ id: string; libelle: string }[]>([]);
  const [secteurs, setSecteurs] = useState<SecteurSaisie[]>([]);
  const [f, setF] = useState<SaisieEtablissement>({ nom: '', type: null, secteur: null });
  const [precision, setPrecision] = useState<number | null>(null);
  const [localisation, setLocalisation] = useState<'attente' | 'erreur' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const localites = secteurs.find((s) => s.id === f.secteur)?.localites ?? [];

  useEffect(() => {
    let actif = true;
    Promise.all([
      client.referentiel.valeurs('type_etablissement'),
      client.etablissements.secteurs(),
    ])
      .then(([v, s]) => {
        if (!actif) return;
        setTypes(v.filter((x) => !x.archive));
        setSecteurs(s);
      })
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [client]);

  async function maPosition() {
    setLocalisation('attente');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('refus');
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setF((avant) => ({
        ...avant,
        latitude: Math.round(position.coords.latitude * 1e6) / 1e6,
        longitude: Math.round(position.coords.longitude * 1e6) / 1e6,
      }));
      setPrecision(Math.round(position.coords.accuracy ?? 0));
      setLocalisation(null);
    } catch {
      setLocalisation('erreur');
    }
  }

  async function creer() {
    setErreur(null);
    setEnvoi(true);
    try {
      const e = await client.etablissements.creer(f);
      if (pour === 'prospect') {
        rendre(e);
        routeur.back();
      } else {
        annoncerFiche(e.id, { ton: 'succes', texte: t('etablissement.mobile.creee') });
        routeur.replace(`/lieu/${e.id}`);
      }
    } catch (x) {
      setErreur(messageErreur(x, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }

  const pret = (f.nom ?? '').trim().length > 0 && !!f.type && !!f.secteur;
  const retour = (
    <Bouton
      variante="contour"
      petit={tablette}
      libelle={t('prospect.mobile.retour')}
      onPress={() => routeur.back()}
      style={tablette ? undefined : { flex: 1 }}
    />
  );
  const creerBouton = (
    <Bouton
      petit={tablette}
      libelle={t('etablissement.mobile.creer')}
      chargement={envoi}
      desactive={!pret}
      onPress={() => void creer()}
      style={tablette ? undefined : { flex: 2 }}
    />
  );

  const position = (
    <>
      <Texte variante="sousTitre" accessibilityRole="header">
        {t('etablissement.champs.position')}
      </Texte>
      <Texte variante="libelle">{t('etablissement.aides.position')}</Texte>
      <Bouton
        variante="contour"
        petit={!tablette}
        icone="map-pin"
        libelle={
          localisation === 'attente'
            ? t('etablissement.aides.positionEnCours')
            : t('etablissement.aides.maPosition')
        }
        chargement={localisation === 'attente'}
        onPress={() => void maPosition()}
      />
      {tablette && f.latitude != null && f.longitude != null && (
        <Carte marge={0}>
          <Ligne
            libelle={t('etablissement.champs.latitude')}
            valeur={coordonnee(f.latitude, i18n.language)}
          />
          <Ligne
            libelle={t('etablissement.champs.longitude')}
            valeur={coordonnee(f.longitude, i18n.language)}
          />
          <Ligne
            libelle={t('etablissement.mobile.precision')}
            valeur={t('etablissement.mobile.metres', { metres: precision ?? 0 })}
            derniere
          />
        </Carte>
      )}
      {precision !== null && (
        <View style={{ flexDirection: 'row' }}>
          <Statut ton="ok">
            {t('etablissement.mobile.positionEnregistree', { metres: precision })}
          </Statut>
        </View>
      )}
      {localisation === 'erreur' && (
        <Alerte type="attention">{t('etablissement.aides.positionImpossible')}</Alerte>
      )}
    </>
  );

  return (
    <Ecran
      titre={t('etablissement.nouveau')}
      retour
      onglets={false}
      enteteTablette={{
        action: (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {retour}
            {creerBouton}
          </View>
        ),
      }}
      pied={
        tablette ? undefined : (
          <>
            {retour}
            {creerBouton}
          </>
        )
      }
      droite={tablette ? <View style={{ padding: 24, gap: 14 }}>{position}</View> : undefined}
      largeurDroite={400}
    >
      <Alerte type="attention">{t('etablissement.aides.aValider')}</Alerte>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      <Champ
        libelle={t('etablissement.champs.nom')}
        value={f.nom}
        onChangeText={(nom) => setF({ ...f, nom })}
        autoCapitalize="words"
      />
      <View style={styles.grille}>
        <ListeDeroulante
          libelle={t('etablissement.champs.type')}
          valeur={f.type}
          options={types}
          surChoix={(type) => setF({ ...f, type })}
        />
        <ListeDeroulante
          libelle={t('etablissement.champs.secteur')}
          valeur={f.secteur}
          options={secteurs}
          surChoix={(secteur) => setF({ ...f, secteur, localite: null })}
        />
      </View>
      <ListeDeroulante
        libelle={t('etablissement.champs.localite')}
        indice={t('etablissement.mobile.indiceLocalite')}
        valeur={f.localite}
        options={localites}
        surChoix={(localite) => setF({ ...f, localite })}
      />
      {!tablette && <Carte style={{ gap: 10 }}>{position}</Carte>}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  grille: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});
