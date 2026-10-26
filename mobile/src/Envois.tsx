/**
 * Les envois en attente (OFF-003), selon la maquette 1.5.1 : ce qui a été enregistré sans réseau
 * et partira de soi-même au retour du réseau. Chaque envoi se lit (ce que c'est, pour qui, à
 * quelle heure il a été saisi) et peut être abandonné ; « Envoyer maintenant » rejoue la file.
 * Un envoi refusé garde son message ; une visite en conflit montre les deux versions (OFF-004).
 * Sur la tablette, l'état des données hors connexion est à droite.
 */
import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  abandonnerEnvoi,
  ecouterReseau,
  type Envoi,
  envoyerAttente,
  garderMaVersion,
  lireReseau,
} from './Brouillons';
import { Alerte, Bouton, Carte, Ligne, Statut, Texte, usePalette } from './composants';
import { differencesVisite, TableauDifferences } from './Conflits';
import { useTablette } from './disposition';
import { Ecran } from './Ecran';
import { police } from './polices';
import { useSession } from './session';
import { useEtatLocal, useQuand, useRelance } from './Synchronisation';

const heure = (iso: string, langue: string) =>
  new Intl.DateTimeFormat(langue, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function EcranEnvois() {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const tablette = useTablette();
  const { client } = useSession();
  const { derniere, attente } = useEtatLocal();
  const reseau = useSyncExternalStore(ecouterReseau, lireReseau);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<{ partis: number; restants: number } | null>(null);

  async function envoyer() {
    setEnvoi(true);
    setResultat(null);
    const avant = attente.length;
    const partis = await envoyerAttente(client).catch(() => 0);
    setResultat({ partis, restants: avant - partis });
    setEnvoi(false);
  }

  const sansReseau = reseau?.joignable === false;
  const etatReseau = sansReseau ? <Statut ton="wa">{t('attente.sansReseau')}</Statut> : null;
  const surTitreTelephone = sansReseau
    ? `${t('attente.sansReseau')} · ${heure(reseau.le, i18n.language)}`
    : undefined;

  const boutonEnvoyer = attente.length ? (
    <Bouton
      libelle={t('attente.envoyer')}
      petit={tablette}
      chargement={envoi}
      onPress={() => void envoyer()}
    />
  ) : null;

  const issue =
    resultat === null ? null : resultat.partis > 0 ? (
      <Alerte type="info">{t('attente.envoyes', { count: resultat.partis })}</Alerte>
    ) : resultat.restants > 0 ? (
      <Alerte type="attention">{t('synchro.sansReseau')}</Alerte>
    ) : null;

  const liste = attente.length ? (
    <Carte marge={0} style={{ ...styles.liste, borderLeftColor: p.orange }}>
      {attente.map((e, i) => (
        <LigneEnvoi
          key={e.id}
          envoi={e}
          tablette={tablette}
          derniere={i === attente.length - 1}
          surRelancer={() => void envoyer()}
        />
      ))}
    </Carte>
  ) : (
    <Carte>
      <Texte variante="fort">{t('attente.vide')}</Texte>
    </Carte>
  );

  if (tablette) {
    return (
      <Ecran
        titre={t('attente.titre', { count: attente.length })}
        retour
        enteteTablette={{
          surTitre: t('attente.surTablette'),
          action: (
            <View style={styles.actions}>
              {etatReseau}
              {boutonEnvoyer}
            </View>
          ),
        }}
        droite={<VoletHorsConnexion attente={attente.length} rapports={derniere?.rapports} />}
        largeurDroite={380}
      >
        {issue}
        {liste}
        <Alerte type="info">{t('attente.heureSaisie')}</Alerte>
      </Ecran>
    );
  }

  return (
    <Ecran
      titre={t('attente.titre', { count: attente.length })}
      surTitre={surTitreTelephone}
      retour
    >
      {attente.length > 0 && (
        <Texte variante="libelle">{t('attente.aide', { count: attente.length })}</Texte>
      )}
      {liste}
      {boutonEnvoyer}
      {issue}
    </Ecran>
  );
}

/**
 * Une ligne de la file : ce que c'est, pour qui ; l'heure de saisie sur la tablette ; le refus
 * du serveur s'il y en a un. « Abandonner » un envoi pas encore refusé demande confirmation :
 * il n'est pas encore parti et serait perdu.
 */
function LigneEnvoi({
  envoi: e,
  tablette,
  derniere,
  surRelancer,
}: {
  envoi: Envoi;
  tablette: boolean;
  derniere: boolean;
  surRelancer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const p = usePalette();
  const [confirmer, setConfirmer] = useState(false);
  const conflit = e.type === 'modif_visite' && e.conflit ? e.conflit : null;
  const abandonner = () => void abandonnerEnvoi(e.id);

  return (
    <View
      style={[
        styles.ligne,
        tablette && styles.ligneLarge,
        !derniere && { borderBottomWidth: 1, borderBottomColor: p.ligne },
      ]}
    >
      <View style={styles.rangee}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[styles.nom, { color: p.texte }]}>
            {t(`attente.types.${e.type}`)}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: p.texteSecondaire }]}>
            {[e.resume, !tablette && e.le ? heure(e.le, i18n.language) : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {tablette && e.le ? <Texte variante="libelle">{heure(e.le, i18n.language)}</Texte> : null}
        {!conflit && !confirmer && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('attente.abandonnerUn', { resume: e.resume })}
            onPress={() => (e.erreur ? abandonner() : setConfirmer(true))}
            hitSlop={8}
            style={styles.abandonner}
          >
            <Text style={[styles.lien, { color: p.erreur }]}>{t('attente.abandonner')}</Text>
          </Pressable>
        )}
      </View>
      {e.erreur ? <Text style={[styles.meta, { color: p.erreur }]}>{e.erreur}</Text> : null}
      {confirmer && (
        <View style={{ gap: 8 }}>
          <Texte variante="discret">{t('attente.confirmer')}</Texte>
          <View style={styles.actions}>
            <Bouton
              variante="contour"
              petit
              libelle={t('attente.garder')}
              onPress={() => setConfirmer(false)}
            />
            <Bouton petit libelle={t('attente.abandonner')} onPress={abandonner} />
          </View>
        </View>
      )}
      {conflit && e.type === 'modif_visite' ? (
        <View style={{ gap: 8 }}>
          <TableauDifferences
            lignes={differencesVisite(conflit, e.saisie as Record<string, unknown>, t)}
          />
          <Bouton
            libelle={t('conflits.garderTelephone')}
            onPress={() => void garderMaVersion(e.id).then(surRelancer)}
          />
          <Bouton variante="contour" libelle={t('conflits.garderServeur')} onPress={abandonner} />
        </View>
      ) : null}
    </View>
  );
}

/** Tablette : la dernière synchronisation, la file, les rapports prêts ; et la relancer. */
function VoletHorsConnexion({ attente, rapports }: { attente: number; rapports?: number }) {
  const { t } = useTranslation();
  const p = usePalette();
  const { derniere } = useEtatLocal();
  const quand = useQuand();
  const { relancer, envoi, echec } = useRelance();
  return (
    <View style={{ padding: 24, gap: 16 }}>
      <Texte variante="sousTitre" accessibilityRole="header">
        {t('synchro.titre')}
      </Texte>
      <Carte marge={0}>
        <Ligne
          libelle={t('synchro.derniere')}
          valeur={derniere ? quand.long(derniere.le) : t('synchro.ligneJamais')}
        />
        <View style={[styles.kv, { borderBottomColor: p.ligne }]}>
          <Texte variante="discret" style={{ fontSize: 13 }}>
            {t('synchro.enAttente')}
          </Texte>
          <Text style={[styles.compte, { color: attente ? p.orange : p.texte }]}>{attente}</Text>
        </View>
        <Ligne libelle={t('synchro.rapportsCourt')} valeur={String(rapports ?? 0)} derniere />
      </Carte>
      {echec && <Texte variante="discret">{t('synchro.sansReseau')}</Texte>}
      <Bouton
        variante="contour"
        libelle={t('synchro.maintenant')}
        chargement={envoi}
        onPress={relancer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  liste: { overflow: 'hidden', borderLeftWidth: 3 },
  ligne: { paddingHorizontal: 16, paddingVertical: 10, minHeight: 64, gap: 8 },
  ligneLarge: { paddingHorizontal: 24, minHeight: 72, justifyContent: 'center' },
  rangee: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nom: { fontFamily: police.texteFort, fontSize: 15, lineHeight: 21 },
  meta: { fontFamily: police.texte, fontSize: 13, lineHeight: 18 },
  abandonner: { minHeight: 44, justifyContent: 'center' },
  lien: { fontFamily: police.texteFort, fontSize: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  compte: { fontFamily: police.texteGras, fontSize: 14, lineHeight: 20 },
});
