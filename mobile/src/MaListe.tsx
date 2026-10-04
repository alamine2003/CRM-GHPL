import type { ListeCible } from '@innov/api-client';
import { marque } from '@innov/design';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { ecrire, lire } from './baseLocale';
import { Alerte, Carte, Champ, Texte, usePalette } from './composants';
import { police } from './polices';
import { useSession } from './session';

const CLE = 'ciblage.moi';

function normaliser(texte: string) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Liste cible du délégué (PRP-011) : lue sur le serveur et gardée dans la base locale
 * chiffrée, pour rester disponible sans réseau (CA2).
 */
export function MaListeCible() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const { client } = useSession();
  const [listes, setListes] = useState<ListeCible[] | null>(null);
  const [horsLigneDepuis, setHorsLigneDepuis] = useState<string | null>(null);
  const [indisponible, setIndisponible] = useState(false);
  const [saisie, setSaisie] = useState('');

  useEffect(() => {
    let actif = true;
    client.ciblage
      .mesListes()
      .then(async (fraiches) => {
        if (!actif) return;
        setListes(fraiches);
        setHorsLigneDepuis(null);
        await ecrire(CLE, fraiches).catch(() => undefined);
      })
      .catch(async () => {
        const memoire = await lire<ListeCible[]>(CLE).catch(() => null);
        if (!actif) return;
        if (memoire) {
          setListes(memoire.valeur);
          setHorsLigneDepuis(memoire.maj);
        } else {
          setIndisponible(true);
        }
      });
    return () => {
      actif = false;
    };
  }, [client]);

  if (indisponible) return <Alerte type="attention">{t('ciblage.mobile.indisponible')}</Alerte>;
  if (!listes) return <Texte variante="discret">{t('session.chargement')}</Texte>;
  if (listes.length === 0) {
    return (
      <Carte>
        <Texte variante="discret">{t('ciblage.mobile.sansPoste')}</Texte>
      </Carte>
    );
  }
  const filtre = normaliser(saisie);
  return (
    <>
      {horsLigneDepuis && (
        <Alerte type="attention">
          {t('ciblage.mobile.horsLigne', {
            date: new Intl.DateTimeFormat(i18n.language, {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(horsLigneDepuis)),
          })}
        </Alerte>
      )}
      <Champ
        libelle={t('ciblage.mobile.rechercher')}
        value={saisie}
        onChangeText={setSaisie}
        autoCorrect={false}
      />
      {listes.map(({ poste, cibles }) => (
        <Carte key={poste.id} style={{ paddingVertical: 8 }}>
          <Texte variante="sousTitre">{poste.libelle}</Texte>
          <Texte variante="discret">
            {t('ciblage.mobile.resume', {
              count: poste.synthese.total,
              visites: poste.synthese.visites_par_cycle,
              semaines: poste.synthese.cycle_semaines,
            })}
          </Texte>
          {cibles.length === 0 && <Texte variante="discret">{t('ciblage.videLecture')}</Texte>}
          {cibles
            .filter((c) =>
              normaliser(
                `${c.prospect.prenom} ${c.prospect.nom} ${c.prospect.specialite_libelle ?? ''} ${c.prospect.lieu_principal?.libelle ?? ''}`,
              ).includes(filtre),
            )
            .map((c) => {
              const a = c.prospect.potentiel === 'A';
              return (
                <View key={c.id} style={[styles.ligne, { borderColor: p.ligne }]}>
                  <View style={[styles.potentiel, { borderColor: a ? marque.orange : p.ligne }]}>
                    <Text
                      style={[
                        styles.potentielTexte,
                        { color: a ? marque.orange : p.texteSecondaire },
                      ]}
                    >
                      {c.prospect.potentiel}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Texte variante="fort">
                      {[
                        c.prospect.civilite ? t(`prospect.civilites.${c.prospect.civilite}`) : '',
                        c.prospect.prenom,
                        c.prospect.nom,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    </Texte>
                    <Texte variante="discret">
                      {[
                        c.prospect.specialite_libelle ?? c.prospect.type_libelle,
                        c.prospect.lieu_principal?.libelle ?? c.prospect.secteur,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Texte>
                  </View>
                  <Text style={[styles.frequence, { color: p.texteSecondaire }]}>
                    {t('ciblage.parCycle', { count: c.frequence })}
                  </Text>
                </View>
              );
            })}
        </Carte>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  potentiel: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  potentielTexte: { fontFamily: police.titreFort, fontSize: 14 },
  frequence: { fontFamily: police.texteFort, fontSize: 12 },
});
