import type { Etablissement, SaisieEtablissement, SecteurSaisie } from '@innov/api-client';
import { marque, rayon } from '@innov/design';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alerte, Bouton, Carte, Champ, Etiquette, Texte, usePalette } from './composants';
import { police } from './polices';
import { messageErreur, useSession } from './session';

export function Pilule({
  libelle,
  actif,
  onPress,
}: {
  libelle: string;
  actif: boolean;
  onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      onPress={onPress}
      style={[
        styles.pilule,
        actif
          ? { backgroundColor: marque.bleuMarine, borderColor: marque.bleuMarine }
          : { borderColor: p.ligne, backgroundColor: p.surface },
      ]}
    >
      <Text style={[styles.piluleTexte, { color: actif ? '#FFFFFF' : p.texte }]}>{libelle}</Text>
    </Pressable>
  );
}

export function LigneEtablissement({ etablissement }: { etablissement: Etablissement }) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <View style={[styles.ligne, { borderColor: p.ligne }]}>
      <View style={{ flex: 1 }}>
        <Texte variante="fort">{etablissement.nom}</Texte>
        <Texte variante="discret">
          {[etablissement.type_libelle, etablissement.secteur.libelle].join(' · ')}
        </Texte>
      </View>
      {etablissement.statut === 'a_valider' && (
        <Etiquette>{t('prospect.statuts.a_valider')}</Etiquette>
      )}
      <MaterialIcons
        name={etablissement.a_coordonnees ? 'gps-fixed' : 'location-off'}
        size={18}
        color={etablissement.a_coordonnees ? '#1E9E6A' : '#C2410C'}
        accessibilityLabel={
          etablissement.a_coordonnees
            ? t('etablissement.champs.position')
            : t('etablissement.sansGps')
        }
      />
    </View>
  );
}

/**
 * Création d'un établissement depuis le téléphone (PRP-003) : le délégué, devant la porte,
 * enregistre la position de référence qui servira au contrôle de distance des visites.
 */
export function FormulaireEtablissement({ surTermine }: { surTermine: () => void }) {
  const { t } = useTranslation();
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
      await client.etablissements.creer(f);
      surTermine();
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Carte>
      <Texte variante="sousTitre">{t('etablissement.nouveau')}</Texte>
      <Alerte type="info">{t('etablissement.aides.aValider')}</Alerte>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      <Champ
        libelle={t('etablissement.champs.nom')}
        value={f.nom}
        onChangeText={(nom) => setF({ ...f, nom })}
      />
      <Texte variante="libelle">{t('etablissement.champs.type')}</Texte>
      <View style={styles.pilules}>
        {types.map((v) => (
          <Pilule
            key={v.id}
            libelle={v.libelle}
            actif={f.type === v.id}
            onPress={() => setF({ ...f, type: v.id })}
          />
        ))}
      </View>
      <Texte variante="libelle">{t('etablissement.champs.secteur')}</Texte>
      <View style={styles.pilules}>
        {secteurs.map((s) => (
          <Pilule
            key={s.id}
            libelle={s.libelle}
            actif={f.secteur === s.id}
            onPress={() => setF({ ...f, secteur: s.id, localite: null })}
          />
        ))}
      </View>
      {localites.length > 0 && (
        <>
          <Texte variante="libelle">{t('etablissement.champs.localite')}</Texte>
          <View style={styles.pilules}>
            {localites.map((l) => (
              <Pilule
                key={l.id}
                libelle={l.libelle}
                actif={f.localite === l.id}
                onPress={() => setF({ ...f, localite: f.localite === l.id ? null : l.id })}
              />
            ))}
          </View>
        </>
      )}
      <Texte variante="libelle">{t('etablissement.champs.position')}</Texte>
      <Texte variante="discret">{t('etablissement.aides.position')}</Texte>
      <Bouton
        secondaire
        libelle={
          localisation === 'attente'
            ? t('etablissement.aides.positionEnCours')
            : t('etablissement.aides.maPosition')
        }
        chargement={localisation === 'attente'}
        onPress={() => void maPosition()}
      />
      {precision !== null && (
        <Alerte type="succes">
          {t('etablissement.mobile.positionEnregistree', { metres: precision })}
        </Alerte>
      )}
      {localisation === 'erreur' && (
        <Alerte type="attention">{t('etablissement.aides.positionImpossible')}</Alerte>
      )}
      <Bouton
        libelle={t('etablissement.mobile.creer')}
        chargement={envoi}
        onPress={() => void creer()}
      />
    </Carte>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pilules: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pilule: {
    borderWidth: 1,
    borderRadius: rayon,
    paddingHorizontal: 12,
    minHeight: 40,
    justifyContent: 'center',
  },
  piluleTexte: { fontFamily: police.texteFort, fontSize: 13 },
});
