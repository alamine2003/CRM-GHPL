import { type ClientApi, ErreurApi, type Moi, type Perimetre } from '@innov/api-client';
import { createContext, useContext } from 'react';

export type Etat =
  | { statut: 'chargement' }
  | { statut: 'anonyme'; sessionExpiree?: boolean }
  | {
      statut: 'connecte';
      utilisateur: Moi;
      perimetre: Perimetre;
      /** Rôle sensible sans double authentification : rien n'est accessible avant (SEC-003). */
      doubleAuthAActiver: boolean;
    };

export interface Session {
  etat: Etat;
  client: ClientApi;
  /** Renvoie le jeton d'étape si le code à usage unique est attendu, sinon null. */
  connexion(identifiant: string, motDePasse: string): Promise<string | null>;
  validerCode(jetonEtape: string, code: string): Promise<void>;
  /** Après l'activation obligatoire : charge enfin le périmètre. */
  doubleAuthActivee(): Promise<void>;
  deconnexion(): Promise<void>;
  /** Change le pays actif (code ISO), ou revient au pays principal / à la vue consolidée. */
  choisirPays(code: string | null): Promise<void>;
  /** Change la langue de l'interface ; connecté, elle est mémorisée sur le compte (USR-004). */
  changerLangue(langue: string): Promise<void>;
}

export const ContexteSession = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(ContexteSession);
  if (!session) throw new Error('useSession hors de FournisseurSession');
  return session;
}

/** Message affichable pour une erreur d'API : celui du serveur, déjà traduit. */
export function messageErreur(erreur: unknown, messageReseau: string): string {
  return erreur instanceof ErreurApi ? erreur.message : messageReseau;
}
