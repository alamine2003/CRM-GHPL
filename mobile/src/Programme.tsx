/**
 * Programme du jour du délégué (VIS-001, 0.4.1) : les visites de la version approuvée, dans
 * l'ordre, la prochaine en tête, puis le reste de la semaine. Le téléphone garde le dernier
 * programme lu et l'affiche sans réseau (CA1) ; il garde aussi la semaine, pour ouvrir le
 * détail d'une visite en mode avion.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { JourProgramme, Programme, VisiteProgramme } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lire, ecrire } from './baseLocale';
import { envoyerAttente, estTransitoire } from './Brouillons';
import { garderDetail } from './DetailVisite';
import {
  CLE_PROGRAMME as CLE,
  ecouterProgramme,
  ExecutionVisite,
  joursOuvresDe,
} from './Execution';
import { Alerte, Carte, Etiquette, MarquePotentiel, Texte, usePalette } from './composants';
import { nomProspect } from './Fiches';
import { police } from './polices';
import { VisiteImprevue } from './Imprevue';
import { useSession } from './session';
import { garderSemaine } from './semaineLocale';

export function ProgrammeDuJour() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const { client, etat } = useSession();
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [horsLigne, setHorsLigne] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<{ texte: string; ton: 'info' | 'succes' } | null>(null);
  const connecte = etat.statut === 'connecte';

  // Une visite démarrée sur le téléphone change le programme gardé : l'écran suit.
  useEffect(() => ecouterProgramme(setProgramme), []);

  useEffect(() => {
    if (!connecte) return;
    let actif = true;
    Promise.resolve()
      // D'abord ce qui attend dans la file (une visite démarrée sans réseau), puis le programme.
      .then(() => envoyerAttente(client).catch(() => 0))
      .then(() => client.plannings.programme())
      .then((lu) => {
        if (!actif) return;
        setProgramme(lu);
        setHorsLigne(null);
        void ecrire(CLE, lu).catch(() => undefined);
        // Le détail des visites du jour (coordonnées, historique) et la semaine : chaque
        // visite s'ouvre sans réseau.
        const jourLu = lu.jours.find((j) => j.date === lu.aujourdhui);
        for (const v of jourLu?.visites ?? [])
          void garderDetail(client, v.id).catch(() => undefined);
        void client.plannings
          .semaine(lu.semaine)
          .then((s) => garderSemaine(s, lu.semaine))
          .catch(() => undefined);
      })
      .catch(async (e: unknown) => {
        const memoire = estTransitoire(e) ? await lire<Programme>(CLE).catch(() => null) : null;
        if (actif && memoire) {
          setProgramme(memoire.valeur);
          setHorsLigne(memoire.maj);
        }
      });
    return () => {
      actif = false;
    };
  }, [client, connecte]);

  if (!programme || programme.etat === 'sans_poste') return null;
  const jour = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, options).format(new Date(`${iso}T12:00:00`));
  const ouvrir = (v: VisiteProgramme) =>
    routeur.push({ pathname: '/visite/[id]', params: { id: v.id, jour: v.date } });
  const aujourdhui = programme.jours.find((j) => j.date === programme.aujourdhui);
  // La prochaine : la première du jour pas encore faite (prd.md §14.22). Elle se recalcule ici :
  // une visite terminée sur le téléphone, même sans réseau, laisse la place à la suivante.
  // La visite en cours la plus récemment démarrée d'abord (une imprévue, par exemple), sinon la
  // première prévue.
  const prochaine =
    aujourdhui?.visites
      .filter((v) => v.statut === 'en_cours')
      .sort((a, b) => (b.debut_le ?? '').localeCompare(a.debut_le ?? ''))[0] ??
    aujourdhui?.visites.find((v) => v.statut === 'prevue') ??
    null;
  const autresJours = programme.jours.filter((j) => j.date > programme.aujourdhui);
  // Restées prévues après leur journée : à justifier (VIS-009 CA1).
  const aJustifier = (programme.a_justifier ?? []).filter((v) => v.statut === 'prevue');

  return (
    <>
      {aJustifier.length > 0 && (
        <Carte style={{ gap: 4 }}>
          <Texte variante="sousTitre">
            {`${t('programme.aJustifier')} (${aJustifier.length})`}
          </Texte>
          <Texte variante="discret">{t('programme.aJustifierNote')}</Texte>
          {aJustifier.map((v) => (
            <Pressable
              key={v.id}
              accessibilityRole="button"
              onPress={() => ouvrir(v)}
              style={({ pressed }) => [
                styles.ligne,
                { borderTopColor: p.ligne },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ gap: 2 }}>
                <Text style={[styles.surTitre, { color: p.attention }]}>
                  {jour(v.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
                <LigneVisite
                  visite={v}
                  jour={{ date: v.date, ferie: null, visites: aJustifier, activites: [] }}
                />
              </View>
            </Pressable>
          ))}
        </Carte>
      )}
      <Carte style={{ gap: 10 }}>
        <View style={{ gap: 2 }}>
          <Texte variante="sousTitre">{t('programme.titre')}</Texte>
          {programme.etat === 'approuve' && aujourdhui && (
            <Texte variante="discret">
              {[
                t('programme.visitesAujourdhui', { count: aujourdhui.visites.length }),
                t('programme.version', { numero: programme.version }),
              ].join(' · ')}
            </Texte>
          )}
        </View>
        {horsLigne && (
          <Alerte type="attention">
            {t('programme.horsLigne', {
              date: new Intl.DateTimeFormat(i18n.language, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(horsLigne)),
            })}
          </Alerte>
        )}
        {programme.etat === 'non_approuve' ? (
          <Texte variante="discret">{t('programme.nonApprouve')}</Texte>
        ) : programme.etat === 'sans_planning' ? (
          <Texte variante="discret">{t('programme.sansPlanning')}</Texte>
        ) : !aujourdhui || aujourdhui.ferie || aujourdhui.visites.length === 0 ? (
          <>
            {aujourdhui?.ferie && (
              <Texte>{t('programme.ferie', { libelle: aujourdhui.ferie })}</Texte>
            )}
            {aujourdhui && <Activites jour={aujourdhui} />}
            <Texte variante="discret">{t('programme.aucuneAujourdhui')}</Texte>
          </>
        ) : (
          <>
            <Activites jour={aujourdhui} />
            {annonce && <Alerte type={annonce.ton}>{annonce.texte}</Alerte>}
            {prochaine ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('programme.prochaine')} : ${libelle(prochaine, t)}`}
                onPress={() => ouvrir(prochaine)}
                style={({ pressed }) => [
                  styles.prochaine,
                  { borderColor: p.info, backgroundColor: p.surface },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.surTitre, { color: p.info }]}>{t('programme.prochaine')}</Text>
                <LigneVisite visite={prochaine} jour={aujourdhui} grande />
              </Pressable>
            ) : null}
            {prochaine ? (
              <ExecutionVisite
                visite={prochaine}
                aujourdhui={programme.aujourdhui}
                geolocalisation={programme.geolocalisation}
                fuseau={programme.fuseau}
                attenteSecondes={programme.attente_gps_secondes}
                motifs={programme.motifs_ecart}
                joursOuvres={joursOuvresDe(programme)}
                semaine={programme.semaine}
                surTerminee={setAnnonce}
              />
            ) : (
              <Texte variante="discret">{t('programme.termine')}</Texte>
            )}
            {aujourdhui.visites
              .filter((v) => v.id !== prochaine?.id)
              .map((v) => (
                <Pressable
                  key={v.id}
                  accessibilityRole="button"
                  onPress={() => ouvrir(v)}
                  style={({ pressed }) => [
                    styles.ligne,
                    { borderTopColor: p.ligne },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <LigneVisite visite={v} jour={aujourdhui} />
                </Pressable>
              ))}
          </>
        )}
        {programme.etat === 'approuve' && aujourdhui && (
          <VisiteImprevue programme={programme} surAnnonce={setAnnonce} />
        )}
      </Carte>
      {programme.etat === 'approuve' && autresJours.length > 0 && (
        <Carte style={{ gap: 4 }}>
          <Texte variante="sousTitre">{t('programme.semaine')}</Texte>
          {autresJours.map((j, i) => (
            <Pressable
              key={j.date}
              accessibilityRole="button"
              onPress={() => routeur.push({ pathname: '/jour/[date]', params: { date: j.date } })}
              style={({ pressed }) => [
                styles.jour,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.ligne },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[styles.titreJour, { color: p.texte }]}>
                  {majuscule(jour(j.date, { weekday: 'long', day: 'numeric' }))}
                </Text>
                <Texte variante="discret">
                  {j.ferie
                    ? t('programme.ferie', { libelle: j.ferie })
                    : [
                        t('programme.visites', { count: j.visites.length }),
                        ...j.activites.map((a) => t(`activites.types.${a.type}`)),
                      ].join(' · ')}
                </Texte>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={p.texteDiscret} />
            </Pressable>
          ))}
        </Carte>
      )}
    </>
  );
}

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);

type Traduire = ReturnType<typeof useTranslation>['t'];

function libelle(v: VisiteProgramme, t: Traduire) {
  return [v.heure, v.prospect ? nomProspect(v.prospect, t) : t('visites.sansProspect')]
    .filter(Boolean)
    .join(' · ');
}

function Activites({ jour }: { jour: JourProgramme }) {
  const { t } = useTranslation();
  if (jour.activites.length === 0) return null;
  return (
    <Texte variante="discret">
      {jour.activites
        .map((a) => `${t(`activites.types.${a.type}`)} · ${t(`activites.periodes.${a.periode}`)}`)
        .join(' ; ')}
    </Texte>
  );
}

function LigneVisite({
  visite,
  jour,
  grande,
}: {
  visite: VisiteProgramme;
  jour: JourProgramme;
  grande?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  // Un passage : plusieurs prescripteurs du même lieu, vus à la suite (PLN-003).
  const confreres = visite.passage
    ? jour.visites.filter((v) => v.passage === visite.passage).length
    : 0;
  return (
    <View style={styles.visite}>
      <Text style={[styles.heure, { color: p.texte }, grande && styles.heureGrande]}>
        {visite.heure ?? '—'}
      </Text>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {visite.prospect && <MarquePotentiel valeur={visite.prospect.potentiel} />}
          <Text
            numberOfLines={1}
            style={[styles.nom, { color: p.texte }, grande && styles.nomGrand]}
          >
            {visite.prospect ? nomProspect(visite.prospect, t) : t('visites.sansProspect')}
          </Text>
        </View>
        {visite.etablissement && (
          <Texte variante="discret" numberOfLines={2}>
            {confreres > 1
              ? t('passages.ligne', { lieu: visite.etablissement.nom, count: confreres })
              : visite.etablissement.nom}
          </Texte>
        )}
        {grande && visite.objectif ? <Texte>{visite.objectif}</Texte> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {/* En tête, « En cours depuis … » le dit déjà sous la carte. */}
          {visite.statut !== 'prevue' && !(grande && visite.statut === 'en_cours') && (
            <Etiquette ton={visite.statut === 'effectuee' ? 'succes' : 'attention'}>
              {visite.statut === 'reportee' && visite.report
                ? t('execution.reporteeAu', {
                    jour: [
                      new Intl.DateTimeFormat(i18n.language, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      }).format(new Date(`${visite.report.date}T12:00:00Z`)),
                      visite.report.heure,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  })
                : visite.motif_ecart
                  ? t('execution.ecartLu', {
                      statut: t(`visites.statuts.${visite.statut}`),
                      motif: visite.motif_ecart.libelle,
                    })
                  : t(`visites.statuts.${visite.statut}`)}
            </Etiquette>
          )}
          {visite.modification_en_attente && <Etiquette>{t('programme.enAttente')}</Etiquette>}
          {visite.est_imprevue && <Etiquette ton="neutre">{t('visites.imprevue')}</Etiquette>}
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={p.texteDiscret} />
    </View>
  );
}

const styles = StyleSheet.create({
  prochaine: { borderWidth: 1.5, borderRadius: 12, padding: 12, gap: 6 },
  surTitre: { fontFamily: police.texteFort, fontSize: 13, textTransform: 'uppercase' },
  ligne: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  visite: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heure: { fontFamily: police.texteFort, fontSize: 15, width: 52 },
  heureGrande: { fontSize: 18 },
  nom: { fontFamily: police.texteFort, fontSize: 15, flexShrink: 1 },
  nomGrand: { fontSize: 17 },
  jour: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, minHeight: 56 },
  titreJour: { fontFamily: police.texteFort, fontSize: 15 },
});
