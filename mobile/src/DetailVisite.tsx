/**
 * Détail d'une visite (VIS-002, 0.4.2) : les coordonnées du prospect et du lieu, et les trois
 * dernières visites du délégué chez ce prospect (CA1 : jamais celles d'un collègue), et la
 * prochaine action notée la dernière fois (RPT-006 CA1). Gardé sur
 * le téléphone : le programme du jour le prépare pour chaque visite, et il se lit sans réseau.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ClientApi, DetailVisite } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionPrecedente } from './ActionPrecedente';
import { ecrire, lire } from './baseLocale';
import { estTransitoire } from './Brouillons';
import { Alerte, Carte, Etiquette, Texte, usePalette } from './composants';
import { police } from './polices';
import { useSession } from './session';

const cle = (id: string) => `visite.${id}`;

/** Lit le détail et le garde sur le téléphone. */
export async function garderDetail(client: ClientApi, id: string) {
  const detail = await client.visites.detail(id);
  void ecrire(cle(id), detail).catch(() => undefined);
  return detail;
}

export function useDetailVisite(id: string) {
  const { client } = useSession();
  const [detail, setDetail] = useState<DetailVisite | null>(null);
  const [horsLigne, setHorsLigne] = useState<string | null>(null);
  useEffect(() => {
    let actif = true;
    Promise.resolve()
      .then(() => garderDetail(client, id))
      .then((d) => {
        if (actif) {
          setDetail(d);
          setHorsLigne(null);
        }
      })
      .catch(async (e: unknown) => {
        const memoire = estTransitoire(e)
          ? await lire<DetailVisite>(cle(id)).catch(() => null)
          : null;
        if (actif && memoire) {
          setDetail(memoire.valeur);
          setHorsLigne(memoire.maj);
        }
      });
    return () => {
      actif = false;
    };
  }, [client, id]);
  return { detail, horsLigne };
}

export function CoordonneesEtHistorique({
  id,
  horsLigneDit = false,
}: {
  id: string;
  /** L'écran dit déjà qu'il est hors ligne : pas de second bandeau. */
  horsLigneDit?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { detail, horsLigne } = useDetailVisite(id);
  if (!detail) return null;
  const { prospect, lieu } = detail;
  const telephones = [
    [t('detailVisite.telephoneMobile'), prospect?.telephone_mobile],
    [t('detailVisite.telephonePro'), prospect?.telephone_pro],
    [t('detailVisite.telephoneLieu'), lieu?.telephone],
  ].filter((x): x is [string, string] => !!x[1]);
  const adresse = [lieu?.adresse, lieu?.localite].filter(Boolean).join(', ');
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${iso}T12:00:00`));

  return (
    <>
      {horsLigne && !horsLigneDit && (
        <Alerte type="attention">
          {t('detailVisite.horsLigne', {
            date: new Intl.DateTimeFormat(i18n.language, {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(horsLigne)),
          })}
        </Alerte>
      )}
      <ActionPrecedente action={detail.action_precedente} />
      <Carte style={{ gap: 10 }}>
        <Texte variante="sousTitre">{t('detailVisite.coordonnees')}</Texte>
        {telephones.length === 0 && !adresse && !prospect?.courriel ? (
          <Texte variante="discret">{t('detailVisite.aucuneCoordonnee')}</Texte>
        ) : null}
        {telephones.map(([libelle, numero]) => (
          <Pressable
            key={libelle}
            accessibilityRole="link"
            accessibilityLabel={t('detailVisite.appeler', { numero })}
            onPress={() => void Linking.openURL(`tel:${numero.replace(/\s/g, '')}`)}
            style={({ pressed }) => [styles.ligne, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Texte variante="libelle">{libelle}</Texte>
              <Text style={[styles.valeur, { color: p.texte }]}>{numero}</Text>
            </View>
            <MaterialIcons name="call" size={22} color={p.info} />
          </Pressable>
        ))}
        {prospect?.courriel ? (
          <View>
            <Texte variante="libelle">{t('detailVisite.courriel')}</Texte>
            <Texte>{prospect.courriel}</Texte>
          </View>
        ) : null}
        {adresse ? (
          <View>
            <Texte variante="libelle">{t('detailVisite.adresse')}</Texte>
            <Texte>{adresse}</Texte>
          </View>
        ) : null}
      </Carte>
      <Carte style={{ gap: 8 }}>
        <View style={{ gap: 2 }}>
          <Texte variante="sousTitre">{t('detailVisite.historique')}</Texte>
          <Texte variante="discret">{t('detailVisite.historiqueAide')}</Texte>
        </View>
        {detail.historique.length === 0 ? (
          <Texte variante="discret">{t('detailVisite.aucunHistorique')}</Texte>
        ) : (
          detail.historique.map((h, i) => (
            <View
              key={h.id}
              style={[
                styles.passe,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.ligne },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.valeur, { color: p.texte }]}>
                  {[date(h.date), h.heure].filter(Boolean).join(' · ')}
                </Text>
                {/* « Prévue » n'apprend rien sur une date passée : seul un résultat se dit. */}
                {h.statut !== 'prevue' && (
                  <Etiquette ton={h.statut === 'effectuee' ? 'succes' : 'attention'}>
                    {t(`visites.statuts.${h.statut}`)}
                  </Etiquette>
                )}
              </View>
              {h.etablissement ? <Texte variante="discret">{h.etablissement}</Texte> : null}
              {h.objectif ? <Texte>{h.objectif}</Texte> : null}
            </View>
          ))
        )}
      </Carte>
    </>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  valeur: { fontFamily: police.texteFort, fontSize: 15 },
  passe: { gap: 2, paddingTop: 8 },
});
