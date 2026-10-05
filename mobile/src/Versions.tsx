/**
 * Historique des versions d'un planning au téléphone (PLN-014, RG-037) : chaque version
 * soumise, sa décision et ce qui a changé depuis la précédente ; toucher une version montre
 * la comparaison détaillée (CA1). Toutes restent consultables (CA2).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { DetailVersion, VersionPlanning, VisiteFigee } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alerte, Carte, Etiquette, Texte, usePalette } from './composants';
import { police } from './polices';
import { messageErreur, useSession } from './session';
import { dateHeure } from './Soumission';

type Traduire = ReturnType<typeof useTranslation>['t'];

export function resumeChangements(c: VersionPlanning['changements'], t: Traduire) {
  if (!c) return t('versions.premiere');
  const parties = (['ajoutees', 'retirees', 'deplacees', 'modifiees'] as const)
    .filter((k) => c[k] > 0)
    .map((k) => t(`versions.compte.${k}`, { count: c[k] }));
  return parties.length ? parties.join(' · ') : t('versions.aucunChangement');
}

export function VueVersions({ planning, fuseau }: { planning: string; fuseau?: string }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { client } = useSession();
  const [versions, setVersions] = useState<VersionPlanning[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<number | null>(null);

  useEffect(() => {
    let actif = true;
    client.plannings
      .versions(planning)
      .then((v) => actif && setVersions(v))
      .catch((e) => actif && setErreur(messageErreur(e, t('erreurs.reseau'))));
    return () => {
      actif = false;
    };
  }, [client, planning, t]);

  if (erreur) return <Alerte type="erreur">{erreur}</Alerte>;
  if (!versions) return <Texte variante="discret">{t('session.chargement')}</Texte>;
  return (
    <View style={{ gap: 12 }}>
      {versions.map((v) => (
        <Carte key={v.numero} style={{ gap: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: ouverte === v.numero }}
            onPress={() => setOuverte(ouverte === v.numero ? null : v.numero)}
            style={styles.entete}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.titre}>
                <Texte variante="sousTitre">{t('versions.ligne', { numero: v.numero })}</Texte>
                <Etiquette ton={v.decision === 'a_reviser' ? 'attention' : 'neutre'}>
                  {t(`versions.decisions.${v.decision ?? 'aucune'}`)}
                </Etiquette>
              </View>
              <Texte variante="discret">
                {t('versions.soumise', { date: dateHeure(v.soumis_le, i18n.language, fuseau) })}
              </Texte>
              <Texte variante="discret">
                {[
                  v.motif !== 'soumission' ? t(`versions.motifs.${v.motif}`) : '',
                  resumeChangements(v.changements, t),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Texte>
            </View>
            <MaterialIcons
              name={ouverte === v.numero ? 'expand-less' : 'expand-more'}
              size={24}
              color={p.texteDiscret}
            />
          </Pressable>
          {ouverte === v.numero && (
            <>
              <Decision version={v} fuseau={fuseau} />
              <Comparaison planning={planning} numero={v.numero} />
            </>
          )}
        </Carte>
      ))}
    </View>
  );
}

/** PLN-014 CA2 : qui a décidé la version, quand, et son commentaire. */
function Decision({ version, fuseau }: { version: VersionPlanning; fuseau?: string }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  if (!version.decision || !version.decide_le) return null;
  const mode = version.mode === 'remplacement' ? ` · ${t('versions.enRemplacement')}` : '';
  return (
    <View style={[styles.detail, { borderTopColor: p.ligne }]}>
      <Texte variante="discret">
        {t(`versions.decidee.${version.decision}`, {
          date: dateHeure(version.decide_le, i18n.language, fuseau),
          par: version.par ?? '',
        })}
        {mode}
      </Texte>
      {version.commentaire ? <Texte>{version.commentaire}</Texte> : null}
      {version.remarques.length > 0 && (
        <Texte variante="discret">
          {t('versions.remarques', { count: version.remarques.length })}
        </Texte>
      )}
    </View>
  );
}

function Comparaison({ planning, numero }: { planning: string; numero: number }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { client } = useSession();
  const [detail, setDetail] = useState<DetailVersion | null>(null);

  useEffect(() => {
    let actif = true;
    client.plannings
      .version(planning, numero)
      .then((d) => actif && setDetail(d))
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [client, planning, numero]);

  if (!detail) return <Texte variante="discret">{t('session.chargement')}</Texte>;
  const jour = (date: string, heure: string | null) =>
    `${new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric' }).format(
      new Date(`${date}T12:00:00`),
    )}${heure ? ` ${heure}` : ''}`.replace(/ /g, '\u00a0');
  const qui = (v: VisiteFigee) => v.prospect?.nom ?? t('visites.sansProspect');
  const c = detail.comparaison;
  const sections: { cle: string; titre: string; couleur: string; lignes: string[] }[] = c
    ? [
        {
          cle: 'ajoutees',
          titre: t('versions.sections.ajoutees', { count: c.ajoutees.length }),
          couleur: p.succes,
          lignes: c.ajoutees.map((v) => `${jour(v.date, v.heure)} · ${qui(v)}`),
        },
        {
          cle: 'retirees',
          titre: t('versions.sections.retirees', { count: c.retirees.length }),
          couleur: p.erreur,
          lignes: c.retirees.map((v) => `${jour(v.date, v.heure)} · ${qui(v)}`),
        },
        {
          cle: 'deplacees',
          titre: t('versions.sections.deplacees', { count: c.deplacees.length }),
          couleur: p.info,
          lignes: c.deplacees.map(
            (d) =>
              `${qui(d.visite)} : ${jour(d.avant.date, d.avant.heure)} → ${jour(d.visite.date, d.visite.heure)}`,
          ),
        },
        {
          cle: 'modifiees',
          titre: t('versions.sections.modifiees', { count: c.modifiees.length }),
          couleur: p.texteSecondaire,
          lignes: c.modifiees.map(
            (m) =>
              `${qui(m.visite)} : ${m.champs.map((x) => t(`versions.champs.${x}`)).join(', ')}`,
          ),
        },
      ].filter((s) => s.lignes.length > 0)
    : [];
  // La première version n'a rien à comparer : son en-tête le dit déjà.
  if (!c) return null;
  return (
    <View style={[styles.detail, { borderTopColor: p.ligne }]}>
      {sections.length === 0 ? (
        <Texte variante="discret">{t('versions.aucunChangement')}</Texte>
      ) : (
        sections.map((s) => (
          <View key={s.cle} style={{ gap: 2 }}>
            <Text style={[styles.section, { color: s.couleur }]}>{s.titre}</Text>
            {s.lignes.map((l) => (
              <Texte key={l}>{l}</Texte>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  entete: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  titre: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  detail: { gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  section: { fontFamily: police.texteFort, fontSize: 14 },
});
