/**
 * « Ma semaine » sur l'accueil du délégué (0.2.9) : où en sont cette semaine et la suivante,
 * avec l'échéance à tenir (RG-013). Chaque ligne ouvre la semaine dans l'onglet Semaine.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Semaine } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Carte, Texte, usePalette } from './composants';
import { police } from './polices';
import { useSession } from './session';
import { dateHeure } from './Soumission';

/** « En préparation · 6 visites », « À préparer », ou rien de prévu. */
export function etatDeLaSemaine(s: Semaine, t: ReturnType<typeof useTranslation>['t']) {
  if (!s.planning) return s.peut_creer ? t('accueil.aPreparer') : t('accueil.rienDePrevu');
  return `${t(`semaine.statuts.${s.planning.statut}`)} · ${t('accueil.visites', {
    count: s.visites.length,
  })}`;
}

export function MaSemaine() {
  const { t } = useTranslation();
  const { client, etat } = useSession();
  const [semaines, setSemaines] = useState<Semaine[] | null>(null);
  const connecte = etat.statut === 'connecte';

  useEffect(() => {
    if (!connecte) return;
    let actif = true;
    Promise.resolve()
      .then(() => client.plannings.semaine())
      .then(async (courante) => [courante, await client.plannings.semaine(courante.suivante)])
      .then((s) => {
        if (actif) setSemaines(s);
      })
      // Sans réseau, l'onglet Semaine garde la dernière semaine lue : la carte se tait.
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [client, connecte]);

  if (!semaines) return null;
  const [courante, suivante] = semaines as [Semaine, Semaine];
  return (
    <Carte style={{ gap: 4 }}>
      <Texte variante="sousTitre">{t('accueil.semaine')}</Texte>
      <LigneSemaine
        titre={t('accueil.cetteSemaine')}
        semaine={courante}
        etat={etatDeLaSemaine(courante, t)}
      />
      <LigneSemaine
        titre={t('accueil.semaineProchaine')}
        semaine={suivante}
        etat={etatDeLaSemaine(suivante, t)}
        derniere
      />
    </Carte>
  );
}

function LigneSemaine({
  titre,
  semaine,
  etat,
  derniere,
}: {
  titre: string;
  semaine: Semaine;
  etat: string;
  derniere?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const planning = semaine.planning;
  const echeance =
    planning && semaine.modifiable
      ? t(
          new Date(planning.echeance) < new Date()
            ? 'soumission.echeancePassee'
            : 'soumission.echeance',
          { date: dateHeure(planning.echeance, i18n.language, semaine.fuseau) },
        )
      : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => routeur.push({ pathname: '/semaine', params: { jour: semaine.semaine } })}
      style={({ pressed }) => [
        styles.ligne,
        !derniere && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.ligne },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[styles.titre, { color: p.texte }]}>{titre}</Text>
        <Texte variante="discret">{etat}</Texte>
        {echeance && <Texte variante="discret">{echeance}</Texte>}
      </View>
      <MaterialIcons name="chevron-right" size={22} color={p.texteDiscret} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, minHeight: 56 },
  titre: { fontFamily: police.texteFort, fontSize: 15 },
});
