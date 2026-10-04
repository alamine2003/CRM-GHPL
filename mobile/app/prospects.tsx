import type {
  Etablissement,
  Potentiel,
  Prospect,
  SaisieProspect,
  ValeurReferentiel,
} from '@innov/api-client';
import { marque } from '@innov/design';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Alerte, Bouton, Carte, Champ, Texte, usePalette } from '../src/composants';
import { Ecran } from '../src/Ecran';
import { FormulaireEtablissement, LigneEtablissement, Pilule } from '../src/Etablissements';
import { MaListeCible } from '../src/MaListe';
import { police } from '../src/polices';
import { messageErreur, useSession } from '../src/session';

const POTENTIELS: Potentiel[] = ['A', 'B', 'C'];

function LigneProspect({ prospect }: { prospect: Prospect }) {
  const { t } = useTranslation();
  const p = usePalette();
  const nom = [
    prospect.civilite ? t(`prospect.civilites.${prospect.civilite}`) : '',
    prospect.prenom,
    prospect.nom,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <View style={[styles.ligne, { borderColor: p.ligne }]}>
      <View
        style={[
          styles.potentiel,
          { borderColor: prospect.potentiel === 'A' ? marque.orange : p.ligne },
        ]}
      >
        <Text
          style={[
            styles.potentielTexte,
            { color: prospect.potentiel === 'A' ? marque.orange : p.texteSecondaire },
          ]}
        >
          {prospect.potentiel}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Texte variante="fort">{nom}</Texte>
        <Texte variante="discret">
          {[prospect.specialite_libelle ?? prospect.type_libelle, prospect.lieu_principal?.libelle]
            .filter(Boolean)
            .join(' · ')}
        </Texte>
      </View>
      {prospect.statut === 'a_valider' && (
        <View style={[styles.badge, { backgroundColor: p.orangeDoux }]}>
          <Text style={[styles.badgeTexte, { color: marque.orange }]}>
            {t('prospect.statuts.a_valider')}
          </Text>
        </View>
      )}
    </View>
  );
}

function Formulaire({ surTermine }: { surTermine: (p: Prospect) => void }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [valeurs, setValeurs] = useState<ValeurReferentiel[]>([]);
  const [f, setF] = useState<SaisieProspect>({ nom: '', prenom: '', type: null, potentiel: 'B' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let actif = true;
    client.referentiel
      .valeurs()
      .then((v) => actif && setValeurs(v.filter((x) => !x.archive)))
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [client]);

  const types = valeurs.filter((v) => v.liste === 'type_prospect');
  const specialites = valeurs.filter(
    (v) => v.liste === 'specialite' && (!v.parent || v.parent === f.type),
  );

  async function creer() {
    setErreur(null);
    setEnvoi(true);
    try {
      surTermine(await client.prospects.creer({ ...f, civilite: f.civilite ?? 'dr' }));
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Carte>
      <Texte variante="sousTitre">{t('prospect.nouveau')}</Texte>
      <Alerte type="info">{t('prospect.aides.aValider')}</Alerte>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      <Champ
        libelle={t('prospect.champs.nom')}
        value={f.nom}
        onChangeText={(nom) => setF({ ...f, nom })}
      />
      <Champ
        libelle={t('prospect.champs.prenom')}
        value={f.prenom}
        onChangeText={(prenom) => setF({ ...f, prenom })}
      />
      <Texte variante="libelle">{t('prospect.champs.type')}</Texte>
      <View style={styles.pilules}>
        {types.map((v) => (
          <Pilule
            key={v.id}
            libelle={v.libelle}
            actif={f.type === v.id}
            onPress={() => setF({ ...f, type: v.id, specialite: null })}
          />
        ))}
      </View>
      {f.type && specialites.length > 0 && (
        <>
          <Texte variante="libelle">{t('prospect.champs.specialite')}</Texte>
          <View style={styles.pilules}>
            {specialites.map((v) => (
              <Pilule
                key={v.id}
                libelle={v.libelle}
                actif={f.specialite === v.id}
                onPress={() => setF({ ...f, specialite: v.id })}
              />
            ))}
          </View>
        </>
      )}
      <Texte variante="libelle">{t('prospect.champs.potentiel')}</Texte>
      <View style={styles.pilules}>
        {POTENTIELS.map((p) => (
          <Pilule
            key={p}
            libelle={t(`prospect.potentiels.${p}`)}
            actif={f.potentiel === p}
            onPress={() => setF({ ...f, potentiel: p })}
          />
        ))}
      </View>
      <Champ
        libelle={t('prospect.champs.telephoneMobile')}
        value={f.telephone_mobile ?? ''}
        onChangeText={(telephone_mobile) => setF({ ...f, telephone_mobile })}
        keyboardType="phone-pad"
      />
      <Bouton
        libelle={t('prospect.mobile.creer')}
        chargement={envoi}
        onPress={() => void creer()}
      />
    </Carte>
  );
}

type Segment = 'cible' | 'prospects' | 'etablissements';

/** Prospects et établissements du délégué : recherche dans les fiches communes et création
 * (PRP-002, PRP-003, PRP-006). */
export default function EcranProspects() {
  const { t } = useTranslation();
  const { client, etat } = useSession();
  const [segment, setSegment] = useState<Segment>('cible');
  const [saisie, setSaisie] = useState('');
  const [fiches, setFiches] = useState<Prospect[] | null>(null);
  const [lieux, setLieux] = useState<Etablissement[] | null>(null);
  const [total, setTotal] = useState(0);
  const [creation, setCreation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const peutCreer =
    etat.statut === 'connecte' && etat.perimetre.actions.includes('prospects.creer');

  useEffect(() => {
    let actif = true;
    if (segment === 'cible') return;
    const minuteur = setTimeout(() => {
      const requete =
        segment === 'prospects'
          ? client.prospects.liste({ q: saisie }).then((r) => {
              if (!actif) return;
              setFiches(r.resultats);
              setTotal(r.total);
            })
          : client.etablissements.liste({ q: saisie }).then((r) => {
              if (!actif) return;
              setLieux(r.resultats);
              setTotal(r.total);
            });
      requete.catch(() => undefined);
    }, 300);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [client, saisie, version, segment]);

  const changerSegment = (s: Segment) => {
    setSegment(s);
    setCreation(false);
    setMessage(null);
  };
  const liste = segment === 'prospects' ? fiches : lieux;

  return (
    <Ecran
      titre={t('prospect.mobile.titre')}
      surTitre={
        liste && segment !== 'cible'
          ? segment === 'prospects'
            ? t('prospect.nombre', { count: total })
            : t('etablissement.nombre', { count: total })
          : undefined
      }
    >
      <View style={styles.segments}>
        <Pilule
          libelle={t('ciblage.mobile.segment')}
          actif={segment === 'cible'}
          onPress={() => changerSegment('cible')}
        />
        <Pilule
          libelle={t('etablissement.mobile.segmentProspects')}
          actif={segment === 'prospects'}
          onPress={() => changerSegment('prospects')}
        />
        <Pilule
          libelle={t('etablissement.mobile.segmentEtablissements')}
          actif={segment === 'etablissements'}
          onPress={() => changerSegment('etablissements')}
        />
      </View>
      {message && <Alerte type="succes">{message}</Alerte>}
      {segment === 'cible' ? (
        <MaListeCible />
      ) : creation ? (
        <>
          {segment === 'prospects' ? (
            <Formulaire
              surTermine={() => {
                setCreation(false);
                setMessage(t('prospect.mobile.creee'));
                setVersion((v) => v + 1);
              }}
            />
          ) : (
            <FormulaireEtablissement
              surTermine={() => {
                setCreation(false);
                setMessage(t('etablissement.mobile.creee'));
                setVersion((v) => v + 1);
              }}
            />
          )}
          <Bouton
            secondaire
            libelle={t('prospect.mobile.retour')}
            onPress={() => setCreation(false)}
          />
        </>
      ) : (
        <>
          <Champ
            libelle={
              segment === 'prospects'
                ? t('prospect.mobile.rechercher')
                : t('etablissement.rechercher')
            }
            value={saisie}
            onChangeText={setSaisie}
            autoCorrect={false}
          />
          {peutCreer && (
            <Bouton
              libelle={segment === 'prospects' ? t('prospect.nouveau') : t('etablissement.nouveau')}
              onPress={() => {
                setMessage(null);
                setCreation(true);
              }}
            />
          )}
          <Carte style={{ paddingVertical: 4 }}>
            {liste?.length === 0 && (
              <Texte variante="discret">
                {segment === 'prospects'
                  ? t('prospect.aucunResultat')
                  : t('etablissement.aucunResultat')}
              </Texte>
            )}
            {segment === 'prospects'
              ? fiches?.map((prospect) => <LigneProspect key={prospect.id} prospect={prospect} />)
              : lieux?.map((e) => <LigneEtablissement key={e.id} etablissement={e} />)}
          </Carte>
        </>
      )}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', gap: 8 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  potentiel: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  potentielTexte: { fontFamily: police.titreFort, fontSize: 14 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTexte: { fontFamily: police.texteFort, fontSize: 11 },
  pilules: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
