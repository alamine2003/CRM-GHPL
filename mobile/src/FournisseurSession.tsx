import { type ClientApi, ErreurApi, type Jetons } from '@innov/api-client';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { effacer } from './baseLocale';
import { effacerFichiers } from './BrouillonRapport';
import { creerClientMobile } from './client';
import i18n from './i18n';
import { ContexteSession, type Etat, type Session } from './session';

/** Une session ouverte charge aussitôt le périmètre (rôles, pays, actions permises). */
async function ouvrir(client: ClientApi, jetons: Jetons): Promise<Etat> {
  // L'activation se fait depuis le portail (QR code) : l'application ne garde pas la session.
  if (jetons.double_auth_a_activer) {
    await client.deconnexion().catch(() => undefined);
    return { statut: 'anonyme', doubleAuthRequise: true };
  }
  // La langue choisie sur le compte suit l'utilisateur d'un appareil à l'autre (USR-004).
  if (jetons.utilisateur.langue && jetons.utilisateur.langue !== i18n.language) {
    await i18n.changeLanguage(jetons.utilisateur.langue);
  }
  return {
    statut: 'connecte',
    utilisateur: jetons.utilisateur,
    perimetre: await client.perimetre(),
  };
}

/** SEC-006 : refus qui commandent l'effacement des données du téléphone. */
const CODES_EFFACEMENT = new Set(['appareil_revoque', 'compte_desactive']);

export function doitEffacer(erreur: unknown) {
  return erreur instanceof ErreurApi && CODES_EFFACEMENT.has(erreur.code);
}

/** Rien ne reste sur le téléphone : base locale chiffrée (file comprise) et documents. */
export async function toutEffacer() {
  await effacer().catch(() => undefined);
  await effacerFichiers();
}

export function FournisseurSession({
  children,
  client: clientFourni,
}: {
  children: ReactNode;
  client?: ClientApi;
}) {
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });
  const client = useMemo(
    () =>
      clientFourni ??
      creerClientMobile((erreur) => {
        if (!doitEffacer(erreur)) return setEtat({ statut: 'anonyme', sessionExpiree: true });
        void toutEffacer().then(() => setEtat({ statut: 'anonyme', effacement: true }));
      }),
    [clientFourni],
  );

  useEffect(() => {
    // Reprendre la session enregistrée dans le magasin sécurisé, s'il y en a une.
    let actif = true;
    client
      .reprendre()
      .then((jetons) => ouvrir(client, jetons))
      .then((etatConnecte) => actif && setEtat(etatConnecte))
      .catch(async (erreur) => {
        // SEC-006 CA1 : à la reprise, un téléphone révoqué efface tout et revient à la connexion.
        if (doitEffacer(erreur)) await toutEffacer();
        if (actif) setEtat({ statut: 'anonyme', effacement: doitEffacer(erreur) || undefined });
      });
    return () => {
      actif = false;
    };
  }, [client]);

  const valeur = useMemo<Session>(
    () => ({
      etat,
      client,
      async connexion(identifiant, motDePasse) {
        const resultat = await client.connexion(identifiant, motDePasse).catch(async (e) => {
          if (doitEffacer(e)) await toutEffacer();
          throw e;
        });
        if (resultat.etape === 'code_requis') return resultat.jetonEtape;
        setEtat(await ouvrir(client, resultat.jetons));
        return null;
      },
      async validerCode(jetonEtape, code) {
        setEtat(await ouvrir(client, await client.connexionCode(jetonEtape, code)));
      },
      async changerLangue(langue) {
        await i18n.changeLanguage(langue);
        if (etat.statut !== 'connecte' || etat.utilisateur.langue === langue) return;
        const moi = await client.changerLangue(langue as 'fr' | 'en').catch(() => null);
        if (moi) setEtat({ ...etat, utilisateur: moi });
      },
      async deconnexion() {
        await client.deconnexion().catch(() => undefined);
        // Rien ne reste sur le téléphone après la déconnexion.
        await toutEffacer();
        setEtat({ statut: 'anonyme' });
      },
    }),
    [etat, client],
  );
  return <ContexteSession.Provider value={valeur}>{children}</ContexteSession.Provider>;
}
