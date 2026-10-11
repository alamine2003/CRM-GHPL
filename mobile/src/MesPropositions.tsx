import type { Proposition } from '@innov/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Carte, Etiquette, Texte, usePalette } from './composants';
import { police } from './polices';
import { useSession } from './session';

/**
 * PRP-014 CA2 : le délégué est notifié des décisions sur ses propositions de modification ;
 * « Vu » les retire de l'accueil.
 */
export function MesPropositions() {
  const { t } = useTranslation();
  const p = usePalette();
  const { client, etat } = useSession();
  const [decisions, setDecisions] = useState<Proposition[]>([]);
  const auteur =
    etat.statut === 'connecte' && etat.perimetre.actions.includes('propositions.creer');

  useEffect(() => {
    let actif = true;
    if (!auteur) return;
    client.propositions
      .liste()
      .then((liste) => {
        if (!actif) return;
        setDecisions(liste.filter((x) => x.statut !== 'en_attente' && !x.vue_le));
      })
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [auteur, client]);

  if (decisions.length === 0) return null;
  return (
    <Carte>
      <View style={styles.titre}>
        <Texte variante="sousTitre" style={{ flex: 1 }}>
          {t('propositions.decisionsTitre', { count: decisions.length })}
        </Texte>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setDecisions([]);
            void client.propositions.marquerVues().catch(() => undefined);
          }}
          style={styles.vu}
        >
          <Text style={[styles.vuTexte, { color: p.texte }]}>{t('propositions.vu')}</Text>
        </Pressable>
      </View>
      {decisions.map((d) => (
        <View key={d.id} style={[styles.ligne, { borderTopColor: p.ligne }]}>
          <View style={{ flex: 1, paddingVertical: 8 }}>
            <Texte>
              {d.prospect
                ? [d.prospect.prenom, d.prospect.nom].filter(Boolean).join(' ')
                : (d.etablissement?.nom ?? '')}
            </Texte>
            {d.motif ? <Texte variante="discret">{d.motif}</Texte> : null}
          </View>
          <Etiquette ton={d.statut === 'refusee' ? 'attention' : 'neutre'}>
            {t(`propositions.statuts.${d.statut}`)}
          </Etiquette>
        </View>
      ))}
    </Carte>
  );
}

const styles = StyleSheet.create({
  titre: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vu: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  vuTexte: { fontFamily: police.texteFort, fontSize: 14 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
