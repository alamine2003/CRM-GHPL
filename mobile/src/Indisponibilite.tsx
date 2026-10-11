/**
 * « Je suis indisponible aujourd'hui » (PLN-009, DC-51) : à la place de « maladie », sans motif
 * médical, déclarée le jour même depuis la Tournée, même semaine fermée. Les visites de la
 * période sont justifiées d'un coup et ne sont plus proposées. Sans réseau, la déclaration
 * attend dans la file et part seule.
 */
import type { Activite, PeriodeActivite, Programme, VisiteProgramme } from '@innov/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { estTransitoire, mettreEnAttente, nouvelIdentifiant } from './Brouillons';
import { Alerte, Bouton, Texte, usePalette } from './composants';
import { Pilule } from './Etablissements';
import { ajouterActiviteAuProgramme } from './Execution';
import { messageErreur, useSession } from './session';

const PERIODES: PeriodeActivite[] = ['journee', 'matin', 'apres_midi'];

/** La visite tombe-t-elle dans une indisponibilité déclarée (même règle que le serveur) ? */
export function couverte(
  visite: Pick<VisiteProgramme, 'date' | 'heure'>,
  activites: Pick<Activite, 'type' | 'date' | 'periode'>[],
): boolean {
  return activites.some((a) => {
    if (a.type !== 'indisponibilite' || a.date !== visite.date) return false;
    if (a.periode === 'journee') return true;
    const apresMidi = visite.heure != null && visite.heure >= '13:00';
    return (a.periode === 'apres_midi') === apresMidi;
  });
}

export function Indisponibilite({
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
  const [periode, setPeriode] = useState<PeriodeActivite>('journee');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const jour = programme.jours.find((j) => j.date === programme.aujourdhui);
  if (!jour) return null;
  // Déjà déclarée pour la journée : plus rien à proposer.
  if (jour.activites.some((a) => a.type === 'indisponibilite' && a.periode === 'journee'))
    return null;

  async function declarer() {
    setEnvoi(true);
    setErreur(null);
    const saisie = { id: nouvelIdentifiant(), periode };
    const locale: Activite = {
      id: saisie.id,
      date: programme.aujourdhui,
      periode,
      type: 'indisponibilite',
      commentaire: '',
      demande_superviseur: false,
      avec_visites: false,
    };
    try {
      await client.plannings.declarerIndisponibilite(saisie);
      surAnnonce({ texte: t('indisponibilite.declaree'), ton: 'succes' });
    } catch (e) {
      if (!estTransitoire(e)) {
        setErreur(messageErreur(e, t('erreurs.reseau')));
        setEnvoi(false);
        return;
      }
      await mettreEnAttente({
        id: nouvelIdentifiant(),
        type: 'indisponibilite',
        saisie,
        resume: t('activites.types.indisponibilite'),
      });
      surAnnonce({ texte: t('indisponibilite.enAttente'), ton: 'info' });
    }
    await ajouterActiviteAuProgramme(locale);
    setEnvoi(false);
    setOuvert(false);
  }

  if (!ouvert)
    return (
      <Bouton secondaire libelle={t('indisponibilite.ouvrir')} onPress={() => setOuvert(true)} />
    );
  return (
    <View
      style={{
        gap: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: p.ligne,
        paddingTop: 12,
      }}
    >
      <Texte variante="sousTitre">{t('indisponibilite.titre')}</Texte>
      <Texte variante="discret">{t('indisponibilite.aide')}</Texte>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PERIODES.map((x) => (
          <Pilule
            key={x}
            libelle={t(`indisponibilite.periodes.${x}`)}
            actif={periode === x}
            onPress={() => setPeriode(x)}
          />
        ))}
      </View>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      <Bouton
        libelle={t('indisponibilite.confirmer')}
        chargement={envoi}
        onPress={() => void declarer()}
      />
      <Bouton secondaire libelle={t('commun.annuler')} onPress={() => setOuvert(false)} />
    </View>
  );
}
