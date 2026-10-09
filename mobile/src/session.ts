import { type ClientApi, ErreurApi, type Moi, type Perimetre } from '@innov/api-client';
import { createContext, useContext } from 'react';

export type Etat =
  | { statut: 'chargement' }
  | {
      statut: 'anonyme';
      sessionExpiree?: boolean;
      /** SEC-006 : téléphone révoqué ou compte désactivé, les données locales sont effacées. */
      effacement?: boolean;
      /** Rôle sensible sans double authentification : l'activer depuis le portail (SEC-003). */
      doubleAuthRequise?: boolean;
    }
  | { statut: 'connecte'; utilisateur: Moi; perimetre: Perimetre };

export interface Session {
  etat: Etat;
  client: ClientApi;
  /** Renvoie le jeton d'étape si un code de double authentification est demandé (SEC-003). */
  connexion(identifiant: string, motDePasse: string): Promise<string | null>;
  validerCode(jetonEtape: string, code: string): Promise<void>;
  deconnexion(): Promise<void>;
  /** Change la langue ; elle est mémorisée sur le compte (USR-004). */
  changerLangue(langue: string): Promise<void>;
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
