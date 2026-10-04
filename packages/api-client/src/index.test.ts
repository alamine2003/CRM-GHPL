import { describe, expect, it, vi } from 'vitest';
import { creerClient, ErreurApi, type StockageRafraichissement } from './index';

const MOI = {
  id: '1',
  identifiant: 'awa.diallo',
  prenom: 'Awa',
  nom: 'Diallo',
  courriel: '',
  pays_principal: null,
  est_siege: false,
};

function jetons(acces: string, rafraichissement: string | null) {
  return { acces, expire_dans: 900, rafraichissement, utilisateur: MOI };
}

function reponse(statut: number, corps?: unknown) {
  return new Response(corps === undefined ? null : JSON.stringify(corps), { status: statut });
}

function stockageMemoire(initial: string | null = null): StockageRafraichissement & {
  valeur: string | null;
} {
  return {
    valeur: initial,
    async lire() {
      return this.valeur;
    },
    async ecrire(jeton) {
      this.valeur = jeton;
    },
  };
}

describe('client mobile', () => {
  it('garde le rafraîchissement dans le stockage et l’accès en mémoire', async () => {
    const stockage = stockageMemoire();
    const appel = vi.fn(async () => reponse(200, jetons('A1', 'R1')));
    const client = creerClient({
      baseUrl: 'http://api',
      client: 'mobile',
      langue: () => 'fr',
      stockage,
      fetch: appel,
    });
    await client.connexion('awa.diallo', `${Date.now()}`);
    expect(stockage.valeur).toBe('R1');
    expect(client.estConnecte()).toBe(true);
    const [, init] = appel.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>)['Accept-Language']).toBe('fr');
  });

  it('rafraîchit une seule fois sur 401 puis rejoue la requête', async () => {
    const stockage = stockageMemoire('R1');
    const appel = vi
      .fn()
      .mockResolvedValueOnce(reponse(401, { code: 'session_invalide', message: 'x' }))
      .mockResolvedValueOnce(reponse(200, jetons('A2', 'R2')))
      .mockResolvedValueOnce(reponse(200, MOI));
    const client = creerClient({
      baseUrl: 'http://api',
      client: 'mobile',
      langue: () => 'fr',
      stockage,
      fetch: appel,
    });
    expect((await client.moi()).prenom).toBe('Awa');
    expect(stockage.valeur).toBe('R2');
    const derniere = appel.mock.calls[2]![1] as RequestInit;
    expect((derniere.headers as Record<string, string>).Authorization).toBe('Bearer A2');
  });

  it('signale la session perdue et efface le stockage', async () => {
    const stockage = stockageMemoire('R1');
    const surSessionPerdue = vi.fn();
    const appel = vi
      .fn()
      .mockResolvedValueOnce(reponse(401, { code: 'session_invalide', message: 'x' }))
      .mockResolvedValueOnce(reponse(401, { code: 'session_expiree', message: 'Expirée' }));
    const client = creerClient({
      baseUrl: 'http://api',
      client: 'mobile',
      langue: () => 'fr',
      stockage,
      fetch: appel,
      surSessionPerdue,
    });
    await expect(client.moi()).rejects.toMatchObject({ code: 'session_expiree' });
    expect(surSessionPerdue).toHaveBeenCalledOnce();
    expect(stockage.valeur).toBeNull();
  });

  it('exige un stockage sécurisé', () => {
    expect(() => creerClient({ baseUrl: 'x', client: 'mobile', langue: () => 'fr' })).toThrow();
  });
});

describe('client portail', () => {
  it('envoie le cookie et l’en-tête client, sans jamais recevoir le rafraîchissement', async () => {
    const appel = vi.fn(async () => reponse(200, jetons('A1', null)));
    const client = creerClient({
      baseUrl: 'http://api/',
      client: 'portail',
      langue: () => 'en',
      fetch: appel,
    });
    await client.reprendre();
    const [url, init] = appel.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api/api/v1/auth/rafraichir/');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['X-Innov-Client']).toBe('portail');
  });

  it('transmet le code et le message traduits du serveur', async () => {
    const appel = vi.fn(async () =>
      reponse(423, { code: 'compte_verrouille', message: 'Compte verrouillé', details: {} }),
    );
    const client = creerClient({
      baseUrl: 'http://api',
      client: 'portail',
      langue: () => 'fr',
      fetch: appel,
    });
    const erreur = await client.connexion('a.b', 'c').catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurApi);
    expect(erreur).toMatchObject({
      statut: 423,
      code: 'compte_verrouille',
      message: 'Compte verrouillé',
    });
  });

  it('ne lance qu’un rafraîchissement pour des requêtes simultanées', async () => {
    const appel = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('rafraichir/') ? reponse(200, jetons('A1', null)) : reponse(200, MOI),
    );
    const client = creerClient({
      baseUrl: 'http://api',
      client: 'portail',
      langue: () => 'fr',
      fetch: appel,
    });
    await Promise.all([client.reprendre(), client.reprendre()]);
    expect(appel.mock.calls.filter(([u]) => String(u).endsWith('rafraichir/'))).toHaveLength(1);
  });
});
