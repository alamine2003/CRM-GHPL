/**
 * Historique des versions d'un planning (PLN-014, RG-037), selon la maquette 1.4.3 : chaque
 * version soumise, sa décision et ce qui a changé depuis la précédente (CA1). Au téléphone, la
 * plus récente est dépliée et les autres se déplient d'un geste ; sur la tablette, la liste à
 * gauche et la version choisie à droite. Toutes restent consultables (CA2).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { DetailVersion, VersionPlanning, VisiteFigee } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alerte, Carte, Statut, type TonStatut, Texte, usePalette } from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { police } from './polices';
import { periodeDe } from './Semaine';
import { messageErreur, useSession } from './session';

type Traduire = ReturnType<typeof useTranslation>['t'];

export function resumeChangements(c: VersionPlanning['changements'], t: Traduire) {
  if (!c) return t('versions.premiere');
  const parties = (['ajoutees', 'retirees', 'deplacees', 'modifiees'] as const)
    .filter((k) => c[k] > 0)
    .map((k) => t(`versions.compte.${k}`, { count: c[k] }));
  return parties.length ? parties.join(' · ') : t('versions.aucunChangement');
}

/** Une date dans le fuseau du pays ; à défaut, celui du téléphone. */
function quand(iso: string, langue: string, fuseau: string | undefined, options: object) {
  try {
    return new Intl.DateTimeFormat(langue, { ...options, timeZone: fuseau }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat(langue, options).format(new Date(iso));
  }
}

const JOUR = { weekday: 'long', day: 'numeric', month: 'long' } as const;
const JOUR_COURT = { weekday: 'short', day: 'numeric', month: 'long' } as const;
const HEURE = { hour: '2-digit', minute: '2-digit' } as const;

function tonDecision(v: VersionPlanning): TonStatut {
  if (v.decision === 'approuve') return 'ok';
  if (v.decision === 'a_reviser') return 'er';
  return 'wa';
}

function StatutVersion({ version }: { version: VersionPlanning }) {
  const { t } = useTranslation();
  return (
    <Statut ton={tonDecision(version)}>
      {t(`versions.decisions.${version.decision ?? 'aucune'}`)}
    </Statut>
  );
}

/** « Après révision · 2 ajoutées · 1 retirée » ; la modification après approbation se lit au détail. */
function resume(v: VersionPlanning, t: Traduire) {
  return [
    v.motif === 'revision' ? t('versions.motifs.revision') : '',
    resumeChangements(v.changements, t),
  ]
    .filter(Boolean)
    .join(' · ');
}

function suffixeMode(v: VersionPlanning, t: Traduire) {
  if (v.mode === 'remplacement') return ` · ${t('versions.enRemplacement')}`;
  if (v.mode === 'escalade') return ` · ${t('escalade.parEscalade')}`;
  return '';
}

/** Le détail d'une version, chargé à la demande et gardé le temps de l'écran. */
function useDetails(planning: string) {
  const { client } = useSession();
  const [details, setDetails] = useState<Record<number, DetailVersion>>({});
  const charger = (numero: number) => {
    if (details[numero]) return;
    client.plannings
      .version(planning, numero)
      .then((d) => setDetails((x) => ({ ...x, [numero]: d })))
      .catch(() => undefined);
  };
  return { details, charger };
}

export function VueVersions({
  planning,
  fuseau,
  semaine,
  nombre,
}: {
  planning: string;
  fuseau?: string;
  /** Lundi de la semaine, pour le sous-titre. */
  semaine?: string;
  /** Nombre de versions connu de la semaine, pour le titre avant le chargement. */
  nombre?: number;
}) {
  const { t, i18n } = useTranslation();
  const tablette = useTablette();
  const { client } = useSession();
  const [versions, setVersions] = useState<VersionPlanning[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisie, setChoisie] = useState<number | null>(null);
  const { details, charger } = useDetails(planning);

  useEffect(() => {
    let actif = true;
    client.plannings
      .versions(planning)
      .then((v) => {
        if (!actif) return;
        const triees = [...v].sort((a, b) => b.numero - a.numero);
        setVersions(triees);
        // La plus récente s'ouvre d'elle-même : c'est celle que l'on vient voir.
        if (triees[0]) setChoisie(triees[0].numero);
      })
      .catch((e) => actif && setErreur(messageErreur(e, t('erreurs.reseau'))));
    return () => {
      actif = false;
    };
  }, [client, planning, t]);

  useEffect(() => {
    if (choisie !== null) charger(choisie);
    // charger ne change qu'avec le cache ; seul le choix déclenche le chargement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choisie]);

  const periode = semaine ? periodeDe({ semaine }, t, i18n.language, true) : undefined;
  const titre = t('versions.titre', { count: versions?.length ?? nombre ?? 2 });
  const version = versions?.find((v) => v.numero === choisie);
  // La dernière version approuvée avant celle-ci : celle que le délégué suit en attendant.
  const suivie = version
    ? versions?.find((v) => v.numero < version.numero && v.decision === 'approuve')
    : undefined;

  let contenu;
  if (erreur) contenu = <Alerte type="erreur">{erreur}</Alerte>;
  else if (!versions) contenu = <Texte variante="discret">{t('session.chargement')}</Texte>;
  else if (tablette)
    contenu = version ? (
      <DetailTablette
        version={version}
        detail={details[version.numero]}
        suivie={suivie?.numero}
        fuseau={fuseau}
      />
    ) : null;
  else
    contenu = versions.map((v) => (
      <CarteVersion
        key={v.numero}
        version={v}
        ouverte={choisie === v.numero}
        detail={details[v.numero]}
        fuseau={fuseau}
        surAppui={() => setChoisie(choisie === v.numero ? null : v.numero)}
      />
    ));

  return (
    <Ecran
      titre={titre}
      surTitre={periode}
      retour
      onglets={false}
      enteteTablette={{
        surTitre: [periode, t('versions.figee')].filter(Boolean).join(' · '),
      }}
      largeurGauche={400}
      gauche={
        tablette && versions ? (
          <ListeTablette
            versions={versions}
            choisie={choisie}
            fuseau={fuseau}
            surChoix={setChoisie}
          />
        ) : undefined
      }
    >
      {contenu}
    </Ecran>
  );
}

/** Téléphone : une carte par version ; dépliée, ce qui a changé et la décision. */
function CarteVersion({
  version: v,
  ouverte,
  detail,
  fuseau,
  surAppui,
}: {
  version: VersionPlanning;
  ouverte: boolean;
  detail?: DetailVersion;
  fuseau?: string;
  surAppui: () => void;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const langue = i18n.language;
  // Décidée, le jour suffit ; en attente, l'heure dit si elle est partie à temps.
  const soumise = v.decide_le
    ? t('versions.soumise', { date: quand(v.soumis_le, langue, fuseau, JOUR) })
    : t('versions.soumiseHeure', {
        date: quand(v.soumis_le, langue, fuseau, JOUR),
        heure: quand(v.soumis_le, langue, fuseau, HEURE),
      });
  const decidee =
    v.decision && v.decide_le
      ? `${t(`versions.decideeCourt.${v.decision}`, {
          date: quand(v.decide_le, langue, fuseau, JOUR),
          par: v.par ?? '',
        })}${suffixeMode(v, t)}`
      : '';
  return (
    <Carte marge={0}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: ouverte }}
        onPress={surAppui}
        style={({ pressed }) => [styles.entete, pressed && { opacity: 0.7 }]}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={styles.titre}>
            <Text style={[styles.nom, { color: p.texte }]}>
              {t('versions.ligne', { numero: v.numero })}
            </Text>
            <StatutVersion version={v} />
          </View>
          <Text numberOfLines={1} style={[styles.meta, { color: p.texteSecondaire }]}>
            {[soumise, decidee].filter(Boolean).join(' · ')}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: p.texteSecondaire }]}>
            {resume(v, t)}
          </Text>
        </View>
        <MaterialIcons
          name={ouverte ? 'expand-more' : 'chevron-right'}
          size={22}
          color={p.texteDiscret}
        />
      </Pressable>
      {ouverte && (
        <View style={[styles.deplie, { borderTopColor: p.ligne }]}>
          <Decision version={v} />
          {v.changements && <Changements detail={detail} />}
          {v.motif === 'modification' && (
            <Texte variante="libelle">{t('versions.motifs.modification')}</Texte>
          )}
        </View>
      )}
    </Carte>
  );
}

/** Le commentaire du superviseur et ses remarques (PLN-014 CA2). */
function Decision({ version }: { version: VersionPlanning }) {
  const { t } = useTranslation();
  if (!version.commentaire && version.remarques.length === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      {version.commentaire ? <Texte>{version.commentaire}</Texte> : null}
      {version.remarques.length > 0 && (
        <Texte variante="libelle">
          {t('versions.remarques', { count: version.remarques.length })}
        </Texte>
      )}
    </View>
  );
}

/** « mar. 13 » : le jour court d'une visite. */
function jourCourt(date: string, langue: string) {
  return new Intl.DateTimeFormat(langue, { weekday: 'short', day: 'numeric' }).format(
    new Date(`${date}T12:00:00`),
  );
}

interface Section {
  cle: 'ajoutees' | 'retirees' | 'deplacees' | 'modifiees';
  titre: string;
  couleur: string;
  lignes: { cle: string; quand: string; qui: string; detail?: string }[];
}

/** Les visites ajoutées, retirées, déplacées et modifiées depuis la version précédente. */
function useSections(detail?: DetailVersion): Section[] {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const c = detail?.comparaison;
  if (!c) return [];
  const langue = i18n.language;
  const qui = (v: VisiteFigee) =>
    v.prospect?.nom ?? v.etablissement?.nom ?? t('visites.sansProspect');
  const moment = (v: { date: string; heure: string | null }) =>
    [jourCourt(v.date, langue), v.heure].filter(Boolean).join(' · ');
  const sections: Section[] = [
    {
      cle: 'ajoutees',
      titre: t('versions.sections.ajoutees', { count: c.ajoutees.length }),
      couleur: p.succes,
      lignes: c.ajoutees.map((v) => ({ cle: v.id, quand: moment(v), qui: qui(v) })),
    },
    {
      cle: 'retirees',
      titre: t('versions.sections.retirees', { count: c.retirees.length }),
      couleur: p.erreur,
      lignes: c.retirees.map((v) => ({ cle: v.id, quand: moment(v), qui: qui(v) })),
    },
    {
      cle: 'deplacees',
      titre: t('versions.sections.deplacees', { count: c.deplacees.length }),
      couleur: p.info,
      lignes: c.deplacees.map((d) => {
        const memeJour = d.avant.date === d.visite.date;
        return {
          cle: d.visite.id,
          // Le même jour, seule l'heure bouge : « mer. 14 · 11:30 → 14:30 ».
          quand: memeJour ? jourCourt(d.visite.date, langue) : moment(d.avant),
          qui: qui(d.visite),
          detail: memeJour
            ? `${d.avant.heure ?? '—'} → ${d.visite.heure ?? '—'}`
            : `→ ${moment(d.visite)}`,
        };
      }),
    },
    {
      cle: 'modifiees',
      titre: t('versions.sections.modifiees', { count: c.modifiees.length }),
      couleur: p.texteSecondaire,
      lignes: c.modifiees.map((m) => ({
        cle: m.visite.id,
        quand: moment(m.visite),
        qui: qui(m.visite),
        detail: m.champs.map((x) => t(`versions.champs.${x}`)).join(', '),
      })),
    },
  ];
  return sections.filter((s) => s.lignes.length > 0);
}

function Changements({ detail }: { detail?: DetailVersion }) {
  const { t } = useTranslation();
  const p = usePalette();
  const sections = useSections(detail);
  if (!detail) return <Texte variante="discret">{t('session.chargement')}</Texte>;
  if (sections.length === 0)
    return <Texte variante="discret">{t('versions.aucunChangement')}</Texte>;
  return (
    <>
      {sections.map((s) => (
        <View key={s.cle} style={{ gap: 10 }}>
          <Text style={[styles.section, { color: s.couleur }]}>{s.titre}</Text>
          {s.lignes.map((l) => (
            <Text key={l.cle} style={[styles.changement, { color: p.texte }]}>
              {[l.quand, l.detail, l.qui].filter(Boolean).join(' · ')}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}

/** Tablette : la liste des versions, la choisie marquée d'un filet orange. */
function ListeTablette({
  versions,
  choisie,
  fuseau,
  surChoix,
}: {
  versions: VersionPlanning[];
  choisie: number | null;
  fuseau?: string;
  surChoix: (numero: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const langue = i18n.language;
  return (
    <View>
      {versions.map((v) => {
        const active = v.numero === choisie;
        const ligne1 =
          v.decision && v.decide_le
            ? `${t(`versions.decidee.${v.decision}`, {
                date: quand(v.decide_le, langue, fuseau, JOUR_COURT),
                par: v.par ?? '',
              })}${suffixeMode(v, t)}`
            : t('versions.soumiseCourte', {
                date: quand(v.soumis_le, langue, fuseau, JOUR_COURT),
                heure: quand(v.soumis_le, langue, fuseau, HEURE),
              });
        return (
          <Pressable
            key={v.numero}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => surChoix(v.numero)}
            style={({ pressed }) => [
              styles.rangee,
              { borderBottomColor: p.ligne, borderLeftColor: active ? p.orange : 'transparent' },
              active && { backgroundColor: p.surface2 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[styles.nom, { color: p.texte }]}>
                {t('versions.ligne', { numero: v.numero })}
              </Text>
              <Text style={[styles.meta, { color: p.texteSecondaire }]}>{ligne1}</Text>
              <Text style={[styles.meta, { color: p.texteSecondaire }]}>{resume(v, t)}</Text>
            </View>
            <StatutVersion version={v} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tablette : la version choisie, ses changements en cartes côte à côte. */
function DetailTablette({
  version: v,
  detail,
  suivie,
  fuseau,
}: {
  version: VersionPlanning;
  detail?: DetailVersion;
  suivie?: number;
  fuseau?: string;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const sections = useSections(detail);
  const langue = i18n.language;
  const contexte = [
    t('versions.soumiseHeure', {
      date: quand(v.soumis_le, langue, fuseau, JOUR),
      heure: quand(v.soumis_le, langue, fuseau, HEURE),
    }),
    v.motif !== 'soumission' ? t(`versions.motifs.${v.motif}`).toLocaleLowerCase(langue) : '',
    v.decision && v.decide_le
      ? `${t(`versions.decideeCourt.${v.decision}`, {
          date: quand(v.decide_le, langue, fuseau, JOUR),
          par: v.par ?? '',
        })}${suffixeMode(v, t)}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <Carte style={styles.carteTitre}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text accessibilityRole="header" style={[styles.grandTitre, { color: p.texte }]}>
            {t('versions.ligne', { numero: v.numero })}
          </Text>
          <Texte variante="libelle">{contexte}</Texte>
        </View>
        <StatutVersion version={v} />
      </Carte>
      {(v.commentaire || v.remarques.length > 0) && (
        <Carte>
          <Decision version={v} />
        </Carte>
      )}
      {v.changements ? (
        !detail ? (
          <Texte variante="discret">{t('session.chargement')}</Texte>
        ) : sections.length === 0 ? (
          <Texte variante="discret">{t('versions.aucunChangement')}</Texte>
        ) : (
          <View style={styles.grille}>
            {sections.map((s) => (
              <Carte key={s.cle} marge={0} style={styles.case}>
                <Text style={[styles.section, styles.sectionTablette, { color: s.couleur }]}>
                  {s.titre}
                </Text>
                {s.lignes.map((l) => (
                  <View key={l.cle} style={styles.ligneTablette}>
                    <Text style={[styles.quand, { color: p.texte }]}>{l.quand}</Text>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={[styles.qui, { color: p.texte }]}>{l.qui}</Text>
                      {l.detail ? (
                        <Text style={[styles.meta, { color: p.texteSecondaire }]}>{l.detail}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Carte>
            ))}
          </View>
        )
      ) : (
        <Texte variante="discret">{t('versions.premiere')}</Texte>
      )}
      {!v.decision && (
        <Alerte type="info">
          {suivie ? t('versions.enAttenteSuivie', { numero: suivie }) : t('versions.enAttente')}
        </Alerte>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  entete: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  titre: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nom: { fontFamily: police.texteGras, fontSize: 15.5, lineHeight: 21 },
  meta: { fontFamily: police.texte, fontSize: 13, lineHeight: 18 },
  deplie: {
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  section: { fontFamily: police.texteGras, fontSize: 13, lineHeight: 18 },
  changement: { fontFamily: police.texte, fontSize: 14, lineHeight: 20 },
  rangee: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
  },
  carteTitre: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 },
  grandTitre: { fontFamily: police.titreFort, fontSize: 22, lineHeight: 28 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  case: { flexBasis: 280, flexGrow: 1, paddingBottom: 6 },
  sectionTablette: { fontSize: 15, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 6 },
  ligneTablette: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  quand: { width: 92, fontFamily: police.texteFort, fontSize: 12.5, lineHeight: 18 },
  qui: { fontFamily: police.texteGras, fontSize: 14, lineHeight: 19 },
});
