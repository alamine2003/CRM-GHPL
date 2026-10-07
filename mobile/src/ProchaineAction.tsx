/**
 * RPT-006 : la prochaine action du rapport — un type (liste du pays), une précision, une
 * échéance facultative et, au besoin, la proposition d'une nouvelle visite.
 */
import type { Rapport } from '@innov/api-client';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';
import { Champ, Texte, usePalette } from './composants';
import { Pilule } from './Etablissements';

export type SaisieAction = {
  prochaine_action: string;
  prochaine_action_type: string | null;
  prochaine_action_echeance: string | null;
  visite_proposee: boolean;
};

/** Échéances proposées, en jours après la visite. */
const DELAIS = [7, 14, 30] as const;

function plus(jour: string, jours: number) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

export function ProchaineAction({
  rapport,
  saisie,
  jourVisite,
  surChangement,
}: {
  rapport: Rapport;
  saisie: SaisieAction;
  /** Jour de la visite (AAAA-MM-JJ) : les échéances partent de là. */
  jourVisite: string;
  surChangement: (champs: Partial<SaisieAction>) => void;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const echeances = DELAIS.map((n) => ({ n, date: plus(jourVisite, n) }));
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T12:00:00Z`));
  const autre =
    saisie.prochaine_action_echeance &&
    !echeances.some((e) => e.date === saisie.prochaine_action_echeance)
      ? saisie.prochaine_action_echeance
      : null;

  return (
    <View style={{ gap: 8 }}>
      <Texte variante="sousTitre">{t('rapport.prochaineAction')}</Texte>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {rapport.types_action_proposes.map((x) => (
          <Pilule
            key={x.id}
            libelle={x.libelle}
            actif={saisie.prochaine_action_type === x.id}
            onPress={() =>
              surChangement({
                prochaine_action_type: saisie.prochaine_action_type === x.id ? null : x.id,
              })
            }
          />
        ))}
      </View>
      <View style={{ marginTop: 6 }}>
        <Champ
          libelle={t('rapport.prochaineActionPrecision')}
          placeholder={t('rapport.prochaineActionIndice')}
          value={saisie.prochaine_action}
          onChangeText={(prochaine_action) => surChangement({ prochaine_action })}
          maxLength={500}
          multiline
        />
      </View>
      <Texte variante="libelle" style={{ marginTop: 6 }}>
        {t('rapport.echeance')}
      </Texte>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pilule
          libelle={t('rapport.sansEcheance')}
          actif={!saisie.prochaine_action_echeance}
          onPress={() => surChangement({ prochaine_action_echeance: null })}
        />
        {echeances.map((e) => (
          <Pilule
            key={e.n}
            libelle={t(`rapport.delais.${e.n}`)}
            actif={saisie.prochaine_action_echeance === e.date}
            onPress={() => surChangement({ prochaine_action_echeance: e.date })}
          />
        ))}
        {autre && <Pilule libelle={date(autre)} actif onPress={() => undefined} />}
      </View>
      {saisie.prochaine_action_echeance && (
        <Texte variante="discret">
          {t('rapport.echeanceLe', { date: date(saisie.prochaine_action_echeance) })}
        </Texte>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
        <Texte style={{ flex: 1 }}>{t('rapport.visiteProposee')}</Texte>
        <Switch
          accessibilityLabel={t('rapport.visiteProposee')}
          value={saisie.visite_proposee}
          onValueChange={(visite_proposee) => surChangement({ visite_proposee })}
          trackColor={{ true: p.succes }}
        />
      </View>
    </View>
  );
}
