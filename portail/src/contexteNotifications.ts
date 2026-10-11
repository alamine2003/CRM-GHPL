import { createContext, useContext } from 'react';

export type GraviteNotification = 'success' | 'info' | 'warning' | 'error';

export type Notifier = (message: string, gravite?: GraviteNotification) => void;

export const ContexteNotifications = createContext<Notifier>(() => undefined);

/** Affiche un message bref en bas de l'écran (« Modification enregistrée. »). */
export function useNotifier(): Notifier {
  return useContext(ContexteNotifications);
}
