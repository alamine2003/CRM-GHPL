/**
 * Visites d'un planning en préparation (PLN-002) : le délégué choisit le prospect, le lieu,
 * l'heure, le réseau et l'objectif. Une visite peut rester incomplète pendant la préparation
 * (CA1) : les champs manquants s'affichent « À compléter » et la soumission (0.2.8) les exigera.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ClientApi, JourSemaine, ListeCible, Semaine, Visite } from '@innov/api-client';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lire } from './baseLocale';
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  MarquePotentiel,
  Texte,
  useLien,
  usePalette,
} from './composants';
import { Pilule } from './Etablissements';
import { nomProspect } from './Fiches';
import { police } from './polices';
import { messageErreur, useSession } from './session';

/** Prospect proposé au choix : de la liste cible, ou trouvé dans toutes les fiches. */
type Choix = {
  id: string;
  civilite?: string;
  prenom?: string;
  nom: string;
  potentiel: string;
  detail: string;
};

type Lieu = { id: string; nom: string };

function normaliser(texte: string) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** « 9h30 », « 930 », « 09:30 » → « 09:30 » ; null si l'heure n'est pas lisible. */
export function lireHeure(saisie: string): string | null {
  const m = /^(\d{1,2})\s*(?:[:hH.]\s*(\d{2})?|(\d{2}))?$/.exec(saisie.trim());
  if (!m) return null;
  const heures = Number(m[1]);
  const minutes = Number(m[2] ?? m[3] ?? 0);
  if (heures > 23 || minutes > 59) return null;
  return `${String(heures).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const depuisCible = (c: ListeCible['cibles'][number]): Choix => ({
  id: c.prospect.id,
  civilite: c.prospect.civilite,
  prenom: c.prospect.prenom,
  nom: c.prospect.nom,
  potentiel: c.prospect.potentiel,
  detail: [
    c.prospect.specialite_libelle || c.prospect.type_libelle,
    c.prospect.lieu_principal?.libelle,
  ]
    .filter(Boolean)
    .join(' · '),
});

/**
 * Ligne d'une visite dans la semaine : heure, prospect, lieu, et ce qui reste à compléter.
 * Dans un passage, l'heure et le lieu sont portés par la ligne du passage (PLN-003).
 */
export function LigneVisite({
  visite,
  onPress,
  dansPassage,
  alertes = [],
}: {
  visite: Visite;
  onPress?: () => void;
  dansPassage?: boolean;
  /** Contrôles qui concernent cette visite (PLN-004). */
  alertes?: { texte: string; ton: 'erreur' | 'attention' }[];
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const nom = visite.prospect ? nomProspect(visite.prospect, t) : t('visites.sansProspect');
  const manquants = visite.manquants.map((c) => t(`visites.champs.${c}`)).join(', ');
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? t('visites.modifier') : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.visite, pressed && { backgroundColor: p.fond }]}
    >
      {dansPassage ? (
        <View style={styles.retrait} />
      ) : (
        <Text
          style={[styles.heure, { color: visite.heure ? p.texte : p.texteDiscret }]}
          accessibilityLabel={visite.heure ?? t('visites.sansHeure')}
        >
          {visite.heure ?? '--:--'}
        </Text>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={[styles.nom, { color: visite.prospect ? p.texte : p.texteSecondaire }]}
        >
          {nom}
        </Text>
        {visite.etablissement && !dansPassage && (
          <Texte variante="discret" numberOfLines={1}>
            {visite.etablissement.nom}
          </Texte>
        )}
        {manquants ? (
          <Text style={[styles.manquants, { color: p.attention }]}>
            {t('visites.aCompleter', { champs: manquants })}
          </Text>
        ) : visite.objectif ? (
          <Texte variante="discret" numberOfLines={1}>
            {visite.objectif}
          </Texte>
        ) : null}
        {alertes.map((a) => (
          <Text
            key={a.texte}
            style={[styles.manquants, { color: a.ton === 'erreur' ? p.erreur : p.attention }]}
          >
            {a.texte}
          </Text>
        ))}
      </View>
      {onPress && <MaterialIcons name="chevron-right" size={22} color={p.texteDiscret} />}
    </Pressable>
  );
}

/** Action discrète en texte (« + Ajouter une visite », « Déclarer une absence »…). */
export function LienAction({
  icone,
  libelle,
  description,
  onPress,
  couleur,
}: {
  icone: ComponentProps<typeof MaterialIcons>['name'];
  libelle: string;
  /** Libellé vocalisé, plus précis que le texte affiché. */
  description?: string;
  onPress: () => void;
  couleur?: string;
}) {
  const lien = useLien();
  const teinte = couleur ?? lien;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={description ?? libelle}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.ajouter, pressed && { opacity: 0.6 }]}
    >
      <MaterialIcons name={icone} size={18} color={teinte} />
      <Text style={[styles.ajouterTexte, { color: teinte }]}>{libelle}</Text>
    </Pressable>
  );
}

/**
 * Saisie d'une visite, en pleine page à la place de la semaine. Ajout si `visite` est absente,
 * sinon modification ou retrait.
 */
export function FormulaireVisite({
  semaine,
  jour,
  visite,
  surTermine,
  surAnnuler,
}: {
  semaine: Semaine;
  jour: string;
  visite?: Visite;
  surTermine: (message: string) => void;
  surAnnuler: () => void;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const lien = useLien();
  const { client } = useSession();
  // Une journée entière d'absence ne reçoit pas de visite (PLN-009).
  const absents = new Set(
    semaine.absences.filter((a) => a.periode === 'journee').map((a) => a.date),
  );
  const jours = semaine.jours.filter(
    (j) => j.planifiable && (!absents.has(j.date) || j.date === visite?.date),
  );
  const passage = visite?.passage
    ? semaine.passages.find((x) => x.id === visite.passage)
    : undefined;
  const unSeulReseau = semaine.reseaux.length === 1 ? (semaine.reseaux[0]?.id ?? null) : null;

  const [date, setDate] = useState(visite?.date ?? jour);
  const [prospect, setProspect] = useState<Choix | null>(
    visite?.prospect
      ? {
          ...visite.prospect,
          detail: visite.prospect.specialite_libelle || visite.prospect.type_libelle,
        }
      : null,
  );
  const [lieu, setLieu] = useState<Lieu | null>(visite?.etablissement ?? null);
  const [heure, setHeure] = useState(visite?.heure ?? '');
  const [reseau, setReseau] = useState<string | null>(visite?.reseau?.id ?? unSeulReseau);
  const [objectif, setObjectif] = useState(visite?.objectif ?? '');
  const [note, setNote] = useState(visite?.note ?? '');
  const [envoi, setEnvoi] = useState<'enregistrer' | 'retirer' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const heureLue = heure.trim() ? lireHeure(heure) : null;
  const heureIllisible = heure.trim() !== '' && heureLue === null;
  const libelleJour = (j: JourSemaine) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric' }).format(
      new Date(`${j.date}T12:00:00`),
    );

  async function enregistrer() {
    setEnvoi('enregistrer');
    setErreur(null);
    const saisie = {
      date,
      heure: heureLue,
      prospect: prospect?.id ?? null,
      etablissement: lieu?.id ?? null,
      reseau,
      objectif: objectif.trim(),
      note: note.trim(),
    };
    try {
      if (visite) await client.visites.modifier(visite.id, saisie);
      else if (semaine.planning) await client.plannings.ajouterVisite(semaine.planning.id, saisie);
      surTermine(visite ? t('visites.modifiee') : t('visites.ajoutee'));
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setEnvoi(null);
    }
  }

  async function retirer() {
    if (!visite) return;
    setEnvoi('retirer');
    setErreur(null);
    try {
      await client.visites.retirer(visite.id);
      surTermine(t('visites.retiree'));
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setEnvoi(null);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Texte variante="sousTitre">{visite ? t('visites.modifier') : t('visites.nouvelle')}</Texte>
      <Texte variante="discret">{t('visites.aide')}</Texte>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}

      <Section titre={t('visites.champs.date')}>
        <View style={styles.pilules}>
          {jours.map((j) => (
            <Pilule
              key={j.date}
              libelle={libelleJour(j)}
              actif={date === j.date}
              onPress={() => setDate(j.date)}
            />
          ))}
        </View>
      </Section>

      <Section titre={t('visites.champs.prospect')}>
        {prospect ? (
          <Carte style={{ gap: 4, paddingVertical: 12 }}>
            <View style={styles.choisi}>
              <MarquePotentiel valeur={prospect.potentiel} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.nom, { color: p.texte }]}>
                  {nomProspect(prospect, t)}
                </Text>
                {prospect.detail ? (
                  <Texte variante="discret" numberOfLines={1}>
                    {prospect.detail}
                  </Texte>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setProspect(null);
                  setLieu(null);
                }}
                hitSlop={8}
                style={styles.changer}
              >
                <Text style={[styles.ajouterTexte, { color: lien }]}>{t('visites.changer')}</Text>
              </Pressable>
            </View>
          </Carte>
        ) : (
          <ChoixProspect
            client={client}
            surChoix={(c) => {
              setProspect(c);
              setLieu(null);
            }}
          />
        )}
      </Section>

      {prospect && (
        <Section titre={t('visites.champs.etablissement')}>
          <ChoixLieu client={client} prospect={prospect.id} lieu={lieu} surChoix={setLieu} />
        </Section>
      )}

      <Champ
        libelle={t('visites.champs.heure')}
        placeholder={t('visites.indiceHeure')}
        value={heure}
        onChangeText={setHeure}
        onBlur={() => heureLue && setHeure(heureLue)}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        autoCorrect={false}
      />
      {heureIllisible && <Texte variante="discret">{t('visites.heureIllisible')}</Texte>}
      {passage && !heureIllisible && (
        <Texte variante="discret">
          {t('passages.heureCommune', { count: passage.visites.length })}
        </Texte>
      )}

      {semaine.reseaux.length > 1 && (
        <Section titre={t('visites.champs.reseau')}>
          <View style={styles.pilules}>
            {semaine.reseaux.map((r) => (
              <Pilule
                key={r.id}
                libelle={r.libelle}
                actif={reseau === r.id}
                onPress={() => setReseau(r.id)}
              />
            ))}
          </View>
        </Section>
      )}

      <Champ
        libelle={t('visites.champs.objectif')}
        placeholder={t('visites.indiceObjectif')}
        value={objectif}
        onChangeText={setObjectif}
        maxLength={200}
      />
      <Champ
        libelle={t('visites.champs.note')}
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
      />

      <Bouton
        libelle={t('commun.enregistrer')}
        chargement={envoi === 'enregistrer'}
        desactive={heureIllisible || envoi === 'retirer'}
        onPress={() => void enregistrer()}
      />
      <Bouton secondaire libelle={t('commun.annuler')} onPress={surAnnuler} />
      {visite && (
        <Pressable
          accessibilityRole="button"
          disabled={envoi !== null}
          onPress={() => void retirer()}
          style={({ pressed }) => [styles.retirer, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.ajouterTexte, { color: p.erreur }]}>
            {envoi === 'retirer' ? t('session.chargement') : t('visites.retirer')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Texte variante="libelle">{titre}</Texte>
      {children}
    </View>
  );
}

/**
 * Choix du prospect : la liste cible d'abord (gardée hors ligne), et si la personne n'y est pas,
 * une recherche dans toutes les fiches du pays.
 */
function ChoixProspect({ client, surChoix }: { client: ClientApi; surChoix: (c: Choix) => void }) {
  const { t } = useTranslation();
  const [cibles, setCibles] = useState<Choix[] | null>(null);
  const [saisie, setSaisie] = useState('');
  const [partout, setPartout] = useState<Choix[] | null>(null);
  const [recherche, setRecherche] = useState(false);

  useEffect(() => {
    let actif = true;
    client.ciblage
      .mesListes()
      .catch(async () => (await lire<ListeCible[]>('ciblage.moi').catch(() => null))?.valeur ?? [])
      .then((listes) => {
        if (actif) setCibles(listes.flatMap((l) => l.cibles).map(depuisCible));
      });
    return () => {
      actif = false;
    };
  }, [client]);

  const filtre = normaliser(saisie.trim());
  const retenues = (cibles ?? []).filter((c) =>
    normaliser(`${c.prenom ?? ''} ${c.nom} ${c.prenom ?? ''} ${c.detail}`).includes(filtre),
  );

  async function chercherPartout() {
    setRecherche(true);
    try {
      const r = await client.prospects.liste({ q: saisie.trim() });
      setPartout(
        r.resultats.map((f) => ({
          id: f.id,
          civilite: f.civilite,
          prenom: f.prenom,
          nom: f.nom,
          potentiel: f.potentiel,
          detail: f.specialite_libelle || f.type_libelle,
        })),
      );
    } catch {
      setPartout([]);
    } finally {
      setRecherche(false);
    }
  }

  const liste = partout ?? retenues.slice(0, 5);
  return (
    <View style={{ gap: 8 }}>
      <Champ
        libelle={t('visites.chercherProspect')}
        libelleMasque
        placeholder={t('visites.chercherProspect')}
        value={saisie}
        onChangeText={(v) => {
          setSaisie(v);
          setPartout(null);
        }}
        autoCorrect={false}
        returnKeyType="search"
      />
      {!cibles ? (
        <Texte variante="discret">{t('session.chargement')}</Texte>
      ) : (
        <>
          {partout === null && liste.length > 0 && (
            <Texte variante="discret">{t('visites.depuisMaListe')}</Texte>
          )}
          {liste.length === 0 && (
            <Texte variante="discret">
              {partout ? t('visites.aucunePartout') : t('visites.aucuneDansMaListe')}
            </Texte>
          )}
          {liste.map((c) => (
            <LigneChoix key={c.id} choix={c} onPress={() => surChoix(c)} />
          ))}
          {partout === null && saisie.trim().length >= 2 && (
            <Bouton
              secondaire
              libelle={t('visites.chercherPartout', { saisie: saisie.trim() })}
              chargement={recherche}
              onPress={() => void chercherPartout()}
            />
          )}
        </>
      )}
    </View>
  );
}

function LigneChoix({ choix, onPress }: { choix: Choix; onPress: () => void }) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.choix,
        { borderColor: p.ligne, backgroundColor: pressed ? p.fond : p.surface },
      ]}
    >
      <MarquePotentiel valeur={choix.potentiel} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.nom, { color: p.texte }]}>
          {nomProspect(choix, t)}
        </Text>
        {choix.detail ? (
          <Texte variante="discret" numberOfLines={1}>
            {choix.detail}
          </Texte>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Lieux d'exercice actifs du prospect, le principal d'abord ; un seul est retenu d'office. */
function ChoixLieu({
  client,
  prospect,
  lieu,
  surChoix,
}: {
  client: ClientApi;
  prospect: string;
  lieu: Lieu | null;
  surChoix: (l: Lieu) => void;
}) {
  const { t } = useTranslation();
  const [lieux, setLieux] = useState<Lieu[] | null>(null);

  useEffect(() => {
    let actif = true;
    client.exercices
      .duProspect(prospect)
      .then((exercices) => {
        if (!actif) return;
        const trouves = exercices
          .filter((e) => e.actif)
          .sort((a, b) => Number(!!b.principal) - Number(!!a.principal))
          .map((e) => ({ id: e.etablissement.id, nom: e.etablissement.nom }));
        setLieux(trouves);
        if (trouves[0] && trouves.length === 1 && !lieu) surChoix(trouves[0]);
      })
      .catch(() => actif && setLieux([]));
    return () => {
      actif = false;
    };
    // Le lieu choisi ne relance pas la lecture : seul le prospect compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, prospect]);

  if (!lieux) return <Texte variante="discret">{t('session.chargement')}</Texte>;
  // Le lieu déjà enregistré reste proposé, même s'il n'est plus un lieu d'exercice actif.
  const proposes = lieu && !lieux.some((l) => l.id === lieu.id) ? [lieu, ...lieux] : lieux;
  if (proposes.length === 0) return <Texte variante="discret">{t('visites.sansLieu')}</Texte>;
  return (
    <View style={styles.pilules}>
      {proposes.map((l) => (
        <Pilule key={l.id} libelle={l.nom} actif={lieu?.id === l.id} onPress={() => surChoix(l)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  visite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
    paddingLeft: 4,
    borderRadius: 6,
  },
  retrait: { width: 14 },
  heure: { fontFamily: police.texteFort, fontSize: 14, width: 48, fontVariant: ['tabular-nums'] },
  nom: { fontFamily: police.texteFort, fontSize: 15 },
  manquants: { fontFamily: police.texteFort, fontSize: 12 },
  ajouter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingRight: 8,
  },
  ajouterTexte: { fontFamily: police.texteFort, fontSize: 14 },
  pilules: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choisi: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  changer: { minHeight: 44, justifyContent: 'center', paddingLeft: 8 },
  choix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
  },
  retirer: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
