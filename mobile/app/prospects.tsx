import type {
  Etablissement,
  ListeCible,
  Potentiel,
  Prospect,
  ProspectCree,
  SaisieProspect,
  ValeurReferentiel,
} from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  Etiquette,
  MarquePotentiel,
  Texte,
  usePalette,
} from '../src/composants';
import { Ecran } from '../src/Ecran';
import { FormulaireEtablissement, LigneEtablissement, Pilule } from '../src/Etablissements';
import { lire } from '../src/baseLocale';
import { MaListeCible } from '../src/MaListe';
import { MesPropositions } from '../src/MesPropositions';
import { normaliserNom, ressemblantesLocales } from '../src/ressemblances';
import { messageErreur, useSession } from '../src/session';

const POTENTIELS: Potentiel[] = ['A', 'B', 'C'];

function LigneProspect({ prospect }: { prospect: Prospect }) {
  const { t } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const nom = [
    prospect.civilite ? t(`prospect.civilites.${prospect.civilite}`) : '',
    prospect.prenom,
    prospect.nom,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => routeur.push(`/fiche/${prospect.id}`)}
      style={({ pressed }) => [
        styles.ligne,
        { borderColor: p.ligne, backgroundColor: pressed ? p.fond : 'transparent' },
      ]}
    >
      <MarquePotentiel
        valeur={prospect.potentiel}
        libelle={t(`prospect.potentiels.${prospect.potentiel}`)}
      />
      <View style={{ flex: 1 }}>
        <Texte variante="fort">{nom}</Texte>
        <Texte variante="discret">
          {[prospect.specialite_libelle ?? prospect.type_libelle, prospect.lieu_principal?.libelle]
            .filter(Boolean)
            .join(' · ')}
        </Texte>
      </View>
      {prospect.statut === 'a_valider' && <Etiquette>{t('prospect.statuts.a_valider')}</Etiquette>}
    </Pressable>
  );
}

/**
 * PRP-007 : fiches ressemblantes pendant la saisie. En ligne, le serveur cherche dans tout le
 * pays ; sans réseau, la liste cible gardée sur le téléphone sert de référence (CA2).
 */
function Ressemblantes({ nom, prenom }: { nom: string; prenom: string }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [fiches, setFiches] = useState<{ id: string; libelle: string; detail: string }[]>([]);
  const [horsLigne, setHorsLigne] = useState(false);
  const palette = usePalette();

  const court = normaliserNom(prenom, nom).length < 2;
  useEffect(() => {
    let actif = true;
    if (court) return;
    const minuteur = setTimeout(() => {
      Promise.resolve()
        .then(() => client.prospects.ressemblants({ nom, prenom }))
        .then((r) => {
          if (!actif) return;
          setHorsLigne(false);
          setFiches(
            r.map(({ prospect: p, lieu_principal }) => ({
              id: p.id,
              libelle: [p.prenom, p.nom].filter(Boolean).join(' '),
              detail: [p.specialite_libelle ?? p.type_libelle, lieu_principal]
                .filter(Boolean)
                .join(' · '),
            })),
          );
        })
        .catch(async () => {
          const memoire = await lire<ListeCible[]>('ciblage.moi').catch(() => null);
          if (!actif) return;
          setHorsLigne(true);
          setFiches(
            ressemblantesLocales(memoire?.valeur ?? [], nom, prenom).map((p) => ({
              id: p.id,
              libelle: [p.prenom, p.nom].filter(Boolean).join(' '),
              detail: [p.specialite_libelle ?? p.type_libelle, p.lieu_principal?.libelle]
                .filter(Boolean)
                .join(' · '),
            })),
          );
        });
    }, 350);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [client, court, nom, prenom]);

  if (court || fiches.length === 0) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.ressemblantes, { borderColor: palette.attention }]}
    >
      <Texte variante="libelle">{t('doublons.ressemblantes')}</Texte>
      <Texte variante="discret">
        {t('doublons.ressemblantesAide')}
        {horsLigne ? ` ${t('doublons.horsLigne')}` : ''}
      </Texte>
      {fiches.map((f) => (
        <View key={f.id} style={[styles.ressemblante, { borderTopColor: palette.ligne }]}>
          <Texte>{f.libelle}</Texte>
          {f.detail ? <Texte variante="discret">{f.detail}</Texte> : null}
        </View>
      ))}
    </View>
  );
}

function Formulaire({ surTermine }: { surTermine: (p: ProspectCree) => void }) {
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
      <Ressemblantes nom={f.nom} prenom={f.prenom ?? ''} />
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
  const routeur = useRouter();
  const { client, etat } = useSession();
  const [segment, setSegment] = useState<Segment>('cible');
  const [saisie, setSaisie] = useState('');
  const [fiches, setFiches] = useState<Prospect[] | null>(null);
  const [lieux, setLieux] = useState<Etablissement[] | null>(null);
  const [total, setTotal] = useState(0);
  const [creation, setCreation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Pages de 20 (PRP-005 CA3) : « Voir plus » ajoute la suivante.
  const [page, setPage] = useState(1);
  const [suite, setSuite] = useState(false);
  const peutCreer =
    etat.statut === 'connecte' && etat.perimetre.actions.includes('prospects.creer');

  useEffect(() => {
    let actif = true;
    if (segment === 'cible') return;
    const minuteur = setTimeout(() => {
      const ajouter = page > 1;
      const requete =
        segment === 'prospects'
          ? client.prospects.liste({ q: saisie, page }).then((r) => {
              if (!actif) return;
              setFiches((avant) => (ajouter && avant ? [...avant, ...r.resultats] : r.resultats));
              setTotal(r.total);
            })
          : client.etablissements.liste({ q: saisie, page }).then((r) => {
              if (!actif) return;
              setLieux((avant) => (ajouter && avant ? [...avant, ...r.resultats] : r.resultats));
              setTotal(r.total);
            });
      requete.finally(() => actif && setSuite(false));
      requete.catch(() => undefined);
    }, 300);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [client, saisie, version, segment, page]);

  const changerSegment = (s: Segment) => {
    setSegment(s);
    setPage(1);
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
      {/* 1.4.0 : les décisions sur mes propositions quittent la Tournée de la maquette. */}
      <MesPropositions />
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
        <MaListeCible
          chercherPartout={(texte) => {
            changerSegment('prospects');
            setSaisie(texte);
          }}
        />
      ) : creation ? (
        <>
          {segment === 'prospects' ? (
            <Formulaire
              surTermine={(cree) => {
                setCreation(false);
                // PRP-008 : la décision du détecteur est annoncée au délégué.
                setMessage(
                  cree.doublon && cree.doublon !== 'aucun'
                    ? t(`doublons.saisie.${cree.doublon}`)
                    : t('prospect.mobile.creee'),
                );
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
            placeholder={
              segment === 'prospects' ? t('prospect.mobile.indice') : t('etablissement.rechercher')
            }
            value={saisie}
            onChangeText={(texte) => {
              setSaisie(texte);
              setPage(1);
            }}
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
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
              : lieux?.map((e) => (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    onPress={() => routeur.push(`/lieu/${e.id}`)}
                  >
                    <LigneEtablissement etablissement={e} />
                  </Pressable>
                ))}
          </Carte>
          {liste && liste.length < total && (
            <Bouton
              secondaire
              libelle={t('recherche.voirPlus', { reste: total - liste.length })}
              chargement={suite}
              onPress={() => {
                setSuite(true);
                setPage((p) => p + 1);
              }}
            />
          )}
        </>
      )}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', gap: 8 },
  ressemblantes: { borderWidth: 1, borderRadius: 6, padding: 12, gap: 4 },
  ressemblante: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 4 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pilules: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
