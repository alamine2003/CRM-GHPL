/* global open, __ENV */
// Charge HTTP réelle sur la préproduction (0.9.4, NFR-001, NFR-002) avec k6 :
//   k6 run -e API=https://api.preprod.exemple -e JETONS=jetons.json deploiement/charge/scenario.js
// `jetons.json` (jamais commité) : {"delegue": ["…"], "superviseur": ["…"], "responsable": ["…"]}
// — des jetons d'accès de comptes de démonstration, obtenus par la connexion.
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API;
const JETONS = JSON.parse(open(__ENV.JETONS));

export const options = {
  scenarios: {
    // Un matin de semaine : la plupart des délégués synchronisent entre 7 h et 9 h.
    delegues: { executor: 'constant-vus', vus: 100, duration: '10m', exec: 'delegue' },
    superviseurs: { executor: 'constant-vus', vus: 15, duration: '10m', exec: 'superviseur' },
    responsables: { executor: 'constant-vus', vus: 3, duration: '10m', exec: 'responsable' },
  },
  thresholds: {
    // NFR-002 : 1 s au 95e centile pour le portail sur une bonne connexion.
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

function lire(role, chemins) {
  const liste = JETONS[role];
  const jeton = liste[Math.floor(Math.random() * liste.length)];
  const entetes = { headers: { Authorization: `Bearer ${jeton}`, 'Accept-Encoding': 'gzip' } };
  for (const chemin of chemins) {
    const r = http.get(`${API}${chemin}`, entetes);
    check(r, { [`${chemin} 200`]: (x) => x.status === 200 });
  }
}

export function delegue() {
  lire('delegue', [
    '/api/v1/programme/',
    '/api/v1/plannings/semaine/',
    '/api/v1/ciblage/moi/',
    '/api/v1/synchro/rapports/',
    '/api/v1/synchro/historique/',
    '/api/v1/pilotage/mes-chiffres/',
  ]);
  sleep(30);
}

export function superviseur() {
  lire('superviseur', [
    '/api/v1/rapports/a-traiter/',
    '/api/v1/plannings/a-valider/',
    '/api/v1/pilotage/equipe/',
  ]);
  sleep(20);
}

export function responsable() {
  lire('responsable', ['/api/v1/pilotage/equipe/?periode=30j', '/api/v1/prospects/?portee=pays']);
  sleep(20);
}
