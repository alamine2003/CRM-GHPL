import Feather from '@expo/vector-icons/Feather';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  useColorScheme,
  View,
  type ViewStyle,
} from 'react-native';
import logoGH from '../assets/logo-gh.png';
import { police } from './polices';
import { RAYON, type Theme, themeClair, themeSombre } from './theme';

/** Jetons de la maquette 1.4.0 (src/theme.ts), clairs ou sombres selon le téléphone. */
export function usePalette(): Theme {
  return useColorScheme() === 'dark' ? themeSombre : themeClair;
}

/** Couleur des liens et actions en texte : le bleu marine devient illisible sur fond sombre. */
export function useLien() {
  return usePalette().lien;
}

export type NomIcone = ComponentProps<typeof Feather>['name'];

/** Icônes au trait de la maquette (famille Feather) : 20 px, 16 px en petit. */
export function Icone({
  nom,
  taille = 20,
  couleur,
}: {
  nom: NomIcone;
  taille?: number;
  couleur?: string;
}) {
  const p = usePalette();
  return (
    <Feather
      name={nom}
      size={taille}
      color={couleur ?? p.texte}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

type Variante = 'titre' | 'sousTitre' | 'texte' | 'fort' | 'discret' | 'libelle' | 'nombre';

/** Texte typographié selon la maquette (Plus Jakarta Sans pour les titres, DM Sans sinon). */
export function Texte({
  variante = 'texte',
  style,
  ...props
}: TextProps & { variante?: Variante }) {
  const p = usePalette();
  const styles: Record<Variante, TextStyle> = {
    // .ttl
    titre: { fontFamily: police.titre, fontSize: 20, lineHeight: 28, color: p.texte },
    // .sec-t
    sousTitre: { fontFamily: police.titre, fontSize: 15, lineHeight: 22, color: p.texte },
    texte: { fontFamily: police.texte, fontSize: 14, lineHeight: 20, color: p.texte },
    // .li .n
    fort: { fontFamily: police.texteFort, fontSize: 15, lineHeight: 21, color: p.texte },
    // .li .m
    discret: { fontFamily: police.texte, fontSize: 13, lineHeight: 18, color: p.texteSecondaire },
    // .lib
    libelle: {
      fontFamily: police.texteMoyen,
      fontSize: 12.5,
      lineHeight: 18,
      color: p.texteSecondaire,
    },
    // .num
    nombre: { fontFamily: police.titre, fontSize: 20, lineHeight: 24, color: p.texte },
  };
  return <Text {...props} style={[styles[variante], style]} />;
}

/** La marque, identique dans toutes les langues. */
const MARQUE = 'CRM';
const MARQUE_LUE = 'CRM GH';

/** Marque de l'entreprise : « CRM » et le logo GH (maquette 1.4.0). */
export function Logo({
  taille = 24,
  mot = 14,
  sansCadre,
  surMarine,
}: {
  /** Côté du logo, en px. */
  taille?: number;
  /** Corps du mot « CRM ». */
  mot?: number;
  /** Logo nu (écran de connexion du téléphone) plutôt que posé sur un carré blanc. */
  sansCadre?: boolean;
  /** Sur le marine (barre latérale, volet de connexion) : le mot passe en blanc. */
  surMarine?: boolean;
}) {
  const p = usePalette();
  return (
    <View
      accessible
      accessibilityLabel={MARQUE_LUE}
      style={{ flexDirection: 'row', alignItems: 'center', gap: mot >= 24 ? 12 : 6 }}
    >
      <Text
        style={{
          fontFamily: police.titreFort,
          fontSize: mot,
          letterSpacing: mot * 0.03,
          color: surMarine ? '#FFFFFF' : p.texte,
        }}
      >
        {MARQUE}
      </Text>
      <Image
        source={logoGH}
        resizeMode="contain"
        style={[
          { width: taille, height: taille, borderRadius: taille >= 40 ? RAYON : 4 },
          !sansCadre && {
            backgroundColor: '#FFFFFF',
            borderWidth: surMarine ? 0 : 1,
            borderColor: p.ligne,
            padding: 2,
          },
        ]}
      />
    </View>
  );
}

/** Surface blanche à filet (.card) ; `marge` 16 par défaut (.pad), 0 pour une liste. */
export function Carte({
  children,
  style,
  marge = 16,
  accent,
}: {
  children: ReactNode;
  style?: ViewStyle;
  marge?: number;
  /** Filet de couleur à gauche (rapports à corriger, en retard, à justifier). */
  accent?: string;
}) {
  const p = usePalette();
  return (
    <View
      style={[
        styles.carte,
        { backgroundColor: p.surface, borderColor: p.ligne, padding: marge },
        accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Paire libellé · valeur (.kv). */
export function Ligne({
  libelle,
  valeur,
  derniere,
}: {
  libelle: string;
  valeur: string;
  derniere?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={[styles.ligne, !derniere && { borderBottomWidth: 1, borderBottomColor: p.ligne }]}>
      <Text
        style={{
          maxWidth: '50%',
          fontFamily: police.texte,
          fontSize: 13,
          lineHeight: 18,
          color: p.texteSecondaire,
        }}
      >
        {libelle}
      </Text>
      <Text
        style={{
          flexShrink: 1,
          textAlign: 'right',
          fontFamily: police.texteMoyen,
          fontSize: 14,
          lineHeight: 20,
          color: p.texte,
        }}
      >
        {valeur}
      </Text>
    </View>
  );
}

export function Champ({
  libelle,
  libelleMasque,
  action,
  titre,
  aide,
  erreur,
  modifie,
  style,
  ...props
}: TextInputProps & {
  libelle: string;
  /** Champ de recherche : le texte indicatif suffit à l'écran ; le libellé reste vocalisé. */
  libelleMasque?: boolean;
  /** Lien à droite du libellé (« Mot de passe oublié ? »). */
  action?: ReactNode;
  /** Libellé en titre de section (.sec-t), pour les grands champs d'un formulaire. */
  titre?: boolean;
  /** Une ligne d'aide sous le libellé (.lib). */
  aide?: string;
  /** Champ à revoir : filet rouge doublé (correction demandée). */
  erreur?: boolean;
  /** Valeur changée par rapport à la fiche : filet d'accent doublé (correction proposée). */
  modifie?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      {!libelleMasque && (
        <View style={styles.enteteChamp}>
          <Texte variante={titre ? 'sousTitre' : 'libelle'}>{libelle}</Texte>
          {action}
        </View>
      )}
      {aide ? (
        <Texte variante="libelle" style={{ marginTop: -2 }}>
          {aide}
        </Texte>
      ) : null}
      <TextInput
        accessibilityLabel={libelle}
        placeholderTextColor={p.texteDiscret}
        style={[
          styles.champ,
          { borderColor: p.ligne, color: p.texte, backgroundColor: p.surface },
          props.multiline && styles.champLong,
          erreur && { borderColor: p.erreur, borderWidth: 2 },
          modifie && !erreur && { borderColor: p.accentPlein, borderWidth: 2 },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

/** Choix dans une liste, présenté comme un champ (.inp) qui se déplie. */
export function ListeDeroulante({
  libelle,
  valeur,
  options,
  surChoix,
  indice,
}: {
  libelle: string;
  /** Texte indicatif tant que rien n'est choisi (« Choisir… » par défaut). */
  indice?: string;
  valeur: string | null | undefined;
  options: { id: string; libelle: string }[];
  surChoix: (id: string) => void;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const [ouvert, setOuvert] = useState(false);
  const choisi = options.find((o) => o.id === valeur);
  return (
    <View style={{ gap: 6, flex: 1, minWidth: 0 }}>
      <Texte variante="libelle">{libelle}</Texte>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${libelle} : ${choisi?.libelle ?? indice ?? t('mobile.choisir')}`}
        accessibilityState={{ expanded: ouvert }}
        onPress={() => setOuvert(!ouvert)}
        style={[
          styles.champ,
          styles.deroulant,
          { borderColor: p.ligne, backgroundColor: p.surface },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.deroulantValeur, { color: choisi ? p.texte : p.texteDiscret }]}
        >
          {choisi?.libelle ?? indice ?? t('mobile.choisir')}
        </Text>
        <Icone
          nom={ouvert ? 'chevron-up' : 'chevron-down'}
          taille={20}
          couleur={p.texteSecondaire}
        />
      </Pressable>
      {ouvert && (
        <Carte marge={0}>
          {options.map((o, i) => (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityState={{ selected: o.id === valeur }}
              onPress={() => {
                surChoix(o.id);
                setOuvert(false);
              }}
              style={({ pressed }) => [
                styles.deroulantOption,
                i > 0 && { borderTopWidth: 1, borderTopColor: p.ligne },
                pressed && { backgroundColor: p.fond },
              ]}
            >
              <Text style={[styles.deroulantValeur, { color: p.texte }]}>{o.libelle}</Text>
              {o.id === valeur && <Icone nom="check" taille={18} couleur={p.lien} />}
            </Pressable>
          ))}
        </Carte>
      )}
    </View>
  );
}

/** Champ de recherche (.inp avec loupe) : le texte indicatif suffit, le libellé est vocalisé. */
export function ChampRecherche({
  libelle,
  style,
  ...props
}: TextInputProps & { libelle: string; style?: ViewStyle }) {
  const p = usePalette();
  return (
    <View
      style={[
        styles.champ,
        styles.recherche,
        { borderColor: p.ligne, backgroundColor: p.surface },
        style,
      ]}
    >
      <Icone nom="search" taille={20} couleur={p.texteSecondaire} />
      <TextInput
        accessibilityLabel={libelle}
        placeholderTextColor={p.texteDiscret}
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[styles.rechercheTexte, { color: p.texte }]}
        {...props}
      />
    </View>
  );
}

/**
 * Choix unique en segments côte à côte (.seg) : le segment choisi est plein. Un second appui
 * sur lui le signale aussi : à l'écran de décider s'il le retire.
 */
export function Segments<T extends string>({
  libelle,
  options,
  valeur,
  surChoix,
  style,
}: {
  libelle: string;
  /** `lu` : le libellé vocalisé, quand l'écran en montre un plus court. */
  options: { cle: T; libelle: string; lu?: string }[];
  valeur: T | null;
  surChoix: (cle: T) => void;
  style?: ViewStyle;
}) {
  const p = usePalette();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={libelle}
      style={[styles.segments, { borderColor: p.ligne, backgroundColor: p.surface }, style]}
    >
      {options.map((o, i) => {
        const actif = o.cle === valeur;
        return (
          <Pressable
            key={o.cle}
            accessibilityRole="radio"
            accessibilityState={{ checked: actif }}
            accessibilityLabel={o.lu ?? o.libelle}
            onPress={() => surChoix(o.cle)}
            style={({ pressed }) => [
              styles.segment,
              i < options.length - 1 && { borderRightWidth: 1, borderRightColor: p.ligne },
              actif && { backgroundColor: p.accentPlein },
              pressed && !actif && { backgroundColor: p.surface2 },
            ]}
          >
            <Text
              style={{
                fontFamily: police.texteFort,
                fontSize: 14,
                lineHeight: 20,
                textAlign: 'center',
                color: actif ? p.accentTexte : p.texteSecondaire,
              }}
            >
              {o.libelle}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type VarianteBouton = 'plein' | 'contour' | 'fantome' | 'clair' | 'clairContour';

/**
 * Bouton de 48 px (.btn) : plein marine, `contour` (.btn.out), `fantome` (.btn.ghost) ; sur le
 * bandeau marine, `clair` (blanc) et `clairContour`.
 */
export function Bouton({
  libelle,
  onPress,
  chargement,
  secondaire,
  desactive,
  variante,
  icone,
  petit,
  style,
  accessibilityLabel,
}: {
  libelle?: string;
  onPress: () => void;
  chargement?: boolean;
  /** Ancien nom de la variante `contour`. */
  secondaire?: boolean;
  /** Action impossible pour l'instant (rien à envoyer) : visible mais inactive. */
  desactive?: boolean;
  variante?: VarianteBouton;
  icone?: NomIcone;
  /** 44 px, texte de 14 (.btn.sm). */
  petit?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  const v: VarianteBouton = variante ?? (secondaire ? 'contour' : 'plein');
  const [fond, bord, texte] = {
    plein: [p.bouton, p.bouton, p.boutonTexte],
    contour: ['transparent', p.ligne, p.lien],
    fantome: ['transparent', 'transparent', p.lien],
    clair: ['#FFFFFF', '#FFFFFF', '#1B2A5B'],
    clairContour: ['transparent', 'rgba(255,255,255,.35)', '#FFFFFF'],
  }[v];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? libelle}
      accessibilityState={{ busy: chargement, disabled: chargement || desactive }}
      disabled={chargement || desactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bouton,
        petit && { minHeight: 44 },
        { backgroundColor: fond, borderColor: bord },
        (pressed || chargement) && { opacity: 0.85 },
        desactive && { opacity: 0.5 },
        style,
      ]}
    >
      {chargement ? (
        <ActivityIndicator color={texte} />
      ) : (
        <>
          {icone && <Icone nom={icone} couleur={texte} />}
          {libelle ? (
            <Text
              style={{
                color: texte,
                fontFamily: police.texteFort,
                fontSize: petit ? 14 : 15,
                lineHeight: 20,
                textAlign: 'center',
              }}
            >
              {libelle}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/** Bouton icône de 44 px (.ibtn) : cloche, fermeture. */
export function BoutonIcone({
  icone,
  libelle,
  onPress,
  pastille,
  desactive,
}: {
  icone: NomIcone;
  libelle: string;
  onPress: () => void;
  /** Nombre non lu, en orange. */
  pastille?: number;
  /** Grisé (« Semaine suivante » sur la semaine en cours). */
  desactive?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      accessibilityState={{ disabled: !!desactive }}
      disabled={desactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.boutonIcone,
        { borderColor: p.ligne, backgroundColor: p.surface },
        pressed && { opacity: 0.7 },
        desactive && { opacity: 0.4 },
      ]}
    >
      <Icone nom={icone} />
      {pastille ? (
        <View style={styles.pastille}>
          <Text style={styles.pastilleTexte}>{pastille > 9 ? '9+' : pastille}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Lien en texte gras (.link). */
export function Lien({
  libelle,
  onPress,
  taille = 14,
  discret,
  style,
}: {
  libelle: string;
  onPress: () => void;
  taille?: number;
  /** Lien secondaire (« Retour ») : gris, moins appuyé. */
  discret?: boolean;
  style?: TextStyle;
}) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10}>
      <Text
        style={[
          {
            color: discret ? p.texteSecondaire : p.lien,
            fontFamily: discret ? police.texteMoyen : police.texteFort,
            fontSize: taille,
            lineHeight: taille + 6,
          },
          style,
        ]}
      >
        {libelle}
      </Text>
    </Pressable>
  );
}

export function Alerte({
  children,
  type,
  icone,
}: {
  children: ReactNode;
  type: 'erreur' | 'info' | 'succes' | 'attention';
  /** Icône de tête, dans la couleur du ton (.alert svg). */
  icone?: NomIcone;
}) {
  const p = usePalette();
  const [fond, accent] = {
    erreur: [p.erreurDoux, p.erreur],
    info: [p.infoDoux, p.info],
    succes: [p.succesDoux, p.succes],
    attention: [p.attentionDoux, p.attention],
  }[type];
  return (
    <View
      accessibilityRole={type === 'erreur' || type === 'attention' ? 'alert' : undefined}
      style={[styles.alerte, { backgroundColor: fond }]}
    >
      {icone && <Icone nom={icone} couleur={accent} />}
      <Text style={[styles.alerteTexte, { color: p.texte }]}>{children}</Text>
    </View>
  );
}

/** Mot en gras dans une alerte ou une phrase. */
export function Gras({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: police.texteGras }}>{children}</Text>;
}

/** Potentiel A/B/C (.pot) : la seule « couleur métier » des listes (A orange, B marine, C gris). */
export function MarquePotentiel({
  valeur,
  libelle,
  taille = 24,
}: {
  valeur: string;
  libelle?: string;
  taille?: number;
}) {
  const p = usePalette();
  const [fond, texte] =
    valeur === 'A'
      ? [p.orange, '#151B30']
      : valeur === 'B'
        ? [p.potentielB, '#FFFFFF']
        : [p.ligne, p.texte];
  return (
    <View
      accessibilityLabel={libelle}
      style={{
        width: taille,
        height: taille,
        borderRadius: 4,
        backgroundColor: fond,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: texte, fontFamily: police.titreFort, fontSize: taille / 2 }}>
        {valeur}
      </Text>
    </View>
  );
}

export type TonStatut = 'ok' | 'wa' | 'er' | 'in' | 'or' | 'neutre';

/** Statut : pastille de 8 px et texte, jamais la couleur seule (.st). */
export function Statut({
  children,
  ton = 'neutre',
  lignes = 1,
}: {
  children: ReactNode;
  ton?: TonStatut;
  /** Une case étroite (chiffres de la visite) laisse le statut passer à la ligne. */
  lignes?: number;
}) {
  const p = usePalette();
  const pastille = {
    ok: p.succes,
    wa: p.attention,
    er: p.erreur,
    in: p.info,
    or: p.orange,
    neutre: p.texteDiscret,
  }[ton];
  const texte = ton === 'or' ? p.texte : ton === 'neutre' ? p.texteSecondaire : pastille;
  return (
    <View style={styles.statut}>
      <View style={[styles.point, { backgroundColor: pastille }]} />
      <Text numberOfLines={lignes} style={[styles.statutTexte, { color: texte }]}>
        {children}
      </Text>
    </View>
  );
}

/** État en texte coloré (« À valider »…) ; même rendu que `Statut`. */
export function Etiquette({
  children,
  ton = 'attention',
}: {
  children: ReactNode;
  ton?: 'attention' | 'neutre' | 'succes';
}) {
  return (
    <Statut ton={ton === 'attention' ? 'wa' : ton === 'succes' ? 'ok' : 'neutre'}>
      {children}
    </Statut>
  );
}

/** Petite étiquette grise à filet (.tag) : « Imprévue », un code, un rang. */
export function Puce({ children }: { children: ReactNode }) {
  const p = usePalette();
  return (
    <Text
      style={[
        styles.puce,
        { backgroundColor: p.surface2, borderColor: p.ligne, color: p.texteSecondaire },
      ]}
    >
      {children}
    </Text>
  );
}

/** Barre de progression de 6 px (.bar). */
export function Barre({ valeur, libelle }: { valeur: number; libelle: string }) {
  const p = usePalette();
  const part = Math.max(0, Math.min(1, valeur));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={libelle}
      style={[styles.barre, { backgroundColor: p.ligne }]}
    >
      <View style={{ width: `${part * 100}%`, height: '100%', backgroundColor: p.accentPlein }} />
    </View>
  );
}

/** Rangée de chiffres séparés par des filets (.stats). */
export function Chiffres({
  valeurs,
}: {
  valeurs: { libelle: string; valeur: string; couleur?: string }[];
}) {
  const p = usePalette();
  return (
    <Carte marge={0} style={{ flexDirection: 'row' }}>
      {valeurs.map((v, i) => (
        <View
          key={v.libelle}
          style={[
            styles.chiffre,
            i < valeurs.length - 1 && { borderRightWidth: 1, borderRightColor: p.ligne },
          ]}
        >
          <Texte variante="libelle" numberOfLines={1}>
            {v.libelle}
          </Texte>
          <Texte variante="nombre" style={v.couleur ? { color: v.couleur } : undefined}>
            {v.valeur}
          </Texte>
        </View>
      ))}
    </Carte>
  );
}

const styles = StyleSheet.create({
  carte: { borderWidth: 1, borderRadius: RAYON },
  segments: { flexDirection: 'row', borderWidth: 1, borderRadius: RAYON, overflow: 'hidden' },
  segment: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puce: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
    fontFamily: police.texteMoyen,
    fontSize: 12,
    lineHeight: 18,
  },
  ligne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  enteteChamp: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  champ: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: RAYON,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: police.texte,
  },
  recherche: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deroulant: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deroulantValeur: { flex: 1, fontFamily: police.texte, fontSize: 15 },
  deroulantOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  rechercheTexte: { flex: 1, minHeight: 46, fontSize: 15, fontFamily: police.texte },
  champLong: { minHeight: 72, paddingTop: 12, textAlignVertical: 'top' },
  bouton: {
    minHeight: 48,
    borderRadius: RAYON,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  boutonIcone: {
    width: 44,
    height: 44,
    borderRadius: RAYON,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastille: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#F26B1D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastilleTexte: { color: '#151B30', fontFamily: police.titreFort, fontSize: 10, lineHeight: 16 },
  alerte: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: RAYON,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  alerteTexte: { flex: 1, fontFamily: police.texte, fontSize: 13.5, lineHeight: 19 },
  statut: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  point: { width: 8, height: 8, borderRadius: 4 },
  statutTexte: { fontFamily: police.texteMoyen, fontSize: 12.5, lineHeight: 18, flexShrink: 1 },
  barre: { height: 6, borderRadius: 3, overflow: 'hidden' },
  chiffre: { flex: 1, minWidth: 0, paddingVertical: 14, paddingHorizontal: 16, gap: 2 },
});
