/**
 * Documents du rapport (RPT-007) : un PDF, trois au plus, 10 Mo chacun (CA1). Pas de photo
 * (décision DC-48 : risque de données de patient, aucun usage établi). Sans réseau, la pièce attend dans la file et part
 * au retour du réseau, même après la soumission du rapport (téléversement différé, OFF-005).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ClientApi, PieceJointe, Rapport } from '@innov/api-client';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
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

/**
 * Annonce la pièce puis l'envoie ; sans réseau, l'une et l'autre attendent dans la file. OFF-005
 * (0.8.7) : l'annonce (nom, taille) part avant le fichier, et les fichiers partent en dernier :
 * le rapport arrive sans attendre un gros document, qui s'affiche « en attente ».
 */
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
  const annonce = {
    id: saisie.id,
    nom: saisie.nom,
    taille: saisie.taille,
    prise_le: saisie.prise_le,
  };
  let annoncee = false;
  try {
    await client.visites.annoncerPiece(visite, annonce);
    annoncee = true;
    const piece = await client.visites.joindrePiece(visite, {
      id: saisie.id,
      nom: saisie.nom,
      prise_le: saisie.prise_le,
      fichier: await fichierAEnvoyer(saisie.uri, saisie.nom, saisie.type_mime),
    });
    return { issue: 'parti', piece };
  } catch (e) {
    if (!estTransitoire(e)) throw e;
    // RPT-009 : le document quitte le cache du téléphone pour un dossier durable.
    saisie.uri = await garderFichier(saisie.uri, saisie.id);
    if (!annoncee)
      await mettreEnAttente({
        id: nouvelIdentifiant(),
        type: 'annonce_piece',
        visite,
        saisie: annonce,
        resume: saisie.nom,
      });
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
  octets,
  note,
  surRetrait,
}: {
  nom: string;
  octets: number;
  note?: string;
  surRetrait?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const lien = useLien();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
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
        <MaterialIcons name="picture-as-pdf" size={24} color={p.texteSecondaire} />
      </View>
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

  const total =
    rapport.pieces_jointes.filter((x) => !enAttente.some((a) => a.id === x.id)).length +
    enAttente.length;

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
      {rapport.pieces_jointes
        // Annoncée et pas encore envoyée d'ici : elle s'affiche une fois, avec la file.
        .filter((x) => !enAttente.some((a) => a.id === x.id))
        .map((x) => (
          <Ligne
            key={x.id}
            nom={x.nom}
            octets={x.taille}
            note={x.en_attente ? t('pieces.enAttenteAilleurs') : undefined}
            surRetrait={modifiable && !x.en_attente ? () => void retirer(x) : undefined}
          />
        ))}
      {enAttente.map((x) => (
        <Ligne key={x.id} nom={x.nom} octets={x.taille} note={t('pieces.enAttente')} />
      ))}
      {message && <Alerte type={message.ton}>{message.texte}</Alerte>}
      {modifiable && total < PIECES_MAX && (
        <Bouton
          secondaire
          libelle={t('pieces.pdf')}
          chargement={envoi}
          onPress={() => void document()}
        />
      )}
      {modifiable && total >= PIECES_MAX && (
        <Texte variante="discret">{t('pieces.maximum', { n: PIECES_MAX })}</Texte>
      )}
    </View>
  );
}
