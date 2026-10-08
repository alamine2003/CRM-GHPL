/**
 * Mes chiffres (DSH-001, 0.7.1) : les indicateurs du délégué pour une semaine, comparés à la
 * précédente, et la couverture de sa liste cible sur le cycle de visites. Le téléphone garde
 * les derniers chiffres lus et les affiche sans réseau, avec l'heure de leur calcul (CA1).
 *
 * Aucun score, aucune appréciation, aucun classement (DC-49) : des comptages et des taux bornés
 * à 100 %, chacun avec ce qu'il compte (« 1 sur 3 »).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { marque } from '@innov/design';
import type { Indicateurs, MesChiffres, TauxIndicateurs } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lire, ecrire } from './baseLocale';
import { estTransitoire } from './Brouillons';
import { Alerte, Bouton, Carte, Texte, usePalette } from './composants';
import { police } from './polices';
import { useSession } from './session';

/** La semaine en cours se garde sous cette clé ; une autre semaine, sous la date de son lundi. */
export const CLE_CHIFFRES = 'mes-chiffres';

function cle(lundi: string | null) {
  return lundi ? `${CLE_CHIFFRES}:${lundi}` : CLE_CHIFFRES;
}

function decaler(jour: string, jours: number) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/** Variation d'un taux par rapport à la semaine précédente, en points. */
export function ecartPoints(actuel: number | null, avant: number | null): number | null {
  if (actuel === null || avant === null) return null;
  return Math.round((actuel - avant) * 100);
}

export function EcranMesChiffres() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { client, etat } = useSession();
  const connecte = etat.statut === 'connecte';
  // `null` : la semaine en cours ; sinon le lundi de la semaine choisie.
  const [lundi, setLundi] = useState<string | null>(null);
  const [chiffres, setChiffres] = useState<MesChiffres | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [indisponible, setIndisponible] = useState(false);

  useEffect(() => {
    if (!connecte) return;
    let actif = true;
    const memoire = () =>
      lire<MesChiffres>(cle(lundi))
        .catch(() => null)
        .then((m) => {
          if (!actif) return;
          if (m) {
            setChiffres(m.valeur);
            setHorsLigne(true);
          } else {
            setChiffres(null);
            setIndisponible(true);
          }
        });
    client.pilotage
      .mesChiffres(lundi ?? undefined)
      .then((lu) => {
        if (!actif) return;
        setChiffres(lu);
        setHorsLigne(false);
        setIndisponible(false);
        void ecrire(cle(lundi), lu).catch(() => undefined);
      })
      .catch((e: unknown) => {
        if (estTransitoire(e)) return memoire();
        setChiffres(null);
        setIndisponible(true);
      });
    return () => {
      actif = false;
    };
  }, [client, connecte, lundi]);

  const pourcent = new Intl.NumberFormat(i18n.language, { style: 'percent' });
  const jourCourt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const date = (iso: string) => jourCourt.format(new Date(`${iso}T12:00:00Z`));

  if (!chiffres) {
    return (
      <View style={styles.pile}>
        <Texte variante="discret">
          {indisponible ? t('chiffres.indisponible') : t('session.chargement')}
        </Texte>
        {indisponible && lundi !== null && (
          <Bouton secondaire libelle={t('chiffres.revenir')} onPress={() => setLundi(null)} />
        )}
      </View>
    );
  }

  const s = chiffres.semaine;
  const avant = chiffres.precedente;
  const calcule = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(chiffres.calcule_le));

  return (
    <View style={styles.pile}>
      <View style={styles.navigation}>
        <Fleche
          icone="chevron-left"
          libelle={t('chiffres.precedente')}
          onPress={() => setLundi(avant.debut)}
        />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Texte variante="sousTitre">
            {t('chiffres.semaine', { debut: date(s.debut), fin: date(s.fin) })}
          </Texte>
          {!horsLigne && (
            <Texte variante="discret">{t('chiffres.calcule', { date: calcule })}</Texte>
          )}
        </View>
        <Fleche
          icone="chevron-right"
          libelle={t('chiffres.suivante')}
          desactive={s.fin >= chiffres.aujourdhui}
          // La semaine en cours se relit sous sa propre clé, gardée pour le mode avion (CA1).
          onPress={() => {
            const suivant = decaler(s.debut, 7);
            setLundi(decaler(suivant, 7) > chiffres.aujourdhui ? null : suivant);
          }}
        />
      </View>
      {horsLigne && <Alerte type="attention">{t('chiffres.horsLigne', { date: calcule })}</Alerte>}

      {!s.activite ? (
        <Carte>
          <Texte variante="fort">{t('chiffres.aucuneActivite')}</Texte>
          <Texte variante="discret">{t('chiffres.aucuneActiviteDetail')}</Texte>
        </Carte>
      ) : (
        <>
          <Carte style={styles.carte}>
            <View style={styles.entete}>
              <Text style={[styles.grand, { color: p.texte }]}>{s.visites.effectuees}</Text>
              <View style={{ flex: 1 }}>
                <Texte variante="fort">
                  {t('chiffres.visitesFaites', { count: s.visites.effectuees })}
                </Texte>
                <Texte variante="discret">
                  {s.visites.imprevues
                    ? t('chiffres.dontImprevues', { count: s.visites.imprevues })
                    : t('chiffres.toutesPrevues')}
                </Texte>
              </View>
            </View>
            <Courbe jours={chiffres.jours} langue={i18n.language} />
            <Indicateur
              libelle={t('chiffres.realisation')}
              detail={t('chiffres.surPrevues', {
                n: s.visites.effectuees_prevues,
                count: s.visites.echues,
              })}
              valeur={s.taux.realisation}
              avant={avant.taux.realisation}
              format={pourcent}
            />
            <Indicateur
              libelle={t('chiffres.ecartsJustifies')}
              detail={t('chiffres.surEcarts', {
                n: s.visites.ecarts_justifies,
                count: s.visites.ecarts,
              })}
              valeur={s.taux.ecarts_justifies}
              format={pourcent}
            />
            <Indicateur
              libelle={t('chiffres.geolocalisation')}
              detail={t('chiffres.surFaites', {
                n: s.visites.geolocalisees,
                count: s.visites.effectuees,
              })}
              valeur={s.taux.geolocalisation}
              avant={avant.taux.geolocalisation}
              format={pourcent}
              derniere
            />
            {s.visites.a_venir > 0 && (
              <Texte variante="discret">{t('chiffres.aVenir', { count: s.visites.a_venir })}</Texte>
            )}
            {s.visites.a_justifier > 0 && (
              <Alerte type="attention">
                {t('chiffres.aJustifier', { count: s.visites.a_justifier })}
              </Alerte>
            )}
          </Carte>

          <Carte style={styles.carte}>
            <Texte variante="sousTitre">{t('chiffres.rapports')}</Texte>
            <Indicateur
              libelle={t('chiffres.dansLeDelai')}
              detail={t('chiffres.surDus', {
                n: s.rapports.dans_delai,
                count: s.rapports.soumis + s.rapports.en_retard,
              })}
              valeur={s.taux.rapports_dans_delai}
              avant={avant.taux.rapports_dans_delai}
              format={pourcent}
            />
            <Compte libelle={t('chiffres.valides')} valeur={s.rapports.valides} />
            <Compte
              libelle={t('chiffres.enRetard')}
              valeur={s.rapports.en_retard}
              attention={s.rapports.en_retard > 0}
              derniere
            />
          </Carte>
        </>
      )}

      <Couverture indicateurs={chiffres.cycle} date={date} format={pourcent} />
      <Texte variante="discret" style={styles.note}>
        {t('chiffres.note')}
      </Texte>
    </View>
  );
}

function Fleche({
  icone,
  libelle,
  desactive,
  onPress,
}: {
  icone: 'chevron-left' | 'chevron-right';
  libelle: string;
  desactive?: boolean;
  onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      accessibilityState={{ disabled: !!desactive }}
      disabled={desactive}
      onPress={onPress}
      style={styles.fleche}
    >
      <MaterialIcons name={icone} size={28} color={desactive ? p.ligne : p.texte} />
    </Pressable>
  );
}

function Indicateur({
  libelle,
  detail,
  valeur,
  avant,
  format,
  derniere,
}: {
  libelle: string;
  detail: string;
  valeur: number | null;
  avant?: number | null;
  format: Intl.NumberFormat;
  derniere?: boolean;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const ecart = avant === undefined ? null : ecartPoints(valeur, avant);
  return (
    <View
      style={[
        styles.ligne,
        !derniere && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.ligne },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Texte>{libelle}</Texte>
        <Texte variante="discret">{detail}</Texte>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.taux, { color: p.texte }]}>
          {valeur === null ? '—' : format.format(valeur)}
        </Text>
        {ecart !== null && ecart !== 0 && (
          <Texte variante="discret">
            {t('chiffres.ecartPoints', {
              count: Math.abs(ecart),
              signe: ecart > 0 ? '+' : '−',
            })}
          </Texte>
        )}
      </View>
    </View>
  );
}

function Compte({
  libelle,
  valeur,
  attention,
  derniere,
}: {
  libelle: string;
  valeur: number;
  attention?: boolean;
  derniere?: boolean;
}) {
  const p = usePalette();
  return (
    <View
      style={[
        styles.ligne,
        !derniere && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.ligne },
      ]}
    >
      <Texte style={{ flex: 1 }}>{libelle}</Texte>
      <Text style={[styles.taux, { color: attention ? p.attention : p.texte }]}>{valeur}</Text>
    </View>
  );
}

/** Visites prévues et faites, jour par jour : deux barres par jour, sans axe. */
function Courbe({ jours, langue }: { jours: MesChiffres['jours']; langue: string }) {
  const { t } = useTranslation();
  const p = usePalette();
  const nom = new Intl.DateTimeFormat(langue, { weekday: 'narrow' });
  const max = Math.max(1, ...jours.map((j) => Math.max(j.prevues, j.effectuees)));
  return (
    <View
      accessible
      accessibilityLabel={jours
        .map((j) => t('chiffres.jourCourbe', { ...j, date: j.date }))
        .join(', ')}
    >
      <View style={styles.courbe}>
        {jours.map((j) => (
          <View key={j.date} style={styles.jour}>
            <View style={[styles.barres, { borderBottomColor: p.ligne }]}>
              <View
                style={[
                  styles.barre,
                  j.prevues > 0 && {
                    height: (j.prevues / max) * 48,
                    borderColor: p.texteDiscret,
                    borderWidth: 1,
                  },
                ]}
              />
              <View
                style={[
                  styles.barre,
                  { height: (j.effectuees / max) * 48, backgroundColor: marque.orange },
                ]}
              />
            </View>
            <Texte variante="discret">{nom.format(new Date(`${j.date}T12:00:00Z`))}</Texte>
          </View>
        ))}
      </View>
      <View style={styles.legende}>
        <View style={[styles.pastille, { borderColor: p.texteDiscret, borderWidth: 1 }]} />
        <Texte variante="discret">{t('chiffres.prevues')}</Texte>
        <View style={[styles.pastille, { backgroundColor: marque.orange }]} />
        <Texte variante="discret">{t('chiffres.faites')}</Texte>
      </View>
    </View>
  );
}

function Couverture({
  indicateurs,
  date,
  format,
}: {
  indicateurs: Indicateurs & { semaines: number };
  date: (iso: string) => string;
  format: Intl.NumberFormat;
}) {
  const { t } = useTranslation();
  const c = indicateurs.couverture;
  const taux: TauxIndicateurs = indicateurs.taux;
  return (
    <Carte style={styles.carte}>
      <Texte variante="sousTitre">{t('chiffres.couverture')}</Texte>
      <Texte variante="discret">
        {t('chiffres.cycle', {
          count: indicateurs.semaines,
          debut: date(indicateurs.debut),
          fin: date(indicateurs.fin),
        })}
      </Texte>
      {c.cibles === 0 ? (
        <Texte variante="discret">{t('chiffres.sansListe')}</Texte>
      ) : (
        <>
          <Indicateur
            libelle={t('chiffres.listeVisitee')}
            detail={t('chiffres.surCibles', { n: c.visitees, total: c.cibles })}
            valeur={taux.couverture}
            format={format}
          />
          <Indicateur
            libelle={t('chiffres.abVus')}
            detail={t('chiffres.surCibles', { n: c.visitees_ab, total: c.cibles_ab })}
            valeur={taux.couverture_ab}
            format={format}
          />
          <Indicateur
            libelle={t('chiffres.abFrequence')}
            detail={t('chiffres.surCibles', { n: c.frequence_ab, total: c.cibles_ab })}
            valeur={taux.frequence_ab}
            format={format}
            derniere
          />
        </>
      )}
    </Carte>
  );
}

const styles = StyleSheet.create({
  pile: { gap: 12 },
  carte: { gap: 4 },
  navigation: { flexDirection: 'row', alignItems: 'center' },
  fleche: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  grand: { fontFamily: police.titre, fontSize: 36, lineHeight: 42 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  taux: { fontFamily: police.titre, fontSize: 17 },
  courbe: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8 },
  jour: { alignItems: 'center', gap: 4, flex: 1 },
  barres: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 49,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barre: { width: 8, height: 0, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  legende: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  pastille: { width: 10, height: 10, borderRadius: 2 },
  note: { textAlign: 'center', paddingHorizontal: 8 },
});
