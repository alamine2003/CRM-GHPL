import type { MonOrganisation } from '@innov/api-client';
import { marque } from '@innov/design';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Alerte, Carte, Ligne, Texte, usePalette } from './composants';
import { useSession } from './session';

/** Poste(s) occupé(s), superviseur et réseaux de l'utilisateur dans le pays actif (ORG-006/007). */
export function MonPoste() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { client } = useSession();
  const [organisation, setOrganisation] = useState<MonOrganisation | null>(null);

  useEffect(() => {
    let actif = true;
    client.organisation
      .moi()
      .then((o) => actif && setOrganisation(o))
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [client]);

  const o = organisation;
  if (!o || (!o.postes.length && !o.postes_supervises)) return null;
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(
      new Date(`${iso}T12:00:00`),
    );

  return (
    <>
      {o.superviseur_manquant && (
        <Alerte type="attention">{t('monPoste.superviseurManquant')}</Alerte>
      )}
      {o.postes.map(({ occupation, type_poste, reseaux, secteurs, superviseur }) => (
        <Carte key={occupation.id} style={{ borderLeftWidth: 4, borderLeftColor: marque.orange }}>
          <View style={styles.titre}>
            <View style={[styles.icone, { backgroundColor: p.orangeDoux }]}>
              <MaterialIcons name="badge" size={20} color={marque.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Texte variante="discret">
                {o.postes.length > 1 ? t('monPoste.titrePlusieurs') : t('monPoste.titre')}
                {o.postes.length > 1 && occupation.principal ? ` · ${t('monPoste.principal')}` : ''}
              </Texte>
              <Texte variante="sousTitre">{occupation.poste.libelle}</Texte>
              <Texte variante="discret">
                {t(`organisation.typesPoste.${type_poste}`)} ·{' '}
                {t('monPoste.depuis', { date: formatDate(occupation.debut) })}
              </Texte>
            </View>
          </View>
          <Ligne
            libelle={t('monPoste.superviseur')}
            valeur={superviseur ? `${superviseur.prenom} ${superviseur.nom}` : '—'}
          />
          <Ligne
            libelle={t('monPoste.reseaux')}
            valeur={reseaux.map((r) => r.libelle).join(', ') || '—'}
          />
          <Ligne
            libelle={t('monPoste.secteurs')}
            valeur={secteurs.map((s) => s.libelle).join(', ') || '—'}
            derniere
          />
        </Carte>
      ))}
      {o.postes_supervises > 0 && (
        <Carte>
          <Texte variante="fort">
            {t('monPoste.postesSupervises', { count: o.postes_supervises })}
          </Texte>
        </Carte>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  titre: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 6 },
  icone: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
