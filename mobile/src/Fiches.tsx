/**
 * Fiches consultées par le délégué sur le terrain : tout ce qu'il cherche sur un prospect ou un
 * établissement, sur un seul écran, avec l'appel et l'itinéraire en un toucher.
 *
 * En ligne, la fiche vient du serveur (PRP-002, PRP-003) avec ses lieux d'exercice (PRP-004).
 * Sans réseau, le prospect de sa liste cible enregistrée sur le téléphone suffit à l'appeler et
 * à retrouver son lieu principal (PRP-011 CA2).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Etablissement, Exercice, Prospect, ProspectCible } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { dateVisite, useChronologie, VisitesPrecedentes } from './Chronologie';
import {
  Alerte,
  Bouton,
  Carte,
  Etiquette,
  Ligne,
  MarquePotentiel,
  Puce,
  Statut,
  Texte,
  usePalette,
} from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { cibleEnregistree, ciblesDe, useMaListe } from './MaListe';
import { police } from './polices';
import { ProposerCorrection } from './Proposition';
import { useSession } from './session';
import type { Annonce } from './Tournee';

type Traduire = (cle: string, options?: Record<string, unknown>) => string;

export function nomProspect(
  p: { civilite?: string; prenom?: string; nom: string },
  t: Traduire,
): string {
  return [p.civilite ? t(`prospect.civilites.${p.civilite}`) : '', p.prenom, p.nom]
    .filter(Boolean)
    .join(' ');
}

function itineraire(destination: string) {
  const adresse = encodeURIComponent(destination);
  return Platform.OS === 'ios'
    ? `https://maps.apple.com/?daddr=${adresse}`
    : `https://www.google.com/maps/dir/?api=1&destination=${adresse}`;
}

// ---------------------------------------------------------------------------------------------
// Annonces : la décision sur une fiche qui vient d'être créée (PRP-008), lue en tête de la fiche

const annonces = new Map<string, Annonce>();
const abonnes = new Set<() => void>();

function abonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

export function annoncerFiche(id: string, annonce: Annonce | null) {
  if (annonce) annonces.set(id, annonce);
  else annonces.delete(id);
  abonnes.forEach((f) => f());
}

function AnnonceFiche({ id }: { id: string }) {
  const annonce = useSyncExternalStore(abonner, () => annonces.get(id) ?? null);
  return annonce ? <Alerte type={annonce.ton}>{annonce.texte}</Alerte> : null;
}

/** Ligne touchable (.li) menant à une autre fiche : nom, puce « principal », détail, chevron. */
function Lien({
  titre,
  puce,
  detail,
  marque,
  onPress,
  derniere,
  droite,
}: {
  titre: string;
  puce?: string;
  detail?: string;
  marque?: React.ReactNode;
  onPress: () => void;
  derniere?: boolean;
  /** À droite, avant le chevron (« Dernière visite : 12 oct. »). */
  droite?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.lien,
        !derniere && { borderBottomWidth: 1, borderBottomColor: p.ligne },
        pressed && { backgroundColor: p.fond },
      ]}
    >
      {marque}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={styles.titreLien}>
          <Text style={[styles.nomLien, { color: p.texte }]}>{titre}</Text>
          {puce ? <Puce>{puce}</Puce> : null}
        </View>
        {detail ? <Text style={[styles.meta, { color: p.texteSecondaire }]}>{detail}</Text> : null}
      </View>
      {droite ? <Text style={[styles.droite, { color: p.texteSecondaire }]}>{droite}</Text> : null}
      <MaterialIcons name="chevron-right" size={20} color={p.texteDiscret} />
    </Pressable>
  );
}

/** Les initiales du prospect, dans un rond marine (.avatar.lg). */
function Avatar({ prenom, nom, grand }: { prenom?: string; nom: string; grand?: boolean }) {
  const p = usePalette();
  const initiales = [prenom, nom]
    .map((x) => (x ?? '').trim()[0] ?? '')
    .join('')
    .toLocaleUpperCase();
  const taille = grand ? 76 : 56;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.avatar,
        { width: taille, height: taille, borderRadius: taille / 2, backgroundColor: p.marine },
      ]}
    >
      <Text style={[styles.avatarTexte, { fontSize: grand ? 26 : 20 }]}>{initiales}</Text>
    </View>
  );
}

/** La fiche, en ligne ou, sans réseau, la cible de ma liste enregistrée sur le téléphone. */
function useFiche(id: string) {
  const { client } = useSession();
  const [fiche, setFiche] = useState<Prospect | null>(null);
  const [lieux, setLieux] = useState<Exercice[] | null>(null);
  const [cible, setCible] = useState<Awaited<ReturnType<typeof cibleEnregistree>>>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);

  useEffect(() => {
    let actif = true;
    // D'une fiche à l'autre (tablette), l'écran donne une clé nouvelle : l'état repart à vide.
    void cibleEnregistree(id).then((c) => actif && setCible(c));
    Promise.all([client.prospects.detail(id), client.exercices.duProspect(id)])
      .then(([f, e]) => {
        if (!actif) return;
        setFiche(f);
        setLieux(e.filter((x) => x.actif));
      })
      .catch(async () => {
        const c = await cibleEnregistree(id);
        if (!actif) return;
        if (c) setHorsLigne(true);
        else setIntrouvable(true);
      });
    return () => {
      actif = false;
    };
  }, [client, id]);

  // Hors ligne : la fiche de la liste enregistrée (nom, métier, lieu principal, téléphones).
  const base: ProspectCible | null = fiche
    ? { ...fiche, secteur: fiche.secteur?.libelle ?? null }
    : (cible?.prospect ?? null);
  return { fiche, lieux, cible, horsLigne, introuvable, base };
}

function StatutListe({ frequence }: { frequence?: number }) {
  const { t } = useTranslation();
  return frequence ? (
    <Statut ton="ok">{t('fiche.dansMaListe', { count: frequence })}</Statut>
  ) : (
    <Statut>{t('fiche.horsMaListe')}</Statut>
  );
}

/**
 * Fiche d'un prospect (PRP-002, PRP-004, RPT-011), selon la maquette 1.4.4 : qui il est, ma
 * liste, Appeler / Écrire / Itinéraire, ses informations, ses lieux d'exercice et l'historique
 * de mes visites. Sur la tablette, ma liste à gauche pour passer d'une fiche à l'autre.
 */
export function EcranFiche({ id }: { id: string }) {
  const { t } = useTranslation();
  const routeur = useRouter();
  const tablette = useTablette();
  const { listes } = useMaListe();
  const cibles = listes ? ciblesDe(listes) : [];
  const cible = cibles.find((c) => c.prospect.id === id);
  return (
    <Ecran
      titre={t('fiche.titreProspect')}
      retour
      enteteTablette={{ action: listes ? <StatutListe frequence={cible?.frequence} /> : null }}
      largeurGauche={340}
      gauche={
        tablette && cibles.length > 0 ? (
          <View accessibilityLabel={t('ciblage.mobile.segment')}>
            {cibles.map((c) => (
              <LigneLaterale
                key={c.prospect.id}
                cible={c}
                active={c.prospect.id === id}
                surAppui={() => routeur.replace(`/fiche/${c.prospect.id}`)}
              />
            ))}
          </View>
        ) : undefined
      }
    >
      <FicheProspect key={id} id={id} />
    </Ecran>
  );
}

function LigneLaterale({
  cible: c,
  active,
  surAppui,
}: {
  cible: ReturnType<typeof ciblesDe>[number];
  active: boolean;
  surAppui: () => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={surAppui}
      style={({ pressed }) => [
        styles.laterale,
        { borderBottomColor: p.ligne, borderLeftColor: active ? p.orange : 'transparent' },
        active && { backgroundColor: p.surface2 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <MarquePotentiel valeur={c.prospect.potentiel} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={[styles.nomLien, { color: p.texte }]}>
          {nomProspect(c.prospect, t)}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: p.texteSecondaire }]}>
          {c.prospect.specialite_libelle ?? c.prospect.type_libelle}
        </Text>
      </View>
    </Pressable>
  );
}

function Titre({ children }: { children: string }) {
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

export function FicheProspect({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const tablette = useTablette();
  const { client } = useSession();
  const { fiche, lieux, cible, horsLigne, introuvable, base } = useFiche(id);
  const chronologie = useChronologie(id);

  if (introuvable) return <Alerte type="erreur">{t('fiche.introuvable')}</Alerte>;
  if (!base) return <Texte variante="discret">{t('session.chargement')}</Texte>;

  const metier = [base.specialite_libelle ?? base.type_libelle, fiche?.grade_libelle]
    .filter(Boolean)
    .join(' · ');
  const ou = fiche?.localite?.libelle ?? base.secteur ?? '';
  const sousTitre = [metier, tablette && cible?.reseau ? cible.reseau : '', ou]
    .filter(Boolean)
    .join(' · ');
  const telephone = base.telephone_mobile || base.telephone_pro || '';
  const courriel = fiche?.courriel ?? '';
  const principal = lieux?.find((e) => e.principal) ?? lieux?.[0];
  const derniere = chronologie.rapports?.[0];

  async function allerAuLieu() {
    const lieu = principal?.etablissement;
    let destination = lieu
      ? [lieu.nom, lieu.localite ?? lieu.secteur].filter(Boolean).join(', ')
      : (base?.lieu_principal?.libelle ?? '');
    if (lieu?.a_coordonnees) {
      const detail = await client.etablissements.detail(lieu.id).catch(() => null);
      if (detail && detail.latitude !== null && detail.longitude !== null) {
        destination = `${detail.latitude},${detail.longitude}`;
      }
    }
    await Linking.openURL(itineraire(destination));
  }

  const actions = [
    {
      cle: 'appeler',
      icone: 'phone' as const,
      libelle: t('fiche.appeler'),
      lu: telephone ? `${t('fiche.appeler')} ${telephone}` : t('fiche.appeler'),
      desactive: !telephone,
      surAppui: () => void Linking.openURL(`tel:${telephone.replace(/\s/g, '')}`),
    },
    {
      cle: 'ecrire',
      icone: 'mail' as const,
      libelle: t('fiche.ecrireCourt'),
      // Un courriel s'il est connu, sinon un message au mobile.
      lu: courriel ? `${t('fiche.ecrire')} ${courriel}` : t('fiche.ecrireSms'),
      desactive: !courriel && !base.telephone_mobile,
      surAppui: () =>
        void Linking.openURL(
          courriel
            ? `mailto:${courriel}`
            : `sms:${(base.telephone_mobile ?? '').replace(/\s/g, '')}`,
        ),
    },
    {
      cle: 'itineraire',
      icone: 'navigation' as const,
      libelle: t('fiche.itineraire'),
      lu: t('fiche.itineraire'),
      desactive: !principal && !base.lieu_principal,
      surAppui: () => void allerAuLieu(),
    },
  ];

  const informations = (
    [
      [t('fiche.reseau'), cible?.reseau],
      [t('fiche.mobile'), base.telephone_mobile],
      [t('fiche.pro'), base.telephone_pro],
      [t('prospect.champs.courriel'), courriel],
      [
        t('fiche.frequence'),
        tablette && cible ? t('fiche.parCycle', { count: cible.frequence }) : '',
      ],
      [t('fiche.derniereVisite'), derniere ? dateVisite(derniere.date, i18n.language) : ''],
      [t('prospect.champs.numeroOrdre'), fiche?.numero_ordre],
      [t('lieu.exercice'), fiche?.activite ? t(`lieu.exercices.${fiche.activite}`) : ''],
      [t('etablissement.champs.secteur'), fiche?.secteur?.libelle],
    ] as [string, string | null | undefined][]
  ).filter((x): x is [string, string] => Boolean(x[1]));

  const boutons = actions.map((a, i) => (
    <Bouton
      key={a.cle}
      petit
      variante={tablette && i === actions.length - 1 ? 'plein' : 'contour'}
      icone={a.icone}
      libelle={a.libelle}
      accessibilityLabel={a.lu}
      desactive={a.desactive}
      onPress={a.surAppui}
      style={tablette ? { paddingHorizontal: 14 } : { flex: 1, paddingHorizontal: 0 }}
    />
  ));

  const entete = (
    <Carte style={tablette ? styles.enteteTablette : styles.entete}>
      <View style={styles.identite}>
        <Avatar prenom={base.prenom} nom={base.nom} grand={tablette} />
        <View style={{ flex: 1, minWidth: tablette ? 150 : 0, gap: 2 }}>
          <Text
            accessibilityRole="header"
            style={[tablette ? styles.nomTablette : styles.nom, { color: p.texte }]}
          >
            {nomProspect(base, t)}
          </Text>
          {sousTitre ? (
            <Text style={[styles.meta, tablette && { fontSize: 14 }, { color: p.texteSecondaire }]}>
              {sousTitre}
            </Text>
          ) : null}
          {!tablette && (
            <View style={{ marginTop: 4, flexDirection: 'row' }}>
              <StatutListe frequence={cible?.frequence} />
            </View>
          )}
          {base.statut === 'a_valider' && (
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <Etiquette>{t('prospect.statuts.a_valider')}</Etiquette>
            </View>
          )}
        </View>
        <MarquePotentiel
          valeur={base.potentiel}
          libelle={t(`prospect.potentiels.${base.potentiel}`)}
          taille={tablette ? 32 : 24}
        />
        {tablette && <View style={styles.actionsTablette}>{boutons}</View>}
      </View>
      {!tablette && <View style={styles.actions}>{boutons}</View>}
    </Carte>
  );

  const infos =
    informations.length > 0 ? (
      <Carte marge={0} style={tablette ? { flex: 1 } : undefined}>
        <Titre>{t('fiche.informations')}</Titre>
        {informations.map(([libelle, valeur], k) => (
          <Ligne
            key={libelle}
            libelle={libelle}
            valeur={valeur}
            derniere={k === informations.length - 1}
          />
        ))}
      </Carte>
    ) : null;

  const lieuxVue = (
    <Carte marge={0} style={tablette ? { flex: 1 } : undefined}>
      <Titre>{t('fiche.lieux')}</Titre>
      {lieux === null ? (
        base.lieu_principal ? (
          <Lien
            titre={base.lieu_principal.libelle}
            puce={t('fiche.principal')}
            derniere
            onPress={() => routeur.push(`/lieu/${base.lieu_principal!.id}`)}
          />
        ) : (
          <Texte variante="discret" style={styles.vide}>
            {t('fiche.aucunLieu')}
          </Texte>
        )
      ) : lieux.length === 0 ? (
        <Texte variante="discret" style={styles.vide}>
          {t('fiche.aucunLieu')}
        </Texte>
      ) : (
        lieux.map((e, i) => (
          <Lien
            key={e.id}
            derniere={i === lieux.length - 1}
            titre={e.etablissement.nom}
            puce={e.principal ? t('fiche.principal') : undefined}
            detail={[
              e.etablissement.type_libelle,
              e.etablissement.localite ?? e.etablissement.secteur,
              e.presence ?? '',
            ]
              .filter(Boolean)
              .join(' · ')}
            onPress={() => routeur.push(`/lieu/${e.etablissement.id}`)}
          />
        ))
      )}
    </Carte>
  );

  return (
    <>
      <AnnonceFiche id={id} />
      {horsLigne && <Alerte type="attention">{t('fiche.horsLigne')}</Alerte>}
      {entete}
      {tablette ? (
        <View style={styles.grille}>
          {infos ?? <View style={{ flex: 1 }} />}
          {lieuxVue}
        </View>
      ) : (
        <>
          {infos}
          {lieuxVue}
        </>
      )}
      <VisitesPrecedentes prospect={id} chronologie={chronologie} />
      {fiche?.statut === 'actif' && (
        <ProposerCorrection
          objet="prospect"
          id={fiche.id}
          nom={nomProspect(fiche, t)}
          actuels={{
            telephone_mobile: fiche.telephone_mobile,
            telephone_pro: fiche.telephone_pro,
            courriel: fiche.courriel,
            numero_ordre: fiche.numero_ordre,
          }}
        />
      )}
    </>
  );
}

/** Fiche d'un établissement (PRP-003), écran entier selon la maquette 1.4.5. */
export function EcranLieu({ id }: { id: string }) {
  const { t } = useTranslation();
  return (
    <Ecran titre={t('fiche.titreEtablissement')} retour>
      <FicheEtablissement id={id} />
    </Ecran>
  );
}

/**
 * Où aller, qui appeler, qui y exerce : le nom, l'adresse et la position de référence, Appeler
 * et Itinéraire, puis les prospects du lieu (sur la tablette, ma dernière visite chez chacun).
 */
export function FicheEtablissement({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const tablette = useTablette();
  const { client } = useSession();
  const [fiche, setFiche] = useState<Etablissement | null>(null);
  const [exercent, setExercent] = useState<Exercice[] | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let actif = true;
    Promise.all([client.etablissements.detail(id), client.exercices.deLEtablissement(id)])
      .then(([e, x]) => {
        if (!actif) return;
        setFiche(e);
        setExercent(x.filter((y) => y.actif));
      })
      .catch(() => actif && setErreur(true));
    return () => {
      actif = false;
    };
  }, [client, id]);

  if (erreur) return <Alerte type="attention">{t('fiche.lieuHorsLigne')}</Alerte>;
  if (!fiche) return <Texte variante="discret">{t('session.chargement')}</Texte>;

  const adresse = [fiche.adresse, fiche.localite?.libelle].filter(Boolean).join(', ');
  const sousTitre = [
    fiche.type_libelle,
    adresse,
    tablette || !adresse ? t('fiche.secteur', { secteur: fiche.secteur.libelle }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const gps = fiche.latitude !== null && fiche.longitude !== null;
  const destination = gps
    ? `${fiche.latitude},${fiche.longitude}`
    : [fiche.nom, adresse, fiche.secteur.libelle].filter(Boolean).join(', ');
  const position = gps ? (
    <Statut ton="ok">{t('fiche.positionReference')}</Statut>
  ) : (
    <Statut ton="wa">{t('fiche.sansPosition')}</Statut>
  );
  const boutons = [
    <Bouton
      key="appeler"
      petit
      variante="contour"
      icone="phone"
      libelle={t('fiche.appeler')}
      accessibilityLabel={
        fiche.telephone ? `${t('fiche.appeler')} ${fiche.telephone}` : t('fiche.appeler')
      }
      desactive={!fiche.telephone}
      onPress={() => void Linking.openURL(`tel:${(fiche.telephone ?? '').replace(/\s/g, '')}`)}
      style={tablette ? { paddingHorizontal: 14 } : { flex: 1, paddingHorizontal: 0 }}
    />,
    <Bouton
      key="itineraire"
      petit
      variante={tablette ? 'plein' : 'contour'}
      icone="navigation"
      libelle={t('fiche.itineraire')}
      onPress={() => void Linking.openURL(itineraire(destination))}
      style={tablette ? { paddingHorizontal: 14 } : { flex: 1, paddingHorizontal: 0 }}
    />,
  ];
  const derniere = (iso?: string | null) =>
    iso
      ? t('fiche.derniereVisiteLe', {
          date: new Intl.DateTimeFormat(i18n.language, {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          }).format(new Date(`${iso}T12:00:00Z`)),
        })
      : undefined;

  return (
    <>
      <AnnonceFiche id={id} />
      <Carte style={tablette ? styles.enteteLieuTablette : styles.entete}>
        <View style={tablette ? styles.identite : { gap: 2 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text
              accessibilityRole="header"
              style={[tablette ? styles.nomTablette : styles.nom, { color: p.texte }]}
            >
              {fiche.nom}
            </Text>
            <Text style={[styles.meta, tablette && { fontSize: 14 }, { color: p.texteSecondaire }]}>
              {sousTitre}
            </Text>
            {!tablette && <View style={{ marginTop: 6, flexDirection: 'row' }}>{position}</View>}
            {fiche.statut === 'a_valider' && (
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                <Etiquette>{t('prospect.statuts.a_valider')}</Etiquette>
              </View>
            )}
          </View>
          {tablette && (
            <>
              {position}
              <View style={styles.actionsTablette}>{boutons}</View>
            </>
          )}
        </View>
        {!tablette && <View style={styles.actions}>{boutons}</View>}
      </Carte>

      <Carte marge={0}>
        <Titre>{t('fiche.quiExerceIci')}</Titre>
        {exercent === null || exercent.length === 0 ? (
          <Texte variante="discret" style={styles.vide}>
            {t('fiche.personne')}
          </Texte>
        ) : (
          exercent.map((x, i) => (
            <Lien
              key={x.id}
              derniere={i === exercent.length - 1}
              marque={
                <MarquePotentiel
                  valeur={x.prospect.potentiel}
                  libelle={t(`prospect.potentiels.${x.prospect.potentiel}`)}
                />
              }
              titre={nomProspect(x.prospect, t)}
              detail={[
                x.prospect.specialite_libelle,
                x.principal ? t('fiche.principal') : '',
                x.presence ?? '',
              ]
                .filter(Boolean)
                .join(' · ')}
              droite={tablette ? derniere(x.derniere_visite) : undefined}
              onPress={() => routeur.push(`/fiche/${x.prospect.id}`)}
            />
          ))
        )}
      </Carte>

      {fiche.statut === 'actif' && (
        <ProposerCorrection
          objet="etablissement"
          id={fiche.id}
          nom={fiche.nom}
          actuels={{ adresse: fiche.adresse, telephone: fiche.telephone }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  entete: { gap: 16 },
  enteteTablette: { padding: 24 },
  enteteLieuTablette: { padding: 24 },
  droite: { fontFamily: police.texteMoyen, fontSize: 13 },
  identite: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  actions: { flexDirection: 'row', gap: 8 },
  actionsTablette: { flexDirection: 'row', gap: 10, marginLeft: 6 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarTexte: { color: '#FFFFFF', fontFamily: police.titreFort },
  nom: { fontFamily: police.titreFort, fontSize: 21, lineHeight: 27, letterSpacing: -0.2 },
  nomTablette: { fontFamily: police.titreFort, fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  meta: { fontFamily: police.texte, fontSize: 13, lineHeight: 18 },
  grille: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  vide: { paddingHorizontal: 16, paddingVertical: 12 },
  titreLien: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  nomLien: { fontFamily: police.texteGras, fontSize: 15.5, lineHeight: 21 },
  laterale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
  },
  ficheLieu: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lien: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
});
