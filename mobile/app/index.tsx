import type { Langue } from '@innov/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alerte, BoutonIcone } from '../src/composants';
import { useTablette } from '../src/disposition';
import { Ecran } from '../src/Ecran';
import { useNonLues } from '../src/MesNotifications';
import { useSession } from '../src/session';
import { StatutSynchro } from '../src/Synchronisation';
import {
  type Annonce,
  ListeProgramme,
  TourneeTablette,
  TourneeTelephone,
  useTournee,
  VoletProgramme,
} from '../src/Tournee';

/** Tournée du délégué connecté (VIS-001), selon la maquette 1.4.0. */
export default function Accueil() {
  const { t, i18n } = useTranslation();
  const { etat } = useSession();
  const routeur = useRouter();
  const tablette = useTablette();
  const tournee = useTournee();
  const nonLues = useNonLues();
  const [annonce, setAnnonce] = useState<Annonce | null>(null);
  const langue = i18n.language as Langue;
  const connecte = etat.statut === 'connecte' ? etat : null;
  const date = new Intl.DateTimeFormat(langue, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: connecte?.utilisateur.pays_principal?.fuseau,
  }).format(new Date());
  const jour = date.charAt(0).toUpperCase() + date.slice(1);
  const nomPays = connecte?.perimetre.pays_actif?.nom ?? t('session.siege');
  const roles = connecte?.perimetre.roles ?? [];
  const role = roles.includes('delegue')
    ? t('mobile.tournee.roleDelegue')
    : roles[0]
      ? t(`roles.${roles[0]}`)
      : null;
  const pointsATraiter = tournee
    ? tournee.aCorriger.length + tournee.enRetard.length + tournee.aJustifier.length
    : 0;
  const cloche = (
    <BoutonIcone
      icone="bell"
      libelle={
        nonLues
          ? t('mobile.tournee.notificationsNonLues', { count: nonLues })
          : t('mobile.tournee.notifications')
      }
      pastille={nonLues}
      onPress={() => routeur.push('/notifications')}
    />
  );
  const avecAlertes = !!tournee?.alertes;

  return (
    <Ecran
      titre={t('session.bonjour', { prenom: connecte?.utilisateur.prenom ?? '' })}
      surTitre={`${jour} · ${nomPays}`}
      action={cloche}
      enteteTablette={{
        surTitre: [
          jour,
          nomPays,
          avecAlertes ? t('mobile.tournee.pointsATraiter', { count: pointsATraiter }) : role,
        ]
          .filter(Boolean)
          .join(' · '),
        action: (
          <>
            {!avecAlertes && <StatutSynchro />}
            {cloche}
          </>
        ),
      }}
      gauche={tablette && tournee && !avecAlertes ? <VoletProgramme etat={tournee} /> : undefined}
      droite={tablette && tournee && avecAlertes ? <ListeProgramme etat={tournee} /> : undefined}
    >
      {roles.length === 0 && <Alerte type="info">{t('roles.aucun')}</Alerte>}
      {tournee &&
        (tablette ? (
          <TourneeTablette etat={tournee} annonce={annonce} surAnnonce={setAnnonce} />
        ) : (
          <TourneeTelephone etat={tournee} annonce={annonce} surAnnonce={setAnnonce} />
        ))}
    </Ecran>
  );
}
