/**
 * Visites précédentes chez un prospect (RPT-011) : les rapports que l'on peut lire, du plus
 * récent au plus ancien ; CA1 : un délégué ne voit que les siens. La dernière liste lue reste
 * sur le téléphone : sans réseau, elle s'affiche quand même.
 */
import type { RapportChronologie } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ecrire, lire } from './baseLocale';
import { Carte, Etiquette, Statut, type TonStatut, Texte, useLien, usePalette } from './composants';
import { police } from './polices';
import { useSession } from './session';

/** Au-delà, « Voir les visites plus anciennes ». */
const VISIBLES = 3;

const cle = (prospect: string) => `chronologie.${prospect}`;

/** Le statut d'un rapport, comme dans la Tournée : le brouillon est un rapport à rédiger. */
const STATUTS: Record<string, [string, TonStatut]> = {
  brouillon: ['attendu', 'wa'],
  soumis: ['soumis', 'ok'],
  valide: ['valide', 'ok'],
  a_corriger: ['a_corriger', 'er'],
  rouvert: ['rouvert', 'wa'],
};

/** « 12 octobre » ; l'année seulement quand ce n'est pas la courante. */
export function dateVisite(date: string, langue: string) {
  const jour = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat(langue, {
    day: 'numeric',
    month: 'long',
    ...(jour.getUTCFullYear() !== new Date().getUTCFullYear() ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(jour);
}

/** Une visite (.li) : la date, ce qui s'est dit, le statut du rapport ; le détail se déplie. */
function Visite({ rapport, premiere }: { rapport: RapportChronologie; premiere: boolean }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const [ouverte, setOuverte] = useState(false);
  const [statut, ton] = STATUTS[rapport.statut] ?? ['soumis', 'ok'];
  const resume = [rapport.presentations.map((x) => x.libelle).join(', '), rapport.resultat ?? '']
    .filter(Boolean)
    .join(' · ');
  const produits = rapport.presentations
    .map((x) => (x.retour ? `${x.libelle} — ${t(`rapport.retours.${x.retour}`)}` : x.libelle))
    .join('\n');
  const action = [rapport.prochaine_action_type, rapport.prochaine_action]
    .filter(Boolean)
    .join(' — ');
  return (
    <View style={!premiere && { borderTopWidth: 1, borderTopColor: p.ligne }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: ouverte }}
        onPress={() => setOuverte(!ouverte)}
        style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: p.fond }]}
      >
        <Text style={[styles.date, { color: p.texte }]}>
          {dateVisite(rapport.date, i18n.language)}
        </Text>
        <Text numberOfLines={ouverte ? undefined : 1} style={[styles.resume, { color: p.texte }]}>
          {resume || rapport.etablissement || t('chronologie.sansDetail')}
        </Text>
        <Statut ton={ton}>{t(`mobile.tournee.statuts.${statut}`)}</Statut>
      </Pressable>
      {ouverte && (
        <View style={styles.detail}>
          {rapport.en_retard && rapport.statut !== 'brouillon' && (
            <Etiquette>{t('chronologie.enRetard')}</Etiquette>
          )}
          <Texte variante="discret">
            {[rapport.heure, rapport.etablissement, rapport.de_moi ? '' : rapport.delegue_nom]
              .filter(Boolean)
              .join(' · ')}
          </Texte>
          {rapport.resultat_obtenu ? <Texte>{rapport.resultat_obtenu}</Texte> : null}
          {produits ? <Texte>{produits}</Texte> : null}
          {rapport.resume ? <Texte variante="discret">{rapport.resume}</Texte> : null}
          {action ? (
            <Texte>
              <Texte variante="fort">{`${t('chronologie.suite')} `}</Texte>
              {action}
            </Texte>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** Les rapports d'un prospect ; la dernière liste lue reste sur le téléphone. */
export function useChronologie(prospect: string | null) {
  const { client } = useSession();
  const [rapports, setRapports] = useState<RapportChronologie[] | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);

  useEffect(() => {
    let actif = true;
    if (!prospect) return;
    // Promesse d'abord : une erreur, même immédiate, passe par le repli hors ligne.
    void Promise.resolve()
      .then(() => client.prospects.rapports(prospect))
      .then(async (r) => {
        await ecrire(cle(prospect), r).catch(() => undefined);
        if (actif) setRapports(r);
      })
      .catch(async () => {
        const garde = await lire<RapportChronologie[]>(cle(prospect)).catch(() => null);
        if (!actif) return;
        setRapports(garde?.valeur ?? []);
        setHorsLigne(true);
      });
    return () => {
      actif = false;
    };
  }, [client, prospect]);

  return { rapports, horsLigne };
}

export function VisitesPrecedentes({
  prospect,
  chronologie,
}: {
  prospect: string;
  /** Déjà lue par la fiche (sa dernière visite) : pas de seconde lecture. */
  chronologie?: ReturnType<typeof useChronologie>;
}) {
  const propre = useChronologie(chronologie ? null : prospect);
  const { rapports, horsLigne } = chronologie ?? propre;
  const { t } = useTranslation();
  const lien = useLien();
  const [tout, setTout] = useState(false);

  if (rapports === null) return null;
  const affiches = tout ? rapports : rapports.slice(0, VISIBLES);
  return (
    <Carte marge={0}>
      <Texte
        variante="sousTitre"
        accessibilityRole="header"
        style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 4 }}
      >
        {t('chronologie.titre')}
      </Texte>
      {horsLigne && (
        <Texte variante="discret" style={{ paddingHorizontal: 16 }}>
          {t('chronologie.horsLigne')}
        </Texte>
      )}
      {rapports.length === 0 ? (
        <Texte variante="discret" style={{ padding: 16, paddingTop: 8 }}>
          {t('chronologie.aucune')}
        </Texte>
      ) : (
        affiches.map((r, i) => <Visite key={r.id} rapport={r} premiere={i === 0} />)
      )}
      {rapports.length > VISIBLES && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setTout(!tout)}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}
        >
          <Texte style={{ color: lien, fontWeight: '600' }}>
            {tout
              ? t('chronologie.moins')
              : t('chronologie.plus', { count: rapports.length - VISIBLES })}
          </Texte>
        </Pressable>
      )}
    </Carte>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  date: { width: 92, fontFamily: police.texteFort, fontSize: 12.5, lineHeight: 18 },
  resume: { flex: 1, minWidth: 0, fontFamily: police.texteFort, fontSize: 14, lineHeight: 20 },
  detail: { gap: 4, paddingHorizontal: 16, paddingBottom: 14, paddingLeft: 120 },
});
