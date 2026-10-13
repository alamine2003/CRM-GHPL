/**
 * Rapport de la visite effectuée (RPT-001 à RPT-005, RPT-008), selon la maquette 1.4.2.
 *
 * - À rédiger : l'avancement (« 4 champs sur 5 remplis », l'échéance), les produits présentés
 *   dans l'ordre avec le retour du prescripteur, le résultat obtenu en segments, le résumé, la
 *   prochaine action ; puis les échantillons et cadeaux, les documents et les champs du pays.
 *   Téléphone : « Enregistrer » et « Soumettre le rapport » collés en bas, avec ce qui manque.
 *   Tablette : à droite, « Avant de soumettre » coche ce qui est fait.
 * - Soumis : des cartes en lecture ; sur tablette, la synthèse à droite.
 * - À corriger (RPT-014, RPT-015) : la demande du superviseur en tête, seules les parties à revoir
 *   s'écrivent, le reste se lit sous « Reste inchangé ».
 *
 * Il s'enregistre tout seul (RPT-009) : sur le téléphone à chaque changement, au serveur dès que
 * le réseau le permet ; « Enregistrer » le fait aussitôt. Déjà ouvert une fois, il se complète
 * et se soumet sans réseau (RPT-010).
 */
import type {
  Correction,
  DefinitionChamp,
  Rapport,
  ValeursChamps,
  VisiteProgramme,
} from '@innov/api-client';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { ActionPrecedente } from './ActionPrecedente';
import {
  abandonnerRapportLocal as abandonnerSaisie,
  envoyerAttente,
  estTransitoire,
  lireAttente,
  mettreEnAttente,
  nouvelIdentifiant,
  retirerBrouillonsRapport,
} from './Brouillons';
import {
  garderRapport,
  garderSaisie,
  garderSoumission,
  lireBrouillonRapport,
  marquerEnvoye,
  oublierBrouillon,
  type SaisieLocale,
  versionDeBase,
} from './BrouillonRapport';
import { ConflitRapport, estConflit } from './Conflits';
import {
  Alerte,
  Barre,
  Bouton,
  Carte,
  Champ,
  Gras,
  Ligne,
  Segments,
  Statut,
  Texte,
  type TonStatut,
  usePalette,
} from './composants';
import { useDetailVisite } from './DetailVisite';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { Pilule } from './Etablissements';
import { changerVisite, dureeMinutes, useVisiteDuProgramme } from './Execution';
import { nomProspect } from './Fiches';
import i18n from './i18n';
import { PiecesJointes } from './PiecesJointes';
import { police } from './polices';
import { ProchaineAction } from './ProchaineAction';
import { ProduitsPresentes, Remises } from './RapportProduits';
import { messageErreur, useSession } from './session';

const SOCLE = [
  'produits',
  'retours',
  'resultat',
  'resume',
  'prochaine_action_type',
  'prochaine_action',
] as const;
const MODIFIABLES = new Set(['brouillon', 'a_corriger', 'rouvert']);
/** Au-delà, les résultats proposés passent des segments aux pastilles. */
const SEGMENTS_MAX = 4;

type Saisie = SaisieLocale;
type Traduire = ReturnType<typeof useTranslation>['t'];

function saisieDe(rapport: Rapport): Saisie {
  return {
    presentations: rapport.presentations,
    remises: rapport.remises,
    resultat: rapport.resultat,
    resultat_obtenu: rapport.resultat_obtenu,
    resume: rapport.resume,
    prochaine_action: rapport.prochaine_action,
    prochaine_action_type: rapport.prochaine_action_type,
    prochaine_action_echeance: rapport.prochaine_action_echeance,
    visite_proposee: rapport.visite_proposee,
    champs: (rapport.champs ?? {}) as ValeursChamps,
  };
}

/** Ce qui manque avant de soumettre, comme le serveur le calcule (RPT-002 CA1). */
export function manquantsDe(saisie: Saisie, definitions: DefinitionChamp[]): string[] {
  const rempli = {
    produits: saisie.presentations.length > 0,
    retours: saisie.presentations.every((x) => !!x.retour),
    resultat: saisie.resultat != null,
    resume: saisie.resume.trim() !== '',
    prochaine_action_type: saisie.prochaine_action_type != null,
    prochaine_action: saisie.prochaine_action.trim() !== '',
  };
  return [
    ...SOCLE.filter((c) => !rempli[c]),
    ...definitions
      .filter(
        (d) =>
          d.obligatoire &&
          [null, undefined, '', false].some((vide) => vide === saisie.champs[d.code]),
      )
      .map((d) => d.code),
  ];
}

/** Un nombre saisi au clavier (virgule ou point) ; vide si rien. */
function nombreDe(texte: string): number | string | null {
  const net = texte.trim().replace(',', '.');
  if (!net) return null;
  const n = Number(net);
  return Number.isFinite(n) ? n : texte;
}

function ChampPays({
  definition,
  valeur,
  surValeur,
}: {
  definition: DefinitionChamp;
  valeur: ValeursChamps[string] | undefined;
  surValeur: (v: ValeursChamps[string]) => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const libelle = definition.obligatoire
    ? definition.libelle
    : t('rapport.facultatif', { libelle: definition.libelle });
  if (definition.type === 'case')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
        <Texte style={{ flex: 1 }}>{libelle}</Texte>
        <Switch
          accessibilityLabel={definition.libelle}
          value={valeur === true}
          onValueChange={surValeur}
          trackColor={{ true: p.succes }}
        />
      </View>
    );
  if (definition.type === 'liste')
    return (
      <View style={{ gap: 6 }}>
        <Texte variante="libelle">{libelle}</Texte>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {definition.options.map((o) => (
            <Pilule
              key={o}
              libelle={o}
              actif={valeur === o}
              onPress={() => surValeur(valeur === o ? null : o)}
            />
          ))}
        </View>
      </View>
    );
  return (
    <Champ
      libelle={libelle}
      value={valeur == null ? '' : String(valeur)}
      onChangeText={(texte) => surValeur(definition.type === 'nombre' ? nombreDe(texte) : texte)}
      keyboardType={definition.type === 'nombre' ? 'decimal-pad' : 'default'}
      maxLength={definition.type === 'nombre' ? 12 : 500}
      multiline={definition.type === 'texte'}
    />
  );
}

/** « 08:30 », à l'heure du pays. */
function heureDe(iso: string, fuseau: string | undefined) {
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

/**
 * La dernière minute avant l'échéance : « 23 h 59 » en français, l'heure usuelle ailleurs.
 * L'échéance est minuit du lendemain (RG-032) ; « avant 00 h 00 » se lirait mal.
 */
function heureLimite(iso: string, fuseau: string | undefined, langue: string) {
  const h = heureDe(new Date(Date.parse(iso) - 60_000).toISOString(), fuseau);
  return langue.startsWith('fr') ? h.replace(':', ' h ') : h;
}

/** La visite du rapport en une ligne : « Dr Awa Ndiaye · 08:30 – 09:12 · 42 min ». */
function contexteVisite(
  visite:
    | Pick<VisiteProgramme, 'prospect' | 'etablissement' | 'debut_le' | 'fin_le' | 'heure' | 'date'>
    | undefined,
  fuseau: string | undefined,
  t: Traduire,
  {
    lieu = false,
    duree = true,
    date = false,
  }: { lieu?: boolean; duree?: boolean; date?: boolean } = {},
) {
  if (!visite) return undefined;
  const heures =
    visite.debut_le && visite.fin_le
      ? `${heureDe(visite.debut_le, fuseau)} – ${heureDe(visite.fin_le, fuseau)}`
      : visite.heure;
  return [
    visite.prospect ? nomProspect(visite.prospect, t) : t('visites.sansProspect'),
    lieu ? visite.etablissement?.nom : null,
    date ? dateLongue(visite.date, false) : heures,
    !date && duree && visite.debut_le && visite.fin_le
      ? t('execution.duree', { n: dureeMinutes(visite.debut_le, visite.fin_le) })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** « 9 octobre », ou « lundi 12 octobre » avec le jour. */
function dateLongue(iso: string, avecJour: boolean) {
  return new Intl.DateTimeFormat(i18n.language, {
    ...(avecJour ? { weekday: 'long' as const } : {}),
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
}

/** L'objectif planifié, en tête du rapport (RPT-003 CA1) ; la justification d'une imprévue. */
function objectifDe(rapport: Rapport, t: Traduire): [string, string, boolean] {
  if (rapport.objectif_prevu) return [t('rapport.objectifPrevu'), rapport.objectif_prevu, true];
  if (rapport.est_imprevue) return [t('rapport.imprevue'), rapport.justification, true];
  return [t('rapport.objectifPrevu'), t('rapport.sansObjectif'), false];
}

function ObjectifPrevu({ rapport }: { rapport: Rapport }) {
  const { t } = useTranslation();
  const [libelle, texte, prevu] = objectifDe(rapport, t);
  return (
    <Carte>
      <View style={{ gap: 2 }}>
        <Texte variante="libelle">{libelle}</Texte>
        <Texte variante={prevu ? 'fort' : 'discret'}>{texte}</Texte>
      </View>
    </Carte>
  );
}

/** Le libellé d'une valeur choisie dans une liste du pays. */
const libelleDe = (liste: { id: string; libelle: string }[], id: string | null) =>
  liste.find((x) => x.id === id)?.libelle ?? null;

/** Titre d'une carte de lignes (.sec-t, 14 / 16 / 4). */
function TitreCarte({ children }: { children: ReactNode }) {
  return (
    <Texte
      variante="sousTitre"
      accessibilityRole="header"
      style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 4 }}
    >
      {children}
    </Texte>
  );
}

/** Des lignes libellé · valeur ; la dernière sans filet. */
function Lignes({ lignes }: { lignes: [string, string][] }) {
  return (
    <>
      {lignes.map(([libelle, valeur], i) => (
        <Ligne
          key={`${libelle}-${i}`}
          libelle={libelle}
          valeur={valeur}
          derniere={i === lignes.length - 1}
        />
      ))}
    </>
  );
}

function lignesProduits(rapport: Pick<Rapport, 'presentations'>, t: Traduire): [string, string][] {
  return rapport.presentations.map((x, i) => [
    `${i + 1}. ${x.libelle}`,
    x.retour ? t(`rapport.retours.${x.retour}`) : '—',
  ]);
}

function lignesRemises(rapport: Pick<Rapport, 'remises'>, t: Traduire): [string, string][] {
  return rapport.remises.map((r) => [
    `${t(`rapport.typesRemise.${r.type}`)} · ${r.libelle}`,
    `× ${r.quantite}`,
  ]);
}

function lignesSynthese(rapport: Rapport, t: Traduire, avecResume: boolean): [string, string][] {
  const [libelleObjectif, objectif, prevu] = objectifDe(rapport, t);
  const action = [
    libelleDe(rapport.types_action_proposes, rapport.prochaine_action_type),
    rapport.prochaine_action,
  ]
    .filter(Boolean)
    .join(' · ');
  return [
    ...(prevu ? [[libelleObjectif, objectif] as [string, string]] : []),
    [
      t('mobile.visite.resultat'),
      [libelleDe(rapport.resultats_proposes, rapport.resultat), rapport.resultat_obtenu]
        .filter(Boolean)
        .join(' · ') || '—',
    ],
    ...(avecResume ? [[t('rapport.resume'), rapport.resume || '—'] as [string, string]] : []),
    [t('rapport.prochaineAction'), action || '—'],
    ...(rapport.prochaine_action_echeance
      ? [
          [
            t('mobile.rapport.echeance'),
            t('mobile.rapport.echeanceLue', {
              date: dateLongue(rapport.prochaine_action_echeance, false),
            }),
          ] as [string, string],
        ]
      : []),
    ...(rapport.visite_proposee
      ? [[t('rapport.visiteProposeeLue'), t('rapport.oui')] as [string, string]]
      : []),
  ];
}

function lignesPays(rapport: Rapport, t: Traduire): [string, string][] {
  const champs = (rapport.champs ?? {}) as ValeursChamps;
  return rapport.definitions.map((d) => {
    const v = champs[d.code];
    if (d.type === 'case') return [d.libelle, v ? t('rapport.oui') : t('rapport.non')];
    return [d.libelle, v == null || v === '' ? '—' : String(v)];
  });
}

/** Le rapport soumis, en lecture : ce qui a été transmis au superviseur. */
function RapportLu({ rapport, tablette }: { rapport: Rapport; tablette?: boolean }) {
  const { t } = useTranslation();
  const produits = (
    <Carte marge={0} style={tablette ? { flex: 1 } : undefined}>
      <TitreCarte>{t('rapport.produits')}</TitreCarte>
      {rapport.presentations.length ? (
        <Lignes lignes={lignesProduits(rapport, t)} />
      ) : (
        <Texte variante="discret" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          —
        </Texte>
      )}
    </Carte>
  );
  const remises = (
    <Carte marge={0} style={tablette ? { flex: 1 } : undefined}>
      <TitreCarte>{t('rapport.remises')}</TitreCarte>
      {rapport.remises.length ? (
        <Lignes lignes={lignesRemises(rapport, t)} />
      ) : (
        <Texte variante="discret" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          {t('rapport.aucuneRemise')}
        </Texte>
      )}
    </Carte>
  );
  const pays = rapport.definitions.length > 0 && (
    <Carte marge={0}>
      <TitreCarte>{t('rapport.champsPays')}</TitreCarte>
      <Lignes lignes={lignesPays(rapport, t)} />
    </Carte>
  );
  if (tablette)
    return (
      <>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
          {produits}
          {remises}
        </View>
        <Carte style={{ gap: 6 }}>
          <Texte variante="sousTitre">{t('rapport.resume')}</Texte>
          <Texte style={{ fontSize: 15, lineHeight: 21 }}>{rapport.resume || '—'}</Texte>
        </Carte>
        {pays}
      </>
    );
  return (
    <>
      <Carte marge={0}>
        <Lignes lignes={lignesSynthese(rapport, t, true)} />
      </Carte>
      {produits}
      {remises}
      {pays}
    </>
  );
}

/** RPT-014 : qui demande quoi, quand, et les parties à revoir. */
function AlerteCorrection({ correction, rapport }: { correction: Correction; rapport: Rapport }) {
  const { t } = useTranslation();
  const p = usePalette();
  const parties = correction.champs.map((code) =>
    PARTIES_SOCLE.includes(code)
      ? t(`correction.parties.${code}`)
      : (rapport.definitions.find((d) => d.code === code)?.libelle ?? code),
  );
  return (
    <Alerte type="erreur">
      <Gras>
        {t('correction.demandee', {
          date: dateLongue(correction.le, true),
          par: correction.par,
        })}
      </Gras>
      {`\n« ${correction.commentaire} »`}
      {parties.length ? (
        <Text style={{ fontFamily: police.texteMoyen, fontSize: 12.5, color: p.texte }}>
          {`\n${t('correction.aRevoir', { champs: parties.join(', ') })}`}
        </Text>
      ) : null}
    </Alerte>
  );
}

const PARTIES_SOCLE = [
  'presentations',
  'remises',
  'resultat',
  'resume',
  'prochaine_action',
  'pieces_jointes',
];

/**
 * Le rapport, son état et ses gestes : lu au serveur ou sur le téléphone, enregistré tout seul,
 * soumis — ou gardé pour partir au retour du réseau.
 */
function useRapport(id: string) {
  const { t } = useTranslation();
  const { client } = useSession();
  const { programme, visite } = useVisiteDuProgramme(id);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<'soumettre' | 'enregistrer' | null>(null);
  const [message, setMessage] = useState<{
    texte: string;
    ton: 'erreur' | 'succes' | 'info';
  } | null>(null);

  const [tentative, setTentative] = useState(0);
  // RPT-009 : où la saisie est gardée, et depuis quand.
  const [garde, setGarde] = useState<{ ou: 'telephone' | 'serveur'; le: Date } | null>(null);
  const [repris, setRepris] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);
  // RPT-010 : soumis sur le téléphone sans réseau, à cette heure ; en attente d'envoi.
  const [soumisLocal, setSoumisLocal] = useState<string | null>(null);
  /** OFF-004 : la saisie du téléphone, quand le rapport a changé ailleurs entre-temps. */
  const [conflit, setConflit] = useState<SaisieLocale | null>(null);
  const modifie = useRef(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // L'heure d'ouverture de l'écran suffit pour dire si l'échéance est passée.
  const [ouvertLe] = useState(() => Date.now());

  useEffect(() => {
    let actif = true;
    void (async () => {
      const local = await lireBrouillonRapport(id);
      // La fin de visite restée dans la file part d'abord : le serveur doit la connaître.
      await envoyerAttente(client).catch(() => 0);
      try {
        const r = await client.visites.rapport(id);
        await garderRapport(id, r);
        if (!actif) return;
        // Une saisie faite sur le téléphone, pas encore reçue par le serveur, l'emporte… sauf si
        // le rapport a changé ailleurs depuis (RG-052) ou si le superviseur a décidé (RG-050) :
        // le délégué voit alors les deux versions et choisit (RG-053).
        const nonEnvoyee = local?.saisie && !local.envoye ? local.saisie : null;
        const change =
          !!nonEnvoyee &&
          (!MODIFIABLES.has(r.statut) || r.version > Math.max(versionDeBase(local) ?? 0, 1));
        const enCours = !!nonEnvoyee && !change;
        setConflit(change ? nonEnvoyee : null);
        setRapport(r);
        setSaisie(enCours && nonEnvoyee ? nonEnvoyee : saisieDe(r));
        setRepris(!!enCours);
        setHorsLigne(false);
        setSoumisLocal(local?.soumis_le && MODIFIABLES.has(r.statut) ? local.soumis_le : null);
        // Repris : il sera renvoyé à la prochaine saisie ou depuis la file.
        if (enCours && local?.modifie_le)
          setGarde({ ou: 'telephone', le: new Date(local.modifie_le) });
      } catch (e) {
        if (!actif) return;
        if (estTransitoire(e) && local) {
          // Sans réseau : le rapport déjà ouvert une fois se complète sur le téléphone.
          setRapport(local.rapport);
          setSaisie(local.saisie ?? saisieDe(local.rapport));
          setHorsLigne(true);
          setSoumisLocal(local.soumis_le ?? null);
          if (local.saisie && !local.envoye && local.modifie_le)
            setGarde({ ou: 'telephone', le: new Date(local.modifie_le) });
          return;
        }
        setErreurChargement(
          estTransitoire(e) ? t('rapport.horsLigne') : messageErreur(e, t('erreurs.reseau')),
        );
      }
    })();
    return () => {
      actif = false;
    };
  }, [client, id, t, tentative]);

  /** Garde la saisie sur le téléphone, puis l'envoie ; sans réseau, l'envoi attend dans la file. */
  async function enregistrerSaisie(r: Rapport, s: Saisie) {
    await garderSaisie(id, r, s);
    try {
      const version = versionDeBase(await lireBrouillonRapport(id));
      const recu = await client.visites.enregistrerRapport(id, { ...s, version });
      await marquerEnvoye(id, recu);
      await retirerBrouillonsRapport(id);
      modifie.current = false;
      setRapport((avant) => (avant ? { ...recu, pieces_jointes: avant.pieces_jointes } : recu));
      setGarde({ ou: 'serveur', le: new Date() });
      setHorsLigne(false);
      await changerVisite(id, { rapport_statut: recu.statut });
    } catch (e) {
      if (estConflit(e)) {
        // Changé ailleurs pendant la saisie : on relit, et le délégué choisit.
        setTentative((n) => n + 1);
        return;
      }
      if (!estTransitoire(e)) {
        setMessage({ texte: messageErreur(e, t('erreurs.reseau')), ton: 'erreur' });
        return;
      }
      setGarde({ ou: 'telephone', le: new Date() });
      const file = await lireAttente().catch(() => []);
      if (!file.some((x) => x.type === 'brouillon_rapport' && x.visite === id))
        await mettreEnAttente({
          id: nouvelIdentifiant(),
          type: 'brouillon_rapport',
          visite: id,
          resume: t('rapport.titre'),
        });
    }
  }

  // Enregistrement automatique : quand la saisie se pose.
  useEffect(() => {
    if (!rapport || !saisie || !modifie.current || !MODIFIABLES.has(rapport.statut)) return;
    if (soumisLocal) return;
    minuteur.current = setTimeout(() => void enregistrerSaisie(rapport, saisie), 800);
    return () => clearTimeout(minuteur.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seule la saisie déclenche l'envoi
  }, [saisie]);

  /** « Enregistrer » : tout de suite, sans attendre que la saisie se pose. */
  async function enregistrer() {
    if (!rapport || !saisie) return;
    clearTimeout(minuteur.current);
    if (!modifie.current) {
      setMessage({ texte: t('mobile.rapport.dejaEnregistre'), ton: 'info' });
      return;
    }
    setEnvoi('enregistrer');
    setMessage(null);
    try {
      await enregistrerSaisie(rapport, saisie);
    } finally {
      setEnvoi(null);
    }
  }

  const changer = (champs: Partial<Saisie>) => {
    if (!saisie) return;
    setMessage(null);
    modifie.current = true;
    setSaisie({ ...saisie, ...champs });
  };

  async function soumettre() {
    if (!saisie || !rapport) return;
    clearTimeout(minuteur.current);
    setEnvoi('soumettre');
    setMessage(null);
    // RPT-010 CA1 : l'heure du geste, sur le téléphone, fait foi même si l'envoi attend.
    const soumisLe = new Date().toISOString();
    try {
      const version = versionDeBase(await lireBrouillonRapport(id)) ?? rapport.version;
      await client.visites.enregistrerRapport(id, { ...saisie, version });
      const r = await client.visites.soumettreRapport(id, soumisLe);
      modifie.current = false;
      setRapport(r);
      setSaisie(saisieDe(r));
      await oublierBrouillon(id);
      await changerVisite(id, { rapport_statut: r.statut });
      setMessage({ texte: t('rapport.soumis'), ton: 'succes' });
    } catch (e) {
      if (estConflit(e)) {
        await garderSaisie(id, rapport, saisie);
        setTentative((n) => n + 1);
        return;
      }
      if (!estTransitoire(e)) {
        setMessage({ texte: messageErreur(e, t('erreurs.reseau')), ton: 'erreur' });
        return;
      }
      // Sans réseau : la soumission attend dans la file et partira seule (RPT-010).
      modifie.current = false;
      await garderSoumission(id, rapport, saisie, soumisLe);
      await mettreEnAttente({
        id: nouvelIdentifiant(),
        type: 'soumission_rapport',
        visite: id,
        soumis_le: soumisLe,
        resume: t('rapport.titre'),
      });
      await changerVisite(id, { rapport_statut: 'soumis' });
      setSoumisLocal(soumisLe);
    } finally {
      setEnvoi(null);
    }
  }

  async function garderTelephone() {
    if (!rapport || !conflit) return;
    // RG-053 : le délégué garde sa version en connaissance de cause ; elle repart de la version
    // du serveur qu'il vient de voir.
    await garderSaisie(id, rapport, conflit, rapport.version);
    modifie.current = true;
    setConflit(null);
    setSaisie(conflit);
    setMessage({ texte: t('conflits.versionGardee'), ton: 'succes' });
  }

  async function garderServeur() {
    if (!rapport) return;
    await abandonnerSaisie(id, rapport);
    setConflit(null);
    setSoumisLocal(null);
    setSaisie(saisieDe(rapport));
  }

  const manquants = rapport && saisie ? manquantsDe(saisie, rapport.definitions) : [];
  // RG-032 : attendu avant minuit, heure du pays, le jour de la visite.
  // Déjà soumis une fois (correction demandée) : seul le retard de la première soumission compte.
  const enRetard =
    !!rapport &&
    (rapport.en_retard ||
      (!rapport.soumis_le && !!rapport.echeance && ouvertLe >= Date.parse(rapport.echeance)));

  return {
    id,
    programme,
    visite,
    rapport,
    setRapport,
    saisie,
    erreurChargement,
    recharger: () => {
      setErreurChargement(null);
      setTentative((n) => n + 1);
    },
    envoi,
    message,
    garde,
    repris,
    horsLigne,
    soumisLocal,
    conflit,
    manquants,
    enRetard,
    changer,
    enregistrer,
    soumettre,
    garderTelephone,
    garderServeur,
  };
}

type EtatRapport = ReturnType<typeof useRapport>;
type Pret = EtatRapport & { rapport: Rapport; saisie: Saisie };

function libelleManquant(code: string, rapport: Rapport, t: Traduire) {
  return (SOCLE as readonly string[]).includes(code)
    ? t(`rapport.socle.${code}`)
    : (rapport.definitions.find((d) => d.code === code)?.libelle ?? code);
}

/** Les alertes du rapport en rédaction : retard, sans réseau, brouillon repris, réouverture. */
function AlertesRapport({ e }: { e: Pret }) {
  const { t } = useTranslation();
  const { rapport } = e;
  return (
    <>
      {e.message && <Alerte type={e.message.ton}>{e.message.texte}</Alerte>}
      {rapport.statut === 'a_corriger' && !rapport.correction && (
        <Alerte type="erreur">{t('rapport.aCorriger')}</Alerte>
      )}
      {rapport.statut === 'rouvert' && rapport.reouverture && (
        <Alerte type="erreur">
          {[
            t('reouvertureRapport.rouvertLe', {
              date: new Intl.DateTimeFormat(i18n.language, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(rapport.reouverture.le)),
              par: rapport.reouverture.par,
            }),
            `« ${rapport.reouverture.motif} »`,
          ].join('\n')}
        </Alerte>
      )}
      {e.enRetard && <Alerte type="attention">{t('rapport.retard')}</Alerte>}
      {e.horsLigne && <Alerte type="attention">{t('rapport.horsLigneLocal')}</Alerte>}
      {e.repris && !e.horsLigne && <Alerte type="info">{t('rapport.repris')}</Alerte>}
    </>
  );
}

/** « 4 champs sur 5 remplis » et l'échéance, au-dessus de la barre (téléphone). */
function Avancement({ e }: { e: Pret }) {
  const { t, i18n: langue } = useTranslation();
  const p = usePalette();
  const total = SOCLE.length + e.rapport.definitions.filter((d) => d.obligatoire).length;
  const remplis = total - e.manquants.length;
  const echeance =
    e.enRetard || e.rapport.soumis_le || !e.rapport.echeance
      ? null
      : t('mobile.rapport.aRendre', {
          heure: heureLimite(e.rapport.echeance, e.programme?.fuseau, langue.language),
        });
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Texte variante="libelle">
          {t('mobile.rapport.champsRemplis', { count: remplis, total })}
        </Texte>
        {e.enRetard ? (
          <Texte variante="libelle" style={{ color: p.attention }}>
            {t('mobile.rapport.enRetard')}
          </Texte>
        ) : echeance ? (
          <Texte variante="libelle">{echeance}</Texte>
        ) : null}
      </View>
      <Barre
        valeur={total ? remplis / total : 0}
        libelle={t('mobile.rapport.champsRemplis', { count: remplis, total })}
      />
    </View>
  );
}

function ResultatObtenu({ e }: { e: Pret }) {
  const { t } = useTranslation();
  const tablette = useTablette();
  const { rapport, saisie } = e;
  const basculer = (cle: string) => e.changer({ resultat: saisie.resultat === cle ? null : cle });
  return (
    <View style={{ gap: 6 }}>
      <Texte variante="sousTitre" accessibilityRole="header">
        {t('rapport.resultat')}
      </Texte>
      {rapport.resultats_proposes.length <= SEGMENTS_MAX ? (
        <Segments
          libelle={t('rapport.resultat')}
          options={rapport.resultats_proposes.map((r) => ({ cle: r.id, libelle: r.libelle }))}
          valeur={saisie.resultat}
          surChoix={basculer}
          style={tablette && rapport.resultats_proposes.length <= 3 ? { maxWidth: 460 } : undefined}
        />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {rapport.resultats_proposes.map((r) => (
            <Pilule
              key={r.id}
              libelle={r.libelle}
              actif={saisie.resultat === r.id}
              onPress={() => basculer(r.id)}
            />
          ))}
        </View>
      )}
      <View style={{ marginTop: 6 }}>
        <Champ
          libelle={t('rapport.resultatObtenu')}
          placeholder={t('rapport.resultatObtenuIndice')}
          value={saisie.resultat_obtenu}
          onChangeText={(resultat_obtenu) => e.changer({ resultat_obtenu })}
          maxLength={1000}
          multiline
        />
      </View>
    </View>
  );
}

function Resume({ e, erreur }: { e: Pret; erreur?: boolean }) {
  const { t } = useTranslation();
  const tablette = useTablette();
  return (
    <Champ
      titre
      libelle={t('rapport.resume')}
      aide={tablette ? t('rapport.resumeIndice') : undefined}
      placeholder={tablette ? undefined : t('rapport.resumeIndice')}
      value={e.saisie.resume}
      onChangeText={(resume) => e.changer({ resume })}
      maxLength={4000}
      multiline
      erreur={erreur}
      style={{ minHeight: tablette ? 150 : erreur ? 120 : 92 }}
    />
  );
}

function Action({ e }: { e: Pret }) {
  return (
    <ProchaineAction
      rapport={e.rapport}
      saisie={e.saisie}
      jourVisite={e.visite?.date ?? new Date().toISOString().slice(0, 10)}
      surChangement={e.changer}
    />
  );
}

function Produits({ e }: { e: Pret }) {
  return (
    <ProduitsPresentes
      rapport={e.rapport}
      presentations={e.saisie.presentations}
      surChangement={(presentations) => e.changer({ presentations })}
    />
  );
}

function RemisesDuRapport({ e }: { e: Pret }) {
  return (
    <Remises
      rapport={e.rapport}
      presentations={e.saisie.presentations}
      remises={e.saisie.remises}
      surChangement={(remises) => e.changer({ remises })}
    />
  );
}

function Documents({ e, modifiable }: { e: Pret; modifiable: boolean }) {
  return (
    <PiecesJointes
      rapport={e.rapport}
      visite={e.id}
      modifiable={modifiable}
      surRapport={(pieces_jointes) => e.setRapport({ ...e.rapport, pieces_jointes })}
    />
  );
}

function ChampsPays({ e, codes }: { e: Pret; codes?: string[] }) {
  const { t } = useTranslation();
  const definitions = e.rapport.definitions.filter((d) => !codes || codes.includes(d.code));
  if (!definitions.length) return null;
  return (
    <View style={{ gap: 12 }}>
      <Texte variante="sousTitre">{t('rapport.champsPays')}</Texte>
      {definitions.map((d) => (
        <ChampPays
          key={d.code}
          definition={d}
          valeur={e.saisie.champs[d.code]}
          surValeur={(v) => e.changer({ champs: { ...e.saisie.champs, [d.code]: v } })}
        />
      ))}
    </View>
  );
}

/** Le formulaire entier : le rapport à rédiger, ou rouvert. */
function Formulaire({ e }: { e: Pret }) {
  const tablette = useTablette();
  return (
    <>
      <ObjectifPrevu rapport={e.rapport} />
      <ActionPrecedente action={e.rapport.action_precedente} />
      <Produits e={e} />
      <ResultatObtenu e={e} />
      {tablette ? (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
          <View style={{ flex: 3, minWidth: 0 }}>
            <Resume e={e} />
          </View>
          <View style={{ flex: 2, minWidth: 0 }}>
            <Action e={e} />
          </View>
        </View>
      ) : (
        <>
          <Resume e={e} />
          <Action e={e} />
        </>
      )}
      <RemisesDuRapport e={e} />
      <Documents e={e} modifiable />
      <ChampsPays e={e} />
    </>
  );
}

/** À corriger : seules les parties demandées s'écrivent (RPT-015). */
function PartiesARevoir({ e, parties }: { e: Pret; parties: string[] }) {
  const codesPays = parties.filter((c) => !PARTIES_SOCLE.includes(c));
  return (
    <>
      {parties.includes('presentations') && <Produits e={e} />}
      {parties.includes('resultat') && <ResultatObtenu e={e} />}
      {parties.includes('resume') && <Resume e={e} erreur />}
      {parties.includes('prochaine_action') && <Action e={e} />}
      {parties.includes('remises') && <RemisesDuRapport e={e} />}
      {parties.includes('pieces_jointes') && <Documents e={e} modifiable />}
      {codesPays.length > 0 && <ChampsPays e={e} codes={codesPays} />}
    </>
  );
}

/** Ce que la correction ne touche pas, en lecture. */
function ResteInchange({ e, parties, titre }: { e: Pret; parties: string[]; titre: boolean }) {
  const { t } = useTranslation();
  const lu = { ...e.rapport, ...e.saisie };
  const lignes: [string, string][] = [];
  if (!parties.includes('resultat'))
    lignes.push([
      t('rapport.resultat'),
      [libelleDe(lu.resultats_proposes, lu.resultat), lu.resultat_obtenu]
        .filter(Boolean)
        .join(' · ') || '—',
    ]);
  if (!parties.includes('presentations')) {
    lignes.push([t('rapport.produits'), lu.presentations.map((x) => x.libelle).join(', ') || '—']);
    const retours = lu.presentations
      .map((x) => (x.retour ? t(`rapport.retours.${x.retour}`) : null))
      .filter(Boolean);
    if (retours.length) lignes.push([t('mobile.rapport.retourPrescripteur'), retours.join(', ')]);
  }
  if (!parties.includes('resume')) lignes.push([t('rapport.resume'), lu.resume || '—']);
  if (!parties.includes('prochaine_action'))
    lignes.push([
      t('rapport.prochaineAction'),
      [libelleDe(lu.types_action_proposes, lu.prochaine_action_type), lu.prochaine_action]
        .filter(Boolean)
        .join(' · ') || '—',
    ]);
  if (!parties.includes('remises') && lu.remises.length)
    lignes.push([
      t('rapport.remises'),
      lignesRemises(lu, t)
        .map((l) => l.join(' '))
        .join(', '),
    ]);
  return (
    <Carte marge={0}>
      {titre && <TitreCarte>{t('mobile.rapport.resteInchange')}</TitreCarte>}
      <Lignes lignes={lignes} />
    </Carte>
  );
}

/** Tablette : « Avant de soumettre », ce qui est fait et ce qui manque, puis la soumission. */
function AvantDeSoumettre({ e }: { e: Pret }) {
  const { t, i18n: langue } = useTranslation();
  const p = usePalette();
  const { rapport } = e;
  const controles = [
    ...SOCLE.map((c) => ({ cle: c, libelle: t(`mobile.rapport.controles.${c}`) })),
    ...rapport.definitions
      .filter((d) => d.obligatoire)
      .map((d) => ({ cle: d.code, libelle: d.libelle })),
  ];
  const total = controles.length;
  const remplis = total - e.manquants.length;
  return (
    <View style={{ flex: 1, gap: 18, paddingVertical: 24, paddingHorizontal: 28 }}>
      <Texte variante="sousTitre" accessibilityRole="header">
        {t('mobile.rapport.avantDeSoumettre')}
      </Texte>
      <Barre
        valeur={total ? remplis / total : 0}
        libelle={t('mobile.rapport.champsRemplis', { count: remplis, total })}
      />
      <View style={{ gap: 14 }}>
        {controles.map((c) => {
          const manque = e.manquants.includes(c.cle);
          return (
            <View key={c.cle} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Statut ton={manque ? 'wa' : 'ok'}>
                  <Text style={{ fontSize: 14, color: p.texte }}>{c.libelle}</Text>
                </Statut>
              </View>
              <Texte variante="libelle">
                {t(manque ? 'mobile.rapport.manquant' : 'mobile.rapport.fait')}
              </Texte>
            </View>
          );
        })}
      </View>
      {e.manquants.length > 0 && (
        <Alerte type="attention">
          <Gras>{t('mobile.rapport.aCompleter')}</Gras>
          {` ${e.manquants.map((c) => libelleManquant(c, rapport, t)).join(', ')}.`}
        </Alerte>
      )}
      <View style={{ flex: 1 }} />
      <Garde e={e} />
      {rapport.echeance && !rapport.soumis_le ? (
        <Texte variante="libelle">
          {t('mobile.rapport.noteSoumission', {
            heure: heureLimite(rapport.echeance, e.programme?.fuseau, langue.language),
          })}
        </Texte>
      ) : null}
      <Bouton
        libelle={t('rapport.soumettre')}
        chargement={e.envoi === 'soumettre'}
        desactive={e.manquants.length > 0 || e.envoi !== null}
        onPress={() => void e.soumettre()}
      />
    </View>
  );
}

/** Où la saisie est gardée (RPT-009). */
function Garde({ e }: { e: Pret }) {
  const { t } = useTranslation();
  if (!e.garde) return null;
  return (
    <Texte variante="discret" accessibilityLiveRegion="polite">
      {t(e.garde.ou === 'serveur' ? 'rapport.gardeServeur' : 'rapport.gardeTelephone', {
        heure: e.garde.le.toTimeString().slice(0, 5),
      })}
    </Texte>
  );
}

/** Téléphone : ce qui manque, « Enregistrer » et « Soumettre le rapport », collés en bas. */
function PiedRapport({ e }: { e: Pret }) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <View style={{ flex: 1, gap: 10 }}>
      {e.manquants.length > 0 ? (
        <Text
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: police.texteFort,
            fontSize: 12.5,
            lineHeight: 18,
            color: p.attention,
          }}
        >
          {t('rapport.manque', {
            liste: e.manquants.map((c) => libelleManquant(c, e.rapport, t)).join(', '),
          })}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Bouton
          variante="contour"
          libelle={t('mobile.rapport.enregistrer')}
          chargement={e.envoi === 'enregistrer'}
          onPress={() => void e.enregistrer()}
          style={{ flex: 1 }}
        />
        <Bouton
          libelle={t('rapport.soumettre')}
          chargement={e.envoi === 'soumettre'}
          desactive={e.manquants.length > 0 || e.envoi !== null}
          onPress={() => void e.soumettre()}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
}

/** Le statut du rapport, en tête : court sur le téléphone, complet sur la tablette. */
function statutRapport(e: EtatRapport, t: Traduire, court: boolean) {
  const { rapport } = e;
  if (!rapport) return null;
  if (e.soumisLocal) return { ton: 'wa' as TonStatut, texte: t('rapport.soumissionEnAttente') };
  const statut = rapport.statut;
  const ton: TonStatut =
    statut === 'soumis' || statut === 'valide'
      ? 'ok'
      : statut === 'a_corriger' || statut === 'rouvert'
        ? 'er'
        : 'wa';
  if (statut === 'soumis' && !court && rapport.soumis_le)
    return {
      ton,
      texte: t('mobile.rapport.soumisA', {
        heure: heureDe(rapport.soumis_le, e.programme?.fuseau),
      }),
    };
  return {
    ton,
    texte: t(`mobile.tournee.${court ? 'statutsCourts' : 'statuts'}.${statut}`),
  };
}

/** L'écran du rapport (`/rapport/[id]`), sur le téléphone ou la tablette. */
export function FormulaireRapport({ id }: { id: string }) {
  const { t } = useTranslation();
  const tablette = useTablette();
  const e = useRapport(id);
  const { rapport, saisie, programme } = e;
  // Une visite d'une semaine passée n'est plus au programme : son détail gardé la décrit.
  const { detail } = useDetailVisite(id);
  const visite = e.visite ?? detail?.visite;
  const fuseau = programme?.fuseau;
  const modifiable = !!rapport && MODIFIABLES.has(rapport.statut) && !e.soumisLocal && !e.conflit;
  const parties =
    rapport?.statut === 'a_corriger' && rapport.correction?.champs.length
      ? rapport.correction.champs
      : null;
  const lu = rapport && !MODIFIABLES.has(rapport.statut) && !e.conflit;
  const court = statutRapport(e, t, true);
  const long = statutRapport(e, t, false);
  const boutonEnregistrer = modifiable && (
    <Bouton
      variante="contour"
      petit
      libelle={t('mobile.rapport.enregistrer')}
      chargement={e.envoi === 'enregistrer'}
      onPress={() => void e.enregistrer()}
    />
  );

  let contenu: ReactNode;
  let droite: ReactNode;
  let largeurDroite = 380;
  if (e.erreurChargement)
    contenu = (
      <>
        <Alerte type="attention">{e.erreurChargement}</Alerte>
        <Bouton variante="contour" libelle={t('rapport.reessayer')} onPress={e.recharger} />
      </>
    );
  else if (!rapport || !saisie)
    contenu = <ActivityIndicator accessibilityLabel={t('session.chargement')} />;
  else if (e.conflit)
    contenu = (
      <ConflitRapport
        rapport={rapport}
        telephone={e.conflit}
        surGarderTelephone={() => void e.garderTelephone()}
        surGarderServeur={() => void e.garderServeur()}
      />
    );
  else if (e.soumisLocal) {
    const enCours = { ...rapport, ...saisie };
    contenu = (
      <>
        <Alerte type="info">
          {t('rapport.soumisTelephone', {
            heure: new Date(e.soumisLocal).toTimeString().slice(0, 5),
          })}
        </Alerte>
        <RapportLu rapport={enCours} tablette={tablette} />
      </>
    );
    if (tablette)
      droite = <Synthese rapport={enCours} e={{ ...e, rapport, saisie }} documents={false} />;
  } else if (lu) {
    contenu = (
      <>
        {e.message ? (
          <Alerte type={e.message.ton}>{e.message.texte}</Alerte>
        ) : rapport.en_retard ? (
          <Alerte type="attention">{t('rapport.soumisEnRetard')}</Alerte>
        ) : null}
        <RapportLu rapport={rapport} tablette={tablette} />
        {!tablette && <Documents e={{ ...e, rapport, saisie }} modifiable={false} />}
      </>
    );
    if (tablette) droite = <Synthese rapport={rapport} e={{ ...e, rapport, saisie }} />;
  } else {
    const pret: Pret = { ...e, rapport, saisie };
    contenu = parties ? (
      <>
        <AlerteCorrection correction={rapport.correction!} rapport={rapport} />
        <AlertesRapport e={pret} />
        <PartiesARevoir e={pret} parties={parties} />
        {!tablette && <ResteInchange e={pret} parties={parties} titre />}
        {!tablette && <Garde e={pret} />}
      </>
    ) : (
      <>
        {!tablette && <Avancement e={pret} />}
        {rapport.statut === 'a_corriger' && rapport.correction && (
          <AlerteCorrection correction={rapport.correction} rapport={rapport} />
        )}
        <AlertesRapport e={pret} />
        <Formulaire e={pret} />
        {!tablette && <Garde e={pret} />}
      </>
    );
    if (tablette && parties)
      droite = (
        <View style={{ gap: 18, paddingVertical: 24, paddingHorizontal: 28 }}>
          <Texte variante="sousTitre" accessibilityRole="header">
            {t('mobile.rapport.resteInchange')}
          </Texte>
          <ResteInchange e={pret} parties={parties} titre={false} />
          <Garde e={pret} />
          <Texte variante="libelle">{t('mobile.rapport.noteCorrection')}</Texte>
        </View>
      );
    else if (tablette) {
      droite = <AvantDeSoumettre e={pret} />;
      largeurDroite = 340;
    }
  }

  return (
    <Ecran
      titre={t('rapport.titre')}
      surTitre={contexteVisite(visite, fuseau, t, {
        date: !!parties,
        duree: !lu,
      })}
      retour
      onglets={false}
      action={court ? <Statut ton={court.ton}>{court.texte}</Statut> : undefined}
      enteteTablette={{
        surTitre: contexteVisite(visite, fuseau, t, { lieu: true, date: !!parties }),
        action: (
          <>
            {long && <Statut ton={long.ton}>{long.texte}</Statut>}
            {boutonEnregistrer}
            {modifiable && parties && rapport && (
              <Bouton
                petit
                libelle={t('rapport.soumettre')}
                chargement={e.envoi === 'soumettre'}
                desactive={e.manquants.length > 0 || e.envoi !== null}
                onPress={() => void e.soumettre()}
              />
            )}
          </>
        ),
      }}
      pied={
        !tablette && modifiable && rapport && saisie ? (
          <PiedRapport e={{ ...e, rapport, saisie }} />
        ) : undefined
      }
      droite={droite}
      largeurDroite={largeurDroite}
    >
      {contenu}
    </Ecran>
  );
}

/** Tablette, rapport soumis : la synthèse à droite (résultat, action, échéance, documents). */
function Synthese({
  rapport,
  e,
  documents = true,
}: {
  rapport: Rapport;
  e: Pret;
  documents?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 18, paddingVertical: 24, paddingHorizontal: 28 }}>
      <Carte marge={0}>
        <Lignes lignes={lignesSynthese(rapport, t, false)} />
      </Carte>
      {documents && <Documents e={e} modifiable={false} />}
      <Texte variante="libelle">{t('mobile.rapport.noteSoumis')}</Texte>
    </View>
  );
}
