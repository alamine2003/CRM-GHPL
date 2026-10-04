import { type ClientApi, ErreurApi, type Moi } from '@innov/api-client';
import { createContext, useContext } from 'react';

export type Etat =
  | { statut: 'chargement' }
  | { statut: 'anonyme'; sessionExpiree?: boolean }
  | { statut: 'connecte'; utilisateur: Moi };

export interface Session {
  etat: Etat;
  client: ClientApi;
  connexion(identifiant: string, motDePasse: string): Promise<void>;
  deconnexion(): Promise<void>;
}

export const ContexteSession = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(ContexteSession);
  if (!session) throw new Error('useSession hors de FournisseurSession');
  return session;
}

export function messageErreur(erreur: unknown, messageReseau: string): string {
  return erreur instanceof ErreurApi ? erreur.message : messageReseau;
}
