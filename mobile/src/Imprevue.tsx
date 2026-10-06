/**
 * Visite imprévue (VIS-008, RG-027) : le délégué rencontre un prospect hors du planning. Il
 * dit pourquoi (CA1), la visite démarre aussitôt, rattachée au jour réel, avec la position du
 * moment ; sans réseau, elle attend dans la file. Elle reste marquée « imprévue » (CA2) et ne
 * passe pas par le superviseur.
 */
import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { estTransitoire, mettreEnAttente, nouvelIdentifiant } from './Brouillons';
import { Alerte, Bouton, Champ, Texte, usePalette } from './composants';
import { ajouterAuProgramme, prendrePosition } from './Execution';
import { nomProspect } from './Fiches';
import { messageErreur, useSession } from './session';
import { type Choix, ChoixLieu, ChoixProspect, LigneChoix, type Lieu } from './Visites';

/** L'heure du moment dans le fuseau du pays, « HH:MM ». */
function heureLocale(iso: string, fuseau: string) {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: fuseau,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toTimeString().slice(0, 5);
  }
}

/** Déclare la visite imprévue ; rend la visite telle qu'elle apparaît dans le programme. */
export async function declarerImprevue(
  client: ClientApi,
  programme: Programme,
  prospect: Choix,
  lieu: Lieu | null,
  justification: string,
): Promise<{ issue: 'parti' | 'en_attente'; visite: VisiteProgramme }> {
  const position = programme.geolocalisation
    ? await prendrePosition(programme.attente_gps_secondes)
    : null;
  const le = new Date().toISOString();
  const saisie = {
    id: nouvelIdentifiant(),
    le,
    prospect: prospect.id,
    etablissement: lieu?.id ?? null,
    justification: justification.trim(),
    ...(position ?? {}),
  };
  const locale: VisiteProgramme = {
    id: saisie.id,
    date: programme.aujourdhui,
    heure: heureLocale(le, programme.fuseau),
    prospect: {
      id: prospect.id,
      civilite: prospect.civilite ?? '',
      prenom: prospect.prenom ?? '',
      nom: prospect.nom,
      type_libelle: prospect.detail,
      potentiel: prospect.potentiel,
    },
    etablissement: lieu,
    reseau: null,
    objectif: '',
    note: '',
    statut: 'en_cours',
    manquants: [],
    passage: null,
    ordre: 99,
    debut_le: le,
    sans_gps: programme.geolocalisation && !position,
    distance_debut_m: null,
    fin_le: null,
    fin_sans_gps: false,
    distance_fin_m: null,
    motif_ecart: null,
    commentaire_ecart: '',
    ecart_le: null,
    reportee_de: null,
    report: null,
    est_imprevue: true,
    justification: saisie.justification,
    modification_en_attente: false,
  };
  try {
    const recue = await client.visites.imprevue(saisie);
    const visite = { ...locale, ...recue, modification_en_attente: false };
    await ajouterAuProgramme(visite);
    return { issue: 'parti', visite };
  } catch (e) {
    if (!estTransitoire(e)) throw e;
    await mettreEnAttente({
      id: nouvelIdentifiant(),
      type: 'imprevue_visite',
      visite: saisie.id,
      saisie,
      resume: [locale.heure, prospect.prenom, prospect.nom].filter(Boolean).join(' '),
    });
    await ajouterAuProgramme(locale);
    return { issue: 'en_attente', visite: locale };
  }
}

export function VisiteImprevue({
  programme,
  surAnnonce,
}: {
  programme: Programme;
  surAnnonce: (annonce: { texte: string; ton: 'info' | 'succes' }) => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const p = usePalette();
  const [ouvert, setOuvert] = useState(false);
  const [prospect, setProspect] = useState<Choix | null>(null);
  const [lieu, setLieu] = useState<Lieu | null>(null);
  const [justification, setJustification] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function fermer() {
    setOuvert(false);
    setProspect(null);
    setLieu(null);
    setJustification('');
    setErreur(null);
  }

  async function demarrer() {
    if (!prospect || !justification.trim()) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const { issue, visite } = await declarerImprevue(
        client,
        programme,
        prospect,
        lieu,
        justification,
      );
      const texte = t('execution.imprevueNote', {
        nom: nomProspect(prospect, t),
        heure: visite.heure,
      });
      surAnnonce({
        texte: issue === 'en_attente' ? t('execution.horsLigneEcart', { texte }) : texte,
        ton: issue === 'en_attente' ? 'info' : 'succes',
      });
      fermer();
    } catch (e) {
      setErreur(t('execution.refusEcart', { message: messageErreur(e, t('erreurs.reseau')) }));
    } finally {
      setEnvoi(false);
    }
  }

  if (!ouvert)
    return <Bouton secondaire libelle={t('execution.imprevue')} onPress={() => setOuvert(true)} />;
  // Le panneau se détache de la liste du jour par un filet, comme une nouvelle section.
  return (
    <View
      style={{
        gap: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: p.ligne,
        paddingTop: 12,
      }}
    >
      <Texte variante="sousTitre">{t('execution.imprevueTitre')}</Texte>
      <Texte variante="discret">{t('execution.imprevueAide')}</Texte>
      <Texte variante="libelle">{t('execution.prospect')}</Texte>
      {prospect ? (
        <LigneChoix
          choix={prospect}
          onPress={() => {
            setProspect(null);
            setLieu(null);
          }}
          note={t('visites.changer')}
        />
      ) : (
        <ChoixProspect client={client} surChoix={setProspect} />
      )}
      {prospect && (
        <>
          <Texte variante="libelle">{t('visites.champs.etablissement')}</Texte>
          <ChoixLieu client={client} prospect={prospect.id} lieu={lieu} surChoix={setLieu} />
        </>
      )}
      <Champ
        libelle={t('execution.justification')}
        placeholder={t('execution.justificationIndice')}
        value={justification}
        onChangeText={setJustification}
        maxLength={500}
        multiline
      />
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      <Bouton
        libelle={t('execution.demarrerImprevue')}
        chargement={envoi}
        desactive={!prospect || !justification.trim()}
        onPress={() => void demarrer()}
      />
      <Bouton secondaire libelle={t('execution.annuler')} onPress={fermer} />
    </View>
  );
}
