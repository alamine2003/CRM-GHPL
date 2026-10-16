/**
 * « Depuis ma liste cible » (PLN-005 CA1), selon la maquette 1.4.6 : le délégué coche les
 * prospects pas encore prévus cette semaine, et chacun devient une visite pré-remplie
 * (prospect, établissement principal) sur le jour choisi. Sur téléphone, le glisser-déposer
 * d'une longue liste vers une semaine qui défile serait malcommode : on coche puis on pose [H].
 * Sur la tablette, le jour se choisit à droite, avec ce que la pose fait à l'objectif du jour.
 */
import type { ListeCible, Semaine } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lire } from './baseLocale';
import {
  Alerte,
  Bouton,
  Carte,
  ChampRecherche,
  Chiffres,
  MarquePotentiel,
  Segments,
  Texte,
  usePalette,
} from './composants';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { nomProspect } from './Fiches';
import { police } from './polices';
import { messageErreur, useSession } from './session';
import { type Choix, depuisCible, normaliser } from './Visites';

const majuscule = (x: string) => x.charAt(0).toLocaleUpperCase() + x.slice(1);

type Cible = Choix & { faites: number | null; frequence: number };

export function PoserDepuisCible({
  semaine,
  jour: jourInitial,
  surTermine,
  surAnnuler,
}: {
  semaine: Semaine;
  jour: string;
  surTermine: (message: string) => void;
  surAnnuler: () => void;
}) {
  const { t, i18n } = useTranslation();
  const tablette = useTablette();
  const { client } = useSession();
  // Une journée entière d'absence ne reçoit pas de visite (PLN-009).
  const absents = new Set(
    semaine.activites.filter((a) => a.periode === 'journee').map((a) => a.date),
  );
  const jours = semaine.jours.filter((j) => j.planifiable && !absents.has(j.date));
  const [jour, setJour] = useState(
    jours.some((j) => j.date === jourInitial) ? jourInitial : (jours[0]?.date ?? jourInitial),
  );
  const [cibles, setCibles] = useState<Cible[] | null>(null);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [saisie, setSaisie] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    client.ciblage
      .mesListes()
      .catch(async () => (await lire<ListeCible[]>('ciblage.moi').catch(() => null))?.valeur ?? [])
      .then((listes) => {
        if (!actif) return;
        // Un prospect sur deux postes n'apparaît qu'une fois, à sa plus forte fréquence.
        const vus = new Map<string, Cible>();
        for (const c of listes.flatMap((l) => l.cibles)) {
          const avant = vus.get(c.prospect.id);
          if (avant && avant.frequence >= c.frequence) continue;
          vus.set(c.prospect.id, {
            ...depuisCible(c),
            faites: c.visites_cycle ?? null,
            frequence: c.frequence,
          });
        }
        setCibles([...vus.values()]);
      });
    return () => {
      actif = false;
    };
  }, [client]);

  const libelleJour = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, options).format(new Date(`${iso}T12:00:00`));
  // Les prospects déjà prévus cette semaine ne se reposent pas d'ici (la visite se copie).
  const prevus = new Set(semaine.visites.map((v) => v.prospect?.id).filter(Boolean));
  const aPoser = (cibles ?? []).filter((c) => !prevus.has(c.id));
  const filtre = normaliser(saisie.trim());
  const retenus = aPoser.filter((c) =>
    normaliser(`${c.prenom ?? ''} ${c.nom} ${c.prenom ?? ''} ${c.detail}`).includes(filtre),
  );
  const basculer = (id: string) =>
    setChoisis((avant) => (avant.includes(id) ? avant.filter((x) => x !== id) : [...avant, id]));
  const jourLong = libelleJour(jour, { weekday: 'long', day: 'numeric' });
  const deja = semaine.visites.filter((v) => v.date === jour).length;
  const apres = deja + choisis.length;
  const objectif = semaine.controles?.objectifs.find((o) => o.date === jour);

  async function poser() {
    if (!semaine.planning || choisis.length === 0) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await client.plannings.poser(semaine.planning.id, jour, choisis);
      surTermine(t('pose.posees', { count: choisis.length, jour: jourLong }));
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
      setEnvoi(false);
    }
  }

  const bouton = (
    <Bouton
      libelle={
        choisis.length
          ? t('pose.poser', { count: choisis.length, jour: jourLong })
          : t('pose.choisir')
      }
      chargement={envoi}
      desactive={choisis.length === 0}
      onPress={() => void poser()}
      style={tablette ? { alignSelf: 'stretch' } : { flex: 1 }}
    />
  );
  const recherche = (
    <ChampRecherche
      libelle={t('pose.chercher')}
      placeholder={t('pose.chercher')}
      value={saisie}
      onChangeText={setSaisie}
      style={tablette ? { width: 300 } : undefined}
    />
  );

  const liste = !cibles ? (
    <Texte variante="discret" style={styles.vide}>
      {t('session.chargement')}
    </Texte>
  ) : cibles.length === 0 ? (
    <Texte variante="discret" style={styles.vide}>
      {t('ciblage.mobile.sansPoste')}
    </Texte>
  ) : retenus.length === 0 ? (
    <Texte variante="discret" style={styles.vide}>
      {t('pose.aucun')}
    </Texte>
  ) : (
    retenus.map((c, i) => (
      <LigneCoche
        key={c.id}
        cible={c}
        coche={choisis.includes(c.id)}
        cycle={tablette}
        derniere={i === retenus.length - 1}
        surAppui={() => basculer(c.id)}
      />
    ))
  );

  // Tablette : le jour, ce qu'il compte déjà et ce qu'il comptera, l'objectif du jour.
  const poserSurUnJour = (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Texte variante="sousTitre" accessibilityRole="header">
        {t('pose.surUnJour')}
      </Texte>
      <Texte variante="libelle">{t('pose.aide')}</Texte>
      <Segments
        libelle={t('pose.jour')}
        options={jours.map((j) => ({
          cle: j.date,
          libelle: majuscule(
            libelleJour(j.date, { weekday: 'short', day: 'numeric' }).replace('.', ''),
          ),
          lu: libelleJour(j.date, { weekday: 'long', day: 'numeric' }),
        }))}
        valeur={jour}
        surChoix={setJour}
      />
      <Chiffres
        valeurs={[
          { libelle: t('pose.dejaPrevues'), valeur: String(deja) },
          { libelle: t('pose.apres'), valeur: String(apres) },
        ]}
      />
      {objectif && (
        <Alerte type={apres >= objectif.max ? 'attention' : 'info'}>
          {[
            t('pose.objectif', { min: objectif.min, max: objectif.max }),
            apres > objectif.max
              ? t('pose.auDela')
              : apres === objectif.max
                ? t('pose.limiteHaute')
                : apres < objectif.min
                  ? t('pose.manque', { count: objectif.min - apres })
                  : '',
          ]
            .filter(Boolean)
            .join(' ')}
        </Alerte>
      )}
      <View style={{ flex: 1 }} />
      {bouton}
    </View>
  );

  return (
    <Ecran
      titre={t('pose.titre')}
      surTitre={cibles ? t('pose.nombre', { count: aPoser.length }) : undefined}
      retour
      surRetour={surAnnuler}
      onglets={false}
      enteteTablette={{ action: recherche }}
      pied={tablette ? undefined : bouton}
      droite={tablette ? poserSurUnJour : undefined}
      largeurDroite={380}
    >
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      {!tablette && <Texte variante="libelle">{t('pose.aideCourte')}</Texte>}
      {!tablette && recherche}
      <Carte marge={0}>{liste}</Carte>
    </Ecran>
  );
}

/** Une ligne à cocher (role checkbox) : case de 22 px, potentiel, nom, lieu ; cycle sur tablette. */
function LigneCoche({
  cible: c,
  coche,
  cycle,
  derniere,
  surAppui,
}: {
  cible: Cible;
  coche: boolean;
  cycle: boolean;
  derniere: boolean;
  surAppui: () => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const nom = nomProspect(c, t);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: coche }}
      accessibilityLabel={[nom, c.detail].filter(Boolean).join(', ')}
      onPress={surAppui}
      style={({ pressed }) => [
        styles.ligne,
        !derniere && { borderBottomWidth: 1, borderBottomColor: p.ligne },
        pressed && { backgroundColor: p.fond },
      ]}
    >
      <View
        style={[
          styles.case,
          coche
            ? { backgroundColor: p.accentPlein, borderColor: p.accentPlein }
            : { borderColor: p.texteDiscret },
        ]}
      >
        {coche ? <Text style={[styles.coche, { color: p.accentTexte }]}>✓</Text> : null}
      </View>
      <MarquePotentiel valeur={c.potentiel as 'A' | 'B' | 'C'} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={[styles.nom, { color: p.texte }]}>
          {nom}
        </Text>
        {c.detail ? (
          <Text numberOfLines={1} style={[styles.meta, { color: p.texteSecondaire }]}>
            {c.detail}
          </Text>
        ) : null}
      </View>
      {cycle && (
        <Text style={[styles.cycle, { color: p.texte }]}>
          {c.faites === null
            ? t('ciblage.parCycle', { count: c.frequence })
            : t('mobile.prospects.cycle', { faites: c.faites, frequence: c.frequence })}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  vide: { padding: 16 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  case: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coche: { fontFamily: police.texteGras, fontSize: 14, lineHeight: 16 },
  nom: { fontFamily: police.texteGras, fontSize: 15.5, lineHeight: 21 },
  meta: { fontFamily: police.texte, fontSize: 13, lineHeight: 18 },
  cycle: { fontFamily: police.texteFort, fontSize: 13, fontVariant: ['tabular-nums'] },
});
