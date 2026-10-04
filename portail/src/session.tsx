import type { ClientApi } from '@innov/api-client';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { creerClientPortail } from './client';
import { ContexteSession, type Etat, type Session } from './contexteSession';

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
      .then((jetons) => actif && setEtat({ statut: 'connecte', utilisateur: jetons.utilisateur }))
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
        setEtat({ statut: 'connecte', utilisateur: jetons.utilisateur });
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
