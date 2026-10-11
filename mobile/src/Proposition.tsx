/**
 * Proposer une correction d'une fiche commune depuis le terrain (PRP-014) : le délégué qui
 * découvre un mauvais numéro ou une adresse changée le signale sur place. La fiche ne change
 * qu'une fois la proposition acceptée par son superviseur ou l'administrateur pays (CA1) ; la
 * décision lui revient sur l'accueil (CA2).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { estTransitoire, mettreEnAttente, nouvelIdentifiant } from './Brouillons';
import { Alerte, Bouton, Carte, Champ, Texte } from './composants';
import { messageErreur, useSession } from './session';

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

export function ProposerCorrection({
  objet,
  id,
  nom,
  actuels,
}: {
  objet: 'prospect' | 'etablissement';
  id: string;
  /** Nom de la fiche, pour la reconnaître dans la file d'envoi (0.8.3). */
  nom?: string;
  actuels: Record<string, string | null | undefined>;
}) {
  const { t } = useTranslation();
  const { client, etat } = useSession();
  const initiales = () =>
    Object.fromEntries(CHAMPS[objet].map((c) => [c.cle, actuels[c.cle] ?? ''])) as Record<
      string,
      string
    >;
  const [ouvert, setOuvert] = useState(false);
  const [valeurs, setValeurs] = useState(initiales);
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoyee, setEnvoyee] = useState<'envoyee' | 'attente' | null>(null);

  if (etat.statut !== 'connecte' || !etat.perimetre.actions.includes('propositions.creer')) {
    return null;
  }
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
      setEnvoyee('envoyee');
      setOuvert(false);
    } catch (e) {
      if (estTransitoire(e)) {
        await mettreEnAttente({
          id: saisie.id,
          type: 'proposition',
          saisie,
          resume: nom || t('propositions.mobile.enAttente'),
        });
        setEnvoyee('attente');
        setOuvert(false);
      } else setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }

  if (!ouvert) {
    return (
      <View style={{ gap: 12 }}>
        {envoyee === 'envoyee' && <Alerte type="succes">{t('propositions.mobile.envoyee')}</Alerte>}
        {envoyee === 'attente' && <Alerte type="info">{t('propositions.mobile.horsLigne')}</Alerte>}
        <Bouton
          secondaire
          libelle={t('propositions.mobile.corriger')}
          onPress={() => {
            setValeurs(initiales());
            setCommentaire('');
            setEnvoyee(null);
            setOuvert(true);
          }}
        />
      </View>
    );
  }
  return (
    <Carte style={{ gap: 12 }}>
      <Texte variante="sousTitre">{t('propositions.mobile.corriger')}</Texte>
      <Texte variante="discret">{t('propositions.proposerAide')}</Texte>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      {CHAMPS[objet].map((c) => (
        <Champ
          key={c.cle}
          libelle={t(`propositions.champs.${c.cle}`)}
          value={valeurs[c.cle]}
          onChangeText={(v) => setValeurs((avant) => ({ ...avant, [c.cle]: v }))}
          keyboardType={c.clavier}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ))}
      <Champ
        libelle={t('propositions.commentaire')}
        value={commentaire}
        onChangeText={setCommentaire}
        multiline
      />
      {rien && <Texte variante="discret">{t('propositions.mobile.aucunChangement')}</Texte>}
      <Bouton
        libelle={t('propositions.envoyer')}
        chargement={envoi}
        desactive={rien}
        onPress={() => void envoyer()}
      />
      <Bouton secondaire libelle={t('commun.annuler')} onPress={() => setOuvert(false)} />
    </Carte>
  );
}
