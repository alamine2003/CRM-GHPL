/**
 * Onglet Prospects (PRP-002, PRP-003, PRP-005, PRP-011), selon la maquette 1.4.4 : ma liste
 * cible d'abord, cherchée et filtrée sur le téléphone même sans réseau ; « Tous » cherche dans
 * les fiches communes du pays, « Établissements » dans les lieux. Sur la tablette, un tableau
 * (prospect, spécialité, établissement, zone, cycle).
 */
import type { Etablissement, Potentiel, Prospect } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Alerte,
  Bouton,
  BoutonIcone,
  Carte,
  ChampRecherche,
  Etiquette,
  MarquePotentiel,
  Texte,
  usePalette,
} from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { LigneEtablissement, Pilule } from './Etablissements';
import { nomProspect } from './Fiches';
import { type CibleDeListe, ciblesDe, correspond, useMaListe } from './MaListe';
import { MesPropositions } from './MesPropositions';
import { police } from './polices';
import { useSession } from './session';
import { StatutSynchro } from './Synchronisation';

type Mode = 'liste' | 'tous' | 'lieux';
type Filtre = 'specialite' | 'zone';

/** Une ligne de la liste, qu'elle vienne de ma liste cible ou des fiches communes. */
interface LigneP {
  id: string;
  potentiel: Potentiel;
  nom: string;
  specialite: string;
  lieu: string;
  zone: string;
  /** « 2 / 3 » : visites du cycle sur la fréquence ; seulement pour ma liste. */
  cycle: { faites: number | null; frequence: number } | null;
  aValider: boolean;
}

const POTENTIELS: Potentiel[] = ['A', 'B', 'C'];

function deCible(c: CibleDeListe, t: ReturnType<typeof useTranslation>['t']): LigneP {
  const f = c.prospect;
  return {
    id: f.id,
    potentiel: f.potentiel,
    nom: nomProspect(f, t),
    specialite: f.specialite_libelle ?? f.type_libelle,
    lieu: f.lieu_principal?.libelle ?? '',
    zone: f.secteur ?? '',
    cycle: { faites: c.visites_cycle ?? null, frequence: c.frequence },
    aValider: f.statut === 'a_valider',
  };
}

function deFiche(f: Prospect, t: ReturnType<typeof useTranslation>['t']): LigneP {
  return {
    id: f.id,
    potentiel: f.potentiel,
    nom: nomProspect(f, t),
    specialite: f.specialite_libelle ?? f.type_libelle,
    lieu: f.lieu_principal?.libelle ?? '',
    zone: f.secteur?.libelle ?? '',
    cycle: null,
    aValider: f.statut === 'a_valider',
  };
}

/** « 2 / 3 », vocalisé « 2 visites sur 3 ce cycle » ; sans le compte (liste ancienne), « 3 / cycle ». */
function Cycle({ cycle }: { cycle: LigneP['cycle'] }) {
  const { t } = useTranslation();
  const p = usePalette();
  if (!cycle) return null;
  const { faites, frequence } = cycle;
  return (
    <Text
      accessibilityLabel={
        faites === null
          ? t('ciblage.parCycle', { count: frequence })
          : t('mobile.prospects.cycleLong', { faites, count: frequence })
      }
      style={[styles.cycle, { color: p.texte }]}
    >
      {faites === null
        ? t('ciblage.parCycle', { count: frequence })
        : t('mobile.prospects.cycle', { faites, frequence })}
    </Text>
  );
}

export function EcranProspects() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const tablette = useTablette();
  const { client, etat } = useSession();
  const { listes, horsLigneDepuis, indisponible } = useMaListe();
  const [mode, setMode] = useState<Mode>('liste');
  const [saisie, setSaisie] = useState('');
  const [potentiel, setPotentiel] = useState<Potentiel | null>(null);
  const [filtres, setFiltres] = useState<Record<Filtre, string | null>>({
    specialite: null,
    zone: null,
  });
  const [choix, setChoix] = useState<Filtre | null>(null);
  const [fiches, setFiches] = useState<Prospect[] | null>(null);
  const [lieux, setLieux] = useState<Etablissement[] | null>(null);
  const [total, setTotal] = useState(0);
  // Pages de 20 (PRP-005 CA3) : « Voir plus » ajoute la suivante.
  const [page, setPage] = useState(1);
  const [suite, setSuite] = useState(false);
  const pays = etat.statut === 'connecte' ? etat.perimetre.pays_actif?.nom : undefined;
  const peutCreer =
    etat.statut === 'connecte' && etat.perimetre.actions.includes('prospects.creer');

  useEffect(() => {
    let actif = true;
    if (mode === 'liste') return;
    const minuteur = setTimeout(() => {
      const ajouter = page > 1;
      const requete =
        mode === 'tous'
          ? client.prospects
              .liste({ q: saisie, page, potentiel: potentiel ?? undefined })
              .then((r) => {
                if (!actif) return;
                setFiches((avant) => (ajouter && avant ? [...avant, ...r.resultats] : r.resultats));
                setTotal(r.total);
              })
          : client.etablissements.liste({ q: saisie, page }).then((r) => {
              if (!actif) return;
              setLieux((avant) => (ajouter && avant ? [...avant, ...r.resultats] : r.resultats));
              setTotal(r.total);
            });
      requete.finally(() => actif && setSuite(false));
      requete.catch(() => undefined);
    }, 300);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [client, saisie, mode, page, potentiel]);

  const changerMode = (m: Mode) => {
    setMode(m);
    setPage(1);
    setChoix(null);
  };

  // Ma liste : une ligne par prospect, filtrée sur le téléphone.
  const cibles = listes ? ciblesDe(listes) : [];
  const compte = (v: Potentiel) => cibles.filter((c) => c.prospect.potentiel === v).length;
  const valeursDe = (filtre: Filtre) =>
    [
      ...new Set(
        cibles
          .map((c) =>
            filtre === 'zone'
              ? (c.prospect.secteur ?? '')
              : (c.prospect.specialite_libelle ?? c.prospect.type_libelle),
          )
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
  const lignesListe = cibles
    .map((c) => deCible(c, t))
    .filter(
      (l, i) =>
        (!potentiel || l.potentiel === potentiel) &&
        (!filtres.specialite || l.specialite === filtres.specialite) &&
        (!filtres.zone || l.zone === filtres.zone) &&
        correspond(cibles[i]!, saisie),
    );
  const lignes = mode === 'liste' ? lignesListe : (fiches ?? []).map((f) => deFiche(f, t));

  const surTitre =
    mode === 'liste'
      ? listes
        ? t('mobile.prospects.maListe', { count: cibles.length })
        : undefined
      : mode === 'tous'
        ? fiches
          ? t('mobile.prospects.tous', { count: total })
          : undefined
        : lieux
          ? t('etablissement.nombre', { count: total })
          : undefined;

  const nouveau = peutCreer ? (
    <BoutonIcone
      icone="plus"
      libelle={mode === 'lieux' ? t('etablissement.nouveau') : t('mobile.prospects.nouveau')}
      onPress={() => {
        routeur.push(mode === 'lieux' ? '/etablissement/nouveau' : '/prospect/nouveau');
      }}
    />
  ) : null;

  const recherche = (
    <ChampRecherche
      libelle={mode === 'lieux' ? t('etablissement.rechercher') : t('mobile.prospects.rechercher')}
      placeholder={mode === 'lieux' ? t('etablissement.rechercher') : t('mobile.prospects.indice')}
      value={saisie}
      onChangeText={(texte) => {
        setSaisie(texte);
        setPage(1);
      }}
      style={tablette ? { width: 340 } : undefined}
    />
  );

  const ouvrir = (id: string) => routeur.push(`/fiche/${id}`);

  const filtresVue = (
    <View style={{ gap: 8 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtres}
        accessibilityRole="tablist"
      >
        <Pilule
          libelle={t('ciblage.mobile.segment')}
          actif={mode === 'liste'}
          onPress={() => changerMode('liste')}
        />
        <Pilule
          libelle={t('mobile.prospects.segmentTous')}
          actif={mode === 'tous'}
          onPress={() => changerMode('tous')}
        />
        <Pilule
          libelle={t('etablissement.mobile.segmentEtablissements')}
          actif={mode === 'lieux'}
          onPress={() => changerMode('lieux')}
        />
        {mode !== 'lieux' && (
          <>
            <View style={[styles.separateur, { backgroundColor: p.ligne }]} />
            {POTENTIELS.map((v) => (
              <Pilule
                key={v}
                marque={<MarquePotentiel valeur={v} taille={20} />}
                libelle={
                  tablette
                    ? t('mobile.prospects.potentiel', { valeur: v })
                    : mode === 'liste'
                      ? String(compte(v))
                      : v
                }
                actif={potentiel === v}
                onPress={() => {
                  setPotentiel(potentiel === v ? null : v);
                  setPage(1);
                }}
              />
            ))}
          </>
        )}
        {mode === 'liste' &&
          (['specialite', 'zone'] as const).map((f) => (
            <Pilule
              key={f}
              libelle={filtres[f] ?? t(`mobile.prospects.filtres.${f}`)}
              actif={!!filtres[f] || choix === f}
              onPress={() => setChoix(choix === f ? null : f)}
            />
          ))}
      </ScrollView>
      {mode === 'liste' && choix && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtres}
        >
          <Pilule
            libelle={t(`mobile.prospects.filtres.${choix}Toutes`)}
            actif={!filtres[choix]}
            onPress={() => {
              setFiltres({ ...filtres, [choix]: null });
              setChoix(null);
            }}
          />
          {valeursDe(choix).map((v) => (
            <Pilule
              key={v}
              libelle={v}
              actif={filtres[choix] === v}
              onPress={() => {
                setFiltres({ ...filtres, [choix]: v });
                setChoix(null);
              }}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );

  let contenu;
  if (mode === 'lieux') {
    contenu = (
      <>
        <Carte marge={0} style={{ paddingHorizontal: 16 }}>
          {lieux?.length === 0 && (
            <Texte variante="discret" style={{ paddingVertical: 14 }}>
              {t('etablissement.aucunResultat')}
            </Texte>
          )}
          {lieux?.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              onPress={() => routeur.push(`/lieu/${e.id}`)}
            >
              <LigneEtablissement etablissement={e} />
            </Pressable>
          ))}
        </Carte>
        {lieux && lieux.length < total && (
          <VoirPlus
            reste={total - lieux.length}
            chargement={suite}
            surAppui={() => {
              setSuite(true);
              setPage((x) => x + 1);
            }}
          />
        )}
      </>
    );
  } else if (mode === 'liste' && indisponible) {
    contenu = <Alerte type="attention">{t('ciblage.mobile.indisponible')}</Alerte>;
  } else if (mode === 'liste' && !listes) {
    contenu = <Texte variante="discret">{t('session.chargement')}</Texte>;
  } else if (mode === 'liste' && listes?.length === 0) {
    contenu = (
      <Carte>
        <Texte variante="discret">{t('ciblage.mobile.sansPoste')}</Texte>
      </Carte>
    );
  } else {
    const vide =
      mode === 'liste' ? t('ciblage.mobile.resultats', { count: 0 }) : t('prospect.aucunResultat');
    contenu = (
      <>
        {tablette ? (
          <Tableau
            lignes={lignes}
            vide={fiches || mode === 'liste' ? vide : null}
            surAppui={ouvrir}
          />
        ) : (
          <Carte marge={0}>
            {(mode === 'liste' || fiches) && lignes.length === 0 && (
              <Texte variante="discret" style={{ padding: 16 }}>
                {vide}
              </Texte>
            )}
            {lignes.map((l, i) => (
              <LigneProspect
                key={l.id}
                ligne={l}
                derniere={i === lignes.length - 1}
                surAppui={() => ouvrir(l.id)}
              />
            ))}
          </Carte>
        )}
        {mode === 'liste' && lignes.length === 0 && saisie.trim().length >= 2 && (
          <Bouton
            variante="contour"
            libelle={t('ciblage.mobile.chercherPartout', { texte: saisie.trim() })}
            onPress={() => changerMode('tous')}
          />
        )}
        {mode === 'tous' && fiches && fiches.length < total && (
          <VoirPlus
            reste={total - fiches.length}
            chargement={suite}
            surAppui={() => {
              setSuite(true);
              setPage((x) => x + 1);
            }}
          />
        )}
      </>
    );
  }

  return (
    <Ecran
      titre={t('prospect.mobile.titre')}
      surTitre={surTitre}
      action={
        <View style={styles.actions}>
          <StatutSynchro />
          {nouveau}
        </View>
      }
      enteteTablette={{
        surTitre: [surTitre, pays].filter(Boolean).join(' · '),
        action: (
          <View style={styles.actions}>
            {recherche}
            {nouveau}
          </View>
        ),
      }}
    >
      {/* 1.4.0 : les décisions sur mes propositions quittent la Tournée de la maquette. */}
      <MesPropositions />
      {mode === 'liste' && horsLigneDepuis && (
        <Alerte type="attention">
          {t('ciblage.mobile.horsLigne', { date: dateCourte(horsLigneDepuis, i18n.language) })}
        </Alerte>
      )}
      {!tablette && recherche}
      {filtresVue}
      {contenu}
    </Ecran>
  );
}

function dateCourte(iso: string, langue: string) {
  return new Intl.DateTimeFormat(langue, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function VoirPlus({
  reste,
  chargement,
  surAppui,
}: {
  reste: number;
  chargement: boolean;
  surAppui: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Bouton
      variante="contour"
      libelle={t('recherche.voirPlus', { reste })}
      chargement={chargement}
      onPress={surAppui}
    />
  );
}

/** Téléphone : carré du potentiel, nom, spécialité et lieu, cycle à droite (64 px). */
function LigneProspect({
  ligne: l,
  derniere,
  surAppui,
}: {
  ligne: LigneP;
  derniere: boolean;
  surAppui: () => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={surAppui}
      style={({ pressed }) => [
        styles.ligne,
        !derniere && { borderBottomWidth: 1, borderBottomColor: p.ligne },
        pressed && { backgroundColor: p.fond },
      ]}
    >
      <MarquePotentiel valeur={l.potentiel} libelle={t(`prospect.potentiels.${l.potentiel}`)} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={[styles.nom, { color: p.texte }]}>
          {l.nom}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: p.texteSecondaire }]}>
          {[l.specialite, l.lieu].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {l.aValider && <Etiquette>{t('prospect.statuts.a_valider')}</Etiquette>}
      <Cycle cycle={l.cycle} />
    </Pressable>
  );
}

/** Tablette : le tableau (.thead, .trow) — prospect, spécialité, établissement, zone, cycle. */
function Tableau({
  lignes,
  vide,
  surAppui,
}: {
  lignes: LigneP[];
  vide: string | null;
  surAppui: (id: string) => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const colonnes = [
    { cle: 'prospect', flex: 3 },
    { cle: 'specialite', flex: 2 },
    { cle: 'etablissement', flex: 2.5 },
    { cle: 'zone', flex: 2 },
  ] as const;
  return (
    <Carte marge={0} style={{ overflow: 'hidden' }}>
      <View style={[styles.thead, { backgroundColor: p.surface2, borderBottomColor: p.ligne }]}>
        <View style={styles.colPot} />
        {colonnes.map((c) => (
          <Text key={c.cle} style={[styles.th, { flex: c.flex, color: p.texteSecondaire }]}>
            {t(`mobile.prospects.colonnes.${c.cle}`).toLocaleUpperCase()}
          </Text>
        ))}
        <Text style={[styles.th, styles.colCycle, { color: p.texteSecondaire }]}>
          {t('mobile.prospects.colonnes.cycle').toLocaleUpperCase()}
        </Text>
      </View>
      {lignes.length === 0 && vide ? (
        <Texte variante="discret" style={{ padding: 20 }}>
          {vide}
        </Texte>
      ) : null}
      {lignes.map((l, i) => (
        <Pressable
          key={l.id}
          accessibilityRole="button"
          accessibilityLabel={[l.nom, l.specialite, l.lieu, l.zone].filter(Boolean).join(', ')}
          onPress={() => surAppui(l.id)}
          style={({ pressed }) => [
            styles.trow,
            i < lignes.length - 1 && { borderBottomWidth: 1, borderBottomColor: p.ligne },
            pressed && { backgroundColor: p.fond },
          ]}
        >
          <View style={styles.colPot}>
            <MarquePotentiel
              valeur={l.potentiel}
              libelle={t(`prospect.potentiels.${l.potentiel}`)}
            />
          </View>
          <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text numberOfLines={1} style={[styles.nomTableau, { color: p.texte }]}>
              {l.nom}
            </Text>
            {l.aValider && <Etiquette>{t('prospect.statuts.a_valider')}</Etiquette>}
          </View>
          {[
            { v: l.specialite, flex: 2 },
            { v: l.lieu, flex: 2.5 },
            { v: l.zone, flex: 2 },
          ].map((c, k) => (
            <Text
              key={k}
              numberOfLines={1}
              style={[styles.td, { flex: c.flex, color: p.texteSecondaire }]}
            >
              {c.v || '—'}
            </Text>
          ))}
          <View style={styles.colCycle}>
            <Cycle cycle={l.cycle} />
          </View>
        </Pressable>
      ))}
    </Carte>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  filtres: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  separateur: { width: 1, height: 24, marginHorizontal: 2 },
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
  cycle: { fontFamily: police.texteFort, fontSize: 13, fontVariant: ['tabular-nums'] },
  thead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 40,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  th: { fontFamily: police.texteGras, fontSize: 11, letterSpacing: 0.6 },
  trow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 56,
    paddingHorizontal: 20,
  },
  colPot: { width: 32 },
  colCycle: { width: 64, alignItems: 'flex-end', textAlign: 'right' },
  nomTableau: { flexShrink: 1, fontFamily: police.texteGras, fontSize: 15 },
  td: { fontFamily: police.texte, fontSize: 14 },
});
