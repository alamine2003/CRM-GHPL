import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Semaine } from '@innov/api-client';
import { marque } from '@innov/design';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alerte, Bouton, Carte, Texte, usePalette } from '../src/composants';
import { Ecran } from '../src/Ecran';
import { police } from '../src/polices';
import { messageErreur, useSession } from '../src/session';

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);

const jourIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Semaine du délégué (PLN-001) : ses jours ouvrés, les jours fériés du pays (affichés, non
 * planifiables, CA2) et son planning, un seul par semaine (CA1). Les visites s'y ajoutent à
 * partir de 0.2.2.
 */
export default function EcranSemaine() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { client } = useSession();
  const [jour, setJour] = useState<string | undefined>(undefined);
  const [semaine, setSemaine] = useState<Semaine | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const aujourdhui = jourIso(new Date());

  const charger = useCallback(
    (cible?: string) =>
      client.plannings
        .semaine(cible)
        .then((s) => {
          setSemaine(s);
          setErreur(null);
        })
        .catch((e: unknown) => setErreur(messageErreur(e, t('erreurs.reseau')))),
    [client, t],
  );

  useEffect(() => {
    let actif = true;
    void Promise.resolve().then(() => {
      if (actif) void charger(jour);
    });
    return () => {
      actif = false;
    };
  }, [charger, jour]);

  const date = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, options).format(new Date(`${iso}T12:00:00`));

  async function preparer() {
    if (!semaine) return;
    setCreation(true);
    try {
      await client.plannings.creer(semaine.semaine);
      await charger(semaine.semaine);
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setCreation(false);
    }
  }

  const fin = semaine?.jours.at(-1)?.date;
  const periode =
    semaine && fin
      ? t('semaine.periode', {
          debut: date(semaine.semaine, { day: 'numeric', month: 'short' }),
          fin: date(fin, { day: 'numeric', month: 'short' }),
        })
      : undefined;
  const feries = semaine?.jours.filter((j) => j.ferie).length ?? 0;

  return (
    <Ecran titre={t('mobile.onglets.semaine')} surTitre={periode}>
      <View style={styles.navigation}>
        <Fleche
          sens="precedente"
          libelle={t('semaine.precedente')}
          onPress={() => semaine && setJour(semaine.precedente)}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!semaine || semaine.courante}
          onPress={() => setJour(undefined)}
          style={styles.centre}
        >
          <Text
            style={[
              styles.reperes,
              { color: semaine?.courante ? p.texteSecondaire : marque.bleuMarine },
            ]}
          >
            {semaine?.courante ? t('semaine.cetteSemaine') : t('semaine.revenir')}
          </Text>
        </Pressable>
        <Fleche
          sens="suivante"
          libelle={t('semaine.suivante')}
          onPress={() => semaine && setJour(semaine.suivante)}
        />
      </View>

      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      {!semaine ? (
        !erreur && <Texte variante="discret">{t('session.chargement')}</Texte>
      ) : (
        <>
          <Carte style={{ paddingVertical: 4 }}>
            {semaine.jours.map((j, i) => {
              const estAujourdhui = j.date === aujourdhui;
              return (
                <View
                  key={j.date}
                  style={[
                    styles.jour,
                    i < semaine.jours.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: p.ligne,
                    },
                  ]}
                >
                  <Text
                    style={[styles.date, { color: j.planifiable ? p.texte : p.texteSecondaire }]}
                  >
                    <Text style={styles.nomJour}>
                      {majuscule(date(j.date, { weekday: 'long' }))}
                    </Text>{' '}
                    {date(j.date, { day: 'numeric', month: 'short' })}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {j.ferie ? (
                      <Texte variante="discret" numberOfLines={1}>
                        {t('semaine.ferie', { libelle: j.ferie })}
                      </Texte>
                    ) : null}
                  </View>
                  {estAujourdhui && (
                    <Text style={[styles.aujourdhui, { color: marque.orange }]}>
                      {t('semaine.aujourdhui')}
                    </Text>
                  )}
                </View>
              );
            })}
          </Carte>
          {feries > 0 && (
            <Texte variante="discret">{t('semaine.feriesExclus', { count: feries })}</Texte>
          )}

          <Carte style={{ gap: 8 }}>
            <Texte variante="sousTitre">{t('semaine.planning')}</Texte>
            {semaine.planning ? (
              <>
                <Texte>{t(`semaine.statuts.${semaine.planning.statut}`)}</Texte>
                <Texte variante="discret">{t('semaine.visitesBientot')}</Texte>
              </>
            ) : semaine.peut_creer ? (
              <>
                <Texte variante="discret">{t('semaine.aPreparer')}</Texte>
                <Bouton
                  libelle={t('semaine.preparer')}
                  chargement={creation}
                  onPress={() => void preparer()}
                />
              </>
            ) : (
              <Texte variante="discret">
                {semaine.suivante <= aujourdhui ? t('semaine.passee') : t('semaine.sansPoste')}
              </Texte>
            )}
          </Carte>
        </>
      )}
    </Ecran>
  );
}

function Fleche({
  sens,
  libelle,
  onPress,
}: {
  sens: 'precedente' | 'suivante';
  libelle: string;
  onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fleche,
        { borderColor: p.ligne, backgroundColor: pressed ? p.fond : p.surface },
      ]}
    >
      <MaterialIcons
        name={sens === 'precedente' ? 'chevron-left' : 'chevron-right'}
        size={24}
        color={p.texte}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  navigation: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  reperes: { fontFamily: police.texteFort, fontSize: 14 },
  fleche: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jour: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 8 },
  date: { fontFamily: police.texte, fontSize: 15, width: 132 },
  nomJour: { fontFamily: police.texteFort },
  aujourdhui: { fontFamily: police.texteFort, fontSize: 12 },
});
