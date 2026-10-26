/**
 * « Indisponibilité imprévue » (PLN-009, DC-51), selon la maquette 1.5.5 : à la place de
 * « maladie », sans motif médical, déclarée le jour même depuis la Tournée, même semaine
 * fermée. Le délégué choisit la période (la journée, le matin ou l'après-midi) et lit pour
 * chacune combien de visites seraient justifiées d'un coup ; elles ne sont plus proposées.
 * Sans réseau, la déclaration attend dans la file et part seule. Téléphone : un écran à part ;
 * tablette : une fenêtre sur la Tournée.
 */
import type { Activite, PeriodeActivite, Programme, VisiteProgramme } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { estTransitoire, mettreEnAttente, nouvelIdentifiant } from './Brouillons';
import { Alerte, Bouton, Carte, Texte, usePalette } from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { ajouterActiviteAuProgramme, useProgrammeGarde } from './Execution';
import { CorpsFenetre, EnteteFenetre, Fenetre, PiedFenetre } from './Fenetre';
import { type Annonce, jourDuProgramme, laisserAnnonce } from './Imprevue';
import { police } from './polices';
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
    return (a.periode === 'apres_midi') === estApresMidi(visite);
  });
}

const estApresMidi = (v: Pick<VisiteProgramme, 'heure'>) => v.heure != null && v.heure >= '13:00';

/** Ce que chaque période ferait, lu dans le programme du jour (visites restantes, déjà faites). */
export type ResumePeriode = {
  periode: PeriodeActivite;
  /** Visites encore prévues, qui seraient justifiées d'un coup. */
  concernees: number;
  /** Visites déjà faites dans la période, qui ne changent pas. */
  faites: number;
  /** Déjà déclarée (ou incluse dans une journée déclarée) : le serveur la refuserait. */
  declaree: boolean;
};

export function resumeDesPeriodes(programme: Programme): ResumePeriode[] {
  const jour = programme.jours.find((j) => j.date === programme.aujourdhui);
  const declarees = (jour?.activites ?? []).filter((a) => a.type === 'indisponibilite');
  return PERIODES.map((periode) => {
    const dans = (jour?.visites ?? []).filter(
      (v) => periode === 'journee' || (periode === 'apres_midi') === estApresMidi(v),
    );
    return {
      periode,
      concernees: dans.filter((v) => v.statut === 'prevue' && !couverte(v, declarees)).length,
      faites: dans.filter((v) => v.statut === 'effectuee').length,
      // Le serveur refuse une journée dès qu'une période est déclarée, et deux fois la même.
      declaree:
        declarees.length > 0 &&
        (periode === 'journee' ||
          declarees.some((a) => a.periode === periode || a.periode === 'journee')),
    };
  });
}

function useIndisponibilite(
  programme: Programme,
  surFin: () => void,
  surAnnonce: (a: Annonce) => void,
) {
  const { t } = useTranslation();
  const { client } = useSession();
  const resume = resumeDesPeriodes(programme);
  const [choix, setChoix] = useState<PeriodeActivite | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Par défaut, la première période encore possible (la journée, tant que rien n'est déclaré).
  const periode = choix ?? resume.find((r) => !r.declaree)?.periode ?? null;

  async function declarer() {
    if (!periode) return;
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
    surFin();
  }

  return { resume, periode, setChoix, envoi, erreur, declarer };
}

type Indisponible = ReturnType<typeof useIndisponibilite>;

/** « 4 visites restantes », « 2 visites déjà faites : aucune concernée », « Déjà déclarée »… */
function detailPeriode(r: ResumePeriode, t: ReturnType<typeof useTranslation>['t']) {
  if (r.declaree) return t('indisponibilite.dejaDeclaree');
  if (r.concernees > 0)
    return t(r.periode === 'journee' ? 'indisponibilite.restantes' : 'indisponibilite.concernees', {
      count: r.concernees,
    });
  if (r.faites > 0 && r.periode !== 'journee')
    return t('indisponibilite.faitesAucune', { count: r.faites });
  return t(
    r.periode === 'journee' ? 'indisponibilite.aucuneRestante' : 'indisponibilite.aucuneConcernee',
  );
}

/** Une période à cocher (.li) : le rond de 20 px, son nom, ce qu'elle concerne. */
function LignePeriode({
  resume: r,
  choisie,
  derniere,
  surAppui,
}: {
  resume: ResumePeriode;
  choisie: boolean;
  derniere: boolean;
  surAppui: () => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: choisie, disabled: r.declaree }}
      disabled={r.declaree}
      onPress={surAppui}
      style={({ pressed }) => [
        styles.ligne,
        !derniere && { borderBottomWidth: 1, borderBottomColor: p.ligne },
        r.declaree && { opacity: 0.5 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.rond, { borderColor: choisie ? p.accentPlein : p.texteDiscret }]}>
        {choisie && <View style={[styles.point, { backgroundColor: p.accentPlein }]} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[
            styles.nom,
            { color: p.texte, fontFamily: choisie ? police.texteGras : police.texteFort },
          ]}
        >
          {t(`indisponibilite.periodes.${r.periode}`)}
        </Text>
        <Text style={[styles.detail, { color: p.texteSecondaire }]}>{detailPeriode(r, t)}</Text>
      </View>
    </Pressable>
  );
}

function ChoixPeriode({ indisponible: i }: { indisponible: Indisponible }) {
  const { t } = useTranslation();
  return (
    <Carte marge={0} style={{ overflow: 'hidden' }}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('indisponibilite.periode')}>
        {i.resume.map((r, k) => (
          <LignePeriode
            key={r.periode}
            resume={r}
            choisie={i.periode === r.periode}
            derniere={k === i.resume.length - 1}
            surAppui={() => i.setChoix(r.periode)}
          />
        ))}
      </View>
    </Carte>
  );
}

function BoutonsIndisponibilite({
  indisponible: i,
  surFin,
  tablette,
}: {
  indisponible: Indisponible;
  surFin: () => void;
  tablette?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Bouton
        variante="contour"
        petit={tablette}
        libelle={t('commun.annuler')}
        onPress={surFin}
        style={tablette ? undefined : { flex: 1 }}
      />
      <Bouton
        petit={tablette}
        libelle={t('indisponibilite.confirmer')}
        chargement={i.envoi}
        desactive={!i.periode}
        onPress={() => void i.declarer()}
        style={tablette ? undefined : { flex: 2 }}
      />
    </>
  );
}

/** Téléphone : le choix de la période sur son écran, ses boutons collés en bas. */
export function FormulaireIndisponibilite({
  programme,
  surFin,
  surAnnonce,
}: {
  programme: Programme;
  surFin: () => void;
  surAnnonce: (a: Annonce) => void;
}) {
  const { t, i18n } = useTranslation();
  const indisponible = useIndisponibilite(programme, surFin, surAnnonce);
  return (
    <Ecran
      titre={t('indisponibilite.titre')}
      surTitre={jourDuProgramme(programme, i18n.language)}
      fermer
      surRetour={surFin}
      onglets={false}
      pied={<BoutonsIndisponibilite indisponible={indisponible} surFin={surFin} />}
    >
      <Alerte type="info">{t('indisponibilite.aide')}</Alerte>
      <View style={{ gap: 8 }}>
        <Texte variante="sousTitre" accessibilityRole="header">
          {t('indisponibilite.periode')}
        </Texte>
        <ChoixPeriode indisponible={indisponible} />
      </View>
      {indisponible.erreur && <Alerte type="erreur">{indisponible.erreur}</Alerte>}
    </Ecran>
  );
}

/** L'écran du téléphone (`/indisponibilite`) : il laisse son annonce à la Tournée, puis revient. */
export function EcranIndisponibilite() {
  const { t } = useTranslation();
  const routeur = useRouter();
  const programme = useProgrammeGarde();
  const revenir = () => (routeur.canGoBack() ? routeur.back() : routeur.replace('/'));
  if (!programme)
    return (
      <Ecran titre={t('indisponibilite.titre')} fermer surRetour={revenir} onglets={false}>
        <Texte variante="discret">{t('session.chargement')}</Texte>
      </Ecran>
    );
  return (
    <FormulaireIndisponibilite programme={programme} surFin={revenir} surAnnonce={laisserAnnonce} />
  );
}

/** Tablette : le choix en entier, sans cadre, dans la fenêtre. */
function IndisponibiliteEnFenetre({
  programme,
  surFin,
  surAnnonce,
}: {
  programme: Programme;
  surFin: () => void;
  surAnnonce: (a: Annonce) => void;
}) {
  const { t } = useTranslation();
  const indisponible = useIndisponibilite(programme, surFin, surAnnonce);
  return (
    <View>
      <EnteteFenetre titre={t('indisponibilite.titre')} aide={t('indisponibilite.aide')} />
      <CorpsFenetre style={{ paddingTop: 12, paddingBottom: 12, gap: 12 }}>
        <ChoixPeriode indisponible={indisponible} />
        {indisponible.erreur && <Alerte type="erreur">{indisponible.erreur}</Alerte>}
      </CorpsFenetre>
      <PiedFenetre style={{ paddingTop: 12 }}>
        <BoutonsIndisponibilite indisponible={indisponible} surFin={surFin} tablette />
      </PiedFenetre>
    </View>
  );
}

/**
 * Dans la Tournée : « Je suis indisponible aujourd'hui » ; un écran sur le téléphone, une
 * fenêtre sur la tablette. Rien à proposer si la journée entière est déjà déclarée.
 */
export function Indisponibilite({
  programme,
  surAnnonce,
}: {
  programme: Programme;
  surAnnonce: (annonce: Annonce) => void;
}) {
  const { t } = useTranslation();
  const routeur = useRouter();
  const tablette = useTablette();
  const [ouverte, setOuverte] = useState(false);
  const jour = programme.jours.find((j) => j.date === programme.aujourdhui);
  if (!jour) return null;
  if (jour.activites.some((a) => a.type === 'indisponibilite' && a.periode === 'journee'))
    return null;
  return (
    <>
      <Bouton
        secondaire
        libelle={t('indisponibilite.ouvrir')}
        onPress={() => (tablette ? setOuverte(true) : routeur.push('/indisponibilite'))}
      />
      {tablette && (
        <Fenetre ouverte={ouverte} surFin={() => setOuverte(false)}>
          <IndisponibiliteEnFenetre
            programme={programme}
            surFin={() => setOuverte(false)}
            surAnnonce={surAnnonce}
          />
        </Fenetre>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  ligne: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  rond: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  point: { width: 9, height: 9, borderRadius: 5 },
  nom: { fontSize: 15, lineHeight: 21 },
  detail: { fontFamily: police.texte, fontSize: 13, lineHeight: 18 },
});
