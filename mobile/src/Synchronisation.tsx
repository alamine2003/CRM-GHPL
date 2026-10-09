/**
 * OFF-001 (0.8.1) : la synchronisation se lance d'elle-même à la connexion et au retour dans
 * l'application quand la dernière date de plus de 30 minutes ; le profil en montre l'état et
 * permet de la relancer.
 *
 * 0.8.3 : l'heure de la dernière synchronisation et le nombre d'envois en attente sont visibles
 * sur chaque écran (OFF-003 CA1) ; la file repart d'elle-même tant qu'elle n'est pas vide ; au-delà
 * du délai du pays sans synchronisation, les données sont masquées jusqu'à la prochaine
 * synchronisation réussie, la file restant gardée (OFF-007, RG-054).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { marque } from '@innov/design';
import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CarteAttente } from './Attente';
import {
  abandonnerEnvoi,
  ecouterFile,
  type Envoi,
  envoyerAttente,
  lireAttente,
} from './Brouillons';
import { Alerte, Bouton, Carte, Ligne, Logo, Texte, usePalette } from './composants';
import { police } from './polices';
import { useSession } from './session';
import {
  aRafraichir,
  delaiHorsLigne,
  derniereSynchro,
  type EtatSynchro,
  horsDelai,
  synchroniser,
} from './synchro';
import { horloge } from './Verrou';

type Ecouteur = (etat: EtatSynchro) => void;
const ecouteurs = new Set<Ecouteur>();

/** Tant que la file n'est pas vide, elle est retentée à ce rythme (réseau revenu ou non). */
export const RELANCE_FILE_MS = 60 * 1000;

/** Synchronise et prévient les écrans qui montrent l'état. */
async function lancer(client: Parameters<typeof synchroniser>[0]) {
  const etat = await synchroniser(client);
  ecouteurs.forEach((e) => e(etat));
  return etat;
}

/** La dernière synchronisation et la file d'envoi, tenues à jour pour l'affichage. */
export function useEtatLocal() {
  const [derniere, setDerniere] = useState<EtatSynchro | null>(null);
  const [attente, setAttente] = useState<Envoi[]>([]);
  const [charge, setCharge] = useState(false);
  useEffect(() => {
    let actif = true;
    void derniereSynchro().then((e) => {
      if (!actif) return;
      setDerniere(e);
      setCharge(true);
    });
    void lireAttente().then((a) => actif && setAttente(a));
    ecouteurs.add(setDerniere);
    const arreter = ecouterFile(setAttente);
    return () => {
      actif = false;
      ecouteurs.delete(setDerniere);
      arreter();
    };
  }, []);
  return { derniere, attente, charge };
}

function useQuand() {
  const { t, i18n } = useTranslation();
  const heure = (date: Date) =>
    new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(date);
  const jour = (date: Date) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(date);
  const aujourdhui = (date: Date) =>
    date.toDateString() === new Date(horloge.maintenant()).toDateString();
  return {
    /** « aujourd'hui à 14:32 », « le 7 oct. à 14:32 ». */
    long(le: string) {
      const date = new Date(le);
      return aujourdhui(date)
        ? t('synchro.aujourdhui', { heure: heure(date) })
        : t('synchro.leJour', { jour: jour(date), heure: heure(date) });
    },
    /** La ligne de chaque écran tient sur un petit téléphone : l'heure, ou le jour. */
    court(le: string) {
      const date = new Date(le);
      return aujourdhui(date)
        ? t('synchro.ligneHeure', { heure: heure(date) })
        : t('synchro.ligneJour', { jour: jour(date) });
    },
  };
}

/** Sans affichage : déclenche la synchronisation, et l'envoi de la file, quand il le faut. */
export function SynchroAuto() {
  const { client, etat } = useSession();
  const connecte = etat.statut === 'connecte';
  const enCours = useRef(false);

  const peutEtre = useCallback(async () => {
    if (!connecte || enCours.current) return;
    enCours.current = true;
    // OFF-003 : la file part d'abord ; sans réseau, elle reste et sera retentée.
    if ((await lireAttente()).length) await envoyerAttente(client).catch(() => 0);
    // Sans réseau, rien ne change : on réessaiera au prochain retour.
    if (aRafraichir(await derniereSynchro(), horloge.maintenant()))
      await lancer(client).catch(() => undefined);
    enCours.current = false;
  }, [client, connecte]);

  useEffect(() => {
    void peutEtre();
    const abonnement = AppState.addEventListener('change', (statut) => {
      if (statut === 'active') void peutEtre();
    });
    // Tant que des envois attendent, on retente régulièrement : le retour du réseau suffit.
    const minuterie = setInterval(() => {
      if (AppState.currentState === 'background') return;
      void lireAttente().then((a) => {
        if (a.length) void peutEtre();
      });
    }, RELANCE_FILE_MS);
    return () => {
      abonnement.remove();
      clearInterval(minuterie);
    };
  }, [peutEtre]);
  return null;
}

/** L'état de la dernière synchronisation, la file d'envoi et le bouton pour relancer. */
export function CarteSynchro() {
  const { t } = useTranslation();
  const { client } = useSession();
  const { derniere: etat, attente } = useEtatLocal();
  const quand = useQuand();
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState(false);

  const relancer = () => {
    setEnvoi(true);
    setEchec(false);
    envoyerAttente(client)
      .catch(() => 0)
      .then(() => lancer(client))
      .catch(() => setEchec(true))
      .finally(() => setEnvoi(false));
  };

  return (
    <>
      <Carte>
        <Texte variante="sousTitre" style={{ marginBottom: 6 }}>
          {t('synchro.titre')}
        </Texte>
        <Texte variante="discret" style={{ marginBottom: 8 }}>
          {t('synchro.aide')}
        </Texte>
        {etat ? (
          <>
            <Ligne libelle={t('synchro.derniere')} valeur={quand.long(etat.le)} />
            <Ligne libelle={t('synchro.enAttente')} valeur={String(attente.length)} />
            <Ligne libelle={t('synchro.visites')} valeur={String(etat.visites)} />
            <Ligne libelle={t('synchro.prospects')} valeur={String(etat.prospects)} />
            <Ligne libelle={t('synchro.historiques')} valeur={String(etat.historiques)} />
            <Ligne
              libelle={t('synchro.rapports')}
              valeur={String(etat.rapports ?? 0)}
              derniere={!etat.echecs}
            />
            {etat.echecs > 0 && (
              <Ligne
                libelle={t('synchro.incomplete')}
                valeur={t('synchro.echecs', { count: etat.echecs })}
                derniere
              />
            )}
          </>
        ) : (
          <Texte>{t('synchro.jamais')}</Texte>
        )}
        {echec && (
          <Texte variante="discret" style={{ marginTop: 8 }}>
            {t('synchro.sansReseau')}
          </Texte>
        )}
        <View style={{ marginTop: 12 }}>
          <Bouton
            libelle={t('synchro.maintenant')}
            secondaire
            chargement={envoi}
            onPress={relancer}
          />
        </View>
      </Carte>
      {attente.length > 0 && (
        <CarteAttente
          envois={attente}
          envoi={envoi}
          surEnvoyer={relancer}
          surAbandonner={(id) => void abandonnerEnvoi(id)}
        />
      )}
    </>
  );
}

/**
 * OFF-003 CA1 : sous l'en-tête de chaque écran, l'heure de la dernière synchronisation et le
 * nombre d'envois en attente ; un appui ouvre le profil, où les relancer.
 */
export function LigneSynchro() {
  const { t } = useTranslation();
  const p = usePalette();
  const routeur = useRouter();
  const { derniere, attente } = useEtatLocal();
  const quand = useQuand();
  const texte = [
    derniere ? quand.court(derniere.le) : t('synchro.ligneJamais'),
    attente.length ? t('attente.titre', { count: attente.length }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const enAttente = attente.length > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texte}
      accessibilityHint={t('synchro.ligneAide')}
      onPress={() => routeur.push('/profil')}
      style={[styles.ligne, { backgroundColor: p.surface, borderBottomColor: p.ligne }]}
    >
      <MaterialIcons
        name={enAttente ? 'cloud-upload' : derniere ? 'cloud-done' : 'cloud-off'}
        size={16}
        color={enAttente ? p.attention : p.texteSecondaire}
      />
      <Text
        numberOfLines={1}
        style={[styles.texteLigne, { color: enAttente ? p.texte : p.texteSecondaire }]}
      >
        {texte}
      </Text>
    </Pressable>
  );
}

/**
 * OFF-007 CA1 : au-delà du délai du pays sans synchronisation, l'application ne montre plus
 * ses données et demande de synchroniser. CA2 : la file n'est pas effacée ; elle part à la
 * synchronisation qui lève la garde.
 */
export function GardeHorsLigne({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const p = usePalette();
  const marges = useSafeAreaInsets();
  const { etat, client } = useSession();
  const { derniere, attente, charge } = useEtatLocal();
  const quand = useQuand();
  const [delai, setDelai] = useState<number | null>(null);
  const [, setTic] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    void delaiHorsLigne().then(setDelai);
    // Le temps passe aussi application ouverte : on revérifie chaque minute et au retour.
    const minuterie = setInterval(() => setTic((n) => n + 1), RELANCE_FILE_MS);
    const abonnement = AppState.addEventListener('change', (statut) => {
      if (statut === 'active') setTic((n) => n + 1);
    });
    return () => {
      clearInterval(minuterie);
      abonnement.remove();
    };
  }, [derniere]);

  if (etat.statut !== 'connecte') return <>{children}</>;
  // Rien ne s'affiche tant que la date et le délai ne sont pas relus (quelques millisecondes).
  if (!charge || delai === null) return null;
  if (!derniere || !horsDelai(derniere, delai, horloge.maintenant())) return <>{children}</>;

  return (
    <View
      style={[
        styles.garde,
        { backgroundColor: p.fond, paddingTop: marges.top + 32, paddingBottom: marges.bottom },
      ]}
    >
      <Logo taille={40} />
      <Carte style={{ gap: 12, alignSelf: 'stretch' }}>
        <View style={styles.titreGarde}>
          <MaterialIcons name="cloud-off" size={24} color={marque.orange} />
          <Texte variante="sousTitre" style={{ flex: 1 }}>
            {t('synchro.garde.titre')}
          </Texte>
        </View>
        <Texte>{t('synchro.garde.aide', { count: delai, quand: quand.long(derniere.le) })}</Texte>
        {attente.length > 0 && (
          <Alerte type="info">{t('synchro.garde.attente', { count: attente.length })}</Alerte>
        )}
        {echec && <Alerte type="attention">{t('synchro.sansReseau')}</Alerte>}
        <Bouton
          libelle={t('synchro.maintenant')}
          chargement={envoi}
          onPress={() => {
            setEnvoi(true);
            setEchec(false);
            envoyerAttente(client)
              .catch(() => 0)
              .then(() => lancer(client))
              .catch(() => setEchec(true))
              .finally(() => setEnvoi(false));
          }}
        />
      </Carte>
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: {
    minHeight: 32,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  texteLigne: { flex: 1, fontFamily: police.texte, fontSize: 13, lineHeight: 18 },
  garde: { flex: 1, alignItems: 'center', paddingHorizontal: 16, gap: 24 },
  titreGarde: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
