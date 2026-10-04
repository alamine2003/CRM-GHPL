import type { ClientApi, Jetons } from '@innov/api-client';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { creerClientMobile } from './client';
import i18n from './i18n';
import { ContexteSession, type Etat, type Session } from './session';

/** Une session ouverte charge aussitôt le périmètre (rôles, pays, actions permises). */
async function ouvrir(client: ClientApi, jetons: Jetons): Promise<Etat> {
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
      clientFourni ?? creerClientMobile(() => setEtat({ statut: 'anonyme', sessionExpiree: true })),
    [clientFourni],
  );

  useEffect(() => {
    // Reprendre la session enregistrée dans le magasin sécurisé, s'il y en a une.
    let actif = true;
    client
      .reprendre()
      .then((jetons) => ouvrir(client, jetons))
      .then((etatConnecte) => actif && setEtat(etatConnecte))
      .catch(() => actif && setEtat({ statut: 'anonyme' }));
    return () => {
      actif = false;
    };
  }, [client]);

  const valeur = useMemo<Session>(
    () => ({
      etat,
      client,
      async connexion(identifiant, motDePasse) {
        const jetons = await client.connexion(identifiant, motDePasse);
        setEtat(await ouvrir(client, jetons));
      },
      async changerLangue(langue) {
        await i18n.changeLanguage(langue);
        if (etat.statut !== 'connecte' || etat.utilisateur.langue === langue) return;
        const moi = await client.changerLangue(langue as 'fr' | 'en').catch(() => null);
        if (moi) setEtat({ ...etat, utilisateur: moi });
      },
      async deconnexion() {
        await client.deconnexion().catch(() => undefined);
        setEtat({ statut: 'anonyme' });
      },
    }),
    [etat, client],
  );
  return <ContexteSession.Provider value={valeur}>{children}</ContexteSession.Provider>;
}
