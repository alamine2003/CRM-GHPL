/**
 * Visites d'un planning en préparation (PLN-002) : le délégué choisit le prospect, le lieu,
 * l'heure, le réseau et l'objectif. Une visite peut rester incomplète pendant la préparation
 * (CA1) : les champs manquants s'affichent « À compléter » et la soumission (0.2.8) les exigera.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type {
  ClientApi,
  JourSemaine,
  ListeCible,
  Semaine,
  Visite,
  VisiteProposee,
} from '@innov/api-client';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ecrire, lire } from './baseLocale';
import {
  type ChampsVisite,
  estTransitoire,
  garderBrouillon,
  mettreEnAttente,
  nouvelIdentifiant,
  oublierBrouillon,
} from './Brouillons';
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  ListeDeroulante,
  MarquePotentiel,
  Texte,
  useLien,
  usePalette,
} from './composants';
import { avantDe, conflitDe } from './Conflits';
import type { Alerte as AlerteVisite } from './Controles';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { Pilule } from './Etablissements';
import { nomProspect } from './Fiches';
import { police } from './polices';
import { jourLong } from './Semaine';
import { messageErreur, useSession } from './session';
import { jourIso } from './semaineLocale';
import { RAYON } from './theme';

const CLE_PROPOSEES = 'visites.proposees';

/** Prospect proposé au choix : de la liste cible, ou trouvé dans toutes les fiches. */
export type Choix = {
  id: string;
  civilite?: string;
  prenom?: string;
  nom: string;
  potentiel: string;
  detail: string;
};

export type Lieu = { id: string; nom: string };

export function normaliser(texte: string) {
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

export const depuisCible = (c: ListeCible['cibles'][number]): Choix => ({
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
  alertes?: AlerteVisite[];
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
      {visite.prospect && <MarquePotentiel valeur={visite.prospect.potentiel} />}
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
        {visite.est_imprevue ? (
          <Text style={[styles.manquants, { color: p.texteSecondaire }]}>
            {t('visites.imprevue')}
          </Text>
        ) : manquants ? (
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
            key={a.cle}
            style={[
              styles.manquants,
              { color: a.ton === 'erreur' ? p.erreur : a.ton === 'info' ? p.info : p.attention },
            ]}
          >
            {a.texte}
          </Text>
        ))}
      </View>
      {onPress && <MaterialIcons name="chevron-right" size={20} color={p.texteDiscret} />}
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
  brouillon,
  surTermine,
  surAnnuler,
}: {
  semaine: Semaine;
  jour: string;
  visite?: Visite;
  /** Saisie reprise d'un brouillon gardé sur le téléphone (PLN-007). */
  brouillon?: ChampsVisite;
  surTermine: (message: string) => void;
  surAnnuler: () => void;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { client } = useSession();
  // Une journée entière d'absence ne reçoit pas de visite (PLN-009).
  const absents = new Set(
    semaine.activites.filter((a) => a.periode === 'journee').map((a) => a.date),
  );
  // Planning approuvé (PLN-015, RG-018) : l'heure change librement, le reste est soumis ; une
  // journée passée est verrouillée.
  const apresApprobation = !!semaine.approbation?.modifiable;
  const aujourdhui = jourIso(new Date());
  const jours = semaine.jours.filter(
    (j) =>
      j.planifiable &&
      (!absents.has(j.date) || j.date === visite?.date) &&
      (!apresApprobation || j.date >= aujourdhui),
  );
  const passage = visite?.passage
    ? semaine.passages.find((x) => x.id === visite.passage)
    : undefined;
  const unSeulReseau = semaine.reseaux.length === 1 ? (semaine.reseaux[0]?.id ?? null) : null;

  const [date, setDate] = useState(brouillon?.date ?? visite?.date ?? jour);
  const [prospect, setProspect] = useState<Choix | null>(
    brouillon
      ? brouillon.prospect
      : visite?.prospect
        ? {
            ...visite.prospect,
            detail: visite.prospect.specialite_libelle || visite.prospect.type_libelle,
          }
        : null,
  );
  const [lieu, setLieu] = useState<Lieu | null>(
    brouillon ? brouillon.lieu : (visite?.etablissement ?? null),
  );
  const [heure, setHeure] = useState(brouillon?.heure ?? visite?.heure ?? '');
  const [reseau, setReseau] = useState<string | null>(
    brouillon ? brouillon.reseau : (visite?.reseau?.id ?? unSeulReseau),
  );
  const [objectif, setObjectif] = useState(brouillon?.objectif ?? visite?.objectif ?? '');
  const [note, setNote] = useState(brouillon?.note ?? visite?.note ?? '');

  // PLN-007 CA1 : la saisie est gardée sur le téléphone à chaque changement ; si l'application
  // se ferme, rien n'est perdu.
  useEffect(() => {
    const minuterie = setTimeout(() => {
      void garderBrouillon({
        objet: 'visite',
        semaine: semaine.semaine,
        visite: visite?.id,
        champs: { date, heure, prospect, lieu, reseau, objectif, note },
      });
    }, 300);
    return () => clearTimeout(minuterie);
  }, [semaine.semaine, visite?.id, date, heure, prospect, lieu, reseau, objectif, note]);
  const [envoi, setEnvoi] = useState<'enregistrer' | 'retirer' | 'copier' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const heureLue = heure.trim() ? lireHeure(heure) : null;
  const heureIllisible = heure.trim() !== '' && heureLue === null;
  // Tout ce qui n'est pas l'heure fait une modification majeure, soumise au superviseur.
  const majeure =
    apresApprobation &&
    (!visite ||
      date !== visite.date ||
      (prospect?.id ?? null) !== (visite.prospect?.id ?? null) ||
      (lieu?.id ?? null) !== (visite.etablissement?.id ?? null) ||
      reseau !== (visite.reseau?.id ?? null) ||
      objectif.trim() !== visite.objectif ||
      note.trim() !== visite.note);
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
    // L'identifiant est tiré ici : renvoyée après une coupure, la visite n'est créée qu'une fois.
    const ajout = { ...saisie, id: nouvelIdentifiant() };
    // OFF-004 : la visite telle que le téléphone la connaît ; seuls les champs changés
    // s'écrivent, et un champ changé ailleurs entre-temps est un conflit (RG-053).
    const modification = visite ? { ...saisie, avant: avantDe(visite) } : null;
    try {
      if (visite && modification) await client.visites.modifier(visite.id, modification);
      else if (semaine.planning) await client.plannings.ajouterVisite(semaine.planning.id, ajout);
      await oublierBrouillon();
      surTermine(
        majeure
          ? t('apresApprobation.soumise')
          : apresApprobation
            ? t('apresApprobation.heureChangee')
            : visite
              ? t('visites.modifiee')
              : t('visites.ajoutee'),
      );
    } catch (e) {
      const conflit = conflitDe(e);
      if ((estTransitoire(e) || conflit) && semaine.planning) {
        // Sans réseau : la visite attend sur le téléphone et partira au retour du réseau.
        // En conflit : elle attend que le délégué choisisse entre les deux versions.
        const resume = [
          libelleJour({ date } as JourSemaine),
          prospect ? nomProspect(prospect, t) : '',
        ]
          .filter(Boolean)
          .join(' · ');
        await mettreEnAttente(
          visite && modification
            ? {
                id: nouvelIdentifiant(),
                type: 'modif_visite',
                visite: visite.id,
                saisie: modification,
                resume,
                ...(conflit ? { conflit, erreur: messageErreur(e, '') } : {}),
              }
            : {
                id: ajout.id,
                type: 'ajout_visite',
                planning: semaine.planning.id,
                saisie: ajout,
                resume,
              },
        );
        await oublierBrouillon();
        surTermine(t(conflit ? 'conflits.visiteGardee' : 'attente.gardee'));
        return;
      }
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setEnvoi(null);
    }
  }

  function annuler() {
    void oublierBrouillon();
    surAnnuler();
  }

  /** Copie de la visite, telle qu'enregistrée, sur un autre jour (PLN-005). */
  async function copier(j: JourSemaine) {
    if (!visite) return;
    setEnvoi('copier');
    setErreur(null);
    try {
      await client.visites.copier(visite.id, j.date);
      await oublierBrouillon();
      surTermine(t('visites.copiee', { jour: libelleJour(j) }));
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
      await oublierBrouillon();
      surTermine(apresApprobation ? t('apresApprobation.soumise') : t('visites.retiree'));
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setEnvoi(null);
    }
  }

  const tablette = useTablette();
  const detail = prospect?.detail.split(' · ')[0];

  const boutons = (
    <>
      <Bouton
        variante="contour"
        petit={tablette}
        libelle={t('commun.annuler')}
        onPress={annuler}
        style={tablette ? undefined : { flex: 1 }}
      />
      <Bouton
        petit={tablette}
        libelle={majeure ? t('apresApprobation.soumettre') : t('commun.enregistrer')}
        chargement={envoi === 'enregistrer'}
        desactive={heureIllisible || envoi === 'retirer'}
        onPress={() => void enregistrer()}
        style={tablette ? { minWidth: 140 } : { flex: 2 }}
      />
    </>
  );

  const optionsJours = jours.map((j) => ({ id: j.date, libelle: jourLong(j.date, i18n.language) }));
  const champJour = (
    <ListeDeroulante
      libelle={t('visites.champs.date')}
      valeur={date}
      options={
        optionsJours.some((o) => o.id === date)
          ? optionsJours
          : [{ id: date, libelle: jourLong(date, i18n.language) }, ...optionsJours]
      }
      surChoix={setDate}
    />
  );
  const champHeure = (
    <View style={{ flex: 1, minWidth: 0 }}>
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
    </View>
  );
  const champReseau =
    semaine.reseaux.length > 0 ? (
      <ListeDeroulante
        libelle={t('visites.champs.reseau')}
        valeur={reseau}
        indice={t('visites.sansReseau')}
        options={semaine.reseaux.map((r) => ({ id: r.id, libelle: r.libelle }))}
        surChoix={setReseau}
      />
    ) : null;
  const champProspect = (
    <View style={{ gap: 6 }}>
      <Texte variante="libelle">{t('visites.champs.prospect')}</Texte>
      {prospect ? (
        <ChoixFait
          libelle={[nomProspect(prospect, t), tablette ? detail : null].filter(Boolean).join(' · ')}
          gauche={<MarquePotentiel valeur={prospect.potentiel} />}
          droite={t('visites.changer')}
          surAppui={() => {
            setProspect(null);
            setLieu(null);
          }}
        />
      ) : (
        <ChoixProspect
          client={client}
          surChoix={(c) => {
            setProspect(c);
            setLieu(null);
          }}
        />
      )}
    </View>
  );
  const champLieu = prospect ? (
    <ChampLieu client={client} prospect={prospect.id} lieu={lieu} surChoix={setLieu} />
  ) : null;
  const champObjectif = (
    <Champ
      libelle={t('visites.champs.objectif')}
      placeholder={t('visites.indiceObjectif')}
      value={objectif}
      onChangeText={setObjectif}
      maxLength={200}
    />
  );
  const champNote = (
    <Champ
      libelle={t('visites.champs.note')}
      placeholder={t('visites.indiceNote')}
      value={note}
      onChangeText={setNote}
      maxLength={500}
      multiline
      style={{ minHeight: tablette ? 110 : 72 }}
    />
  );
  const avertissements = (
    <>
      {heureIllisible && <Texte variante="discret">{t('visites.heureIllisible')}</Texte>}
      {passage && !heureIllisible && (
        <Texte variante="discret">
          {t('passages.heureCommune', { count: passage.visites.length })}
        </Texte>
      )}
      {apresApprobation && visite && (
        <Alerte type={majeure ? 'attention' : 'info'}>
          {majeure ? t('apresApprobation.majeure') : t('apresApprobation.mineure')}
        </Alerte>
      )}
      {apresApprobation && !visite && (
        <Alerte type="attention">{t('apresApprobation.majeure')}</Alerte>
      )}
    </>
  );
  const autresActions = (
    <>
      {/* Après approbation, une copie serait un ajout soumis sans qu'on le voie venir. */}
      {visite && !apresApprobation && jours.length > 1 && (
        <Section titre={t('visites.copierVers')}>
          <Texte variante="discret">{t('visites.copierAide')}</Texte>
          <View style={styles.pilules}>
            {jours
              .filter((j) => j.date !== visite.date)
              .map((j) => (
                <Pilule
                  key={j.date}
                  libelle={libelleJour(j)}
                  actif={false}
                  onPress={() => void copier(j)}
                />
              ))}
          </View>
        </Section>
      )}
      {visite && (
        <Pressable
          accessibilityRole="button"
          disabled={envoi !== null}
          onPress={() => void retirer()}
          style={({ pressed }) => [styles.retirer, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.ajouterTexte, { color: p.erreur }]}>
            {envoi === 'retirer'
              ? t('session.chargement')
              : apresApprobation
                ? t('apresApprobation.retirerSoumettre')
                : t('visites.retirer')}
          </Text>
        </Pressable>
      )}
    </>
  );

  const titre = visite ? t('visites.modifier') : t('visites.nouvelle');
  const jourEntier = jourLong(date, i18n.language);

  if (tablette) {
    return (
      <Ecran
        titre={titre}
        fermer
        surRetour={annuler}
        onglets={false}
        enteteTablette={{
          surTitre: apresApprobation
            ? jourEntier
            : `${jourEntier} · ${t('visites.completerPlusTard')}`,
          action: <View style={styles.actionsEntete}>{boutons}</View>,
        }}
        droite={
          <JourDuFormulaire
            semaine={semaine}
            date={date}
            ecarte={visite?.id}
            nouvelle={
              prospect
                ? {
                    heure: heureLue,
                    potentiel: prospect.potentiel,
                    nom: `${nomProspect(prospect, t)} (${t(visite ? 'visites.modifiee_marque' : 'visites.nouvelle_marque')})`,
                  }
                : null
            }
          />
        }
        largeurDroite={380}
      >
        {erreur && <Alerte type="erreur">{erreur}</Alerte>}
        <View style={styles.deuxColonnes}>
          {champJour}
          {champHeure}
        </View>
        {champProspect}
        <View style={styles.deuxColonnes}>
          {champLieu ?? champReseau ?? <View style={{ flex: 1 }} />}
          {champLieu ? (champReseau ?? <View style={{ flex: 1 }} />) : <View style={{ flex: 1 }} />}
        </View>
        {champObjectif}
        {champNote}
        {avertissements}
        {autresActions}
      </Ecran>
    );
  }

  return (
    <Ecran
      titre={titre}
      surTitre={jourEntier}
      fermer
      surRetour={annuler}
      onglets={false}
      pied={boutons}
    >
      <Texte variante="libelle">
        {apresApprobation ? t('apresApprobation.regle') : t('visites.aide')}
      </Texte>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      {champJour}
      {champProspect}
      {champLieu}
      <View style={styles.deuxColonnes}>
        {champHeure}
        {champReseau}
      </View>
      {champObjectif}
      {champNote}
      {avertissements}
      {autresActions}
    </Ecran>
  );
}

/** Un choix déjà fait, dans un cadre de champ de 48 px : marque, nom, « Changer » à droite. */
export function ChoixFait({
  libelle,
  gauche,
  droite,
  surAppui,
}: {
  libelle: string;
  gauche?: ReactNode;
  droite?: string;
  surAppui: () => void;
}) {
  const p = usePalette();
  const lien = useLien();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={droite ? `${libelle}, ${droite}` : libelle}
      onPress={surAppui}
      style={({ pressed }) => [
        styles.choisiChamp,
        { backgroundColor: p.surface, borderColor: p.ligne },
        pressed && { opacity: 0.7 },
      ]}
    >
      {gauche}
      <Text numberOfLines={1} style={[styles.choisiTexte, { color: p.texte }]}>
        {libelle}
      </Text>
      {droite ? <Text style={[styles.changerTexte, { color: lien }]}>{droite}</Text> : null}
    </Pressable>
  );
}

/** Les lieux d'exercice actifs du prospect, le principal d'abord ; un seul est retenu d'office. */
function useLieux(
  client: ClientApi,
  prospect: string,
  lieu: Lieu | null,
  surChoix: (l: Lieu) => void,
) {
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
  // Le lieu déjà enregistré reste proposé, même s'il n'est plus un lieu d'exercice actif.
  return lieux && lieu && !lieux.some((l) => l.id === lieu.id) ? [lieu, ...lieux] : lieux;
}

/** Le lieu de la visite, présenté comme un champ ; « Changer » est la liste des lieux du prospect. */
function ChampLieu({
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
  const lieux = useLieux(client, prospect, lieu, surChoix);
  if (!lieux)
    return (
      <View style={{ flex: 1, gap: 6 }}>
        <Texte variante="libelle">{t('visites.champs.etablissement')}</Texte>
        <Texte variante="discret">{t('session.chargement')}</Texte>
      </View>
    );
  if (lieux.length === 0)
    return (
      <View style={{ flex: 1, gap: 6 }}>
        <Texte variante="libelle">{t('visites.champs.etablissement')}</Texte>
        <Texte variante="discret">{t('visites.sansLieu')}</Texte>
      </View>
    );
  return (
    <ListeDeroulante
      libelle={t('visites.champs.etablissement')}
      valeur={lieu?.id}
      indice={t('visites.lieuAChoisir')}
      options={lieux.map((l) => ({ id: l.id, libelle: l.nom }))}
      surChoix={(id) => {
        const l = lieux.find((x) => x.id === id);
        if (l) surChoix(l);
      }}
    />
  );
}

/**
 * Tablette, à droite : la journée de la visite — ses visites à leur heure, la nouvelle à sa place
 * (« --:-- » tant que l'heure n'est pas donnée), et ce que l'objectif du jour demande.
 */
function JourDuFormulaire({
  semaine,
  date,
  ecarte,
  nouvelle,
}: {
  semaine: Semaine;
  date: string;
  /** La visite en cours de modification : elle est remplacée par sa saisie. */
  ecarte?: string;
  nouvelle: { heure: string | null; potentiel: string; nom: string } | null;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const lignes = [
    ...semaine.visites
      .filter((v) => v.date === date && v.id !== ecarte)
      .map((v) => ({
        cle: v.id,
        heure: v.heure,
        potentiel: v.prospect?.potentiel ?? null,
        nom: v.prospect
          ? [
              v.prospect.civilite ? t(`prospect.civilites.${v.prospect.civilite}`) : '',
              v.prospect.nom,
            ]
              .filter(Boolean)
              .join(' ')
          : t('visites.sansProspect'),
        neuve: false,
      })),
    ...(nouvelle
      ? [
          {
            cle: 'nouvelle',
            heure: nouvelle.heure,
            potentiel: nouvelle.potentiel,
            nom: nouvelle.nom,
            neuve: true,
          },
        ]
      : []),
  ].sort((a, b) => (a.heure ?? '99:99').localeCompare(b.heure ?? '99:99'));
  const objectif = semaine.controles?.objectifs.find((o) => o.date === date);
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <Texte variante="sousTitre" accessibilityRole="header">
        {jourLong(date, i18n.language)}
      </Texte>
      <Texte variante="libelle">
        {[
          t('jour.visites', { count: lignes.length }),
          objectif ? t('jour.objectif', { min: objectif.min, max: objectif.max }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Texte>
      {lignes.length > 0 && (
        <Carte marge={0} style={{ overflow: 'hidden' }}>
          {lignes.map((l, i) => (
            <View
              key={l.cle}
              style={[styles.ligneJour, i > 0 && { borderTopWidth: 1, borderTopColor: p.ligne }]}
            >
              <Text style={[styles.heureJour, { color: p.texte }]}>{l.heure ?? '--:--'}</Text>
              {l.potentiel ? <MarquePotentiel valeur={l.potentiel} /> : null}
              <Text numberOfLines={1} style={[styles.nomJour, { color: p.texte }]}>
                {l.nom}
              </Text>
            </View>
          ))}
        </Carte>
      )}
      <Alerte type="info">{t('visites.placeeDansLaJournee')}</Alerte>
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
export function ChoixProspect({
  client,
  surChoix,
}: {
  client: ClientApi;
  surChoix: (c: Choix) => void;
}) {
  const { t, i18n } = useTranslation();
  const [cibles, setCibles] = useState<Choix[] | null>(null);
  const [saisie, setSaisie] = useState('');
  const [partout, setPartout] = useState<Choix[] | null>(null);
  const [recherche, setRecherche] = useState(false);
  // DC-61 : les prospects pour qui la dernière visite a proposé d'y revenir, gardés hors ligne.
  const [proposees, setProposees] = useState<{ choix: Choix; note: string }[]>([]);

  useEffect(() => {
    let actif = true;
    void Promise.resolve()
      .then(() => client.rapports.visitesProposees())
      .then(async (v) => {
        await ecrire(CLE_PROPOSEES, v).catch(() => undefined);
        return v;
      })
      .catch(
        async () => (await lire<VisiteProposee[]>(CLE_PROPOSEES).catch(() => null))?.valeur ?? [],
      )
      .then((v) => {
        if (!actif) return;
        const date = (iso: string) =>
          new Intl.DateTimeFormat(i18n.language, {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          }).format(new Date(`${iso}T12:00:00Z`));
        setProposees(
          v.map((x) => ({
            choix: {
              id: x.prospect.id,
              civilite: x.prospect.civilite,
              prenom: x.prospect.prenom,
              nom: x.prospect.nom,
              potentiel: x.prospect.potentiel,
              detail: x.prospect.specialite_libelle || x.prospect.type_libelle,
            },
            note: [t('visites.proposeeLe', { date: date(x.date) }), x.action]
              .filter(Boolean)
              .join(' · '),
          })),
        );
      });
    return () => {
      actif = false;
    };
  }, [client, i18n.language, t]);

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
          {partout === null && !filtre && proposees.length > 0 && (
            <>
              <Texte variante="discret">{t('visites.proposees')}</Texte>
              {proposees.map((x) => (
                <LigneChoix
                  key={`proposee-${x.choix.id}`}
                  choix={x.choix}
                  note={x.note}
                  onPress={() => surChoix(x.choix)}
                />
              ))}
            </>
          )}
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

export function LigneChoix({
  choix,
  onPress,
  choisi,
  note,
}: {
  choix: Choix;
  onPress: () => void;
  /** Case cochée (sélection multiple) ; absent : choix simple. */
  choisi?: boolean;
  /** Mention discrète sous le détail (« Déjà prévu mardi »). */
  note?: string;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const lien = useLien();
  const multiple = choisi !== undefined;
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'button'}
      accessibilityState={multiple ? { checked: choisi } : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choix,
        {
          borderColor: choisi ? lien : p.ligne,
          backgroundColor: pressed ? p.fond : p.surface,
        },
      ]}
    >
      {multiple && (
        <MaterialIcons
          name={choisi ? 'check-box' : 'check-box-outline-blank'}
          size={24}
          color={choisi ? lien : p.texteDiscret}
        />
      )}
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
        {note ? (
          <Text numberOfLines={1} style={[styles.manquants, { color: p.texteSecondaire }]}>
            {note}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Lieux d'exercice actifs du prospect, le principal d'abord ; un seul est retenu d'office. */
export function ChoixLieu({
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
  const proposes = useLieux(client, prospect, lieu, surChoix);
  if (!proposes) return <Texte variante="discret">{t('session.chargement')}</Texte>;
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
  // .li de la maquette : heure (40), potentiel, nom et lieu.
  visite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
  },
  retrait: { width: 14 },
  heure: {
    fontFamily: police.texteGras,
    fontSize: 12.5,
    lineHeight: 18,
    width: 40,
    fontVariant: ['tabular-nums'],
  },
  nom: { fontFamily: police.texteFort, fontSize: 15, lineHeight: 21 },
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
  deuxColonnes: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  actionsEntete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  choisiChamp: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: RAYON,
    paddingHorizontal: 14,
  },
  choisiTexte: { flex: 1, minWidth: 0, fontFamily: police.texteFort, fontSize: 15 },
  changerTexte: { fontFamily: police.texteFort, fontSize: 14 },
  ligneJour: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  heureJour: { width: 44, fontFamily: police.texteGras, fontSize: 13, lineHeight: 18 },
  nomJour: { flex: 1, minWidth: 0, fontFamily: police.texteFort, fontSize: 14 },
});
