/**
 * Mes chiffres (DSH-001), selon la maquette 1.4.8 : les indicateurs du délégué pour une semaine,
 * comparés à la précédente, et la couverture de sa liste cible sur le cycle de visites. Le
 * téléphone garde les derniers chiffres lus et les affiche sans réseau, avec l'heure de leur
 * calcul (CA1). Sur la tablette : la synthèse en quatre chiffres, les visites par jour à côté de
 * la qualité de l'activité, puis la liste cible.
 *
 * Aucun score, aucune appréciation, aucun classement (DC-49) : des comptages et des taux bornés
 * à 100 %, chacun avec ce qu'il compte (« 1 sur 3 »).
 */
import type { MesChiffres } from '@innov/api-client';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { lire, ecrire } from './baseLocale';
import { estTransitoire } from './Brouillons';
import { Alerte, Bouton, BoutonIcone, Carte, Chiffres, Texte, usePalette } from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
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

const majuscule = (x: string) => x.charAt(0).toLocaleUpperCase() + x.slice(1);

/** Variation d'un taux par rapport à la semaine précédente, en points. */
export function ecartPoints(actuel: number | null, avant: number | null): number | null {
  if (actuel === null || avant === null) return null;
  return Math.round((actuel - avant) * 100);
}

export function EcranMesChiffres() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const tablette = useTablette();
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

  const titre = t('mobile.onglets.chiffres');
  if (!chiffres) {
    return (
      <Ecran titre={titre}>
        <Texte variante="discret">
          {indisponible ? t('chiffres.indisponible') : t('session.chargement')}
        </Texte>
        {indisponible && lundi !== null && (
          <Bouton secondaire libelle={t('chiffres.revenir')} onPress={() => setLundi(null)} />
        )}
      </Ecran>
    );
  }

  const pourcent = new Intl.NumberFormat(i18n.language, { style: 'percent' });
  const taux = (x: number | null) => (x === null ? '—' : pourcent.format(x));
  const jourCourt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const date = (iso: string) => jourCourt.format(new Date(`${iso}T12:00:00Z`));
  const jourMois = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' });
  const jourSeul = new Intl.DateTimeFormat(i18n.language, { day: 'numeric' });

  const s = chiffres.semaine;
  const avant = chiffres.precedente;
  const cycle = chiffres.cycle;
  const calcule = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(chiffres.calcule_le));
  // « Semaine du 5 au 11 octobre » ; à cheval sur deux mois, chaque date garde le sien.
  const debut = new Date(`${s.debut}T12:00:00Z`);
  const fin = new Date(`${s.fin}T12:00:00Z`);
  const semaine = t('chiffres.semaine', {
    debut: (debut.getUTCMonth() === fin.getUTCMonth() ? jourSeul : jourMois).format(debut),
    fin: jourMois.format(fin),
  });

  const fleches = (
    <View style={{ flexDirection: 'row', gap: 16 }}>
      <BoutonIcone
        icone="chevron-left"
        libelle={t('chiffres.precedente')}
        onPress={() => setLundi(avant.debut)}
      />
      <BoutonIcone
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
  );

  const realisation = ecartPoints(s.taux.realisation, avant.taux.realisation);
  const qualite = [
    {
      libelle: t('chiffres.realisation'),
      detail: t('chiffres.surPrevues', {
        n: s.visites.effectuees_prevues,
        count: s.visites.echues,
      }),
      valeur: s.taux.realisation,
      // Sur la tablette, l'écart de la réalisation est dans la synthèse.
      ecart: tablette ? null : realisation,
    },
    {
      libelle: t('chiffres.ecartsJustifies'),
      detail: t('chiffres.surEcarts', { n: s.visites.ecarts_justifies, count: s.visites.ecarts }),
      valeur: s.taux.ecarts_justifies,
      ecart: null,
    },
    {
      libelle: t('chiffres.geolocalisation'),
      detail: t('chiffres.surFaites', { n: s.visites.geolocalisees, count: s.visites.effectuees }),
      valeur: s.taux.geolocalisation,
      ecart: ecartPoints(s.taux.geolocalisation, avant.taux.geolocalisation),
    },
  ];
  const lignesQualite = qualite.map((q, i) => (
    <View
      key={q.libelle}
      style={[
        styles.ligne,
        i < qualite.length - 1 && { borderBottomWidth: 1, borderBottomColor: p.ligne },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.nom, { color: p.texte }]}>
          {q.libelle}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: p.texteSecondaire }]}>
          {q.detail}
        </Text>
        <Barre valeur={q.valeur} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Texte variante="nombre">{taux(q.valeur)}</Texte>
        <Ecart points={q.ecart} />
      </View>
    </View>
  ));

  const suivi = (
    <>
      {s.visites.a_venir > 0 && (
        <Texte variante="discret">{t('chiffres.aVenir', { count: s.visites.a_venir })}</Texte>
      )}
      {s.visites.a_justifier > 0 && (
        <Alerte type="attention">
          {t('chiffres.aJustifier', { count: s.visites.a_justifier })}
        </Alerte>
      )}
    </>
  );

  const c = cycle.couverture;
  const couverture = [
    { libelle: t('chiffres.listeVisitee'), n: c.visitees, total: c.cibles },
    { libelle: t('chiffres.abVus'), n: c.visitees_ab, total: c.cibles_ab },
    { libelle: t('chiffres.abFrequence'), n: c.frequence_ab, total: c.cibles_ab },
  ];
  const enTeteListe = (
    <View style={tablette ? { minWidth: 190 } : undefined}>
      <Texte variante="sousTitre" accessibilityRole="header">
        {t('chiffres.couverture')}
      </Texte>
      <Texte variante="libelle">
        {t('chiffres.cycle', {
          count: cycle.semaines,
          debut: date(cycle.debut),
          fin: date(cycle.fin),
        })}
      </Texte>
    </View>
  );
  const listeCible =
    c.cibles === 0 ? (
      <Carte>
        {enTeteListe}
        <Texte variante="discret" style={{ marginTop: 8 }}>
          {t('chiffres.sansListe')}
        </Texte>
      </Carte>
    ) : tablette ? (
      <Carte style={{ flexDirection: 'row', alignItems: 'center', gap: 32 }}>
        {enTeteListe}
        {couverture.map((x) => (
          <View key={x.libelle} style={{ flex: 1 }}>
            <Texte variante="libelle">{x.libelle}</Texte>
            <Texte variante="nombre">{t('chiffres.surCibles', x)}</Texte>
          </View>
        ))}
      </Carte>
    ) : (
      <Carte marge={0}>
        <View style={[styles.enTeteCarte, { borderBottomColor: p.ligne }]}>{enTeteListe}</View>
        {couverture.map((x, i) => (
          <View
            key={x.libelle}
            style={[
              styles.ligne,
              i < couverture.length - 1 && { borderBottomWidth: 1, borderBottomColor: p.ligne },
            ]}
          >
            <Text style={[styles.nom, { color: p.texte, flex: 1 }]}>{x.libelle}</Text>
            <Texte variante="nombre">{t('chiffres.surCibles', x)}</Texte>
          </View>
        ))}
      </Carte>
    );

  const visites = (
    <View style={styles.visites}>
      <Text style={[styles.grand, { color: p.texte }]}>{s.visites.effectuees}</Text>
      <View style={{ paddingBottom: 4 }}>
        <Texte variante="fort">
          {t('chiffres.visitesFaites', { count: s.visites.effectuees })}
        </Texte>
        <Texte variante="libelle">
          {s.visites.imprevues
            ? t('chiffres.dontImprevues', { count: s.visites.imprevues })
            : t('chiffres.toutesPrevues')}
        </Texte>
      </View>
    </View>
  );

  const aucuneActivite = (
    <Carte>
      <Texte variante="fort">{t('chiffres.aucuneActivite')}</Texte>
      <Texte variante="discret">{t('chiffres.aucuneActiviteDetail')}</Texte>
    </Carte>
  );
  const alerteHorsLigne = horsLigne && (
    <Alerte type="attention">{t('chiffres.horsLigne', { date: calcule })}</Alerte>
  );

  if (tablette) {
    return (
      <Ecran
        titre={titre}
        surTitre={semaine}
        action={fleches}
        enteteTablette={{ surTitre: `${semaine} · ${t('chiffres.sansNote')}` }}
      >
        {alerteHorsLigne}
        {!s.activite ? (
          aucuneActivite
        ) : (
          <>
            <Carte marge={0} style={{ flexDirection: 'row' }}>
              <Synthese
                libelle={t('chiffres.visitesFaitesTitre')}
                valeur={String(s.visites.effectuees)}
              >
                <Texte variante="libelle">
                  {s.visites.imprevues
                    ? t('chiffres.dontImprevues', { count: s.visites.imprevues })
                    : t('chiffres.toutesPrevues')}
                </Texte>
              </Synthese>
              <Synthese libelle={t('chiffres.realisation')} valeur={taux(s.taux.realisation)}>
                <Ecart points={realisation} />
              </Synthese>
              <Synthese
                libelle={t('chiffres.rapportsDansLeDelai')}
                valeur={taux(s.taux.rapports_dans_delai)}
              >
                <Texte variante="libelle">
                  {t('chiffres.validesCompte', { count: s.rapports.valides })}
                </Texte>
              </Synthese>
              <Synthese
                libelle={t('chiffres.enRetardTitre')}
                valeur={String(s.rapports.en_retard)}
                couleur={s.rapports.en_retard > 0 ? p.orange : undefined}
                derniere
              >
                {s.rapports.en_retard > 0 && (
                  <Texte variante="libelle">{t('chiffres.aSoumettre')}</Texte>
                )}
              </Synthese>
            </Carte>
            {suivi}
            <View style={{ flexDirection: 'row', gap: 18, alignItems: 'stretch' }}>
              <Carte style={{ flex: 3, gap: 14 }}>
                <Texte variante="sousTitre" accessibilityRole="header">
                  {t('chiffres.parJour')}
                </Texte>
                <Histogramme jours={chiffres.jours} hauteur={200} long />
              </Carte>
              <Carte marge={0} style={{ flex: 2 }}>
                <Texte
                  variante="sousTitre"
                  accessibilityRole="header"
                  style={[styles.titreCarte, { borderBottomColor: p.ligne }]}
                >
                  {t('chiffres.qualite')}
                </Texte>
                {lignesQualite}
              </Carte>
            </View>
          </>
        )}
        {listeCible}
      </Ecran>
    );
  }

  return (
    <Ecran titre={titre} surTitre={semaine} action={fleches}>
      {alerteHorsLigne}
      {!s.activite ? (
        aucuneActivite
      ) : (
        <>
          <Carte style={{ gap: 14 }}>
            {visites}
            <Histogramme jours={chiffres.jours} hauteur={120} />
          </Carte>
          <Carte marge={0}>{lignesQualite}</Carte>
          {suivi}
          <Chiffres
            valeurs={[
              { libelle: t('chiffres.dansLeDelai'), valeur: taux(s.taux.rapports_dans_delai) },
              { libelle: t('chiffres.valides'), valeur: String(s.rapports.valides) },
              {
                libelle: t('chiffres.enRetard'),
                valeur: String(s.rapports.en_retard),
                couleur: s.rapports.en_retard > 0 ? p.orange : undefined,
              },
            ]}
          />
        </>
      )}
      {listeCible}
    </Ecran>
  );
}

/** Une case de la synthèse de la tablette : libellé, grand chiffre, précision. */
function Synthese({
  libelle,
  valeur,
  couleur,
  derniere,
  children,
}: {
  libelle: string;
  valeur: string;
  couleur?: string;
  derniere?: boolean;
  children?: ReactNode;
}) {
  const p = usePalette();
  return (
    <View
      style={[styles.synthese, !derniere && { borderRightWidth: 1, borderRightColor: p.ligne }]}
    >
      <Texte variante="libelle" numberOfLines={1}>
        {libelle}
      </Texte>
      <Text style={[styles.grand, { color: couleur ?? p.texte }]}>{valeur}</Text>
      {children}
    </View>
  );
}

/** « ● +3 pts » : en vert quand le taux monte, en gris sinon (aucune appréciation, DC-49). */
function Ecart({ points }: { points: number | null }) {
  const { t } = useTranslation();
  const p = usePalette();
  if (points === null || points === 0) return null;
  const couleur = points > 0 ? p.succes : p.texteSecondaire;
  return (
    <View style={styles.ecart}>
      <View style={[styles.puce, { backgroundColor: couleur }]} />
      <Text style={[styles.ecartTexte, { color: couleur }]}>
        {t('chiffres.ecartPoints', { count: Math.abs(points), signe: points > 0 ? '+' : '−' })}
      </Text>
    </View>
  );
}

/** Barre de 6 px remplie à proportion du taux (.bar). */
function Barre({ valeur }: { valeur: number | null }) {
  const p = usePalette();
  return (
    <View style={[styles.barre, { backgroundColor: p.ligne }]}>
      <View
        style={{
          width: `${Math.min(100, Math.round((valeur ?? 0) * 100))}%`,
          height: '100%',
          backgroundColor: p.accentPlein,
        }}
      />
    </View>
  );
}

/**
 * Visites prévues (gris) et faites (orange) jour par jour, sans axe : la barre grise mesure le
 * prévu, l'orange le fait, posée dessus ; une visite imprévue peut la dépasser.
 */
function Histogramme({
  jours,
  hauteur,
  long,
}: {
  jours: MesChiffres['jours'];
  hauteur: number;
  /** Tablette : « Lun » plutôt que « L ». */
  long?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const nom = new Intl.DateTimeFormat(i18n.language, { weekday: long ? 'short' : 'narrow' });
  // Le dimanche ne s'affiche que s'il compte une visite, comme dans la maquette (six jours).
  const visibles = jours.filter(
    (j) => j.prevues + j.effectuees > 0 || new Date(`${j.date}T12:00:00Z`).getUTCDay() !== 0,
  );
  const max = Math.max(1, ...visibles.map((j) => Math.max(j.prevues, j.effectuees)));
  // La place des libellés (18 px et l'espace de 6 px) se retire de la hauteur des barres.
  const echelle = (hauteur - 24) / max;
  return (
    <>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={visibles.map((j) => t('chiffres.jourCourbe', j)).join(', ')}
        style={[styles.histogramme, { height: hauteur }]}
      >
        {visibles.map((j) => (
          <View key={j.date} style={styles.colonne}>
            <View style={{ width: '100%', height: Math.max(j.prevues, j.effectuees) * echelle }}>
              <View
                style={[styles.baton, { height: j.prevues * echelle, backgroundColor: p.ligne }]}
              />
              <View
                style={[
                  styles.baton,
                  { height: j.effectuees * echelle, backgroundColor: p.orange },
                ]}
              />
            </View>
            <Texte variante="libelle">
              {majuscule(nom.format(new Date(`${j.date}T12:00:00Z`)).replace('.', ''))}
            </Texte>
          </View>
        ))}
      </View>
      <View style={styles.legende}>
        <View style={styles.ecart}>
          <View style={[styles.puce, { backgroundColor: p.texteDiscret }]} />
          <Texte variante="libelle">{t('chiffres.prevues')}</Texte>
        </View>
        <View style={styles.ecart}>
          <View style={[styles.puce, { backgroundColor: p.orange }]} />
          <Texte variante="libelle" style={{ color: p.texte }}>
            {t('chiffres.faites')}
          </Texte>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  visites: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  grand: { fontFamily: police.titreFort, fontSize: 34, lineHeight: 38, letterSpacing: -0.7 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  nom: { fontFamily: police.texteFort, fontSize: 15, lineHeight: 21 },
  meta: { fontFamily: police.texte, fontSize: 13, lineHeight: 18 },
  barre: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  ecart: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ecartTexte: { fontFamily: police.texteMoyen, fontSize: 12.5, lineHeight: 18 },
  puce: { width: 8, height: 8, borderRadius: 4 },
  histogramme: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  colonne: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  baton: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  legende: { flexDirection: 'row', gap: 16 },
  synthese: { flex: 1, minWidth: 0, paddingVertical: 14, paddingHorizontal: 16, gap: 2 },
  enTeteCarte: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  titreCarte: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1 },
});
