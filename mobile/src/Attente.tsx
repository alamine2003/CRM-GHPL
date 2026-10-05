/**
 * Ce qui n'est pas encore parti (PLN-007, 0.2.7) : le brouillon d'une saisie interrompue, et
 * les visites ou absences enregistrées sans réseau, en attente d'envoi.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Brouillon, Envoi } from './Brouillons';
import { Bouton, Carte, Texte, usePalette } from './composants';
import { police } from './polices';

/** « Une saisie n'a pas été enregistrée » : la reprendre ou l'abandonner. */
export function BandeauBrouillon({
  brouillon,
  empechement,
  surReprendre,
  surAbandonner,
}: {
  brouillon: Brouillon;
  /** Pourquoi la saisie ne peut plus être reprise (visite retirée, planning soumis). */
  empechement?: string;
  surReprendre: () => void;
  surAbandonner: () => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <Carte style={{ gap: 10, borderLeftWidth: 3, borderLeftColor: p.info }}>
      <Texte variante="fort">
        {brouillon.objet === 'visite'
          ? t(brouillon.visite ? 'brouillon.visiteModifiee' : 'brouillon.visite')
          : t('brouillon.absence')}
      </Texte>
      <Texte variante="discret">{empechement ?? t('brouillon.aide')}</Texte>
      {!empechement && <Bouton libelle={t('brouillon.reprendre')} onPress={surReprendre} />}
      <Bouton secondaire libelle={t('brouillon.abandonner')} onPress={surAbandonner} />
    </Carte>
  );
}

/** File des envois en attente, toujours visible tant qu'elle n'est pas vide. */
export function CarteAttente({
  envois,
  envoi,
  surEnvoyer,
  surAbandonner,
}: {
  envois: Envoi[];
  envoi: boolean;
  surEnvoyer: () => void;
  surAbandonner: (id: string) => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <Carte style={{ gap: 8, borderLeftWidth: 3, borderLeftColor: p.attention }}>
      <View style={styles.titre}>
        <MaterialIcons name="cloud-upload" size={20} color={p.attention} />
        <Texte variante="sousTitre">{t('attente.titre', { count: envois.length })}</Texte>
      </View>
      <Texte variante="discret">{t('attente.aide', { count: envois.length })}</Texte>
      {envois.map((e) => (
        <View key={e.id} style={[styles.ligne, { borderTopColor: p.ligne }]}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={[styles.resume, { color: p.texte }]}>
              {t(`attente.types.${e.type}`)} · {e.resume}
            </Text>
            {e.erreur ? <Text style={[styles.erreur, { color: p.erreur }]}>{e.erreur}</Text> : null}
          </View>
          {e.erreur ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('attente.abandonnerUn', { resume: e.resume })}
              onPress={() => surAbandonner(e.id)}
              hitSlop={8}
              style={styles.abandonner}
            >
              <Text style={[styles.lien, { color: p.erreur }]}>{t('attente.abandonner')}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <Bouton secondaire libelle={t('attente.envoyer')} chargement={envoi} onPress={surEnvoyer} />
    </Carte>
  );
}

const styles = StyleSheet.create({
  titre: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  resume: { fontFamily: police.texteFort, fontSize: 14 },
  erreur: { fontFamily: police.texte, fontSize: 13 },
  abandonner: { minHeight: 44, justifyContent: 'center' },
  lien: { fontFamily: police.texteFort, fontSize: 14 },
});
