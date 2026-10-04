import type { ClientApi, Jetons } from '@innov/api-client';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { creerClientPortail } from './client';
import { ContexteSession, type Etat, type Session } from './contexteSession';

/** Une session ouverte charge aussitôt le périmètre (rôles, pays, actions permises). */
async function ouvrir(client: ClientApi, jetons: Jetons): Promise<Etat> {
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
      clientFourni ??
      creerClientPortail(() => setEtat({ statut: 'anonyme', sessionExpiree: true })),
    [clientFourni],
  );

  useEffect(() => {
    // Au chargement, reprendre la session du cookie si elle est encore valable.
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
      async choisirPays(code) {
        if (etat.statut !== 'connecte') return;
        client.choisirPays(code);
        setEtat({ ...etat, perimetre: await client.perimetre() });
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
