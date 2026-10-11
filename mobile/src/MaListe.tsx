import type { ListeCible, Potentiel } from '@innov/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ecrire, lire } from './baseLocale';
import { Alerte, Bouton, Carte, Champ, MarquePotentiel, Texte, usePalette } from './composants';
import { Pilule } from './Etablissements';
import { nomProspect } from './Fiches';
import { police } from './polices';
import { useSession } from './session';

const CLE = 'ciblage.moi';

function normaliser(texte: string) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Liste cible du délégué (PRP-011) : lue sur le serveur et gardée dans la base locale
 * chiffrée, pour rester disponible sans réseau (CA2).
 *
 * Recherche instantanée, même hors ligne, sur le nom, la spécialité, le lieu, le secteur et le
 * téléphone ; filtre rapide par potentiel ; chaque ligne ouvre la fiche. Quand la liste ne
 * contient pas la personne cherchée, un toucher relance la recherche dans toutes les fiches.
 */
export function MaListeCible({
  chercherPartout,
}: {
  /** Relance la saisie dans toutes les fiches du pays (segment Prospects). */
  chercherPartout?: (texte: string) => void;
} = {}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const { client } = useSession();
  const [potentiel, setPotentiel] = useState<Potentiel | null>(null);
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
  const filtre = normaliser(saisie.trim());
  const toutes = listes.flatMap((l) => l.cibles);
  const compte = (v: Potentiel) => toutes.filter((c) => c.prospect.potentiel === v).length;
  const chiffres = filtre.replace(/\D/g, '');
  // Le prénom figure avant et après le nom : « ndiaye aissatou » trouve « Aïssatou NDIAYE ».
  const correspond = ({ prospect: f }: ListeCible['cibles'][number]) =>
    normaliser(
      [
        f.prenom,
        f.nom,
        f.prenom,
        f.specialite_libelle,
        f.type_libelle,
        f.lieu_principal?.libelle,
        f.secteur,
      ].join(' '),
    ).includes(filtre) ||
    (chiffres.length >= 3 &&
      [f.telephone_mobile, f.telephone_pro].some((n) =>
        (n ?? '').replace(/\D/g, '').includes(chiffres),
      ));
  const retenues = (cibles: ListeCible['cibles']) =>
    cibles.filter((c) => (!potentiel || c.prospect.potentiel === potentiel) && correspond(c));
  const nombre = listes.reduce((n, l) => n + retenues(l.cibles).length, 0);
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
      <View style={{ gap: 8 }}>
        <Champ
          libelle={t('ciblage.mobile.rechercher')}
          libelleMasque
          placeholder={t('ciblage.mobile.indice')}
          value={saisie}
          onChangeText={setSaisie}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        <View style={styles.filtres} accessibilityLabel={t('prospect.champs.potentiel')}>
          <Pilule
            libelle={t('ciblage.mobile.tous', { count: toutes.length })}
            actif={potentiel === null}
            onPress={() => setPotentiel(null)}
          />
          {(['A', 'B', 'C'] as const).map((v) => (
            <Pilule
              key={v}
              libelle={`${v} · ${compte(v)}`}
              actif={potentiel === v}
              onPress={() => setPotentiel(potentiel === v ? null : v)}
            />
          ))}
        </View>
      </View>
      {(filtre || potentiel) && (
        <Texte variante="discret">{t('ciblage.mobile.resultats', { count: nombre })}</Texte>
      )}
      {nombre === 0 && filtre.length >= 2 && chercherPartout && (
        <Bouton
          secondaire
          libelle={t('ciblage.mobile.chercherPartout', { texte: saisie.trim() })}
          onPress={() => chercherPartout(saisie.trim())}
        />
      )}
      {listes.map(({ poste, cibles }) => {
        const lignes = retenues(cibles);
        if ((filtre || potentiel) && lignes.length === 0) return null;
        return (
          <Carte key={poste.id} style={{ paddingVertical: 8 }}>
            <Texte variante="sousTitre">{poste.libelle}</Texte>
            {!(filtre || potentiel) && (
              <Texte variante="discret">
                {t('ciblage.mobile.resume', {
                  count: poste.synthese.total,
                  visites: poste.synthese.visites_par_cycle,
                  semaines: poste.synthese.cycle_semaines,
                })}
              </Texte>
            )}
            {cibles.length === 0 && <Texte variante="discret">{t('ciblage.videLecture')}</Texte>}
            {lignes.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => routeur.push(`/fiche/${c.prospect.id}`)}
                style={({ pressed }) => [
                  styles.ligne,
                  { borderColor: p.ligne, backgroundColor: pressed ? p.fond : 'transparent' },
                ]}
              >
                <MarquePotentiel
                  valeur={c.prospect.potentiel}
                  libelle={t(`prospect.potentiels.${c.prospect.potentiel}`)}
                />
                <View style={{ flex: 1 }}>
                  <Texte variante="fort">{nomProspect(c.prospect, t)}</Texte>
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
              </Pressable>
            ))}
          </Carte>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  frequence: { fontFamily: police.texteFort, fontSize: 12 },
  filtres: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
