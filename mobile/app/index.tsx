import type { Langue } from '@innov/i18n';
import { useTranslation } from 'react-i18next';
import { Alerte, Carte, Texte } from '../src/composants';
import { Ecran } from '../src/Ecran';
import { MaSemaine } from '../src/MaSemaine';
import { MesProduits } from '../src/MesProduits';
import { MesPropositions } from '../src/MesPropositions';
import { MonPoste } from '../src/MonPoste';
import { useSession } from '../src/session';

/** Tournée du délégué connecté. Les visites arrivent au cycle 0.4 (prd.md §23). */
export default function Accueil() {
  const { t, i18n } = useTranslation();
  const { etat } = useSession();
  const langue = i18n.language as Langue;
  const connecte = etat.statut === 'connecte' ? etat : null;
  const date = new Intl.DateTimeFormat(langue, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: connecte?.utilisateur.pays_principal?.fuseau,
  }).format(new Date());
  const nomPays = connecte?.perimetre.pays_actif?.nom ?? t('session.siege');
  const roles = connecte?.perimetre.roles ?? [];

  return (
    <Ecran
      surTitre={`${date.charAt(0).toUpperCase() + date.slice(1)} · ${nomPays}`}
      titre={t('session.bonjour', { prenom: connecte?.utilisateur.prenom ?? '' })}
    >
      {roles.length === 0 && <Alerte type="info">{t('roles.aucun')}</Alerte>}
      <MesPropositions />
      {roles.includes('delegue') && <MaSemaine />}
      <MonPoste />
      <MesProduits />
      <Carte>
        <Texte variante="sousTitre">{t('mobile.onglets.tournee')}</Texte>
        <Texte variante="discret" style={{ marginTop: 4 }}>
          {t('mobile.prochainement')}
        </Texte>
      </Carte>
    </Ecran>
  );
}
