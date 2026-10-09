/**
 * OFF-001 (0.8.1) : la synchronisation se lance d'elle-même à la connexion et au retour dans
 * l'application quand la dernière date de plus de 30 minutes ; le profil en montre l'état et
 * permet de la relancer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, View } from 'react-native';
import { Bouton, Carte, Ligne, Texte } from './composants';
import { useSession } from './session';
import { aRafraichir, derniereSynchro, type EtatSynchro, synchroniser } from './synchro';

type Ecouteur = (etat: EtatSynchro) => void;
const ecouteurs = new Set<Ecouteur>();

/** Synchronise et prévient les écrans qui montrent l'état. */
async function lancer(client: Parameters<typeof synchroniser>[0]) {
  const etat = await synchroniser(client);
  ecouteurs.forEach((e) => e(etat));
  return etat;
}

/** Sans affichage : déclenche la synchronisation quand il le faut. */
export function SynchroAuto() {
  const { client, etat } = useSession();
  const connecte = etat.statut === 'connecte';
  const enCours = useRef(false);

  const peutEtre = useCallback(async () => {
    if (!connecte || enCours.current) return;
    if (!aRafraichir(await derniereSynchro())) return;
    enCours.current = true;
    // Sans réseau, rien ne change : on réessaiera au prochain retour.
    await lancer(client).catch(() => undefined);
    enCours.current = false;
  }, [client, connecte]);

  useEffect(() => {
    void peutEtre();
    const abonnement = AppState.addEventListener('change', (statut) => {
      if (statut === 'active') void peutEtre();
    });
    return () => abonnement.remove();
  }, [peutEtre]);
  return null;
}

/** L'état de la dernière synchronisation et le bouton pour la relancer. */
export function CarteSynchro() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [etat, setEtat] = useState<EtatSynchro | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    void derniereSynchro().then(setEtat);
    ecouteurs.add(setEtat);
    return () => {
      ecouteurs.delete(setEtat);
    };
  }, []);

  const quand = etat
    ? new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(etat.le))
    : null;

  return (
    <Carte>
      <Texte variante="sousTitre" style={{ marginBottom: 6 }}>
        {t('synchro.titre')}
      </Texte>
      <Texte variante="discret" style={{ marginBottom: 8 }}>
        {t('synchro.aide')}
      </Texte>
      {etat ? (
        <>
          <Ligne libelle={t('synchro.derniere')} valeur={quand ?? '—'} />
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
          onPress={() => {
            setEnvoi(true);
            setEchec(false);
            lancer(client)
              .then(setEtat)
              .catch(() => setEchec(true))
              .finally(() => setEnvoi(false));
          }}
        />
      </View>
    </Carte>
  );
}
