/**
 * Visite imprévue (VIS-008, RG-027) : le délégué rencontre un prospect hors du planning. Il
 * dit pourquoi (CA1), la visite démarre aussitôt, rattachée au jour réel, avec la position du
 * moment ; sans réseau, elle attend dans la file. Elle reste marquée « imprévue » (CA2) et ne
 * passe pas par le superviseur.
 */
import type { ClientApi, Programme, VisiteProgramme } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { estTransitoire, mettreEnAttente, nouvelIdentifiant } from './Brouillons';
import { Alerte, Bouton, Champ, MarquePotentiel, Texte } from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { CorpsFenetre, EnteteFenetre, Fenetre, PiedFenetre } from './Fenetre';
import { ajouterAuProgramme, prendrePosition, useProgrammeGarde } from './Execution';
import { nomProspect } from './Fiches';
import { messageErreur, useSession } from './session';
import { type Choix, ChoixFait, ChoixLieu, ChoixProspect, type Lieu } from './Visites';

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
    version: 0,
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
    rapport_statut: null,
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

// ---------------------------------------------------------------------------------------------
// Le formulaire (maquette 1.5.4) : un écran sur le téléphone, une fenêtre sur la tablette

/** Annonce laissée par l'écran du téléphone ; la Tournée la reprend à son retour. */
export type Annonce = { texte: string; ton: 'info' | 'succes' };
let annonceEnAttente: Annonce | null = null;
const ecouteurs = new Set<() => void>();

export function laisserAnnonce(a: Annonce) {
  annonceEnAttente = a;
  ecouteurs.forEach((e) => e());
}

/** La Tournée reprend l'annonce laissée par un écran du téléphone (visite hors du planning, indisponibilité). */
export function useAnnonceLaissee(surAnnonce: (a: Annonce) => void) {
  const reprise = useRef(surAnnonce);
  useEffect(() => {
    reprise.current = surAnnonce;
  }, [surAnnonce]);
  useEffect(() => {
    const reprendre = () => {
      if (!annonceEnAttente) return;
      const a = annonceEnAttente;
      annonceEnAttente = null;
      reprise.current(a);
    };
    reprendre();
    ecouteurs.add(reprendre);
    return () => {
      ecouteurs.delete(reprendre);
    };
  }, []);
}

function useImprevue(programme: Programme, surFin: () => void, surAnnonce: (a: Annonce) => void) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [prospect, setProspect] = useState<Choix | null>(null);
  const [lieu, setLieu] = useState<Lieu | null>(null);
  const [justification, setJustification] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const valide = !!prospect && !!justification.trim();

  async function demarrer() {
    if (!prospect || !valide) return;
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
      setEnvoi(false);
      surFin();
    } catch (e) {
      setErreur(t('execution.refusEcart', { message: messageErreur(e, t('erreurs.reseau')) }));
      setEnvoi(false);
    }
  }

  return {
    client,
    prospect,
    changerProspect: () => {
      setProspect(null);
      setLieu(null);
    },
    setProspect,
    lieu,
    setLieu,
    justification,
    setJustification,
    envoi,
    erreur,
    valide,
    demarrer,
  };
}

type Imprevue = ReturnType<typeof useImprevue>;

function ChampsImprevue({ imprevue: i, tablette }: { imprevue: Imprevue; tablette?: boolean }) {
  const { t } = useTranslation();
  const [changerLieu, setChangerLieu] = useState(false);
  // « Gynécologue » : la spécialité seule, le lieu se lit dessous.
  const detail = i.prospect?.detail.split(' · ')[0];
  return (
    <View style={{ gap: tablette ? 14 : 16 }}>
      <Alerte type="info">{t('execution.imprevueAide')}</Alerte>
      <View style={{ gap: 6 }}>
        <Texte variante="libelle">{t('execution.prospect')}</Texte>
        {i.prospect ? (
          <ChoixFait
            libelle={[nomProspect(i.prospect, t), tablette ? detail : null]
              .filter(Boolean)
              .join(' · ')}
            gauche={
              i.prospect.potentiel ? <MarquePotentiel valeur={i.prospect.potentiel} /> : undefined
            }
            droite={t('visites.changer')}
            surAppui={i.changerProspect}
          />
        ) : (
          <ChoixProspect client={i.client} surChoix={i.setProspect} />
        )}
      </View>
      {i.prospect && (
        <View style={{ gap: 6 }}>
          <Texte variante="libelle">{t('visites.champs.etablissement')}</Texte>
          {i.lieu && !changerLieu ? (
            <ChoixFait libelle={i.lieu.nom} surAppui={() => setChangerLieu(true)} />
          ) : (
            <ChoixLieu
              client={i.client}
              prospect={i.prospect.id}
              lieu={i.lieu}
              surChoix={(l) => {
                i.setLieu(l);
                setChangerLieu(false);
              }}
            />
          )}
        </View>
      )}
      <Champ
        libelle={t('execution.justification')}
        placeholder={t('execution.justificationIndice')}
        value={i.justification}
        onChangeText={i.setJustification}
        maxLength={500}
        multiline
      />
      {i.erreur && <Alerte type="erreur">{i.erreur}</Alerte>}
    </View>
  );
}

function BoutonsImprevue({
  imprevue: i,
  surFin,
  tablette,
}: {
  imprevue: Imprevue;
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
        libelle={t('execution.demarrerImprevue')}
        chargement={i.envoi}
        desactive={!i.valide}
        onPress={() => void i.demarrer()}
        style={tablette ? undefined : { flex: 2 }}
      />
    </>
  );
}

/** « Lundi 12 octobre » : le jour réel auquel la visite sera rattachée. */
export function jourDuProgramme(programme: Programme, langue: string) {
  const long = new Intl.DateTimeFormat(langue, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${programme.aujourdhui}T12:00:00Z`));
  return long.charAt(0).toLocaleUpperCase(langue) + long.slice(1);
}

/** Téléphone : le formulaire sur son écran, ses boutons collés en bas. */
export function FormulaireImprevue({
  programme,
  surFin,
  surAnnonce,
}: {
  programme: Programme;
  surFin: () => void;
  surAnnonce: (a: Annonce) => void;
}) {
  const { t, i18n } = useTranslation();
  const imprevue = useImprevue(programme, surFin, surAnnonce);
  return (
    <Ecran
      titre={t('execution.imprevueTitre')}
      surTitre={jourDuProgramme(programme, i18n.language)}
      fermer
      surRetour={surFin}
      onglets={false}
      pied={<BoutonsImprevue imprevue={imprevue} surFin={surFin} />}
    >
      <ChampsImprevue imprevue={imprevue} />
    </Ecran>
  );
}

/** L'écran du téléphone (`/imprevue`) : il laisse son annonce à la Tournée, puis revient. */
export function EcranImprevue() {
  const { t } = useTranslation();
  const routeur = useRouter();
  const programme = useProgrammeGarde();
  const revenir = () => (routeur.canGoBack() ? routeur.back() : routeur.replace('/'));
  if (!programme)
    return (
      <Ecran titre={t('execution.imprevueTitre')} fermer surRetour={revenir} onglets={false}>
        <Texte variante="discret">{t('session.chargement')}</Texte>
      </Ecran>
    );
  return <FormulaireImprevue programme={programme} surFin={revenir} surAnnonce={laisserAnnonce} />;
}

/** Tablette : le formulaire en entier, sans cadre, dans la fenêtre. */
function ImprevueEnFenetre({
  programme,
  surFin,
  surAnnonce,
}: {
  programme: Programme;
  surFin: () => void;
  surAnnonce: (a: Annonce) => void;
}) {
  const { t } = useTranslation();
  const imprevue = useImprevue(programme, surFin, surAnnonce);
  return (
    <View>
      <EnteteFenetre titre={t('execution.imprevueTitre')} />
      <CorpsFenetre>
        <ChampsImprevue imprevue={imprevue} tablette />
      </CorpsFenetre>
      <PiedFenetre>
        <BoutonsImprevue imprevue={imprevue} surFin={surFin} tablette />
      </PiedFenetre>
    </View>
  );
}

function FenetreImprevue({
  ouverte,
  programme,
  surFin,
  surAnnonce,
}: {
  ouverte: boolean;
  programme: Programme;
  surFin: () => void;
  surAnnonce: (a: Annonce) => void;
}) {
  return (
    <Fenetre ouverte={ouverte} surFin={surFin}>
      <ImprevueEnFenetre programme={programme} surFin={surFin} surAnnonce={surAnnonce} />
    </Fenetre>
  );
}

/** Dans la Tournée : le bouton « Visite imprévue » ; un écran sur le téléphone, une fenêtre sur la tablette. */
export function VisiteImprevue({
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
  useAnnonceLaissee(surAnnonce);
  return (
    <>
      <Bouton
        secondaire
        libelle={t('execution.imprevue')}
        onPress={() => (tablette ? setOuverte(true) : routeur.push('/imprevue'))}
      />
      {tablette && (
        <FenetreImprevue
          ouverte={ouverte}
          programme={programme}
          surFin={() => setOuverte(false)}
          surAnnonce={surAnnonce}
        />
      )}
    </>
  );
}
