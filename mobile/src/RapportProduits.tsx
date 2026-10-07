/**
 * Produits présentés et remises du rapport de visite (0.5.3).
 *
 * - RPT-004 : les produits touchés dans l'ordre de présentation, chacun avec le retour du
 *   prescripteur ; un produit « autre », saisi en clair, si le pays l'autorise (CA2).
 * - RPT-005 : échantillons et cadeaux remis, avec leur quantité ; aucune notion de stock.
 */
import type { Presentation, Rapport, Remise, RetourPrescripteur } from '@innov/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { marque, rayon } from '@innov/design';
import { Pressable, Text, View } from 'react-native';
import { police } from './polices';
import { Alerte, Bouton, Champ, Texte, useLien, usePalette } from './composants';
import { Pilule } from './Etablissements';

export const RETOURS: RetourPrescripteur[] = ['non_prescrit', 'peu', 'prescrit', 'tres_bien'];

/** Au-delà, un champ filtre le portefeuille (6 à 25 produits selon le réseau). */
const SEUIL_FILTRE = 8;

const sansAccents = (texte: string) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const correspond = (libelle: string, filtre: string) =>
  sansAccents(libelle).includes(sansAccents(filtre.trim()));

const ligne = { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as const;

/** Petit bouton texte (« Retirer », « − », « + ») à zone tactile suffisante. */
function Lien({
  libelle,
  accessibilite,
  onPress,
}: {
  libelle: string;
  accessibilite?: string;
  onPress: () => void;
}) {
  const lien = useLien();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilite ?? libelle}
      hitSlop={8}
      onPress={onPress}
      style={{
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
      }}
    >
      <Texte style={{ color: lien, fontWeight: '600' }}>{libelle}</Texte>
    </Pressable>
  );
}

/** Les quatre retours côte à côte, cases de même largeur : une seule ligne par produit. */
function ChoixRetour({
  libelle,
  valeur,
  surChoix,
}: {
  libelle: string;
  valeur: RetourPrescripteur | null;
  surChoix: (r: RetourPrescripteur) => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={libelle}
      style={{ flexDirection: 'row' }}
    >
      {RETOURS.map((r, i) => {
        const actif = valeur === r;
        const premier = i === 0;
        const dernier = i === RETOURS.length - 1;
        return (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ checked: actif }}
            accessibilityLabel={t(`rapport.retours.${r}`)}
            onPress={() => surChoix(r)}
            style={{
              flex: 1,
              minHeight: 48,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderLeftWidth: premier ? 1 : 0,
              borderColor: actif ? marque.bleuMarine : p.ligne,
              backgroundColor: actif ? marque.bleuMarine : p.surface,
              borderTopLeftRadius: premier ? rayon : 0,
              borderBottomLeftRadius: premier ? rayon : 0,
              borderTopRightRadius: dernier ? rayon : 0,
              borderBottomRightRadius: dernier ? rayon : 0,
            }}
          >
            <Text
              style={{
                color: actif ? '#FFFFFF' : p.texte,
                fontFamily: police.texteMoyen,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              {t(`rapport.retoursCourts.${r}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProduitsPresentes({
  rapport,
  presentations,
  surChangement,
}: {
  rapport: Rapport;
  presentations: Presentation[];
  surChangement: (presentations: Presentation[]) => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const [filtre, setFiltre] = useState('');
  const [autre, setAutre] = useState('');
  const rangDe = (produit: string) => presentations.findIndex((x) => x.produit === produit);
  const basculer = (produit: string, libelle: string) =>
    surChangement(
      rangDe(produit) >= 0
        ? presentations.filter((x) => x.produit !== produit)
        : [...presentations, { produit, libelle, retour: null }],
    );
  const ajouterAutre = () => {
    const libelle = autre.trim();
    if (!libelle) return;
    if (!presentations.some((x) => (x.libelle ?? '').toLowerCase() === libelle.toLowerCase()))
      surChangement([...presentations, { produit: null, libelle, retour: null }]);
    setAutre('');
  };
  const proposes = rapport.produits_proposes;

  return (
    <View style={{ gap: 6 }}>
      <Texte variante="sousTitre">{t('rapport.produits')}</Texte>
      <Texte variante="discret">{t('rapport.produitsAide')}</Texte>
      {proposes.length > SEUIL_FILTRE && (
        <Champ
          libelle={t('rapport.filtrer')}
          libelleMasque
          placeholder={t('rapport.filtrer')}
          value={filtre}
          onChangeText={setFiltre}
        />
      )}
      {proposes.length ? (
        <View style={ligne}>
          {proposes
            // Les produits déjà choisis restent visibles quel que soit le filtre.
            .filter((pr) => rangDe(pr.id) >= 0 || correspond(pr.libelle, filtre))
            .map((pr) => {
              const rang = rangDe(pr.id);
              return (
                <Pilule
                  key={pr.id}
                  libelle={rang >= 0 ? `${rang + 1}. ${pr.libelle}` : pr.libelle}
                  actif={rang >= 0}
                  onPress={() => basculer(pr.id, pr.libelle)}
                />
              );
            })}
        </View>
      ) : (
        <Alerte type="info">{t('rapport.aucunProduit')}</Alerte>
      )}
      {rapport.produit_autre_autorise && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Champ
              libelle={t('rapport.autreProduit')}
              placeholder={t('rapport.autreProduitIndice')}
              value={autre}
              onChangeText={setAutre}
              maxLength={120}
              onSubmitEditing={ajouterAutre}
            />
          </View>
          <Bouton secondaire libelle={t('rapport.ajouter')} onPress={ajouterAutre} />
        </View>
      )}

      {presentations.length > 0 && (
        <View
          style={{
            gap: 12,
            marginTop: 10,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: p.ligne,
          }}
        >
          <Texte variante="libelle">{t('rapport.retourTitre')}</Texte>
          {presentations.map((pr, i) => (
            <View key={pr.produit ?? `autre-${pr.libelle}`} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Texte variante="fort" style={{ flex: 1 }}>
                  {`${i + 1}. ${pr.libelle}`}
                </Texte>
                {!pr.produit && (
                  <Lien
                    libelle={t('rapport.retirer')}
                    accessibilite={t('rapport.retirerProduit', { libelle: pr.libelle })}
                    onPress={() => surChangement(presentations.filter((_, j) => j !== i))}
                  />
                )}
              </View>
              <ChoixRetour
                libelle={t('rapport.retourDe', { libelle: pr.libelle ?? '' })}
                valeur={pr.retour ?? null}
                surChoix={(r) =>
                  surChangement(
                    presentations.map((x, j) =>
                      j === i ? { ...x, retour: x.retour === r ? null : r } : x,
                    ),
                  )
                }
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** RPT-005 : échantillons et cadeaux remis ; toucher un élément l'ajoute, − et + règlent la
 * quantité. */
export function Remises({
  rapport,
  presentations,
  remises,
  surChangement,
}: {
  rapport: Rapport;
  presentations: Presentation[];
  remises: Remise[];
  surChangement: (remises: Remise[]) => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<Remise['type']>('echantillon');
  // Échantillons : les produits du portefeuille déjà présentés à cette visite.
  const echantillons = presentations
    .filter((x): x is Presentation & { produit: string } => !!x.produit)
    .map((x) => ({ id: x.produit, libelle: x.libelle ?? '' }));
  const elements = type === 'echantillon' ? echantillons : rapport.articles_proposes;
  const cle = (r: Pick<Remise, 'type' | 'produit' | 'article'>) =>
    `${r.type}:${r.produit ?? r.article}`;
  const ajouter = (id: string, libelle: string) => {
    const nouvelle: Remise = {
      type,
      produit: type === 'echantillon' ? id : null,
      article: type === 'cadeau' ? id : null,
      libelle,
      quantite: 1,
    };
    const existe = remises.some((r) => cle(r) === cle(nouvelle));
    surChangement(
      existe
        ? remises.map((r) =>
            cle(r) === cle(nouvelle) ? { ...r, quantite: Math.min(999, r.quantite + 1) } : r,
          )
        : [...remises, nouvelle],
    );
  };
  const changerQuantite = (i: number, delta: number) =>
    surChangement(
      remises
        .map((r, j) => (j === i ? { ...r, quantite: Math.min(999, r.quantite + delta) } : r))
        .filter((r) => r.quantite > 0),
    );

  return (
    <View style={{ gap: 6 }}>
      <Texte variante="sousTitre">{t('rapport.remises')}</Texte>
      <Texte variante="discret">{t('rapport.remisesAide')}</Texte>
      <View style={ligne}>
        {(['echantillon', 'cadeau'] as const).map((x) => (
          <Pilule
            key={x}
            libelle={t(`rapport.typesRemise.${x}`)}
            actif={type === x}
            onPress={() => setType(x)}
          />
        ))}
      </View>
      {elements.length ? (
        <View style={ligne}>
          {elements.map((e) => (
            <Pilule
              key={e.id}
              libelle={`+ ${e.libelle}`}
              actif={false}
              onPress={() => ajouter(e.id, e.libelle)}
            />
          ))}
        </View>
      ) : (
        <Texte variante="discret">
          {t(type === 'echantillon' ? 'rapport.presenterDabord' : 'rapport.aucunArticle')}
        </Texte>
      )}
      {remises.map((r, i) => (
        <View key={cle(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Texte style={{ flex: 1 }}>
            {`${t(`rapport.typesRemise.${r.type}`)} · ${r.libelle}`}
          </Texte>
          <Lien
            libelle="−"
            accessibilite={t('rapport.moins', { libelle: r.libelle })}
            onPress={() => changerQuantite(i, -1)}
          />
          <Texte variante="fort" accessibilityLabel={t('rapport.quantite', { n: r.quantite })}>
            {r.quantite}
          </Texte>
          <Lien
            libelle="+"
            accessibilite={t('rapport.plus', { libelle: r.libelle })}
            onPress={() => changerQuantite(i, 1)}
          />
        </View>
      ))}
    </View>
  );
}
