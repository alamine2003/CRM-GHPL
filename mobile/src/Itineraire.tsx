/**
 * Vues jour et détail du planning (PLN-006) et kilométrage estimé (PLN-010).
 *
 * - Jour : l'itinéraire dans l'ordre de la journée, numéroté, avec la distance d'un arrêt à
 *   l'autre (à vol d'oiseau [H]) ; un passage compte pour un arrêt.
 * - Détail : une visite, avec ses fiches (prospect, lieu) et ce qui reste à faire.
 * Aucune des deux ne montre de montant (PLN-010 CA2).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Semaine, Visite } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LigneAbsence } from './Absences';
import { Alerte, Bouton, Carte, MarquePotentiel, Texte, useLien, usePalette } from './composants';
import { alertesDeVisite } from './Controles';
import { nomProspect } from './Fiches';
import { unitesDuJour } from './Journee';
import { police } from './polices';
import { BandeauHorsLigne } from './Attente';
import { estTransitoire } from './Brouillons';
import { garderSemaine, semaineGardee } from './semaineLocale';
import { messageErreur, useSession } from './session';

/** « 12,4 km » dans la langue de l'interface. */
export function kilometres(km: number, langue: string) {
  return new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(km);
}

/**
 * Semaine qui contient ce jour, relue à l'ouverture de l'écran. Sans réseau, la dernière
 * semaine gardée sur le téléphone la remplace (PLN-007), avec l'heure de sa mise à jour.
 */
function useSemaineDu(jour: string) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [semaine, setSemaine] = useState<Semaine | null>(null);
  const [horsLigne, setHorsLigne] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const charger = useCallback(
    () =>
      client.plannings
        .semaine(jour)
        .then((s) => {
          setSemaine(s);
          setHorsLigne(null);
          setErreur(null);
          garderSemaine(s, jour);
        })
        .catch(async (e: unknown) => {
          const memoire = estTransitoire(e) ? await semaineGardee(jour) : null;
          if (memoire) {
            setSemaine(memoire.valeur);
            setHorsLigne(memoire.maj);
            setErreur(null);
          } else {
            setErreur(messageErreur(e, t('erreurs.reseau')));
          }
        }),
    [client, jour, t],
  );
  useEffect(() => {
    let actif = true;
    void Promise.resolve().then(() => actif && void charger());
    return () => {
      actif = false;
    };
  }, [charger]);
  return { semaine, erreur, horsLigne };
}

const dateLongue = (iso: string, langue: string) =>
  new Intl.DateTimeFormat(langue, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${iso}T12:00:00`),
  );

/** Titre du jour, pour l'en-tête de l'écran. */
export function useTitreDuJour(jour: string) {
  const { i18n } = useTranslation();
  const texte = dateLongue(jour, i18n.language);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export function VueJour({ jour }: { jour: string }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const { semaine, erreur, horsLigne } = useSemaineDu(jour);

  if (erreur) return <Alerte type="erreur">{erreur}</Alerte>;
  if (!semaine) return <Texte variante="discret">{t('session.chargement')}</Texte>;

  const visites = semaine.visites.filter((v) => v.date === jour);
  const absences = semaine.absences.filter((a) => a.date === jour);
  const unites = unitesDuJour(
    visites,
    semaine.passages.filter((x) => x.date === jour),
  );
  const km = semaine.kilometrage?.jours.find((j) => j.date === jour);
  const objectif = semaine.controles?.objectifs.find((o) => o.date === jour);
  const etape = (id: string) => km?.etapes.find((e) => e.visite === id)?.km ?? null;
  const ferie = semaine.jours.find((j) => j.date === jour)?.ferie;

  return (
    <>
      {horsLigne && <BandeauHorsLigne maj={horsLigne} />}
      <Carte style={{ gap: 6 }}>
        <Texte variante="sousTitre">
          {t('jour.visites', { count: visites.length })}
          {objectif ? ` · ${t('jour.objectif', { min: objectif.min, max: objectif.max })}` : ''}
        </Texte>
        {ferie ? <Texte variante="discret">{t('semaine.ferie', { libelle: ferie })}</Texte> : null}
        {km && km.km > 0 && <Texte>{t('km.jour', { km: kilometres(km.km, i18n.language) })}</Texte>}
        {km && km.sans_coordonnees > 0 && (
          <Texte variante="discret">{t('km.partiel', { count: km.sans_coordonnees })}</Texte>
        )}
      </Carte>

      {absences.length > 0 && (
        <Carte style={{ paddingVertical: 4 }}>
          {absences.map((a) => (
            <LigneAbsence key={a.id} absence={a} />
          ))}
        </Carte>
      )}

      {unites.length === 0 ? (
        <Texte variante="discret">{t('jour.vide')}</Texte>
      ) : (
        <Carte style={{ paddingVertical: 4 }}>
          {unites.map((u, i) => {
            const premiere = u.visites[0]!;
            const distance = etape(premiere.id);
            return (
              <View key={u.passage?.id ?? premiere.id}>
                {i > 0 && (
                  <Text style={[styles.trajet, { color: p.texteSecondaire }]}>
                    {distance === null
                      ? t('km.inconnu')
                      : t('km.depuisPrecedent', { km: kilometres(distance, i18n.language) })}
                  </Text>
                )}
                <View style={styles.arret}>
                  <Numero n={i + 1} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={[styles.heure, { color: p.texteSecondaire }]}>
                      {(u.passage ? u.passage.heure : premiere.heure) ?? t('visites.sansHeure')}
                    </Text>
                    {u.passage && (
                      <Text style={[styles.lieu, { color: p.texte }]}>
                        {t('passages.ligne', {
                          lieu: u.passage.etablissement.nom,
                          count: u.visites.length,
                        })}
                      </Text>
                    )}
                    {u.visites.map((v) => (
                      <LigneItineraire
                        key={v.id}
                        visite={v}
                        dansPassage={!!u.passage}
                        onPress={() =>
                          routeur.push({ pathname: '/visite/[id]', params: { id: v.id, jour } })
                        }
                      />
                    ))}
                  </View>
                </View>
              </View>
            );
          })}
        </Carte>
      )}
      {semaine.modifiable && semaine.planning && (
        <Bouton
          secondaire
          libelle={t('jour.modifier')}
          onPress={() => routeur.navigate({ pathname: '/semaine', params: { jour } })}
        />
      )}
    </>
  );
}

function Numero({ n }: { n: number }) {
  const lien = useLien();
  return (
    <View style={[styles.numero, { borderColor: lien }]}>
      <Text style={[styles.numeroTexte, { color: lien }]}>{n}</Text>
    </View>
  );
}

function LigneItineraire({
  visite,
  dansPassage,
  onPress,
}: {
  visite: Visite;
  dansPassage: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: p.fond }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.nom, { color: p.texte }]}>
          {visite.prospect ? nomProspect(visite.prospect, t) : t('visites.sansProspect')}
        </Text>
        {!dansPassage && visite.etablissement && (
          <Texte variante="discret" numberOfLines={1}>
            {visite.etablissement.nom}
          </Texte>
        )}
        {visite.manquants.length > 0 && (
          <Text style={[styles.manque, { color: p.attention }]}>
            {t('visites.aCompleter', {
              champs: visite.manquants.map((c) => t(`visites.champs.${c}`)).join(', '),
            })}
          </Text>
        )}
      </View>
      <MaterialIcons name="chevron-right" size={22} color={p.texteDiscret} />
    </Pressable>
  );
}

export function VueDetail({ id, jour }: { id: string; jour: string }) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const { semaine, erreur, horsLigne } = useSemaineDu(jour);

  if (erreur) return <Alerte type="erreur">{erreur}</Alerte>;
  if (!semaine) return <Texte variante="discret">{t('session.chargement')}</Texte>;
  const visite = semaine.visites.find((v) => v.id === id);
  if (!visite) return <Alerte type="attention">{t('detail.introuvable')}</Alerte>;

  const alertes = alertesDeVisite(semaine.controles, visite.id, t);
  const passage = visite.passage ? semaine.passages.find((x) => x.id === visite.passage) : null;
  const ligne = (libelle: string, valeur?: string | null) =>
    valeur ? (
      <View style={styles.champ}>
        <Texte variante="libelle">{libelle}</Texte>
        <Texte>{valeur}</Texte>
      </View>
    ) : null;

  return (
    <>
      {horsLigne && <BandeauHorsLigne maj={horsLigne} />}
      <Carte style={{ gap: 12 }}>
        <View style={styles.entete}>
          {visite.prospect && <MarquePotentiel valeur={visite.prospect.potentiel} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.titre, { color: p.texte }]}>
              {visite.prospect ? nomProspect(visite.prospect, t) : t('visites.sansProspect')}
            </Text>
            {visite.prospect && (
              <Texte variante="discret">
                {visite.prospect.specialite_libelle || visite.prospect.type_libelle}
              </Texte>
            )}
          </View>
        </View>
        {ligne(
          t('detail.quand'),
          [dateLongue(visite.date, i18n.language), visite.heure].filter(Boolean).join(' · '),
        )}
        {ligne(
          t('visites.champs.etablissement'),
          passage
            ? t('passages.ligne', {
                lieu: passage.etablissement.nom,
                count: passage.visites.length,
              })
            : visite.etablissement?.nom,
        )}
        {ligne(t('visites.champs.objectif'), visite.objectif)}
        {ligne(t('visites.champs.reseau'), visite.reseau?.libelle)}
        {ligne(t('visites.champs.note'), visite.note)}
        {ligne(t('detail.statut'), t(`visites.statuts.${visite.statut ?? 'prevue'}`))}
        {visite.manquants.length > 0 && (
          <Text style={[styles.manque, { color: p.attention }]}>
            {t('visites.aCompleter', {
              champs: visite.manquants.map((c) => t(`visites.champs.${c}`)).join(', '),
            })}
          </Text>
        )}
        {alertes.map((a) => (
          <Text
            key={a.texte}
            style={[styles.manque, { color: a.ton === 'erreur' ? p.erreur : p.attention }]}
          >
            {a.texte}
          </Text>
        ))}
      </Carte>
      {visite.prospect && (
        <Bouton
          secondaire
          libelle={t('detail.ficheProspect')}
          onPress={() => routeur.push(`/fiche/${visite.prospect!.id}`)}
        />
      )}
      {visite.etablissement && (
        <Bouton
          secondaire
          libelle={t('detail.ficheLieu')}
          onPress={() => routeur.push(`/lieu/${visite.etablissement!.id}`)}
        />
      )}
      {semaine.modifiable && (
        <Bouton
          libelle={t('visites.modifier')}
          onPress={() =>
            routeur.navigate({ pathname: '/semaine', params: { jour, modifier: visite.id } })
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  trajet: { fontFamily: police.texte, fontSize: 13, paddingLeft: 44, paddingVertical: 2 },
  arret: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  numero: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  numeroTexte: { fontFamily: police.texteFort, fontSize: 13 },
  heure: { fontFamily: police.texteFort, fontSize: 13, fontVariant: ['tabular-nums'] },
  lieu: { fontFamily: police.texteFort, fontSize: 15 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 6 },
  nom: { fontFamily: police.texteFort, fontSize: 15 },
  manque: { fontFamily: police.texteFort, fontSize: 12 },
  champ: { gap: 2 },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titre: { fontFamily: police.titre, fontSize: 18 },
});
