/**
 * Poser des prospects de la liste cible sur un jour (PLN-005 CA1) : le délégué coche les
 * prospects, choisit le jour, et chacun devient une visite pré-remplie (prospect, établissement
 * principal). Sur téléphone, le glisser-déposer d'une longue liste vers une semaine qui défile
 * serait malcommode : on coche puis on pose [H].
 */
import type { ListeCible, Semaine } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { lire } from './baseLocale';
import { Alerte, Bouton, Champ, Texte } from './composants';
import { Pilule } from './Etablissements';
import { messageErreur, useSession } from './session';
import { type Choix, depuisCible, LigneChoix, normaliser } from './Visites';

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
  const { client } = useSession();
  // Une journée entière d'absence ne reçoit pas de visite (PLN-009).
  const absents = new Set(
    semaine.absences.filter((a) => a.periode === 'journee').map((a) => a.date),
  );
  const jours = semaine.jours.filter((j) => j.planifiable && !absents.has(j.date));
  const [jour, setJour] = useState(
    jours.some((j) => j.date === jourInitial) ? jourInitial : (jours[0]?.date ?? jourInitial),
  );
  const [cibles, setCibles] = useState<Choix[] | null>(null);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [saisie, setSaisie] = useState('');
  const [potentiel, setPotentiel] = useState<string | null>(null);
  const [nouveaux, setNouveaux] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    client.ciblage
      .mesListes()
      .catch(async () => (await lire<ListeCible[]>('ciblage.moi').catch(() => null))?.valeur ?? [])
      .then((listes) => {
        if (!actif) return;
        // Un prospect sur deux postes n'apparaît qu'une fois.
        const vus = new Map<string, Choix>();
        for (const c of listes.flatMap((l) => l.cibles)) vus.set(c.prospect.id, depuisCible(c));
        setCibles([...vus.values()]);
      });
    return () => {
      actif = false;
    };
  }, [client]);

  const libelleJour = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, options).format(new Date(`${iso}T12:00:00`));
  // Jours de la semaine où chaque prospect est déjà prévu.
  const prevus = new Map<string, string[]>();
  for (const v of semaine.visites) {
    if (!v.prospect) continue;
    prevus.set(v.prospect.id, [...(prevus.get(v.prospect.id) ?? []), v.date]);
  }
  const filtre = normaliser(saisie.trim());
  const retenus = (cibles ?? []).filter(
    (c) =>
      (!potentiel || c.potentiel === potentiel) &&
      (!nouveaux || !prevus.has(c.id) || choisis.includes(c.id)) &&
      normaliser(`${c.prenom ?? ''} ${c.nom} ${c.prenom ?? ''} ${c.detail}`).includes(filtre),
  );
  const basculer = (id: string) =>
    setChoisis((avant) => (avant.includes(id) ? avant.filter((x) => x !== id) : [...avant, id]));
  const jourLong = libelleJour(jour, { weekday: 'long', day: 'numeric' });

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
    />
  );

  return (
    <View style={{ gap: 16 }}>
      <Texte variante="sousTitre">{t('pose.titre')}</Texte>
      <Texte variante="discret">{t('pose.aide')}</Texte>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}

      <View style={{ gap: 8 }}>
        <Texte variante="libelle">{t('pose.jour')}</Texte>
        <View style={styles.pilules}>
          {jours.map((j) => (
            <Pilule
              key={j.date}
              libelle={libelleJour(j.date, { weekday: 'short', day: 'numeric' })}
              actif={jour === j.date}
              onPress={() => setJour(j.date)}
            />
          ))}
        </View>
      </View>
      {bouton}

      <View style={{ gap: 8 }}>
        <Champ
          libelle={t('visites.chercherProspect')}
          libelleMasque
          placeholder={t('visites.chercherProspect')}
          value={saisie}
          onChangeText={setSaisie}
          autoCorrect={false}
          returnKeyType="search"
        />
        <View style={styles.pilules}>
          {(['A', 'B', 'C'] as const).map((v) => (
            <Pilule
              key={v}
              libelle={v}
              actif={potentiel === v}
              onPress={() => setPotentiel(potentiel === v ? null : v)}
            />
          ))}
          <Pilule
            libelle={t('pose.nonPrevus')}
            actif={nouveaux}
            onPress={() => setNouveaux(!nouveaux)}
          />
        </View>
      </View>

      {!cibles ? (
        <Texte variante="discret">{t('session.chargement')}</Texte>
      ) : cibles.length === 0 ? (
        <Texte variante="discret">{t('ciblage.mobile.sansPoste')}</Texte>
      ) : retenus.length === 0 ? (
        <Texte variante="discret">{t('pose.aucun')}</Texte>
      ) : (
        <View style={{ gap: 8 }}>
          {retenus.map((c) => {
            const deja = prevus.get(c.id);
            return (
              <LigneChoix
                key={c.id}
                choix={c}
                choisi={choisis.includes(c.id)}
                note={
                  deja
                    ? t('pose.dejaPrevu', {
                        jours: deja
                          .map((d) => libelleJour(d, { weekday: 'short', day: 'numeric' }))
                          .join(', '),
                      })
                    : undefined
                }
                onPress={() => basculer(c.id)}
              />
            );
          })}
        </View>
      )}
      {retenus.length > 6 && bouton}
      <Bouton secondaire libelle={t('commun.annuler')} onPress={surAnnuler} />
    </View>
  );
}

const styles = StyleSheet.create({
  pilules: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
