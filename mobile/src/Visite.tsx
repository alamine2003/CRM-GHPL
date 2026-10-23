/**
 * Écran d'une visite et déclaration d'un écart, selon la maquette 1.4.1.
 *
 * Téléphone : le prospect et le lieu, les fiches, la dernière visite chez ce prospect ; les
 * actions du moment collées en bas (« Prospect absent » et « Démarrer la visite », puis
 * « Terminer », puis le rapport). Un écart s'ouvre sur son propre écran : motif obligatoire en
 * liste à cocher (RG-031), commentaire facultatif.
 * Tablette : les visites du jour à gauche ; à droite le prospect en grand, ses chiffres, les
 * actions, la dernière visite et la position. Un écart s'ouvre en fenêtre sur la journée.
 *
 * Démarrer, terminer et chaque écart suivent les mêmes règles qu'avant (VIS-003 à VIS-009) :
 * heure réelle, position si le pays l'active, envoi aussitôt ou mis en file sans réseau.
 */
import type { DetailVisite, Programme, Semaine, Visite, VisiteProgramme } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BandeauHorsLigne } from './Attente';
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  Icone,
  Ligne,
  MarquePotentiel,
  Statut,
  Texte,
  type TonStatut,
  usePalette,
} from './composants';
import { alertesDeVisite, remarquesDeRevision } from './Controles';
import { CoordonneesEtHistorique, useDetailVisite } from './DetailVisite';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { Pilule } from './Etablissements';
import {
  declarerEcart,
  distanceLisible,
  dureeMinutes,
  HEURE,
  joursOuvresDe,
  joursProposes,
  MOTIF_LU,
  plusSept,
  TEXTES_ECART,
  type TypeEcart,
  useActionVisite,
  useVisiteDuProgramme,
} from './Execution';
import { nomProspect } from './Fiches';
import { kilometres, useSemaineDu, useTitreDuJour } from './Itineraire';
import { police } from './polices';
import { jourIso } from './semaineLocale';
import { messageErreur, useSession } from './session';
import { type Annonce, libelleStatut, statutDe } from './Tournee';
import { RAYON } from './theme';

type Traduire = ReturnType<typeof useTranslation>['t'];
type UneVisite = Visite | VisiteProgramme;

// ---------------------------------------------------------------------------------------------
// Annonces : ce qu'une action vient de faire, lu en tête de l'écran de la visite

const annonces = new Map<string, Annonce>();
const abonnes = new Set<() => void>();

function abonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/** Annonce le résultat d'une action sur la visite (ou l'efface), pour l'écran qui la montre. */
export function annoncer(id: string, annonce: Annonce | null) {
  if (annonce) annonces.set(id, annonce);
  else annonces.delete(id);
  abonnes.forEach((f) => f());
}

export function useAnnonce(id: string) {
  return useSyncExternalStore(abonner, () => annonces.get(id) ?? null);
}

export function AnnonceVisite({ id }: { id: string }) {
  const annonce = useAnnonce(id);
  return annonce ? <Alerte type={annonce.ton}>{annonce.texte}</Alerte> : null;
}

// ---------------------------------------------------------------------------------------------
// Outils

const nom = (v: UneVisite, t: Traduire) =>
  v.prospect ? nomProspect(v.prospect, t) : t('visites.sansProspect');

/** « MS » pour Mariama Sow ; les deux premières lettres d'un nom seul (pharmacie). */
function initiales(v: UneVisite) {
  const pr = v.prospect;
  if (!pr) return '·';
  const mots = [pr.prenom, pr.nom].filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
  const lettres =
    mots.length > 1 ? `${mots[0]![0]}${mots[mots.length - 1]![0]}` : (mots[0] ?? '').slice(0, 2);
  return lettres.toUpperCase();
}

function dateCourte(iso: string, langue: string, mois: 'long' | 'short' = 'long') {
  return new Intl.DateTimeFormat(langue, { day: 'numeric', month: mois, timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}

function jourLisible(iso: string, langue: string, court = false) {
  return new Intl.DateTimeFormat(langue, {
    weekday: court ? 'short' : 'long',
    day: 'numeric',
    month: court ? 'short' : 'long',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** Le statut d'une visite tel que l'écran le dit : « Prochaine », « À justifier »… */
function statutVisite(
  v: UneVisite,
  programme: Programme | null,
  t: Traduire,
): { ton: TonStatut; court: string; long: string } {
  if (v.statut === 'prevue' && programme && v.date < programme.aujourdhui) {
    const texte = t('mobile.visite.aJustifier');
    return { ton: 'wa', court: texte, long: texte };
  }
  const prochaine = programme?.prochaine ? { id: programme.prochaine } : null;
  const s = statutDe(v, prochaine);
  return { ton: s.ton, court: libelleStatut(s, t, true), long: libelleStatut(s, t, false) };
}

/** La dernière visite faite chez ce prospect, et l'action notée alors (RPT-006 CA1). */
function derniereDe(detail: DetailVisite | null) {
  const passee =
    detail?.historique.find((h) => h.statut === 'effectuee') ?? detail?.historique[0] ?? null;
  return { passee, action: detail?.action_precedente ?? null };
}

/** Kilomètres depuis l'arrêt précédent, estimés à vol d'oiseau (PLN-010). */
function kmEtape(semaine: Semaine | null, v: UneVisite) {
  const jour = semaine?.kilometrage?.jours.find((j) => j.date === v.date);
  const km = jour?.etapes.find((e) => e.visite === v.id)?.km;
  return km ? km : null;
}

// ---------------------------------------------------------------------------------------------
// Actions du moment

type CleAction = 'demarrer' | 'terminer' | 'rapport' | TypeEcart;

/** Ce que l'on peut faire de la visite maintenant : une action principale, une secondaire, des
 * écarts plus rares en liens. */
export function actionsDe(v: VisiteProgramme, aujourdhui: string) {
  const r: { principale: CleAction | null; secondaire: CleAction | null; liens: TypeEcart[] } = {
    principale: null,
    secondaire: null,
    liens: [],
  };
  if (v.statut === 'effectuee') r.principale = 'rapport';
  else if (v.statut === 'en_cours') {
    r.principale = 'terminer';
    r.secondaire = 'absent';
    r.liens = ['annuler'];
  } else if (v.statut === 'prevue') {
    // Restée prévue après sa journée : elle se justifie (VIS-009 CA1).
    if (v.date < aujourdhui) r.principale = 'non_realisee';
    // Un autre jour à venir : seuls le report et l'annulation se font à l'avance (VIS-006).
    else if (v.date > aujourdhui) {
      r.principale = 'reporter';
      r.secondaire = 'annuler';
    } else {
      r.principale = 'demarrer';
      r.secondaire = 'absent';
      r.liens = ['reporter', 'annuler'];
    }
  }
  return r;
}

const LIBELLES: Record<CleAction, string> = {
  demarrer: 'execution.demarrer',
  terminer: 'execution.terminer',
  rapport: 'rapport.rediger',
  absent: 'execution.absent',
  annuler: 'execution.annulerVisite',
  non_realisee: 'mobile.visite.justifier',
  reporter: 'execution.reporter',
};

function libelleRapport(v: VisiteProgramme) {
  const statut = v.rapport_statut ?? 'attendu';
  if (statut === 'attendu') return 'rapport.rediger';
  if (statut === 'brouillon' || statut === 'a_corriger' || statut === 'rouvert')
    return 'rapport.reprendre';
  return 'rapport.voir';
}

/**
 * Les boutons de la visite : collés en bas sur le téléphone (l'action principale deux fois plus
 * large), en ligne sous le prospect sur la tablette (l'action principale d'abord).
 */
export function ActionsVisite({
  visite,
  programme,
  tablette,
  surEcart,
  apres,
}: {
  visite: VisiteProgramme;
  programme: Programme;
  tablette?: boolean;
  surEcart: (type: TypeEcart) => void;
  /** Tablette : ce qui suit les actions sur la même ligne (les fiches). */
  apres?: ReactNode;
}) {
  const { t } = useTranslation();
  const routeur = useRouter();
  const { envoi, message, setMessage, agir } = useActionVisite(visite, {
    geolocalisation: programme.geolocalisation,
    fuseau: programme.fuseau,
    attenteSecondes: programme.attente_gps_secondes,
    surTerminee: (a) => annoncer(visite.id, a),
  });
  const { principale, secondaire } = actionsDe(visite, programme.aujourdhui);
  const faire = (cle: CleAction) => {
    setMessage(null);
    if (cle === 'demarrer' || cle === 'terminer') void agir(cle);
    else if (cle === 'rapport')
      routeur.push({ pathname: '/rapport/[id]', params: { id: visite.id } });
    else surEcart(cle);
  };
  const bouton = (cle: CleAction, plein: boolean) => (
    <Bouton
      key={cle}
      variante={
        plein && !(cle === 'rapport' && libelleRapport(visite) === 'rapport.voir')
          ? 'plein'
          : 'contour'
      }
      libelle={t(cle === 'rapport' ? libelleRapport(visite) : LIBELLES[cle])}
      chargement={plein && envoi}
      onPress={() => faire(cle)}
      style={tablette ? (plein ? { minWidth: 240 } : { flexShrink: 1 }) : { flex: plein ? 2 : 1 }}
    />
  );
  const attente = envoi && (principale === 'demarrer' || principale === 'terminer') && (
    <Texte variante="discret" accessibilityLiveRegion="polite">
      {programme.geolocalisation
        ? t(visite.statut === 'en_cours' ? 'execution.positionFin' : 'execution.position', {
            n: programme.attente_gps_secondes,
          })
        : t('execution.demarrage')}
    </Texte>
  );
  const boutons = tablette
    ? [principale && bouton(principale, true), secondaire && bouton(secondaire, false)]
    : [secondaire && bouton(secondaire, false), principale && bouton(principale, true)];
  return (
    <View style={[{ gap: 10 }, !tablette && { flex: 1 }]}>
      {message && <Alerte type={message.ton}>{message.texte}</Alerte>}
      <View style={styles.rangee}>
        {boutons}
        {apres}
      </View>
      {attente}
    </View>
  );
}

/** Les écarts plus rares (reporter, annuler) : de simples liens sous la visite. */
function AutresEcarts({
  visite,
  programme,
  surEcart,
}: {
  visite: VisiteProgramme;
  programme: Programme;
  surEcart: (type: TypeEcart) => void;
}) {
  const { t } = useTranslation();
  const { liens } = actionsDe(visite, programme.aujourdhui);
  if (!liens.length) return null;
  return (
    <View style={[styles.rangee, { flexWrap: 'wrap' }]}>
      {liens.map((type) => (
        <Bouton
          key={type}
          variante="fantome"
          petit
          libelle={t(LIBELLES[type])}
          onPress={() => surEcart(type)}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Un écart : motif obligatoire, commentaire facultatif, nouveau jour pour un report

function useEcart(
  visite: VisiteProgramme,
  programme: Programme,
  type: TypeEcart,
  surFin: () => void,
) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [motif, setMotif] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [heure, setHeure] = useState(visite.heure ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const valide = !!motif && (type !== 'reporter' || (!!date && HEURE.test(heure)));
  const resume = [visite.heure, visite.prospect ? nomProspect(visite.prospect, t) : '']
    .filter(Boolean)
    .join(' · ');

  async function confirmer() {
    const choisi = programme.motifs_ecart.find((m) => m.id === motif);
    if (!choisi || !valide) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const nouveauJour = type === 'reporter' && date ? { date, heure } : undefined;
      const issue = await declarerEcart(
        client,
        type,
        visite,
        choisi,
        commentaire,
        resume,
        nouveauJour,
      );
      let texte = t(TEXTES_ECART[type].note, {
        nom: nom(visite, t),
        motif: choisi.libelle,
        jour: nouveauJour
          ? `${jourLisible(nouveauJour.date, i18n.language)} · ${nouveauJour.heure}`
          : '',
      });
      // Dans la semaine approuvée, le nouveau jour est une modification soumise (VIS-007 CA2).
      if (nouveauJour && nouveauJour.date < plusSept(programme.semaine))
        texte = t('execution.reportSoumis', { texte });
      // Un écart se note sans se féliciter : l'annonce reste neutre.
      annoncer(visite.id, {
        texte: issue === 'en_attente' ? t('execution.horsLigneEcart', { texte }) : texte,
        ton: 'info',
      });
      setEnvoi(false);
      surFin();
    } catch (e) {
      setErreur(t('execution.refusEcart', { message: messageErreur(e, t('erreurs.reseau')) }));
      setEnvoi(false);
    }
  }

  return {
    type,
    visite,
    programme,
    motif,
    setMotif,
    commentaire,
    setCommentaire,
    date,
    setDate,
    heure,
    setHeure,
    envoi,
    erreur,
    valide,
    confirmer,
  };
}

type Ecart = ReturnType<typeof useEcart>;

/** Un motif à cocher (rond de 20 px, plein quand il est choisi). */
function Motif({
  libelle,
  choisi,
  onPress,
  tablette,
}: {
  libelle: string;
  choisi: boolean;
  onPress: () => void;
  tablette?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: choisi }}
      onPress={onPress}
      style={({ pressed }) => [
        tablette ? styles.motifTablette : styles.motif,
        tablette && {
          borderColor: choisi ? p.accentPlein : p.ligne,
          backgroundColor: choisi ? p.surface2 : p.surface,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.rond, { borderColor: choisi ? p.accentPlein : p.texteDiscret }]}>
        {choisi && <View style={[styles.point, { backgroundColor: p.accentPlein }]} />}
      </View>
      <Text
        style={{
          flex: 1,
          color: p.texte,
          fontFamily: choisi ? police.texteFort : police.texte,
          fontSize: tablette ? 14.5 : 15,
          lineHeight: tablette ? 20 : 21,
        }}
      >
        {libelle}
      </Text>
    </Pressable>
  );
}

function ChampsEcart({ ecart, tablette }: { ecart: Ecart; tablette?: boolean }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { visite, programme } = ecart;
  const motifs = programme.motifs_ecart.map((m) => (
    <Motif
      key={m.id}
      libelle={m.libelle}
      choisi={ecart.motif === m.id}
      onPress={() => ecart.setMotif(m.id)}
      tablette={tablette}
    />
  ));
  const aujourdhui = programme.aujourdhui;
  return (
    <View style={{ gap: tablette ? 16 : 14 }}>
      <View style={{ gap: tablette ? 8 : 6 }}>
        <Texte variante="sousTitre" accessibilityRole="header">
          {t('execution.motif')}
        </Texte>
        {tablette ? (
          <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
            {motifs
              .filter((_, i) => i % 2 === 0)
              .map((m, i) => (
                <View key={m.key} style={styles.rangeeMotifs}>
                  <View style={{ flex: 1 }}>{m}</View>
                  <View style={{ flex: 1 }}>{motifs[2 * i + 1]}</View>
                </View>
              ))}
          </View>
        ) : (
          <Carte marge={0} style={{ overflow: 'hidden' }}>
            <View accessibilityRole="radiogroup">
              {motifs.map((m, i) => (
                <View key={m.key} style={i > 0 && { borderTopWidth: 1, borderTopColor: p.ligne }}>
                  {m}
                </View>
              ))}
            </View>
          </Carte>
        )}
      </View>
      {ecart.type === 'reporter' && (
        <View style={{ gap: 8 }}>
          <Texte variante="sousTitre">{t('execution.nouveauJour')}</Texte>
          <View style={[styles.rangee, { flexWrap: 'wrap', gap: 8 }]}>
            {joursProposes(
              visite.date > aujourdhui ? visite.date : aujourdhui,
              joursOuvresDe(programme),
            )
              .filter((j) => j > visite.date)
              .map((j) => (
                <Pilule
                  key={j}
                  libelle={jourLisible(j, i18n.language, true)}
                  actif={ecart.date === j}
                  onPress={() => ecart.setDate(j)}
                />
              ))}
          </View>
          <Champ
            libelle={t('execution.nouvelleHeure')}
            value={ecart.heure}
            onChangeText={ecart.setHeure}
            maxLength={5}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      )}
      <Champ
        libelle={t('execution.commentaire')}
        placeholder={t('mobile.visite.commentaireIndice')}
        value={ecart.commentaire}
        onChangeText={ecart.setCommentaire}
        maxLength={500}
        multiline
        style={{ minHeight: tablette ? 64 : 72 }}
      />
      {ecart.erreur && <Alerte type="erreur">{ecart.erreur}</Alerte>}
    </View>
  );
}

function BoutonsEcart({
  ecart,
  surRetour,
  tablette,
}: {
  ecart: Ecart;
  surRetour: () => void;
  tablette?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Bouton
        variante="contour"
        libelle={t('execution.annuler')}
        onPress={surRetour}
        style={tablette ? undefined : { flex: 1 }}
      />
      <Bouton
        libelle={t(TEXTES_ECART[ecart.type].confirmer)}
        chargement={ecart.envoi}
        desactive={!ecart.valide}
        onPress={() => void ecart.confirmer()}
        style={tablette ? undefined : { flex: 2 }}
      />
    </>
  );
}

/** Le contexte d'un écart : « Dr Mariama Sow · 11:00 », et le lieu sur la tablette. */
function contexteEcart(v: VisiteProgramme, t: Traduire, avecLieu = false) {
  return [nom(v, t), v.heure, avecLieu ? v.etablissement?.nom : null].filter(Boolean).join(' · ');
}

/** Un écart en entier, sans cadre : la fenêtre de la tablette, et les tests. */
export function EcartVisite({
  visite,
  programme,
  type,
  surFin,
  tablette,
}: {
  visite: VisiteProgramme;
  programme: Programme;
  type: TypeEcart;
  surFin: () => void;
  tablette?: boolean;
}) {
  const { t } = useTranslation();
  const ecart = useEcart(visite, programme, type, surFin);
  return (
    <View>
      <View style={styles.enteteFenetre}>
        <Texte variante="titre" accessibilityRole="header">
          {t(TEXTES_ECART[type].titre)}
        </Texte>
        <Texte variante="libelle" style={{ marginTop: 2 }}>
          {contexteEcart(visite, t, tablette)}
        </Texte>
      </View>
      <View style={styles.corpsFenetre}>
        <ChampsEcart ecart={ecart} tablette={tablette} />
      </View>
      <View style={styles.piedFenetre}>
        <BoutonsEcart ecart={ecart} surRetour={surFin} tablette />
      </View>
    </View>
  );
}

/** Tablette : l'écart en fenêtre sur la journée assombrie. */
function FenetreEcart({
  visite,
  programme,
  type,
  surFin,
}: {
  visite: VisiteProgramme;
  programme: Programme;
  type: TypeEcart | null;
  surFin: () => void;
}) {
  const p = usePalette();
  return (
    <Modal transparent visible={!!type} animationType="fade" onRequestClose={surFin}>
      <View style={styles.voile}>
        {type && (
          <View
            accessibilityViewIsModal
            style={[styles.fenetre, { backgroundColor: p.surface, borderColor: p.ligne }]}
          >
            <EcartVisite
              key={type}
              visite={visite}
              programme={programme}
              type={type}
              surFin={surFin}
              tablette
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

/** Téléphone : l'écart sur son écran (`/ecart/[id]`), ses boutons collés en bas. */
export function EcranEcart({ id, type }: { id: string; type: TypeEcart }) {
  const { t } = useTranslation();
  const routeur = useRouter();
  const { programme, visite } = useVisiteDuProgramme(id);
  const revenir = () => (routeur.canGoBack() ? routeur.back() : routeur.replace('/'));
  if (!programme || !visite || !TEXTES_ECART[type])
    return (
      <Ecran titre={t('detail.titre')} retour onglets={false}>
        <Texte variante="discret">{t('session.chargement')}</Texte>
      </Ecran>
    );
  return <FormulaireEcart visite={visite} programme={programme} type={type} surFin={revenir} />;
}

function FormulaireEcart({
  visite,
  programme,
  type,
  surFin,
}: {
  visite: VisiteProgramme;
  programme: Programme;
  type: TypeEcart;
  surFin: () => void;
}) {
  const { t } = useTranslation();
  const ecart = useEcart(visite, programme, type, surFin);
  return (
    <Ecran
      titre={t(TEXTES_ECART[type].titre)}
      surTitre={contexteEcart(visite, t)}
      retour
      onglets={false}
      pied={<BoutonsEcart ecart={ecart} surRetour={surFin} />}
    >
      <ChampsEcart ecart={ecart} />
    </Ecran>
  );
}

// ---------------------------------------------------------------------------------------------
// Ce que l'écran dit de la visite

function Avatar({ visite, grand }: { visite: UneVisite; grand?: boolean }) {
  const p = usePalette();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        { backgroundColor: p.marine },
        grand && { width: 64, height: 64, borderRadius: 32 },
      ]}
    >
      <Text style={[styles.initiales, grand && { fontSize: 22 }]}>{initiales(visite)}</Text>
    </View>
  );
}

function Potentiel({ visite, grand }: { visite: UneVisite; grand?: boolean }) {
  const { t } = useTranslation();
  if (!visite.prospect?.potentiel) return null;
  return (
    <MarquePotentiel
      valeur={visite.prospect.potentiel}
      libelle={t(`prospect.potentiels.${visite.prospect.potentiel}`, {
        defaultValue: visite.prospect.potentiel,
      })}
      taille={grand ? 32 : 24}
    />
  );
}

/** « Gynécologue · Réseau LEAP GYN » (et le lieu sur la tablette). */
function contexteProspect(v: UneVisite, t: Traduire, lieu?: string) {
  return [
    v.prospect?.specialite_libelle || v.prospect?.type_libelle,
    v.reseau ? t('mobile.visite.reseau', { reseau: v.reseau.libelle }) : null,
    lieu,
  ]
    .filter(Boolean)
    .join(' · ');
}

function adresseDe(detail: DetailVisite | null) {
  return [detail?.lieu?.adresse, detail?.lieu?.localite].filter(Boolean).join(', ');
}

/** Où en est la visite : en cours, effectuée, ou son écart et son motif. */
function Deroulement({ visite, fuseau }: { visite: UneVisite; fuseau: string }) {
  const { t, i18n } = useTranslation();
  const heure = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: fuseau,
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toTimeString().slice(0, 5);
    }
  };
  const lignes: ReactNode[] = [];
  const motifLu = MOTIF_LU[visite.statut ?? ''];
  if (motifLu && visite.motif_ecart) {
    lignes.push(
      <Texte key="l" variante="libelle">
        {t(motifLu)}
      </Texte>,
      <Texte key="m" variante="fort">
        {visite.motif_ecart.libelle}
      </Texte>,
    );
    if (visite.commentaire_ecart) lignes.push(<Texte key="c">{visite.commentaire_ecart}</Texte>);
    if (visite.report)
      lignes.push(
        <Texte key="r" variante="fort">
          {t('execution.reporteeAu', {
            jour: [jourLisible(visite.report.date, i18n.language), visite.report.heure]
              .filter(Boolean)
              .join(' · '),
          })}
        </Texte>,
      );
  } else if (visite.statut === 'effectuee' && visite.debut_le && visite.fin_le) {
    lignes.push(
      <Texte key="e" variante="fort">
        {t('execution.effectuee', {
          debut: heure(visite.debut_le),
          fin: heure(visite.fin_le),
          duree: t('execution.duree', { n: dureeMinutes(visite.debut_le, visite.fin_le) }),
        })}
      </Texte>,
    );
    if (visite.fin_sans_gps)
      lignes.push(
        <Texte key="g" variante="discret">
          {t('execution.finSansGps')}
        </Texte>,
      );
  } else if (visite.statut === 'en_cours' && visite.debut_le) {
    lignes.push(
      <Texte key="d" variante="fort">
        {[
          t('execution.enCours', { heure: heure(visite.debut_le) }),
          visite.distance_debut_m != null
            ? t('execution.distance', {
                distance: distanceLisible(visite.distance_debut_m, t, i18n.language),
              })
            : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </Texte>,
    );
    if (visite.sans_gps)
      lignes.push(
        <Texte key="g" variante="discret">
          {t('execution.sansGps')}
        </Texte>,
      );
  }
  if (visite.est_imprevue)
    lignes.push(
      <View key="i" style={{ gap: 2, marginTop: lignes.length ? 6 : 0 }}>
        <Texte variante="libelle">{t('execution.justificationLue')}</Texte>
        <Texte>{visite.justification || t('visites.imprevue')}</Texte>
      </View>,
    );
  if (!lignes.length) return null;
  return <Carte style={{ gap: 4 }}>{lignes}</Carte>;
}

/** Objectif, note, champs à compléter et contrôles du planning (PLN-004, PLN-013). */
function Preparation({ visite, semaine }: { visite: UneVisite; semaine: Semaine | null }) {
  const { t } = useTranslation();
  const p = usePalette();
  const vs = semaine?.visites.find((v) => v.id === visite.id);
  const alertes = vs
    ? alertesDeVisite(
        semaine!.controles,
        vs.id,
        t,
        false,
        remarquesDeRevision(semaine!.planning)[vs.id],
      )
    : [];
  const lignes = [
    [t('mobile.visite.objectif'), visite.objectif],
    [t('mobile.visite.note'), visite.note],
  ].filter((x): x is [string, string] => !!x[1]);
  const manquants = vs?.manquants ?? [];
  if (!lignes.length && !alertes.length && !manquants.length) return null;
  return (
    <Carte marge={0}>
      {lignes.map(([libelle, valeur], i) => (
        <Ligne
          key={libelle}
          libelle={libelle}
          valeur={valeur}
          derniere={i === lignes.length - 1 && !alertes.length && !manquants.length}
        />
      ))}
      {(manquants.length > 0 || alertes.length > 0) && (
        <View style={{ gap: 4, paddingHorizontal: 16, paddingVertical: 12 }}>
          {manquants.length > 0 && (
            <Text style={[styles.controle, { color: p.attention }]}>
              {t('visites.aCompleter', {
                champs: manquants.map((c) => t(`visites.champs.${c}`)).join(', '),
              })}
            </Text>
          )}
          {alertes.map((a) => (
            <Text
              key={a.texte}
              style={[
                styles.controle,
                {
                  color: a.ton === 'erreur' ? p.erreur : a.ton === 'info' ? p.info : p.attention,
                },
              ]}
            >
              {a.texte}
            </Text>
          ))}
        </View>
      )}
    </Carte>
  );
}

function CarteDerniereVisite({
  detail,
  tablette,
}: {
  detail: DetailVisite | null;
  tablette?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { passee, action } = derniereDe(detail);
  const lignes: [string, string][] = [];
  if (passee) {
    lignes.push([t('mobile.visite.resultat'), passee.resultat || t('mobile.visite.aucunResultat')]);
    if (tablette)
      lignes.push([
        t('mobile.visite.produits'),
        // Un détail gardé par une version d'avant 1.4.0 n'a pas encore ses produits.
        (passee.produits ?? []).join(', ') || t('mobile.visite.aucunResultat'),
      ]);
  }
  if (action) lignes.push([t('mobile.visite.prochaineAction'), action.texte || action.type]);
  return (
    <Carte marge={0} style={tablette ? { flex: 1 } : undefined}>
      <Texte variante="sousTitre" style={styles.titreCarte}>
        {passee && !tablette
          ? t('mobile.visite.derniereVisiteDu', { date: dateCourte(passee.date, i18n.language) })
          : t('mobile.visite.derniereVisite')}
      </Texte>
      {lignes.length ? (
        lignes.map(([libelle, valeur], i) => (
          <Ligne
            key={libelle}
            libelle={libelle}
            valeur={valeur}
            derniere={i === lignes.length - 1}
          />
        ))
      ) : (
        <Texte variante="discret" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          {t('mobile.visite.premiereVisite')}
        </Texte>
      )}
    </Carte>
  );
}

function BoutonsFiches({ visite, petit }: { visite: UneVisite; petit?: boolean }) {
  const { t } = useTranslation();
  const routeur = useRouter();
  // Tablette : sur la ligne des actions, les fiches se resserrent plutôt que de passer dessous.
  const style = petit ? { flex: 1 } : { flexShrink: 1 };
  return (
    <>
      {visite.prospect && (
        <Bouton
          variante="contour"
          petit={petit}
          libelle={t('detail.ficheProspect')}
          onPress={() => routeur.push(`/fiche/${visite.prospect!.id}`)}
          style={style}
        />
      )}
      {visite.etablissement && (
        <Bouton
          variante="contour"
          petit={petit}
          libelle={t('detail.ficheLieu')}
          onPress={() => routeur.push(`/lieu/${visite.etablissement!.id}`)}
          style={style}
        />
      )}
    </>
  );
}

/** Approuvé, une visite à venir se modifie encore dans la semaine (PLN-015). */
function BoutonModifier({
  visite,
  semaine,
  jour,
}: {
  visite: UneVisite;
  semaine: Semaine | null;
  jour: string;
}) {
  const { t } = useTranslation();
  const routeur = useRouter();
  if (!semaine?.visites.some((v) => v.id === visite.id)) return null;
  if (!(
    semaine.modifiable ||
    (semaine.approbation?.modifiable && visite.date >= jourIso(new Date()))
  ))
    return null;
  return (
    <Bouton
      variante="contour"
      libelle={t('visites.modifier')}
      onPress={() =>
        routeur.navigate({ pathname: '/semaine', params: { jour, modifier: visite.id } })
      }
    />
  );
}

type Proprietes = {
  visite: UneVisite;
  /** La visite telle que le programme du téléphone la connaît : ce qui se fait maintenant. */
  active: VisiteProgramme | null;
  programme: Programme | null;
  semaine: Semaine | null;
  detail: DetailVisite | null;
  jour: string;
  surEcart: (type: TypeEcart) => void;
};

function VisiteTelephone({
  visite,
  active,
  programme,
  semaine,
  detail,
  jour,
  surEcart,
}: Proprietes) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const km = kmEtape(semaine, visite);
  const adresse = adresseDe(detail);
  const { principale } = active && programme ? actionsDe(active, programme.aujourdhui) : {};
  return (
    <>
      <Carte style={{ gap: 14 }}>
        <View style={[styles.rangee, { alignItems: 'center' }]}>
          <Avatar visite={visite} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={[styles.nom, { color: p.texte }]}>
              {nom(visite, t)}
            </Text>
            <Texte variante="libelle">{contexteProspect(visite, t)}</Texte>
          </View>
          <Potentiel visite={visite} />
        </View>
        {visite.etablissement && (
          <>
            <View style={[styles.filet, { backgroundColor: p.ligne }]} />
            <View style={[styles.rangee, { alignItems: 'flex-start' }]}>
              <View style={{ marginTop: 2 }}>
                <Icone nom="map-pin" couleur={p.texteDiscret} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.lieu, { color: p.texte }]}>{visite.etablissement.nom}</Text>
                {adresse ? <Texte variante="libelle">{adresse}</Texte> : null}
              </View>
              {km && (
                <Text
                  accessibilityLabel={t('mobile.visite.distanceLue', {
                    km: kilometres(km, i18n.language),
                  })}
                  style={[styles.km, { color: p.texte }]}
                >
                  {t('execution.kilometres', { n: kilometres(km, i18n.language) })}
                </Text>
              )}
            </View>
          </>
        )}
      </Carte>
      <View style={[styles.rangee, { gap: 12 }]}>
        <BoutonsFiches visite={visite} petit />
      </View>
      <Deroulement visite={visite} fuseau={programme?.fuseau ?? 'UTC'} />
      <CarteDerniereVisite detail={detail} />
      {(principale === 'demarrer' || principale === 'terminer') && (
        <Texte variante="libelle" style={{ paddingHorizontal: 4 }}>
          {t(programme?.geolocalisation ? 'mobile.visite.noteGps' : 'mobile.visite.noteSansGps')}
        </Texte>
      )}
      {active && programme && (
        <AutresEcarts visite={active} programme={programme} surEcart={surEcart} />
      )}
      <Preparation visite={visite} semaine={semaine} />
      <CoordonneesEtHistorique id={visite.id} horsLigneDit allege />
      <BoutonModifier visite={visite} semaine={semaine} jour={jour} />
    </>
  );
}

function VisiteTablette({
  visite,
  active,
  programme,
  semaine,
  detail,
  jour,
  surEcart,
}: Proprietes) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const km = kmEtape(semaine, visite);
  const { passee } = derniereDe(detail);
  const statut = statutVisite(visite, programme, t);
  const lieu = [visite.etablissement?.nom, detail?.lieu?.localite].filter(Boolean).join(', ');
  const fiches = (
    <>
      <View style={{ flex: 1 }} />
      <BoutonsFiches visite={visite} />
    </>
  );
  const chiffres: [string, ReactNode][] = [
    [t('mobile.visite.quand'), visite.heure ?? '—'],
    [
      t('mobile.visite.statut'),
      <Statut ton={statut.ton} lignes={2}>
        {statut.long}
      </Statut>,
    ],
    [
      t('mobile.visite.distance'),
      km ? t('execution.kilometres', { n: kilometres(km, i18n.language) }) : '—',
    ],
    [
      t('mobile.visite.derniereVisite'),
      passee ? dateCourte(passee.date, i18n.language, 'short') : '—',
    ],
  ];
  return (
    <>
      <Carte marge={24} style={{ gap: 18 }}>
        <View style={[styles.rangee, { gap: 16, alignItems: 'center' }]}>
          <Avatar visite={visite} grand />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={[styles.nomTablette, { color: p.texte }]}>
              {nom(visite, t)}
            </Text>
            <Texte variante="libelle" style={{ fontSize: 14 }}>
              {contexteProspect(visite, t, lieu)}
            </Texte>
          </View>
          <Potentiel visite={visite} grand />
        </View>
        <View style={[styles.chiffres, { borderColor: p.ligne }]}>
          {chiffres.map(([libelle, valeur], i) => (
            <View
              key={libelle}
              style={[
                styles.chiffre,
                i < chiffres.length - 1 && { borderRightWidth: 1, borderRightColor: p.ligne },
              ]}
            >
              <Texte variante="libelle" numberOfLines={1}>
                {libelle}
              </Texte>
              {typeof valeur === 'string' ? (
                <Texte variante="nombre" style={{ fontSize: 17 }}>
                  {valeur}
                </Texte>
              ) : (
                <View style={{ marginTop: 2 }}>{valeur}</View>
              )}
            </View>
          ))}
        </View>
        {active && programme ? (
          <ActionsVisite
            visite={active}
            programme={programme}
            tablette
            surEcart={surEcart}
            apres={fiches}
          />
        ) : (
          <View style={styles.rangee}>{fiches}</View>
        )}
      </Carte>
      <View style={[styles.rangee, { gap: 16, alignItems: 'flex-start' }]}>
        <CarteDerniereVisite detail={detail} tablette />
        <Carte marge={0} style={{ flex: 1 }}>
          <Texte variante="sousTitre" style={styles.titreCarte}>
            {t('mobile.visite.position')}
          </Texte>
          {visite.etablissement && (
            <Ligne libelle={t('mobile.visite.lieu')} valeur={visite.etablissement.nom} />
          )}
          {detail?.lieu?.adresse ? (
            <Ligne libelle={t('mobile.visite.adresse')} valeur={detail.lieu.adresse} />
          ) : null}
          <Texte variante="libelle" style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            {t(
              programme?.geolocalisation === false
                ? 'mobile.visite.noteSansGps'
                : 'mobile.visite.notePosition',
            )}
          </Texte>
        </Carte>
      </View>
      <Deroulement visite={visite} fuseau={programme?.fuseau ?? 'UTC'} />
      {active && programme && (
        <AutresEcarts visite={active} programme={programme} surEcart={surEcart} />
      )}
      <Preparation visite={visite} semaine={semaine} />
      <CoordonneesEtHistorique id={visite.id} horsLigneDit allege />
      <BoutonModifier visite={visite} semaine={semaine} jour={jour} />
    </>
  );
}

/** Tablette : les visites du jour, la visite ouverte surlignée d'orange (.li.sel). */
function VisitesDuJour({
  visites,
  id,
  programme,
}: {
  visites: UneVisite[];
  id: string;
  programme: Programme | null;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  return (
    <View accessibilityLabel={t('mobile.visite.visitesDuJour')}>
      {visites.map((v) => {
        const choisie = v.id === id;
        const s = statutVisite(v, programme, t);
        return (
          <Pressable
            key={v.id}
            accessibilityRole="button"
            accessibilityState={{ selected: choisie }}
            accessibilityLabel={[v.heure, nom(v, t), s.long].filter(Boolean).join(' · ')}
            onPress={() =>
              routeur.replace({ pathname: '/visite/[id]', params: { id: v.id, jour: v.date } })
            }
            style={({ pressed }) => [
              styles.ligneJour,
              { borderBottomColor: p.ligne },
              choisie && { backgroundColor: p.surface2 },
              pressed && { opacity: 0.7 },
            ]}
          >
            {choisie && <View style={[styles.repere, { backgroundColor: p.orange }]} />}
            <Text style={[styles.heure, { color: p.texte }]}>{v.heure ?? '—'}</Text>
            <Potentiel visite={v} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.nomLigne, { color: p.texte }]}>
                {nom(v, t)}
              </Text>
              {v.etablissement ? (
                <Texte variante="discret" numberOfLines={1}>
                  {v.etablissement.nom}
                </Texte>
              ) : null}
            </View>
            <Statut ton={s.ton}>{s.court}</Statut>
          </Pressable>
        );
      })}
    </View>
  );
}

function tonPlanning(statut: string | undefined): TonStatut {
  if (statut === 'approuve' || statut === 'en_cours' || statut === 'termine') return 'ok';
  if (statut === 'a_reviser') return 'wa';
  if (statut === 'soumis') return 'in';
  return 'neutre';
}

/** L'écran d'une visite (`/visite/[id]`), sur le téléphone ou la tablette. */
export function EcranVisite({ id, jour }: { id: string; jour: string }) {
  const { t } = useTranslation();
  const tablette = useTablette();
  const routeur = useRouter();
  const { semaine, erreur, horsLigne } = useSemaineDu(jour);
  // Démarrée, terminée ou justifiée sur le téléphone : le programme gardé le sait déjà.
  const lu = useVisiteDuProgramme(id);
  const programme = lu.programme;
  const active = lu.visite ?? null;
  const { detail } = useDetailVisite(id);
  const [ecart, setEcart] = useState<TypeEcart | null>(null);
  const titreDuJour = useTitreDuJour(jour);
  // L'annonce d'une action vaut pour cette visite, le temps de l'écran.
  useEffect(() => () => annoncer(id, null), [id]);

  const planifiee = semaine?.visites.find((v) => v.id === id) ?? null;
  const visite: UneVisite | null = planifiee ? { ...planifiee, ...(active ?? {}) } : active;
  const surEcart = (type: TypeEcart) =>
    tablette ? setEcart(type) : routeur.push({ pathname: '/ecart/[id]', params: { id, type } });

  const duJour: UneVisite[] = (
    semaine
      ? semaine.visites.filter((v) => v.date === jour)
      : (programme?.jours.find((j) => j.date === jour)?.visites ?? [])
  )
    .map((v) => {
      const p = programme?.jours.flatMap((j) => j.visites).find((x) => x.id === v.id);
      return p ? { ...v, ...p } : v;
    })
    .sort(
      (a, b) =>
        (a.heure ?? '99:99').localeCompare(b.heure ?? '99:99') || (a.ordre ?? 0) - (b.ordre ?? 0),
    );
  const objectif = semaine?.controles?.objectifs.find((o) => o.date === jour);
  const planning = semaine?.planning;
  const statut = visite ? statutVisite(visite, programme, t) : null;
  const actions =
    active && programme ? actionsDe(active, programme.aujourdhui) : { principale: null };

  let contenu: ReactNode;
  if (visite) {
    const proprietes: Proprietes = {
      visite,
      active,
      programme,
      semaine,
      detail,
      jour,
      surEcart,
    };
    contenu = (
      <>
        {horsLigne && <BandeauHorsLigne maj={horsLigne} />}
        <AnnonceVisite id={id} />
        {/* Restée prévue après sa journée : elle se justifie (VIS-009 CA1). */}
        {active && programme && actions.principale === 'non_realisee' && (
          <Alerte type="attention">{t('execution.aJustifier')}</Alerte>
        )}
        {tablette ? <VisiteTablette {...proprietes} /> : <VisiteTelephone {...proprietes} />}
      </>
    );
  } else if (erreur) contenu = <Alerte type="erreur">{erreur}</Alerte>;
  else if (!semaine) contenu = <Texte variante="discret">{t('session.chargement')}</Texte>;
  else contenu = <Alerte type="attention">{t('detail.introuvable')}</Alerte>;

  return (
    <Ecran
      titre={t('detail.titre')}
      surTitre={[titreDuJour, visite?.heure].filter(Boolean).join(' · ')}
      retour
      action={statut ? <Statut ton={statut.ton}>{statut.court}</Statut> : undefined}
      enteteTablette={{
        titre: titreDuJour,
        surTitre: [
          t('jour.visites', { count: duJour.length }),
          objectif ? t('jour.objectif', { min: objectif.min, max: objectif.max }) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        action: planning ? (
          <Statut ton={tonPlanning(planning.statut)}>
            {t(
              planning.numero_version ? 'mobile.visite.planningVersion' : 'mobile.visite.planning',
              {
                statut: t(`semaine.statuts.${planning.statut}`).toLocaleLowerCase(),
                numero: planning.numero_version,
              },
            )}
          </Statut>
        ) : (
          <></>
        ),
      }}
      pied={
        !tablette && active && programme && actions.principale ? (
          <ActionsVisite visite={active} programme={programme} surEcart={surEcart} />
        ) : undefined
      }
      gauche={
        tablette && duJour.length ? (
          <VisitesDuJour visites={duJour} id={id} programme={programme} />
        ) : undefined
      }
    >
      {contenu}
      {tablette && active && programme && (
        <FenetreEcart
          visite={active}
          programme={programme}
          type={ecart}
          surFin={() => setEcart(null)}
        />
      )}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  rangee: { flexDirection: 'row', gap: 12 },
  filet: { height: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initiales: { color: '#FFFFFF', fontFamily: police.titre, fontSize: 15 },
  nom: { fontFamily: police.titre, fontSize: 18, lineHeight: 24 },
  nomTablette: { fontFamily: police.titreFort, fontSize: 26, lineHeight: 32, letterSpacing: -0.26 },
  lieu: { fontFamily: police.texteFort, fontSize: 15, lineHeight: 21 },
  km: { fontFamily: police.texteGras, fontSize: 12.5, lineHeight: 18 },
  titreCarte: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 4 },
  controle: { fontFamily: police.texteFort, fontSize: 12.5, lineHeight: 18 },
  chiffres: { flexDirection: 'row', borderWidth: 1, borderRadius: RAYON },
  chiffre: { flex: 1, minWidth: 0, gap: 2, paddingVertical: 14, paddingHorizontal: 16 },
  ligneJour: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  repere: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  heure: { width: 44, fontFamily: police.titre, fontSize: 14, lineHeight: 20 },
  nomLigne: { fontFamily: police.texteFort, fontSize: 15, lineHeight: 21 },
  motif: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  motifTablette: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: RAYON,
    borderWidth: 1,
  },
  rangeeMotifs: { flexDirection: 'row', gap: 8 },
  rond: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  point: { width: 10, height: 10, borderRadius: 5 },
  voile: {
    flex: 1,
    backgroundColor: 'rgba(15,26,61,.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fenetre: {
    width: 560,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: RAYON,
    shadowColor: '#0F1A3D',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  enteteFenetre: { paddingTop: 22, paddingHorizontal: 24, paddingBottom: 8 },
  corpsFenetre: { paddingTop: 8, paddingHorizontal: 24, paddingBottom: 4 },
  piedFenetre: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
});
