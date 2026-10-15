/**
 * Nouveau prospect (PRP-006, PRP-007, PRP-008), selon la maquette 1.4.4 : nom et prénom, les
 * fiches qui leur ressemblent (à ouvrir plutôt qu'à doubler), le type et la spécialité,
 * l'établissement d'exercice, le potentiel et le mobile. La fiche créée attend la validation de
 * l'administrateur pays ; la décision du détecteur de doublons s'affiche sur la fiche.
 */
import type {
  Etablissement,
  ListeCible,
  Potentiel,
  SaisieProspect,
  ValeurReferentiel,
} from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lire } from './baseLocale';
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  ChampRecherche,
  Icone,
  ListeDeroulante,
  MarquePotentiel,
  Segments,
  Texte,
  usePalette,
} from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { annoncerFiche, nomProspect } from './Fiches';
import { suivreEtablissementCree } from './NouvelEtablissement';
import { police } from './polices';
import { normaliserNom, ressemblantesLocales } from './ressemblances';
import { messageErreur, useSession } from './session';

/** Indicatif téléphonique du pays, en aide dans le champ du mobile. */
const INDICATIFS: Record<string, string> = {
  SN: '+221', ML: '+223', GN: '+224', CI: '+225', BF: '+226', NE: '+227', TG: '+228',
  BJ: '+229', MR: '+222', CM: '+237', GA: '+241', CG: '+242', CD: '+243',
}; // prettier-ignore

interface Ressemblante {
  id: string;
  potentiel: Potentiel;
  libelle: string;
  detail: string;
}

/**
 * PRP-007 : fiches ressemblantes pendant la saisie. En ligne, le serveur cherche dans tout le
 * pays ; sans réseau, la liste cible gardée sur le téléphone sert de référence (CA2).
 */
function useRessemblantes(nom: string, prenom: string) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [fiches, setFiches] = useState<Ressemblante[]>([]);
  const [horsLigne, setHorsLigne] = useState(false);
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
            r.map(({ prospect: f, lieu_principal }) => ({
              id: f.id,
              potentiel: f.potentiel,
              libelle: nomProspect(f, t),
              detail: [f.specialite_libelle ?? f.type_libelle, lieu_principal]
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
            ressemblantesLocales(memoire?.valeur ?? [], nom, prenom).map((f) => ({
              id: f.id,
              potentiel: f.potentiel,
              libelle: nomProspect(f, t),
              detail: [f.specialite_libelle ?? f.type_libelle, f.lieu_principal?.libelle]
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
  }, [client, court, nom, prenom, t]);

  return { fiches: court ? [] : fiches, horsLigne, court };
}

function LigneRessemblante({
  fiche,
  premiere,
  bordure = true,
}: {
  fiche: Ressemblante;
  premiere: boolean;
  bordure?: boolean;
}) {
  const p = usePalette();
  const routeur = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => routeur.push(`/fiche/${fiche.id}`)}
      style={({ pressed }) => [
        styles.ligne,
        (bordure || !premiere) && { borderTopWidth: 1, borderTopColor: p.ligne },
        pressed && { backgroundColor: p.fond },
      ]}
    >
      <MarquePotentiel valeur={fiche.potentiel} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={[styles.nom, { color: p.texte }]}>
          {fiche.libelle}
        </Text>
        {fiche.detail ? (
          <Text numberOfLines={1} style={[styles.meta, { color: p.texteSecondaire }]}>
            {fiche.detail}
          </Text>
        ) : null}
      </View>
      <Icone nom="chevron-right" taille={20} couleur={p.texteDiscret} />
    </Pressable>
  );
}

/** L'établissement d'exercice : recherche dans les lieux du pays, ou création sur place. */
function ChoixEtablissement({
  choisi,
  surChoix,
}: {
  choisi: Etablissement | null;
  surChoix: (e: Etablissement | null) => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const tablette = useTablette();
  const { client } = useSession();
  const [saisie, setSaisie] = useState('');
  const [resultats, setResultats] = useState<Etablissement[]>([]);
  const routeur = useRouter();

  // L'établissement créé sur l'écran « Nouvel établissement » revient ici, choisi.
  useEffect(() => suivreEtablissementCree(surChoix), [surChoix]);

  useEffect(() => {
    let actif = true;
    if (saisie.trim().length < 2) return;
    const minuteur = setTimeout(() => {
      client.etablissements
        .liste({ q: saisie, page: 1 })
        .then((r) => actif && setResultats(r.resultats.slice(0, 5)))
        .catch(() => undefined);
    }, 300);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [client, saisie]);

  const titre = <Texte variante="libelle">{t('mobile.nouveauProspect.etablissement')}</Texte>;
  if (choisi) {
    return (
      <View style={{ gap: 6 }}>
        {titre}
        <Carte marge={0}>
          <View style={styles.ligne}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[styles.nom, { color: p.texte }]}>{choisi.nom}</Text>
              <Text style={[styles.meta, { color: p.texteSecondaire }]}>
                {[choisi.type_libelle, choisi.localite?.libelle ?? choisi.secteur.libelle]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Bouton
              variante="fantome"
              petit
              libelle={t('mobile.nouveauProspect.changer')}
              onPress={() => surChoix(null)}
            />
          </View>
        </Carte>
      </View>
    );
  }
  const ajouter = (
    <Bouton
      variante="contour"
      petit={!tablette}
      icone="plus"
      libelle={t('mobile.nouveauProspect.ajouterEtablissement')}
      onPress={() => routeur.push('/etablissement/nouveau?pour=prospect')}
      style={tablette ? undefined : { alignSelf: 'stretch', justifyContent: 'flex-start' }}
    />
  );
  const recherche = (
    <ChampRecherche
      libelle={t('mobile.nouveauProspect.etablissement')}
      placeholder={t('mobile.nouveauProspect.indiceEtablissement')}
      value={saisie}
      onChangeText={setSaisie}
      style={tablette ? { flex: 1 } : undefined}
    />
  );
  return (
    <View style={{ gap: 8 }}>
      {titre}
      {tablette ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {recherche}
          {ajouter}
        </View>
      ) : (
        recherche
      )}
      {saisie.trim().length >= 2 && resultats.length > 0 && (
        <Carte marge={0}>
          {resultats.map((e, i) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              onPress={() => surChoix(e)}
              style={({ pressed }) => [
                styles.ligne,
                i > 0 && { borderTopWidth: 1, borderTopColor: p.ligne },
                pressed && { backgroundColor: p.fond },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={[styles.nom, { color: p.texte }]}>
                  {e.nom}
                </Text>
                <Text numberOfLines={1} style={[styles.meta, { color: p.texteSecondaire }]}>
                  {[e.type_libelle, e.localite?.libelle ?? e.secteur.libelle]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </Pressable>
          ))}
        </Carte>
      )}
      {!tablette && ajouter}
    </View>
  );
}

/** « Les doublons sont vérifiés à l'enregistrement » : une bulle qui s'efface d'elle-même. */
function Bulle({ texte }: { texte: string }) {
  const tablette = useTablette();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const minuteur = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(minuteur);
  }, []);
  if (!visible) return null;
  return (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={[styles.bulle, tablette ? styles.bulleTablette : styles.bulleTelephone]}
      pointerEvents="none"
    >
      <Text style={styles.bulleTexte}>{texte}</Text>
    </View>
  );
}

export function EcranNouveauProspect() {
  const { t } = useTranslation();
  const routeur = useRouter();
  const tablette = useTablette();
  const { client, etat } = useSession();
  const [valeurs, setValeurs] = useState<ValeurReferentiel[]>([]);
  const [f, setF] = useState<SaisieProspect>({ nom: '', prenom: '', type: null, potentiel: 'B' });
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const { fiches, horsLigne, court } = useRessemblantes(f.nom ?? '', f.prenom ?? '');
  const pays = etat.statut === 'connecte' ? etat.perimetre.pays_actif?.code : undefined;

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
  // Le type le plus courant (le premier de la liste du pays) est proposé d'office.
  const typeChoisi = f.type ?? types[0]?.id ?? null;
  const specialites = valeurs.filter(
    (v) => v.liste === 'specialite' && (!v.parent || v.parent === typeChoisi),
  );

  async function creer() {
    setErreur(null);
    setEnvoi(true);
    try {
      const cree = await client.prospects.creer({
        ...f,
        type: typeChoisi,
        civilite: f.civilite ?? 'dr',
      });
      // Le lieu d'exercice suit la fiche nouvelle ; une saisie rattachée à une fiche existante
      // (doublon certain) ne le modifie pas : c'est une fiche commune.
      if (etablissement && cree.doublon !== 'certain') {
        await client.exercices
          .ajouter(cree.id, { etablissement: etablissement.id, principal: true })
          .catch(() => undefined);
      }
      // PRP-008 : la décision du détecteur est annoncée au délégué, sur la fiche.
      annoncerFiche(cree.id, {
        ton: 'succes',
        texte:
          cree.doublon && cree.doublon !== 'aucun'
            ? t(`doublons.saisie.${cree.doublon}`)
            : t('prospect.mobile.creee'),
      });
      routeur.replace(`/fiche/${cree.id}`);
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }

  const pret = (f.nom ?? '').trim().length > 0 && !!typeChoisi;
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
      libelle={t('prospect.mobile.creer')}
      chargement={envoi}
      desactive={!pret}
      onPress={() => void creer()}
      style={tablette ? { minWidth: 150 } : { flex: 2 }}
    />
  );

  const ressemblantes =
    !court && fiches.length > 0 ? (
      tablette ? (
        <View style={{ gap: 12 }}>
          <Texte variante="sousTitre" accessibilityRole="header">
            {t('mobile.nouveauProspect.ressemblantes')}
          </Texte>
          <Texte variante="libelle">
            {t('mobile.nouveauProspect.ressemblantesAide')}
            {horsLigne ? ` ${t('doublons.horsLigne')}` : ''}
          </Texte>
          <Carte marge={0} style={{ overflow: 'hidden' }}>
            {fiches.map((x, i) => (
              <LigneRessemblante key={x.id} fiche={x} premiere={i === 0} bordure={false} />
            ))}
          </Carte>
        </View>
      ) : (
        <Carte marge={0}>
          <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 6, gap: 2 }}>
            <Texte variante="sousTitre" accessibilityRole="header">
              {t('mobile.nouveauProspect.ressemblantes')}
            </Texte>
            <Texte variante="libelle">
              {t('mobile.nouveauProspect.ressemblantesAide')}
              {horsLigne ? ` ${t('doublons.horsLigne')}` : ''}
            </Texte>
          </View>
          {fiches.map((x, i) => (
            <LigneRessemblante key={x.id} fiche={x} premiere={i === 0} />
          ))}
        </Carte>
      )
    ) : tablette ? (
      <View style={{ gap: 12 }}>
        <Texte variante="sousTitre" accessibilityRole="header">
          {t('mobile.nouveauProspect.ressemblantes')}
        </Texte>
        <Texte variante="libelle">{t('mobile.nouveauProspect.aucuneRessemblante')}</Texte>
      </View>
    ) : null;

  const deux = (a: React.ReactNode, b: React.ReactNode) => (
    <View style={styles.grille}>
      <View style={styles.case}>{a}</View>
      <View style={styles.case}>{b}</View>
    </View>
  );
  const nom = (
    <Champ
      libelle={t('prospect.champs.nom')}
      value={f.nom}
      onChangeText={(x) => setF({ ...f, nom: x })}
      autoCapitalize="words"
    />
  );
  const prenom = (
    <Champ
      libelle={t('prospect.champs.prenom')}
      value={f.prenom}
      onChangeText={(x) => setF({ ...f, prenom: x })}
      autoCapitalize="words"
    />
  );
  const type = (
    <ListeDeroulante
      libelle={t('prospect.champs.type')}
      valeur={typeChoisi}
      options={types}
      surChoix={(id) => setF({ ...f, type: id, specialite: null })}
    />
  );
  const specialite =
    specialites.length > 0 ? (
      <ListeDeroulante
        libelle={t('prospect.champs.specialite')}
        valeur={f.specialite}
        options={specialites}
        surChoix={(id) => setF({ ...f, specialite: id })}
      />
    ) : null;
  const potentiel = (
    <View style={{ gap: 6 }}>
      <Texte variante="libelle">{t('prospect.champs.potentiel')}</Texte>
      <Segments
        libelle={t('prospect.champs.potentiel')}
        options={(['A', 'B', 'C'] as const).map((v) => ({
          cle: v,
          libelle: v,
          lu: t(`prospect.potentiels.${v}`),
        }))}
        valeur={f.potentiel ?? 'B'}
        surChoix={(v) => setF({ ...f, potentiel: v })}
      />
    </View>
  );
  const mobile = (
    <Champ
      libelle={t('prospect.champs.telephoneMobile')}
      placeholder={(pays && INDICATIFS[pays]) || '+'}
      value={f.telephone_mobile ?? ''}
      onChangeText={(x) => setF({ ...f, telephone_mobile: x })}
      keyboardType="phone-pad"
    />
  );
  const choixLieu = <ChoixEtablissement choisi={etablissement} surChoix={setEtablissement} />;

  return (
    <View style={{ flex: 1 }}>
      <Ecran
        titre={t('mobile.nouveauProspect.titre')}
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
        droite={
          tablette ? <View style={{ padding: 24, gap: 12 }}>{ressemblantes}</View> : undefined
        }
        largeurDroite={400}
      >
        {erreur && <Alerte type="erreur">{erreur}</Alerte>}
        {deux(nom, prenom)}
        {tablette ? (
          <>
            {deux(type, specialite)}
            {choixLieu}
            {deux(potentiel, mobile)}
          </>
        ) : (
          <>
            {ressemblantes}
            {type}
            {specialite}
            {choixLieu}
            {potentiel}
            {mobile}
          </>
        )}
      </Ecran>
      <Bulle texte={t('mobile.nouveauProspect.verifies')} />
    </View>
  );
}

const styles = StyleSheet.create({
  grille: { flexDirection: 'row', gap: 12 },
  case: { flex: 1, minWidth: 0 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  nom: { fontFamily: police.texteGras, fontSize: 15.5, lineHeight: 21 },
  meta: { fontFamily: police.texte, fontSize: 13, lineHeight: 18 },
  champ: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valeur: { flex: 1, fontFamily: police.texte, fontSize: 15 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  bulle: {
    position: 'absolute',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#1B2A5B',
    shadowColor: '#0F1A3D',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  bulleTelephone: { left: 16, right: 16, bottom: 104 },
  bulleTablette: { bottom: 32, alignSelf: 'center', width: 380, left: '50%', marginLeft: -190 },
  bulleTexte: { color: '#FFFFFF', fontFamily: police.texteMoyen, fontSize: 14, lineHeight: 20 },
});
