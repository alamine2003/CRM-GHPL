/**
 * Tournée du délégué (VIS-001), selon la maquette 1.4.0.
 *
 * Téléphone : l'avancement du jour, le bandeau marine « Prochaine visite » (démarrer, terminer,
 * itinéraire), les visites du jour sur une frise. Quand des rapports sont à corriger ou en
 * retard, ils passent en tête, avec les visites à justifier, et le programme se résume à une
 * carte qui ouvre la journée.
 * Tablette : la frise à gauche ; à droite les chiffres du jour, le bandeau, la dernière visite
 * et ce qui reste à traiter — ou, avec des alertes, les alertes à gauche et le programme à droite.
 *
 * Le téléphone garde le dernier programme lu et l'affiche sans réseau (CA1) ; il garde aussi
 * la semaine et le détail des visites du jour, pour les ouvrir en mode avion.
 */
import type { JourProgramme, Programme, Semaine, VisiteProgramme } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ecrire, lire } from './baseLocale';
import { envoyerAttente, estTransitoire } from './Brouillons';
import {
  Alerte,
  Barre,
  Bouton,
  Carte,
  Chiffres,
  Gras,
  Icone,
  Ligne,
  MarquePotentiel,
  Puce,
  Statut,
  Texte,
  type TonStatut,
  usePalette,
} from './composants';
import { garderDetail, useDetailVisite } from './DetailVisite';
import { CLE_PROGRAMME, ecouterProgramme, useActionVisite } from './Execution';
import { nomProspect } from './Fiches';
import { VisiteImprevue } from './Imprevue';
import { couverte, Indisponibilite } from './Indisponibilite';
import { kilometres } from './Itineraire';
import { police } from './polices';
import { useSession } from './session';
import { garderSemaine } from './semaineLocale';
import { surMarine } from './theme';

type Traduire = ReturnType<typeof useTranslation>['t'];
export type Annonce = { texte: string; ton: 'info' | 'succes'; rapport?: string };

const RAPPORT_A_FAIRE = ['attendu', 'brouillon'];

/** Le programme gardé, rafraîchi au retour du réseau, et ce qui s'en déduit pour l'écran. */
export function useTournee() {
  const { client, etat } = useSession();
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [semaine, setSemaine] = useState<Semaine | null>(null);
  const [horsLigne, setHorsLigne] = useState<string | null>(null);
  const connecte = etat.statut === 'connecte';

  // Une visite démarrée sur le téléphone change le programme gardé : l'écran suit.
  useEffect(() => ecouterProgramme(setProgramme), []);

  useEffect(() => {
    if (!connecte) return;
    let actif = true;
    Promise.resolve()
      // D'abord ce qui attend dans la file (une visite démarrée sans réseau), puis le programme.
      .then(() => envoyerAttente(client).catch(() => 0))
      .then(() => client.plannings.programme())
      .then((lu) => {
        if (!actif) return;
        setProgramme(lu);
        setHorsLigne(null);
        void ecrire(CLE_PROGRAMME, lu).catch(() => undefined);
        const jourLu = lu.jours.find((j) => j.date === lu.aujourdhui);
        for (const v of jourLu?.visites ?? [])
          void garderDetail(client, v.id).catch(() => undefined);
        void client.plannings
          .semaine(lu.semaine)
          .then((s) => {
            garderSemaine(s, lu.semaine);
            if (actif) setSemaine(s);
          })
          .catch(() => undefined);
      })
      .catch(async (e: unknown) => {
        const memoire = estTransitoire(e)
          ? await lire<Programme>(CLE_PROGRAMME).catch(() => null)
          : null;
        if (actif && memoire) {
          setProgramme(memoire.valeur);
          setHorsLigne(memoire.maj);
        }
      });
    return () => {
      actif = false;
    };
  }, [client, connecte]);

  if (!programme || programme.etat === 'sans_poste') return null;
  const aujourdhui = programme.jours.find((j) => j.date === programme.aujourdhui) ?? null;
  // Sans version approuvée, pas de programme : rien à démarrer (VIS-001).
  const visites = programme.etat === 'approuve' ? (aujourdhui?.visites ?? []) : [];
  // La prochaine : la visite en cours la plus récemment démarrée, sinon la première prévue que
  // ne couvre pas une indisponibilité déclarée (DC-51).
  const prochaine =
    visites
      .filter((v) => v.statut === 'en_cours')
      .sort((a, b) => (b.debut_le ?? '').localeCompare(a.debut_le ?? ''))[0] ??
    visites.find((v) => v.statut === 'prevue' && !couverte(v, aujourdhui?.activites ?? [])) ??
    null;
  // RPT-014, 29.A : un rapport renvoyé pour correction (ou rouvert, RPT-016).
  const aCorriger = (programme.a_corriger ?? []).filter(
    (v) => v.rapport_statut === 'a_corriger' || v.rapport_statut === 'rouvert',
  );
  // RG-032 : passé minuit, un rapport non soumis d'un jour précédent de la semaine.
  const enRetard = programme.jours
    .filter((j) => j.date < programme.aujourdhui)
    .flatMap((j) =>
      j.visites.filter(
        (v) => v.statut === 'effectuee' && RAPPORT_A_FAIRE.includes(v.rapport_statut ?? 'attendu'),
      ),
    );
  // VIS-009 CA1 : restées prévues après leur journée.
  const aJustifier = (programme.a_justifier ?? []).filter((v) => v.statut === 'prevue');
  const aRediger = visites.filter(
    (v) => v.statut === 'effectuee' && RAPPORT_A_FAIRE.includes(v.rapport_statut ?? 'attendu'),
  );
  const toutes = programme.jours.flatMap((j) => j.visites);
  const km = semaine?.kilometrage?.jours.find((j) => j.date === programme.aujourdhui)?.km ?? null;
  return {
    programme,
    aujourdhui,
    visites,
    prochaine,
    aCorriger,
    enRetard,
    aJustifier,
    aRediger,
    faites: visites.filter((v) => v.statut === 'effectuee').length,
    semaineFaites: toutes.filter((v) => v.statut === 'effectuee').length,
    semaineTotal: toutes.length,
    km,
    horsLigne,
    alertes: aCorriger.length + enRetard.length > 0,
  };
}

export type EtatTournee = NonNullable<ReturnType<typeof useTournee>>;

/** Où en est une visite de la frise : son statut et sa pastille. */
export function statutDe(
  v: Pick<VisiteProgramme, 'id' | 'statut' | 'rapport_statut'>,
  prochaine: { id: string } | null,
): { cle: string; ton: TonStatut; autre?: boolean } {
  if (v.statut === 'en_cours') return { cle: 'en_cours', ton: 'or' };
  if (v.id === prochaine?.id) return { cle: 'prochaine', ton: 'or' };
  if (v.statut === 'effectuee') {
    const r = v.rapport_statut ?? 'attendu';
    if (r === 'attendu' || r === 'brouillon') return { cle: r, ton: 'wa' };
    if (r === 'a_corriger' || r === 'rouvert') return { cle: r, ton: 'er' };
    return { cle: r === 'valide' ? 'valide' : 'soumis', ton: 'ok' };
  }
  if (v.statut === 'prevue') return { cle: 'prevue', ton: 'neutre' };
  return { cle: v.statut ?? 'prevue', ton: 'neutre', autre: true };
}

export function libelleStatut(s: ReturnType<typeof statutDe>, t: Traduire, court: boolean) {
  if (s.autre) return t(`visites.statuts.${s.cle}`);
  return t(`mobile.tournee.${court ? 'statutsCourts' : 'statuts'}.${s.cle}`);
}

const nom = (v: VisiteProgramme, t: Traduire) =>
  v.prospect ? nomProspect(v.prospect, t) : t('visites.sansProspect');

/** Minutes écoulées depuis minuit, à l'heure du pays. */
function minutesDuPays(fuseau: string) {
  try {
    const [h, m] = new Intl.DateTimeFormat('fr', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: fuseau,
    })
      .format(new Date())
      .split(':')
      .map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  } catch {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
}

/** « 11:00 · dans 25 min » ; l'heure seule une fois l'heure passée. */
function quandProchaine(v: VisiteProgramme, fuseau: string, t: Traduire) {
  if (!v.heure) return '';
  const [h = 0, m = 0] = v.heure.split(':').map(Number);
  const reste = h * 60 + m - minutesDuPays(fuseau);
  if (reste <= 0) return v.heure;
  const dans =
    reste < 60
      ? t('mobile.tournee.dansMinutes', { n: reste })
      : t('mobile.tournee.dansHeures', {
          h: Math.floor(reste / 60),
          m: String(reste % 60).padStart(2, '0'),
        });
  return `${v.heure} · ${dans}`;
}

/** Ouvre le guidage vers le lieu dans l'application de cartes ; sinon, la visite. */
function ouvrirItineraire(lat: string | null, lng: string | null, repli: () => void) {
  if (!lat || !lng) return repli();
  const url =
    Platform.OS === 'ios'
      ? `maps:?daddr=${lat},${lng}`
      : Platform.OS === 'android'
        ? `google.navigation:q=${lat},${lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.openURL(url).catch(repli);
}

// ---------------------------------------------------------------------------------------------
// Frise des visites du jour (.tl)

export function Frise({ etat, tablette }: { etat: EtatTournee; tablette?: boolean }) {
  const { t } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const { visites, prochaine } = etat;
  return (
    <View>
      {visites.map((v, i) => {
        const s = statutDe(v, prochaine);
        const faite = v.statut === 'effectuee';
        const maintenant = s.cle === 'prochaine' || s.cle === 'en_cours';
        return (
          <View key={v.id} style={styles.item}>
            <Text
              style={[
                styles.heure,
                faite
                  ? { color: p.texteDiscret, fontFamily: police.titreMoyen }
                  : { color: p.texte },
              ]}
            >
              {v.heure ?? '—'}
            </Text>
            <View style={styles.rail}>
              <View
                style={[
                  styles.trait,
                  { backgroundColor: p.ligne },
                  i === 0 && { top: 24 },
                  i === visites.length - 1 && { bottom: undefined, height: 24 },
                ]}
              />
              {maintenant && <View style={[styles.halo, { backgroundColor: p.orangeDoux }]} />}
              <View
                style={[
                  styles.point,
                  { backgroundColor: p.surface, borderColor: p.texteDiscret },
                  faite && { backgroundColor: p.succes, borderColor: p.succes },
                  maintenant && { backgroundColor: p.orange, borderColor: p.orange },
                ]}
              />
            </View>
            <View style={styles.cont}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={[v.heure, nom(v, t), libelleStatut(s, t, false)]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() =>
                  routeur.push({ pathname: '/visite/[id]', params: { id: v.id, jour: v.date } })
                }
                style={({ pressed }) => [
                  styles.boite,
                  maintenant && { backgroundColor: p.surface, borderColor: p.marine },
                  pressed && { opacity: 0.7 },
                ]}
              >
                {v.prospect && <MarquePotentiel valeur={v.prospect.potentiel} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.nom, { color: p.texte }]}>
                    {nom(v, t)}
                  </Text>
                  {tablette ? (
                    <Texte variante="libelle" numberOfLines={1}>
                      {v.etablissement?.nom ?? ''}
                    </Texte>
                  ) : (
                    <View style={styles.statutFrise}>
                      <Statut ton={s.ton}>{libelleStatut(s, t, false)}</Statut>
                      {/* VIS-008 CA2 : une visite imprévue se lit comme telle. */}
                      {v.est_imprevue && <Puce>{t('visites.imprevue')}</Puce>}
                    </View>
                  )}
                </View>
                {tablette && v.est_imprevue && <Puce>{t('visites.imprevue')}</Puce>}
                {tablette && <Statut ton={s.ton}>{libelleStatut(s, t, true)}</Statut>}
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Avancement du jour

export function Avancement({ etat }: { etat: EtatTournee }) {
  const { t } = useTranslation();
  const p = usePalette();
  const total = etat.visites.length;
  if (!total)
    return (
      <Texte variante="sousTitre" accessibilityRole="header">
        {t('programme.titre')}
      </Texte>
    );
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.entreDeux}>
        <Texte variante="sousTitre" accessibilityRole="header">
          {t('programme.titre')}
        </Texte>
        <Texte variante="libelle">
          <Text style={{ color: p.texte, fontFamily: police.texteGras, fontSize: 15 }}>
            {etat.faites}
          </Text>{' '}
          {t('mobile.tournee.faitesSur', { total })}
        </Texte>
      </View>
      <Barre
        valeur={total ? etat.faites / total : 0}
        libelle={t('mobile.tournee.faitesSurLu', { faites: etat.faites, total })}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Bandeau « Prochaine visite » (.hero)

export function Bandeau({
  etat,
  tablette,
  surAnnonce,
}: {
  etat: EtatTournee;
  tablette?: boolean;
  surAnnonce: (a: Annonce) => void;
}) {
  const { programme, prochaine } = etat;
  if (!prochaine) return null;
  return (
    <BandeauVisite
      key={prochaine.id}
      visite={prochaine}
      programme={programme}
      tablette={tablette}
      surAnnonce={surAnnonce}
    />
  );
}

function BandeauVisite({
  visite,
  programme,
  tablette,
  surAnnonce,
}: {
  visite: VisiteProgramme;
  programme: Programme;
  tablette?: boolean;
  surAnnonce: (a: Annonce) => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const { detail } = useDetailVisite(visite.id);
  const { envoi, message, agir, heureDe } = useActionVisite(visite, {
    geolocalisation: programme.geolocalisation,
    fuseau: programme.fuseau,
    attenteSecondes: programme.attente_gps_secondes,
    surTerminee: surAnnonce,
  });
  const enCours = visite.statut === 'en_cours';
  const ouvrir = () =>
    routeur.push({ pathname: '/visite/[id]', params: { id: visite.id, jour: visite.date } });
  const itineraire = () =>
    ouvrirItineraire(detail?.lieu?.latitude ?? null, detail?.lieu?.longitude ?? null, ouvrir);
  const contexte = [
    visite.prospect?.specialite_libelle || visite.prospect?.type_libelle,
    visite.etablissement?.nom,
  ]
    .filter(Boolean)
    .join(' · ');
  const quand =
    enCours && visite.debut_le
      ? t('mobile.tournee.enCoursDepuis', { heure: heureDe(visite.debut_le) })
      : quandProchaine(visite, programme.fuseau, t);
  const principal = (
    <Bouton
      variante="clair"
      libelle={t(enCours ? 'execution.terminer' : 'execution.demarrer')}
      chargement={envoi}
      onPress={() => void agir(enCours ? 'terminer' : 'demarrer')}
      style={tablette ? { minWidth: 220 } : { flex: 1 }}
    />
  );
  return (
    <>
      <View
        accessibilityLabel={t('programme.prochaine')}
        style={[
          styles.bandeau,
          { backgroundColor: p.bandeau },
          tablette && { padding: 24, gap: 18 },
        ]}
      >
        <View style={styles.entreDeux}>
          <Text style={[styles.bandeauLibelle, { color: surMarine.discret }]}>
            {t(enCours ? 'mobile.tournee.visiteEnCours' : 'programme.prochaine')}
          </Text>
          <Text style={[styles.bandeauLibelle, { color: '#FFFFFF', fontFamily: police.texteGras }]}>
            {quand}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={ouvrir}
          style={{ flexDirection: 'row', gap: tablette ? 16 : 12, alignItems: 'center' }}
        >
          {visite.prospect && (
            <MarquePotentiel valeur={visite.prospect.potentiel} taille={tablette ? 32 : 24} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={tablette ? styles.nomBandeauTablette : styles.nomBandeau}
            >
              {nom(visite, t)}
            </Text>
            {contexte ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.bandeauLibelle,
                  { color: surMarine.discret },
                  tablette && { fontSize: 14 },
                ]}
              >
                {contexte}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {tablette ? (
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            {principal}
            <Bouton
              variante="clairContour"
              icone="navigation"
              libelle={t('mobile.tournee.itineraire')}
              onPress={itineraire}
            />
            {visite.prospect && (
              <Bouton
                variante="clairContour"
                libelle={t('mobile.tournee.ficheProspect')}
                onPress={() =>
                  routeur.push({ pathname: '/fiche/[id]', params: { id: visite.prospect!.id } })
                }
              />
            )}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {principal}
            <Bouton
              variante="clairContour"
              icone="navigation"
              accessibilityLabel={t('mobile.tournee.itineraire')}
              onPress={itineraire}
              style={{ width: 48, paddingHorizontal: 0 }}
            />
          </View>
        )}
        {envoi && (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.bandeauLibelle, { color: surMarine.discret }]}
          >
            {programme.geolocalisation
              ? t(enCours ? 'execution.positionFin' : 'execution.position', {
                  n: programme.attente_gps_secondes,
                })
              : t('execution.demarrage')}
          </Text>
        )}
      </View>
      {message && <Alerte type={message.ton}>{message.texte}</Alerte>}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Alertes : rapports à corriger, en retard, visites à justifier

/** « LUNDI », « VENDR. » souligné d'orange (maquette). */
function JourCourt({ date }: { date: string }) {
  const { i18n } = useTranslation();
  const p = usePalette();
  const long = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
  const court = long.length > 6 ? `${long.slice(0, 5)}.` : long;
  return (
    <View style={{ width: 56 }}>
      <Text style={[styles.jourCourt, { color: p.texte, borderBottomColor: p.orange }]}>
        {court.toUpperCase()}
      </Text>
    </View>
  );
}

function LigneAlerte({
  avant,
  titre,
  meta,
  onPress,
}: {
  avant: ReactNode;
  titre: string;
  meta: string;
  onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titre} · ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.li, pressed && { backgroundColor: p.surface2 }]}
    >
      {avant}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="fort" numberOfLines={1}>
          {titre}
        </Texte>
        <Texte variante="discret" numberOfLines={1}>
          {meta}
        </Texte>
      </View>
      <Icone nom="chevron-right" taille={16} couleur={p.texteDiscret} />
    </Pressable>
  );
}

function CarteAlerte({
  titre,
  note,
  accent,
  children,
}: {
  titre: string;
  note: string;
  accent: string;
  children: ReactNode;
}) {
  const p = usePalette();
  return (
    <Carte marge={0} accent={accent}>
      <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 2 }}>
        <Texte variante="sousTitre" accessibilityRole="header">
          {titre}
        </Texte>
        <Texte variante="libelle">{note}</Texte>
      </View>
      {Array.isArray(children)
        ? children.map((c, i) => (
            <View
              key={i}
              style={
                i < children.length - 1 && { borderBottomWidth: 1, borderBottomColor: p.ligne }
              }
            >
              {c}
            </View>
          ))
        : children}
    </Carte>
  );
}

export function Alertes({ etat }: { etat: EtatTournee }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const rapport = (v: VisiteProgramme) =>
    routeur.push({ pathname: '/rapport/[id]', params: { id: v.id } });
  const visite = (v: VisiteProgramme) =>
    routeur.push({ pathname: '/visite/[id]', params: { id: v.id, jour: v.date } });
  const dateLongue = (v: VisiteProgramme) => {
    const d = new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${v.date}T12:00:00Z`));
    return [d.charAt(0).toUpperCase() + d.slice(1), v.heure].filter(Boolean).join(' · ');
  };
  return (
    <>
      {etat.aCorriger.length > 0 && (
        <CarteAlerte
          titre={`${t('correction.listeTitre')} (${etat.aCorriger.length})`}
          note={t('correction.listeNote')}
          accent={p.erreur}
        >
          {etat.aCorriger.map((v) => (
            <LigneAlerte
              key={v.id}
              avant={v.prospect && <MarquePotentiel valeur={v.prospect.potentiel} />}
              titre={nom(v, t)}
              // RPT-016 : un rapport rouvert par le superviseur se distingue d'une correction.
              meta={[
                dateLongue(v),
                v.rapport_statut === 'rouvert' ? t('mobile.tournee.statuts.rouvert') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => rapport(v)}
            />
          ))}
        </CarteAlerte>
      )}
      {etat.enRetard.length > 0 && (
        <CarteAlerte
          titre={`${t('rapport.enRetardTitre')} (${etat.enRetard.length})`}
          note={t('rapport.enRetardNote')}
          accent={p.orange}
        >
          {etat.enRetard.map((v) => (
            <LigneAlerte
              key={v.id}
              avant={<JourCourt date={v.date} />}
              titre={nom(v, t)}
              meta={t(`rapport.statuts.${v.rapport_statut ?? 'attendu'}`)}
              onPress={() => rapport(v)}
            />
          ))}
        </CarteAlerte>
      )}
      {etat.aJustifier.length > 0 && (
        <CarteAlerte
          titre={`${t('programme.aJustifier')} (${etat.aJustifier.length})`}
          note={t('programme.aJustifierNote')}
          accent={p.attention}
        >
          {etat.aJustifier.map((v) => (
            <LigneAlerte
              key={v.id}
              avant={<JourCourt date={v.date} />}
              titre={nom(v, t)}
              meta={t('mobile.tournee.resteePrevue')}
              onPress={() => visite(v)}
            />
          ))}
        </CarteAlerte>
      )}
    </>
  );
}

/** L'alerte jaune « À justifier » de la Tournée sans autre alerte (maquette). */
export function AlerteAJustifier({ etat }: { etat: EtatTournee }) {
  const { t } = useTranslation();
  const routeur = useRouter();
  const premiere = etat.aJustifier[0];
  if (!premiere) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        routeur.push({ pathname: '/visite/[id]', params: { id: premiere.id, jour: premiere.date } })
      }
    >
      <Alerte type="attention" icone="alert-circle">
        <Gras>{t('mobile.tournee.aJustifierTitre')}</Gras>{' '}
        {t('mobile.tournee.aJustifier', { count: etat.aJustifier.length })}
      </Alerte>
    </Pressable>
  );
}

/** Le programme résumé en une carte, qui ouvre la journée (Tournée avec alertes). */
export function ResumeProgramme({ etat }: { etat: EtatTournee }) {
  const { t } = useTranslation();
  const routeur = useRouter();
  const { programme } = etat;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        routeur.push({ pathname: '/jour/[date]', params: { date: programme.aujourdhui } })
      }
    >
      <Carte>
        <Texte variante="sousTitre">{t('programme.titre')}</Texte>
        <Texte variante="libelle">{descriptionProgramme(etat, t)}</Texte>
      </Carte>
    </Pressable>
  );
}

function descriptionProgramme(etat: EtatTournee, t: Traduire) {
  const { programme, visites } = etat;
  if (programme.etat === 'non_approuve') return t('programme.nonApprouve');
  if (programme.etat === 'sans_planning') return t('programme.sansPlanning');
  return [
    t('programme.visitesAujourdhui', { count: visites.length }),
    programme.version ? t('programme.version', { numero: programme.version }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Pas de frise ce jour-là : planning absent, non approuvé, jour férié ou vide. */
export function ProgrammeVide({ etat }: { etat: EtatTournee }) {
  const { t } = useTranslation();
  const { programme, aujourdhui } = etat;
  const texte =
    programme.etat === 'non_approuve'
      ? t('programme.nonApprouve')
      : programme.etat === 'sans_planning'
        ? t('programme.sansPlanning')
        : aujourdhui?.ferie
          ? t('programme.ferie', { libelle: aujourdhui.ferie })
          : t('programme.aucuneAujourdhui');
  return <Texte variante="discret">{texte}</Texte>;
}

/** Activités connexes du jour (commando, formation…), sous la frise. */
export function Activites({ jour }: { jour: JourProgramme | null }) {
  const { t } = useTranslation();
  if (!jour || jour.activites.length === 0) return null;
  return (
    <Texte variante="discret">
      {jour.activites
        .map((a) => `${t(`activites.types.${a.type}`)} · ${t(`activites.periodes.${a.periode}`)}`)
        .join(' ; ')}
    </Texte>
  );
}

/** Hors ligne : le programme tel qu'il a été lu pour la dernière fois. */
export function HorsLigne({ maj }: { maj: string | null }) {
  const { t, i18n } = useTranslation();
  if (!maj) return null;
  return (
    <Alerte type="attention">
      {t('programme.horsLigne', {
        date: new Intl.DateTimeFormat(i18n.language, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(maj)),
      })}
    </Alerte>
  );
}

// ---------------------------------------------------------------------------------------------
// Tablette : chiffres du jour, dernière visite, à traiter

export function ChiffresDuJour({ etat }: { etat: EtatTournee }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  return (
    <Chiffres
      valeurs={[
        {
          libelle: t('mobile.tournee.visitesAujourdhui'),
          valeur: `${etat.faites} / ${etat.visites.length}`,
        },
        {
          libelle: t('mobile.tournee.rapportsARediger'),
          valeur: String(etat.aRediger.length),
          couleur: etat.aRediger.length ? p.orange : undefined,
        },
        {
          libelle: t('mobile.tournee.semaine'),
          valeur: `${etat.semaineFaites} / ${etat.semaineTotal}`,
        },
        {
          libelle: t('mobile.tournee.kmJour'),
          valeur:
            etat.km != null
              ? t('mobile.tournee.km', { km: kilometres(etat.km, i18n.language) })
              : '—',
        },
      ]}
    />
  );
}

export function ChiffresAlertes({ etat }: { etat: EtatTournee }) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <Chiffres
      valeurs={[
        {
          libelle: t('mobile.tournee.aCorrigerCourt'),
          valeur: String(etat.aCorriger.length),
          couleur: p.erreur,
        },
        {
          libelle: t('mobile.tournee.enRetardCourt'),
          valeur: String(etat.enRetard.length),
          couleur: p.orange,
        },
        { libelle: t('mobile.tournee.aJustifierCourt'), valeur: String(etat.aJustifier.length) },
      ]}
    />
  );
}

export function DerniereVisite({ visite }: { visite: VisiteProgramme }) {
  const { t, i18n } = useTranslation();
  const { detail } = useDetailVisite(visite.id);
  const derniere = detail?.historique[0];
  const action = detail?.action_precedente;
  return (
    <Carte marge={0} style={{ flex: 1 }}>
      <Texte variante="sousTitre" style={styles.titreCarte}>
        {t('mobile.tournee.derniereVisite')}
      </Texte>
      {derniere ? (
        <>
          <Ligne
            libelle={t('mobile.tournee.date')}
            valeur={new Intl.DateTimeFormat(i18n.language, {
              day: 'numeric',
              month: 'long',
              timeZone: 'UTC',
            }).format(new Date(`${derniere.date}T12:00:00Z`))}
          />
          <Ligne
            libelle={t('mobile.tournee.resultat')}
            valeur={derniere.resultat ?? '—'}
            derniere={!action}
          />
          {action && (
            <Ligne libelle={t('mobile.tournee.prochaineAction')} valeur={action.texte} derniere />
          )}
        </>
      ) : (
        <Texte variante="discret" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          {t('mobile.tournee.premiereVisite')}
        </Texte>
      )}
    </Carte>
  );
}

export function ATraiter({ etat }: { etat: EtatTournee }) {
  const { t } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const lignes: { titre: string; meta: string; action: string; aller: () => void }[] = [];
  for (const v of etat.aRediger)
    lignes.push({
      titre: t('mobile.tournee.rapportARediger'),
      meta: [nom(v, t), v.heure].filter(Boolean).join(' · '),
      action: t('mobile.tournee.rediger'),
      aller: () => routeur.push({ pathname: '/rapport/[id]', params: { id: v.id } }),
    });
  const v = etat.aJustifier[0];
  if (v) {
    lignes.push({
      titre: t('mobile.tournee.visitesAJustifier', { count: etat.aJustifier.length }),
      meta: t('mobile.tournee.resteePrevue'),
      action: t('mobile.tournee.justifier'),
      aller: () => routeur.push({ pathname: '/visite/[id]', params: { id: v.id, jour: v.date } }),
    });
  }
  return (
    <Carte marge={0} style={{ flex: 1 }}>
      <Texte variante="sousTitre" style={styles.titreCarte}>
        {t('mobile.tournee.aTraiter')}
      </Texte>
      {lignes.length === 0 ? (
        <Texte variante="discret" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          {t('mobile.tournee.rien')}
        </Texte>
      ) : (
        lignes.map((l, i) => (
          <Pressable
            key={`${l.titre}${l.meta}`}
            accessibilityRole="button"
            accessibilityLabel={`${l.titre} · ${l.meta} · ${l.action}`}
            onPress={l.aller}
            style={[
              styles.li,
              i < lignes.length - 1 && { borderBottomWidth: 1, borderBottomColor: p.ligne },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Texte variante="fort" numberOfLines={1}>
                {l.titre}
              </Texte>
              <Texte variante="discret" numberOfLines={1}>
                {l.meta}
              </Texte>
            </View>
            <Text style={{ color: p.lien, fontFamily: police.texteFort, fontSize: 14 }}>
              {l.action}
            </Text>
          </Pressable>
        ))
      )}
    </Carte>
  );
}

/** Programme du jour en liste simple (volet droit de la tablette, avec alertes). */
export function ListeProgramme({ etat }: { etat: EtatTournee }) {
  const { t } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  return (
    <View>
      <View style={[styles.entreDeux, { paddingTop: 20, paddingHorizontal: 24, paddingBottom: 8 }]}>
        <Texte variante="sousTitre" accessibilityRole="header">
          {t('programme.titre')}
        </Texte>
        <Texte variante="libelle">
          {[
            t('programme.visites', { count: etat.visites.length }),
            etat.programme.version
              ? t('mobile.tournee.versionCourte', { numero: etat.programme.version })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Texte>
      </View>
      {etat.visites.map((v, i) => (
        <Pressable
          key={v.id}
          accessibilityRole="button"
          onPress={() =>
            routeur.push({ pathname: '/visite/[id]', params: { id: v.id, jour: v.date } })
          }
          style={[
            styles.li,
            { minHeight: 64, paddingVertical: 0, paddingHorizontal: 24 },
            i < etat.visites.length - 1 && { borderBottomWidth: 1, borderBottomColor: p.ligne },
          ]}
        >
          <Text style={[styles.heureListe, { color: p.texte }]}>{v.heure ?? '—'}</Text>
          {v.prospect && <MarquePotentiel valeur={v.prospect.potentiel} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Texte variante="fort" numberOfLines={1}>
              {nom(v, t)}
            </Texte>
            <Texte variante="discret" numberOfLines={1}>
              {v.etablissement?.nom ?? ''}
            </Texte>
          </View>
        </Pressable>
      ))}
      {etat.visites.length === 0 && (
        <View style={{ paddingHorizontal: 24 }}>
          <ProgrammeVide etat={etat} />
        </View>
      )}
    </View>
  );
}

/** Après « Terminer la visite » : l'annonce, et le rapport à rédiger tout de suite (RPT-001). */
export function AnnonceTerminee({ annonce, etat }: { annonce: Annonce | null; etat: EtatTournee }) {
  const { t } = useTranslation();
  const routeur = useRouter();
  if (!annonce) return null;
  const aRediger =
    annonce.rapport &&
    ['attendu', 'brouillon', 'a_corriger'].includes(
      etat.visites.find((v) => v.id === annonce.rapport)?.rapport_statut ?? 'attendu',
    );
  return (
    <>
      <Alerte type={annonce.ton}>{annonce.texte}</Alerte>
      {aRediger && (
        <Bouton
          variante="contour"
          libelle={t('rapport.rediger')}
          onPress={() => routeur.push(`/rapport/${annonce.rapport}`)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// L'écran composé, téléphone et tablette

type Proprietes = {
  etat: EtatTournee;
  annonce: Annonce | null;
  surAnnonce: (a: Annonce) => void;
};

/** Imprévue et indisponibilité (VIS-008, DC-51) : en bas de la Tournée, jour approuvé. */
export function ActionsDuJour({ etat, surAnnonce }: Omit<Proprietes, 'annonce'>) {
  if (etat.programme.etat !== 'approuve' || !etat.aujourdhui) return null;
  return (
    <Carte style={{ gap: 12 }}>
      <VisiteImprevue programme={etat.programme} surAnnonce={surAnnonce} />
      <Indisponibilite programme={etat.programme} surAnnonce={surAnnonce} />
    </Carte>
  );
}

export function TourneeTelephone({ etat, annonce, surAnnonce }: Proprietes) {
  if (etat.alertes) {
    return (
      <View style={{ gap: 12 }}>
        <HorsLigne maj={etat.horsLigne} />
        <Alertes etat={etat} />
        <ResumeProgramme etat={etat} />
        <AnnonceTerminee annonce={annonce} etat={etat} />
        <ActionsDuJour etat={etat} surAnnonce={surAnnonce} />
      </View>
    );
  }
  return (
    <>
      <HorsLigne maj={etat.horsLigne} />
      <Avancement etat={etat} />
      <AnnonceTerminee annonce={annonce} etat={etat} />
      <Bandeau etat={etat} surAnnonce={surAnnonce} />
      <AlerteAJustifier etat={etat} />
      {etat.visites.length > 0 ? (
        <Carte marge={0} style={{ paddingHorizontal: 12 }}>
          <Frise etat={etat} />
        </Carte>
      ) : (
        <ProgrammeVide etat={etat} />
      )}
      <Activites jour={etat.aujourdhui} />
      <ActionsDuJour etat={etat} surAnnonce={surAnnonce} />
    </>
  );
}

/** Volet gauche de la tablette : l'avancement et la frise du jour. */
export function VoletProgramme({ etat }: { etat: EtatTournee }) {
  return (
    <View>
      <View style={{ paddingTop: 20, paddingHorizontal: 24, paddingBottom: 12 }}>
        <Avancement etat={etat} />
      </View>
      <View style={{ paddingVertical: 8, paddingHorizontal: 20 }}>
        {etat.visites.length > 0 ? <Frise etat={etat} tablette /> : <ProgrammeVide etat={etat} />}
        <Activites jour={etat.aujourdhui} />
      </View>
    </View>
  );
}

export function TourneeTablette({ etat, annonce, surAnnonce }: Proprietes) {
  if (etat.alertes) {
    return (
      <View style={{ gap: 16 }}>
        <HorsLigne maj={etat.horsLigne} />
        <ChiffresAlertes etat={etat} />
        <Alertes etat={etat} />
        <AnnonceTerminee annonce={annonce} etat={etat} />
        <ActionsDuJour etat={etat} surAnnonce={surAnnonce} />
      </View>
    );
  }
  return (
    <>
      <HorsLigne maj={etat.horsLigne} />
      <ChiffresDuJour etat={etat} />
      <AnnonceTerminee annonce={annonce} etat={etat} />
      <Bandeau etat={etat} tablette surAnnonce={surAnnonce} />
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'stretch' }}>
        {etat.prochaine ? <DerniereVisite visite={etat.prochaine} /> : <View style={{ flex: 1 }} />}
        <ATraiter etat={etat} />
      </View>
      <ActionsDuJour etat={etat} surAnnonce={surAnnonce} />
    </>
  );
}

const styles = StyleSheet.create({
  statutFrise: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entreDeux: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  item: { flexDirection: 'row', gap: 12 },
  heure: { width: 46, fontFamily: police.titre, fontSize: 14, lineHeight: 20, paddingTop: 14 },
  rail: { width: 14 },
  trait: { position: 'absolute', left: 6, top: 0, bottom: 0, width: 2 },
  point: {
    position: 'absolute',
    left: 1,
    top: 18,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  halo: { position: 'absolute', left: -3, top: 14, width: 20, height: 20, borderRadius: 10 },
  cont: { flex: 1, minWidth: 0, paddingVertical: 8 },
  boite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 56,
  },
  nom: { fontFamily: police.texteFort, fontSize: 15, lineHeight: 21 },
  bandeau: { borderRadius: 6, padding: 18, gap: 14 },
  bandeauLibelle: { fontFamily: police.texteMoyen, fontSize: 12.5, lineHeight: 18 },
  nomBandeau: { color: '#FFFFFF', fontFamily: police.titre, fontSize: 19, lineHeight: 25 },
  nomBandeauTablette: {
    color: '#FFFFFF',
    fontFamily: police.titreFort,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.26,
  },
  jourCourt: {
    fontFamily: police.texteGras,
    fontSize: 12.5,
    lineHeight: 18,
    borderBottomWidth: 2,
    alignSelf: 'stretch',
  },
  li: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  titreCarte: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 6 },
  heureListe: { width: 44, fontFamily: police.titre, fontSize: 14, lineHeight: 20 },
});
