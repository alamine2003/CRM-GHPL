/**
 * Photos et documents du rapport (RPT-007) : prendre une photo, en choisir une, joindre un
 * PDF. Trois au plus, 10 Mo chacun (CA1). Sans réseau, la pièce attend dans la file et part
 * au retour du réseau, même après la soumission du rapport (téléversement différé).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ClientApi, PieceJointe, Rapport } from '@innov/api-client';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, View } from 'react-native';
import {
  estTransitoire,
  fichierAEnvoyer,
  lireAttente,
  mettreEnAttente,
  nouvelIdentifiant,
  type PieceEnAttente,
} from './Brouillons';
import { garderFichier } from './BrouillonRapport';
import { Alerte, Bouton, Texte, useLien, usePalette } from './composants';
import { messageErreur, useSession } from './session';

export const PIECES_MAX = 3;
export const TAILLE_MAX = 10 * 1024 * 1024;

type Choisie = { uri: string; nom: string; type_mime: string; taille: number };

/** Envoie la pièce, ou la met en attente sans réseau. */
export async function joindrePiece(
  client: ClientApi,
  visite: string,
  choisie: Choisie,
): Promise<
  { issue: 'parti'; piece: PieceJointe } | { issue: 'en_attente'; piece: PieceEnAttente }
> {
  const saisie: PieceEnAttente = {
    id: nouvelIdentifiant(),
    ...choisie,
    prise_le: new Date().toISOString(),
  };
  try {
    const piece = await client.visites.joindrePiece(visite, {
      id: saisie.id,
      nom: saisie.nom,
      prise_le: saisie.prise_le,
      fichier: await fichierAEnvoyer(saisie.uri, saisie.nom, saisie.type_mime),
    });
    return { issue: 'parti', piece };
  } catch (e) {
    if (!estTransitoire(e)) throw e;
    // RPT-009 : la photo quitte le cache du téléphone pour un dossier durable.
    saisie.uri = await garderFichier(saisie.uri, saisie.id);
    await mettreEnAttente({
      id: nouvelIdentifiant(),
      type: 'piece_jointe',
      visite,
      saisie,
      resume: saisie.nom,
    });
    return { issue: 'en_attente', piece: saisie };
  }
}

function taille(octets: number, langue: string) {
  const mo = octets / (1024 * 1024);
  return mo >= 1
    ? `${new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(mo)} Mo`
    : `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

function Ligne({
  nom,
  type_mime,
  octets,
  apercu,
  note,
  surRetrait,
}: {
  nom: string;
  type_mime: string;
  octets: number;
  apercu?: string;
  note?: string;
  surRetrait?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const lien = useLien();
  const image = type_mime.startsWith('image/');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
      {apercu && image ? (
        <Image
          source={{ uri: apercu }}
          style={{ width: 48, height: 48, borderRadius: 6 }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 6,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: p.surface2,
          }}
        >
          <MaterialIcons
            name={image ? 'image' : 'picture-as-pdf'}
            size={24}
            color={p.texteSecondaire}
          />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte numberOfLines={1}>{nom}</Texte>
        <Texte variante="discret">
          {[taille(octets, i18n.language), note].filter(Boolean).join(' · ')}
        </Texte>
      </View>
      {surRetrait && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pieces.retirer', { nom })}
          onPress={surRetrait}
          hitSlop={8}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Texte style={{ color: lien, fontWeight: '600' }}>{t('pieces.retirerCourt')}</Texte>
        </Pressable>
      )}
    </View>
  );
}

export function PiecesJointes({
  rapport,
  visite,
  modifiable,
  surRapport,
}: {
  rapport: Rapport;
  visite: string;
  /** Rapport en rédaction : on ajoute et on retire ; soumis, on lit. */
  modifiable: boolean;
  /** Le rapport à jour après un ajout ou un retrait reçu par le serveur. */
  surRapport: (pieces: PieceJointe[]) => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [enAttente, setEnAttente] = useState<PieceEnAttente[]>([]);
  // Aperçus des photos prises sur ce téléphone, par identifiant de pièce.
  const [apercus, setApercus] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ texte: string; ton: 'erreur' | 'info' } | null>(null);

  const relireAttente = useCallback(
    () =>
      lireAttente()
        .catch(() => [])
        .then((file) =>
          setEnAttente(
            file.flatMap((e) =>
              e.type === 'piece_jointe' && e.visite === visite ? [e.saisie] : [],
            ),
          ),
        ),
    [visite],
  );
  useEffect(() => {
    let actif = true;
    void lireAttente()
      .catch(() => [])
      .then(
        (file) =>
          actif &&
          setEnAttente(
            file.flatMap((e) =>
              e.type === 'piece_jointe' && e.visite === visite ? [e.saisie] : [],
            ),
          ),
      );
    return () => {
      actif = false;
    };
  }, [visite]);

  const total = rapport.pieces_jointes.length + enAttente.length;

  async function ajouter(choisie: Choisie | null) {
    if (!choisie) return;
    setMessage(null);
    if (choisie.taille > TAILLE_MAX) {
      setMessage({ texte: t('pieces.tropLourde'), ton: 'erreur' });
      return;
    }
    setEnvoi(true);
    try {
      const resultat = await joindrePiece(client, visite, choisie);
      setApercus((a) => ({ ...a, [resultat.piece.id]: choisie.uri }));
      if (resultat.issue === 'parti') surRapport([...rapport.pieces_jointes, resultat.piece]);
      else {
        setMessage({ texte: t('pieces.horsLigne'), ton: 'info' });
        await relireAttente();
      }
    } catch (e) {
      setMessage({ texte: messageErreur(e, t('erreurs.reseau')), ton: 'erreur' });
    } finally {
      setEnvoi(false);
    }
  }

  async function photo(source: 'camera' | 'galerie') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage({ texte: t('pieces.permission'), ton: 'erreur' });
      return;
    }
    const options = { mediaTypes: ['images' as const], quality: 0.6 };
    const choix =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const a = choix.canceled ? null : choix.assets[0];
    await ajouter(
      a
        ? {
            uri: a.uri,
            nom: a.fileName ?? `photo-${Date.now()}.jpg`,
            type_mime: a.mimeType ?? 'image/jpeg',
            taille: a.fileSize ?? 0,
          }
        : null,
    );
  }

  async function document() {
    const choix = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf'],
      copyToCacheDirectory: true,
    });
    const a = choix.canceled ? null : choix.assets[0];
    await ajouter(
      a
        ? {
            uri: a.uri,
            nom: a.name,
            type_mime: a.mimeType ?? 'application/pdf',
            taille: a.size ?? 0,
          }
        : null,
    );
  }

  async function retirer(piece: PieceJointe) {
    setMessage(null);
    try {
      await client.visites.retirerPiece(visite, piece.id);
      surRapport(rapport.pieces_jointes.filter((x) => x.id !== piece.id));
    } catch (e) {
      setMessage({ texte: messageErreur(e, t('erreurs.reseau')), ton: 'erreur' });
    }
  }

  if (!modifiable && total === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      <Texte variante="sousTitre">{t('pieces.titre')}</Texte>
      {modifiable && <Texte variante="discret">{t('pieces.aide', { n: PIECES_MAX })}</Texte>}
      {rapport.pieces_jointes.map((x) => (
        <Ligne
          key={x.id}
          nom={x.nom}
          type_mime={x.type_mime}
          octets={x.taille}
          apercu={apercus[x.id]}
          surRetrait={modifiable ? () => void retirer(x) : undefined}
        />
      ))}
      {enAttente.map((x) => (
        <Ligne
          key={x.id}
          nom={x.nom}
          type_mime={x.type_mime}
          octets={x.taille}
          apercu={x.uri}
          note={t('pieces.enAttente')}
        />
      ))}
      {message && <Alerte type={message.ton}>{message.texte}</Alerte>}
      {modifiable && total < PIECES_MAX && (
        <View style={{ gap: 8 }}>
          <Bouton
            secondaire
            libelle={t('pieces.prendrePhoto')}
            chargement={envoi}
            onPress={() => void photo('camera')}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Bouton
                secondaire
                libelle={t('pieces.galerie')}
                desactive={envoi}
                onPress={() => void photo('galerie')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Bouton
                secondaire
                libelle={t('pieces.pdf')}
                desactive={envoi}
                onPress={() => void document()}
              />
            </View>
          </View>
        </View>
      )}
      {modifiable && total >= PIECES_MAX && (
        <Texte variante="discret">{t('pieces.maximum', { n: PIECES_MAX })}</Texte>
      )}
    </View>
  );
}
