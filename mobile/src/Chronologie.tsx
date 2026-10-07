/**
 * Visites précédentes chez un prospect (RPT-011) : les rapports que l'on peut lire, du plus
 * récent au plus ancien ; CA1 : un délégué ne voit que les siens. La dernière liste lue reste
 * sur le téléphone : sans réseau, elle s'affiche quand même.
 */
import type { RapportChronologie } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { ecrire, lire } from './baseLocale';
import { Carte, Etiquette, Texte, useLien, usePalette } from './composants';
import { useSession } from './session';

/** Au-delà, « Voir les visites plus anciennes ». */
const VISIBLES = 3;

const cle = (prospect: string) => `chronologie.${prospect}`;

function Visite({ rapport, premiere }: { rapport: RapportChronologie; premiere: boolean }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${rapport.date}T12:00:00Z`));
  const produits = rapport.presentations
    .map((x) => (x.retour ? `${x.libelle} — ${t(`rapport.retours.${x.retour}`)}` : x.libelle))
    .join('\n');
  const action = [rapport.prochaine_action_type, rapport.prochaine_action]
    .filter(Boolean)
    .join(' — ');
  return (
    <View
      style={{
        gap: 4,
        paddingVertical: 12,
        borderTopWidth: premiere ? 0 : 1,
        borderTopColor: p.ligne,
      }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <Texte variante="fort">{date}</Texte>
        {rapport.statut === 'brouillon' && <Etiquette>{t('rapport.statuts.brouillon')}</Etiquette>}
        {rapport.en_retard && rapport.statut !== 'brouillon' && (
          <Etiquette>{t('chronologie.enRetard')}</Etiquette>
        )}
      </View>
      <Texte variante="discret">
        {[rapport.heure, rapport.etablissement, rapport.de_moi ? '' : rapport.delegue_nom]
          .filter(Boolean)
          .join(' · ')}
      </Texte>
      {rapport.resultat ? (
        <Texte>{[rapport.resultat, rapport.resultat_obtenu].filter(Boolean).join(' — ')}</Texte>
      ) : null}
      {produits ? <Texte>{produits}</Texte> : null}
      {rapport.resume ? <Texte variante="discret">{rapport.resume}</Texte> : null}
      {action ? (
        <Texte>
          <Texte variante="fort">{`${t('chronologie.suite')} `}</Texte>
          {action}
        </Texte>
      ) : null}
    </View>
  );
}

export function VisitesPrecedentes({ prospect }: { prospect: string }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const lien = useLien();
  const [rapports, setRapports] = useState<RapportChronologie[] | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [tout, setTout] = useState(false);

  useEffect(() => {
    let actif = true;
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

  if (rapports === null) return null;
  const affiches = tout ? rapports : rapports.slice(0, VISIBLES);
  return (
    <Carte style={{ paddingVertical: 4, gap: 0 }}>
      <Texte variante="libelle" style={{ paddingTop: 8 }}>
        {t('chronologie.titre')}
      </Texte>
      {horsLigne && <Texte variante="discret">{t('chronologie.horsLigne')}</Texte>}
      {rapports.length === 0 ? (
        <Texte variante="discret" style={{ paddingVertical: 8 }}>
          {t('chronologie.aucune')}
        </Texte>
      ) : (
        affiches.map((r, i) => <Visite key={r.id} rapport={r} premiere={i === 0} />)
      )}
      {rapports.length > VISIBLES && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setTout(!tout)}
          style={{ minHeight: 44, justifyContent: 'center' }}
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
