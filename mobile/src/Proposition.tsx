/**
 * Proposer une correction d'une fiche commune depuis le terrain (PRP-014), selon la maquette
 * 1.4.7 : le délégué qui découvre un mauvais numéro ou une adresse changée le signale sur place.
 * La fiche ne change qu'une fois la proposition acceptée par son superviseur ou l'administrateur
 * pays (CA1) ; la décision lui revient sur l'accueil (CA2). Sans réseau, la proposition attend
 * dans la file et part une seule fois (OFF-002).
 */
import type { Etablissement, Prospect } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { estTransitoire, mettreEnAttente, nouvelIdentifiant } from './Brouillons';
import { Alerte, Bouton, Carte, Champ, Texte, usePalette } from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { annoncerFiche, nomProspect } from './Fiches';
import { cibleEnregistree } from './MaListe';
import { police } from './polices';
import { messageErreur, useSession } from './session';

export type ObjetCorrection = 'prospect' | 'etablissement';

const CHAMPS = {
  prospect: [
    { cle: 'telephone_mobile', clavier: 'phone-pad' },
    { cle: 'telephone_pro', clavier: 'phone-pad' },
    { cle: 'courriel', clavier: 'email-address' },
    { cle: 'numero_ordre', clavier: 'default' },
  ],
  etablissement: [
    { cle: 'adresse', clavier: 'default' },
    { cle: 'telephone', clavier: 'phone-pad' },
  ],
} as const;

/** Le délégué peut-il proposer une correction ? (droit `propositions.creer`) */
export function usePeutCorriger() {
  const { etat } = useSession();
  return etat.statut === 'connecte' && etat.perimetre.actions.includes('propositions.creer');
}

/** Sous la fiche (ou dans l'en-tête de la tablette) : ouvre l'écran de correction. */
export function BoutonCorrection({
  objet,
  id,
  petit,
}: {
  objet: ObjetCorrection;
  id: string;
  petit?: boolean;
}) {
  const { t } = useTranslation();
  const routeur = useRouter();
  if (!usePeutCorriger()) return null;
  return (
    <Bouton
      variante="contour"
      petit={petit}
      libelle={t('propositions.mobile.corriger')}
      onPress={() => routeur.push(`/correction/${objet}/${id}`)}
    />
  );
}

/** L'écran (`/correction/[objet]/[id]`) : lit la fiche, puis le formulaire. */
export function EcranCorrection({ objet, id }: { objet: ObjetCorrection; id: string }) {
  const { t } = useTranslation();
  const routeur = useRouter();
  const { client } = useSession();
  const [fiche, setFiche] = useState<{
    nom: string;
    contexte: string;
    actuels: Record<string, string | null | undefined>;
  } | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let actif = true;
    const lire: Promise<NonNullable<typeof fiche>> =
      objet === 'prospect'
        ? client.prospects.detail(id).then((p: Prospect) => ({
            nom: nomProspect(p, t),
            contexte: p.specialite_libelle ?? p.type_libelle,
            actuels: p as unknown as Record<string, string>,
          }))
        : client.etablissements.detail(id).then((e: Etablissement) => ({
            nom: e.nom,
            contexte: e.type_libelle,
            actuels: e as unknown as Record<string, string>,
          }));
    lire
      .catch(async () => {
        // Sans réseau, la fiche de ma liste suffit à corriger un téléphone (OFF-002).
        const c = objet === 'prospect' ? await cibleEnregistree(id) : null;
        if (!c) throw new Error('indisponible');
        return {
          nom: nomProspect(c.prospect, t),
          contexte: c.prospect.specialite_libelle ?? c.prospect.type_libelle,
          actuels: c.prospect as unknown as Record<string, string>,
        };
      })
      .then((f) => actif && setFiche(f))
      .catch(() => actif && setErreur(true));
    return () => {
      actif = false;
    };
  }, [client, id, objet, t]);

  if (!fiche) {
    return (
      <Ecran titre={t('propositions.mobile.corriger')} retour onglets={false}>
        {erreur ? (
          <Alerte type="attention">{t('fiche.lieuHorsLigne')}</Alerte>
        ) : (
          <Texte variante="discret">{t('session.chargement')}</Texte>
        )}
      </Ecran>
    );
  }
  return (
    <FormulaireCorrection
      objet={objet}
      id={id}
      nom={fiche.nom}
      contexte={fiche.contexte}
      actuels={fiche.actuels}
      surEnvoyee={(etat) => {
        annoncerFiche(id, {
          ton: etat === 'envoyee' ? 'succes' : 'info',
          texte:
            etat === 'envoyee'
              ? t('propositions.mobile.envoyee')
              : t('propositions.mobile.horsLigne'),
        });
        routeur.back();
      }}
    />
  );
}

export function FormulaireCorrection({
  objet,
  id,
  nom,
  contexte,
  actuels,
  surEnvoyee,
}: {
  objet: ObjetCorrection;
  id: string;
  /** Nom de la fiche : sous le titre, et pour la reconnaître dans la file d'envoi (0.8.3). */
  nom?: string;
  /** Spécialité ou type, à côté du nom sur la tablette. */
  contexte?: string;
  actuels: Record<string, string | null | undefined>;
  surEnvoyee: (etat: 'envoyee' | 'attente') => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const tablette = useTablette();
  const { client } = useSession();
  const [valeurs, setValeurs] = useState(
    () =>
      Object.fromEntries(CHAMPS[objet].map((c) => [c.cle, actuels[c.cle] ?? ''])) as Record<
        string,
        string
      >,
  );
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const changements = Object.fromEntries(
    Object.entries(valeurs)
      .map(([cle, v]) => [cle, v.trim()] as const)
      .filter(([cle, v]) => v !== (actuels[cle] ?? '')),
  );
  const rien = Object.keys(changements).length === 0;

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    // OFF-002 : l'identifiant est tiré ici ; sans réseau, la proposition attend dans la file
    // et le serveur ne la créera qu'une fois.
    const saisie = { id: nouvelIdentifiant(), [objet]: id, changements, commentaire };
    try {
      await client.propositions.creer(saisie);
      surEnvoyee('envoyee');
    } catch (e) {
      if (estTransitoire(e)) {
        await mettreEnAttente({
          id: saisie.id,
          type: 'proposition',
          saisie,
          resume: nom || t('propositions.mobile.enAttente'),
        });
        surEnvoyee('attente');
      } else {
        setErreur(messageErreur(e, t('erreurs.reseau')));
        setEnvoi(false);
      }
    }
  }

  const annuler = (
    <Bouton
      variante="contour"
      petit={tablette}
      libelle={t('commun.annuler')}
      onPress={() => routeur.back()}
      style={tablette ? undefined : { flex: 1 }}
    />
  );
  const envoyerBouton = (
    <Bouton
      petit={tablette}
      libelle={t('propositions.envoyer')}
      chargement={envoi}
      desactive={rien}
      onPress={() => void envoyer()}
      style={tablette ? undefined : { flex: 2 }}
    />
  );

  const champs = CHAMPS[objet].map((c) => (
    <View key={c.cle} style={tablette ? styles.case : undefined}>
      <Champ
        libelle={t(`propositions.champs.${c.cle}`)}
        placeholder={t('propositions.mobile.nonRenseigne')}
        value={valeurs[c.cle]}
        onChangeText={(v) => setValeurs((avant) => ({ ...avant, [c.cle]: v }))}
        keyboardType={c.clavier}
        autoCapitalize="none"
        autoCorrect={false}
        modifie={c.cle in changements}
      />
    </View>
  ));

  // Tablette : ce qui change, l'ancienne valeur barrée au-dessus de la nouvelle.
  const ceQuiChange = (
    <View style={{ padding: 24, gap: 16 }}>
      <Texte variante="sousTitre" accessibilityRole="header">
        {t('propositions.mobile.ceQuiChange')}
      </Texte>
      {rien ? (
        <Texte variante="libelle">{t('propositions.mobile.aucunChangement')}</Texte>
      ) : (
        <Carte marge={0}>
          {Object.entries(changements).map(([cle, v], i, tous) => (
            <View
              key={cle}
              style={[
                styles.kv,
                i < tous.length - 1 && { borderBottomWidth: 1, borderBottomColor: p.ligne },
              ]}
            >
              <Text style={[styles.kvLibelle, { color: p.texteSecondaire }]}>
                {t(`propositions.champs.${cle}`)}
              </Text>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                {actuels[cle] ? (
                  <Text style={[styles.avant, { color: p.texteDiscret }]}>{actuels[cle]}</Text>
                ) : null}
                <Text style={[styles.apres, { color: p.texte }]}>
                  {v || t('propositions.mobile.efface')}
                </Text>
              </View>
            </View>
          ))}
        </Carte>
      )}
      <Texte variante="libelle">{t('propositions.mobile.suite')}</Texte>
    </View>
  );

  return (
    <Ecran
      titre={t('propositions.mobile.corriger')}
      surTitre={nom}
      retour
      onglets={false}
      enteteTablette={{
        surTitre: [nom, contexte].filter(Boolean).join(' · '),
        action: (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {annuler}
            {envoyerBouton}
          </View>
        ),
      }}
      pied={
        tablette ? undefined : (
          <>
            {annuler}
            {envoyerBouton}
          </>
        )
      }
      droite={tablette ? ceQuiChange : undefined}
      largeurDroite={380}
    >
      <Alerte type="info">{t('propositions.proposerAide')}</Alerte>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      {tablette ? <View style={styles.grille}>{champs}</View> : champs}
      <Champ
        libelle={t('propositions.commentaire')}
        value={commentaire}
        onChangeText={setCommentaire}
        multiline
      />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  case: { flexBasis: '45%', flexGrow: 1 },
  kv: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  kvLibelle: { flex: 1, fontFamily: police.texte, fontSize: 13.5, lineHeight: 19 },
  avant: {
    fontFamily: police.texte,
    fontSize: 13.5,
    lineHeight: 19,
    textDecorationLine: 'line-through',
  },
  apres: { fontFamily: police.texteFort, fontSize: 14, lineHeight: 20, textAlign: 'right' },
});
