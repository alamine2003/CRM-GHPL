import type { Moi, MonOrganisation, Perimetre, Semaine } from '@innov/api-client';
import { avancement, CYCLES } from '@innov/domaine';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Link,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur } from 'react-router';
import { BarreChiffres, Chiffre, EnTeteCarte, EnTetePage, Ligne } from '../composants/Elements';
import { drapeau } from '../composants/formats';
import { MesNotifications } from '../composants/MesNotifications';
import { useSession } from '../contexteSession';

const VERSION_CLIENT = __INNOV_VERSION__;

function FeuilleDeRoute() {
  const { t } = useTranslation();
  const a = avancement(VERSION_CLIENT);
  const termine = !a.stable && a.etape === 9;
  const suivant = !a.stable && a.cycle !== null ? CYCLES[a.cycle + 1] : undefined;
  return (
    <Card>
      <EnTeteCarte
        titre={t('feuilleRoute.titre')}
        action={
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('commun.versionCourte', { version: a.version })}
          </Typography>
        }
      />
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontWeight: 600 }}>
            {a.stable
              ? t('feuilleRoute.stable')
              : termine
                ? t('feuilleRoute.cycleTermine', { numero: `0.${a.cycle}` })
                : t('feuilleRoute.cycle', {
                    numero: `0.${a.cycle}`,
                    nom: t(`feuilleRoute.cycles.${a.codeCycle}`),
                  })}
          </Typography>
          {!a.stable && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {termine && suivant
                ? t('feuilleRoute.prochain', {
                    numero: `0.${(a.cycle ?? 0) + 1}`,
                    nom: t(`feuilleRoute.cycles.${suivant}`),
                  })
                : t('feuilleRoute.etape', { etape: a.etape })}
            </Typography>
          )}
        </Box>
        {!a.stable && (
          <Box
            role="img"
            aria-label={`${t('feuilleRoute.versionsDuCycle', { numero: `0.${a.cycle}` })} : ${t('feuilleRoute.etape', { etape: a.etape })}`}
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px' }}
          >
            {Array.from({ length: 9 }, (_, i) => (
              <Box
                key={i}
                sx={{
                  height: 4,
                  bgcolor: i + 1 <= (a.etape ?? 0) ? 'secondary.main' : 'divider',
                }}
              />
            ))}
          </Box>
        )}
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {t('feuilleRoute.livrees', { livrees: a.livrees, total: a.total })}
        </Typography>
      </CardContent>
    </Card>
  );
}

function EtatService() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const informations = useQuery({
    queryKey: ['informations', i18n.language],
    queryFn: () => client.informations(),
    retry: false,
  });
  const pastille = (
    <Typography
      variant="caption"
      sx={{
        fontWeight: 600,
        color: informations.isPending
          ? 'text.secondary'
          : informations.isSuccess
            ? 'success.main'
            : 'error.main',
      }}
    >
      {informations.isPending
        ? t('accueil.verification')
        : informations.isSuccess
          ? t('accueil.serveurDisponible')
          : t('accueil.serveurIndisponible')}
    </Typography>
  );
  return (
    <Card>
      <EnTeteCarte titre={t('accueil.etatServeur')} action={pastille} />
      <CardContent sx={{ py: 0.5 }}>
        <Ligne libelle={t('accueil.versionClient')} valeur={VERSION_CLIENT} />
        <Divider />
        <Ligne
          libelle={t('accueil.versionServeur')}
          valeur={informations.isSuccess ? informations.data.version : '—'}
        />
        <Divider />
        <Ligne
          libelle={t('accueil.environnement')}
          valeur={informations.isSuccess ? informations.data.environnement : '—'}
        />
        {informations.isError && (
          <Button
            variant="outlined"
            fullWidth
            sx={{ my: 1.5 }}
            onClick={() => void informations.refetch()}
          >
            {t('accueil.reessayer')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function MonCompte({ utilisateur, perimetre }: { utilisateur: Moi; perimetre: Perimetre }) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <EnTeteCarte titre={t('profil.titre')} />
      <CardContent sx={{ py: 0.5 }}>
        <Ligne libelle={t('profil.identifiant')} valeur={utilisateur.identifiant} />
        <Divider />
        <Ligne
          libelle={t('profil.courriel')}
          valeur={utilisateur.courriel || t('profil.nonRenseigne')}
        />
        <Divider />
        <Ligne
          libelle={t('profil.perimetre')}
          valeur={
            perimetre.pays_actif?.nom ??
            (perimetre.vue_consolidee ? t('pays.consolide') : t('session.siege'))
          }
        />
        <Divider />
        <Ligne libelle={t('profil.langue')} valeur={t(`commun.langues.${i18n.language}`)} />
        {perimetre.roles.length > 0 && (
          <>
            <Divider />
            <Ligne
              libelle={t('profil.roles')}
              valeur={perimetre.roles.map((role) => t(`roles.${role}`)).join(', ')}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Bandeau({ utilisateur, perimetre }: { utilisateur: Moi; perimetre: Perimetre }) {
  const { t, i18n } = useTranslation();
  const fuseau = perimetre.pays_actif?.fuseau ?? utilisateur.pays_principal?.fuseau;
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: fuseau,
  }).format(new Date());
  const lieu =
    perimetre.pays_actif?.nom ??
    (perimetre.vue_consolidee ? t('pays.consolide') : t('session.siege'));
  return (
    <EnTetePage
      titre={t('session.bonjour', { prenom: utilisateur.prenom })}
      sousTitre={`${date.charAt(0).toUpperCase() + date.slice(1)} · ${lieu}`}
    />
  );
}

function ChiffresOrganisation({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const synthese = useQuery({
    queryKey: ['organisation', perimetre.pays_actif?.code ?? 'consolide', 'synthese'],
    queryFn: () => client.organisation.synthese(),
  });
  const s = synthese.data;
  if (!s) return null;
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" component="h2">
          {t('accueil.chiffresOrganisation')}
        </Typography>
        <Button component={LienRouteur} to="/organisation" size="small">
          {t('accueil.voirOrganisation')}
        </Button>
      </Stack>
      <BarreChiffres>
        <Chiffre libelle={t('organisation.chiffres.postes')} valeur={s.postes} />
        <Chiffre
          libelle={t('organisation.chiffres.vacants')}
          valeur={s.postes_vacants}
          ton="warning"
        />
        <Chiffre
          libelle={t('organisation.chiffres.sansSuperviseur')}
          valeur={s.postes_sans_superviseur}
          ton="error"
        />
        <Chiffre
          libelle={t('organisation.chiffres.secteurs')}
          valeur={s.secteurs}
          detail={t('organisation.chiffres.zones', { count: s.zones })}
        />
      </BarreChiffres>
    </Stack>
  );
}

function MonPoste({ perimetre }: { perimetre: Perimetre }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const moi = useQuery({
    queryKey: ['organisation', perimetre.pays_actif?.code ?? 'consolide', 'moi'],
    queryFn: () => client.organisation.moi(),
  });
  const o: MonOrganisation | undefined = moi.data;
  if (!o || (!o.postes.length && !o.postes_supervises && !o.reseaux.length)) return null;
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${iso}T12:00:00`));
  return (
    <Card>
      <EnTeteCarte
        titre={o.postes.length > 1 ? t('monPoste.titrePlusieurs') : t('monPoste.titre')}
        action={
          o.postes_supervises > 0 && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('monPoste.postesSupervises', { count: o.postes_supervises })}
            </Typography>
          )
        }
      />
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {o.superviseur_manquant && (
          <Alert severity="warning" role="alert">
            {t('monPoste.superviseurManquant')}
          </Alert>
        )}
        {o.postes.map(({ occupation, type_poste, reseaux, secteurs, superviseur }) => (
          <Stack key={occupation.id} direction="row" spacing={1.5}>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>
                  {occupation.poste.libelle}
                </Typography>
                {o.postes.length > 1 && occupation.principal && (
                  <Typography variant="caption" sx={{ color: 'secondary.main', fontWeight: 600 }}>
                    {t('monPoste.principal')}
                  </Typography>
                )}
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t(`organisation.typesPoste.${type_poste}`)} ·{' '}
                {t('monPoste.depuis', { date: formatDate(occupation.debut) })}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Ligne
                libelle={t('monPoste.superviseur')}
                valeur={superviseur ? `${superviseur.prenom} ${superviseur.nom}` : '—'}
              />
              <Ligne
                libelle={t('monPoste.reseaux')}
                valeur={reseaux.map((r) => r.libelle).join(', ') || '—'}
              />
              <Ligne
                libelle={t('monPoste.secteurs')}
                valeur={secteurs.map((r) => r.libelle).join(', ') || '—'}
              />
            </Box>
          </Stack>
        ))}
        {o.reseaux.length > 0 && (
          <Ligne
            libelle={t('monPoste.perimetreReseaux')}
            valeur={o.reseaux.map((p) => p.reseau.libelle).join(', ')}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AFaire({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const comptes = useQuery({
    queryKey: ['equipe', cle, 'comptes'],
    queryFn: () => client.utilisateurs(),
    enabled: perimetre.actions.includes('utilisateurs.lire'),
  });
  const synthese = useQuery({
    queryKey: ['organisation', cle, 'synthese'],
    queryFn: () => client.organisation.synthese(),
    enabled: perimetre.actions.includes('organisation.lire'),
  });
  // Qualité des données (0.1.9) : ce que l'administrateur pays doit trancher.
  const qualite = useQuery({
    queryKey: ['prospects', cle, 'qualite'],
    queryFn: client.qualite,
    enabled: perimetre.actions.includes('prospects.gerer') && perimetre.pays_actif !== null,
  });
  const q = qualite.data;
  const sansRole = (comptes.data ?? []).filter((c) => c.actif && !c.roles.length).length;
  const lignes = [
    { n: sansRole, cle: 'accueil.comptesSansRole', lien: '/equipe', ton: 'warning' as const },
    {
      n: synthese.data?.postes_vacants ?? 0,
      cle: 'accueil.postesVacants',
      lien: '/organisation',
      ton: 'warning' as const,
    },
    {
      n: synthese.data?.postes_sans_superviseur ?? 0,
      cle: 'accueil.postesSansSuperviseur',
      lien: '/organisation',
      ton: 'error' as const,
    },
    {
      n: q?.a_valider ?? 0,
      cle: 'qualite.aValider',
      lien: '/prospects?statut=a_valider',
      ton: 'warning' as const,
    },
    {
      n: q?.etablissements_a_valider ?? 0,
      cle: 'qualite.etablissementsAValider',
      lien: '/etablissements?statut=a_valider',
      ton: 'warning' as const,
    },
    { n: q?.doublons ?? 0, cle: 'qualite.doublons', lien: '/doublons', ton: 'warning' as const },
    {
      n: q?.propositions ?? 0,
      cle: 'qualite.propositions',
      lien: '/propositions',
      ton: 'warning' as const,
    },
  ].filter((l) => l.n > 0);
  return (
    <Card>
      <EnTeteCarte titre={t('accueil.aFaire')} />
      <CardContent sx={{ py: 1 }}>
        {lignes.length === 0 ? (
          <Typography sx={{ color: 'text.secondary', py: 1 }}>{t('accueil.aFaireVide')}</Typography>
        ) : (
          lignes.map((l, i) => (
            <Box key={l.cle}>
              {i > 0 && <Divider />}
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.25 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: `${l.ton}.main`,
                    flex: 'none',
                  }}
                />
                <Typography sx={{ flexGrow: 1 }}>{t(l.cle, { count: l.n })}</Typography>
                <Button component={LienRouteur} to={l.lien} size="small">
                  {t('commun.voir')}
                </Button>
              </Stack>
            </Box>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Qualité des données du pays (0.1.9) : fiches actives à compléter, chacune rapportée au
 * total. Chaque ligne ouvre la liste filtrée ; une ligne à zéro disparaît. Ce qui reste à
 * trancher (fiches à valider, doublons, propositions) figure dans « À traiter ».
 */
function QualiteDonnees({ pays }: { pays: string }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const q = useQuery({ queryKey: ['prospects', pays, 'qualite'], queryFn: client.qualite });
  if (q.isError) return null;
  const d = q.data;
  const lignes = d
    ? [
        { n: d.sans_lieu, total: d.prospects, cle: 'sansLieu', lien: '/prospects?sans_lieu=1' },
        {
          n: d.sans_telephone,
          total: d.prospects,
          cle: 'sansTelephone',
          lien: '/prospects?sans_telephone=1',
        },
        {
          n: d.sans_specialite,
          total: d.prospects,
          cle: 'sansSpecialite',
          lien: '/prospects?sans_specialite=1',
        },
        { n: d.hors_cible, total: d.prospects, cle: 'horsCible', lien: '/prospects?hors_cible=1' },
        {
          n: d.sans_coordonnees,
          total: d.etablissements,
          cle: 'sansCoordonnees',
          lien: '/etablissements?sans_coordonnees=1',
        },
      ].filter((l) => l.n > 0)
    : [];
  return (
    <Card>
      <EnTeteCarte titre={t('qualite.titre')} />
      <CardContent sx={{ py: 1 }}>
        {!d ? (
          <Skeleton variant="rounded" height={120} />
        ) : lignes.length === 0 ? (
          <Typography sx={{ color: 'text.secondary', py: 1 }}>{t('qualite.complet')}</Typography>
        ) : (
          lignes.map((l, i) => (
            <Box key={l.cle}>
              {i > 0 && <Divider />}
              <Stack
                direction="row"
                spacing={1.5}
                sx={{ alignItems: 'baseline', justifyContent: 'space-between', py: 1.25 }}
              >
                <Link
                  component={LienRouteur}
                  to={l.lien}
                  color="inherit"
                  underline="always"
                  sx={{ textDecorationColor: 'rgba(127,127,127,.4)', minWidth: 0 }}
                >
                  {t(`qualite.${l.cle}`)}
                </Link>
                <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    {l.n.toLocaleString()}
                  </Box>{' '}
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {t('qualite.sur', { total: l.total.toLocaleString() })}
                  </Box>
                </Typography>
              </Stack>
            </Box>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MonEquipe({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const postes = useQuery({
    queryKey: ['organisation', perimetre.pays_actif?.code ?? 'consolide', 'postes'],
    queryFn: () => client.organisation.postes(),
  });
  const liste = (postes.data ?? []).filter((p) => !p.archive);
  return (
    <Card>
      <EnTeteCarte
        titre={t('accueil.monEquipe')}
        action={
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {liste.length}
          </Typography>
        }
      />
      <CardContent sx={{ py: 0.5 }}>
        {liste.length === 0 && (
          <Typography sx={{ color: 'text.secondary', py: 1 }}>
            {t('accueil.monEquipeVide')}
          </Typography>
        )}
        {liste.slice(0, 8).map((poste, i) => (
          <Box key={poste.id}>
            {i > 0 && <Divider />}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1 }}>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography
                  sx={{ fontWeight: 500, color: poste.vacant ? 'warning.main' : 'text.primary' }}
                  noWrap
                >
                  {poste.occupant
                    ? `${poste.occupant.prenom} ${poste.occupant.nom}`
                    : t('organisation.vacant')}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap component="p">
                  {poste.libelle}
                </Typography>
              </Box>
            </Stack>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}

function LesPays() {
  const { t } = useTranslation();
  const { client, choisirPays } = useSession();
  const pays = useQuery({ queryKey: ['pays', 'liste'], queryFn: () => client.pays.liste() });
  return (
    <Card>
      <EnTeteCarte
        titre={t('accueil.lesPays')}
        action={
          <Button component={LienRouteur} to="/pays" size="small">
            {t('commun.voir')}
          </Button>
        }
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
        }}
      >
        {(pays.data ?? [])
          .filter((p) => p.statut !== 'archive')
          .map((p) => (
            <Box
              key={p.code}
              component="button"
              onClick={() => void choisirPays(p.code)}
              sx={{
                px: 2,
                py: 1.25,
                minHeight: 48,
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                cursor: 'pointer',
                textAlign: 'left',
                font: 'inherit',
                color: 'inherit',
                bgcolor: 'transparent',
                border: 0,
                borderBottom: 1,
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box aria-hidden sx={{ fontSize: 20, lineHeight: 1 }}>
                {drapeau(p.code)}
              </Box>
              <Typography sx={{ fontWeight: 500, flexGrow: 1, minWidth: 0 }} noWrap>
                {p.nom}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: p.statut === 'actif' ? 'text.secondary' : 'warning.main' }}
              >
                {t(`paysPage.statuts.${p.statut}`)}
              </Typography>
            </Box>
          ))}
      </Box>
    </Card>
  );
}

/** Où en sont cette semaine et la suivante, avec l'échéance (PLN-006, RG-013). */
function MaSemaine() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const semaines = useQuery({
    queryKey: ['planning-semaine', 'accueil'],
    queryFn: async () => {
      const courante = await client.plannings.semaine();
      return [courante, await client.plannings.semaine(courante.suivante)] as const;
    },
  });
  const etat = (s: Semaine) =>
    !s.planning
      ? s.peut_creer
        ? t('accueil.aPreparer')
        : t('accueil.rienDePrevu')
      : `${t(`semaine.statuts.${s.planning.statut}`)} · ${t('accueil.visites', {
          count: s.visites.length,
        })}`;
  const echeance = (s: Semaine) =>
    s.planning && s.modifiable
      ? t(
          new Date(s.planning.echeance) < new Date()
            ? 'soumission.echeancePassee'
            : 'soumission.echeance',
          {
            date: new Intl.DateTimeFormat(i18n.language, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: s.fuseau,
            }).format(new Date(s.planning.echeance)),
          },
        )
      : null;
  return (
    <Card>
      <EnTeteCarte titre={t('accueil.semaine')} />
      <CardContent>
        {semaines.isError ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('erreurs.reseau')}
          </Typography>
        ) : !semaines.data ? (
          <Skeleton height={96} />
        ) : (
          <Stack spacing={0.5}>
            {semaines.data.map((s, i) => (
              <Box key={s.semaine}>
                <Ligne
                  libelle={i === 0 ? t('accueil.cetteSemaine') : t('accueil.semaineProchaine')}
                  valeur={etat(s)}
                />
                {echeance(s) && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'right' }}>
                    {echeance(s)}
                  </Typography>
                )}
              </Box>
            ))}
            <Box sx={{ pt: 1 }}>
              <Button component={LienRouteur} to="/planning" variant="outlined">
                {t('accueil.ouvrirPlanning')}
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

/** Accueil adapté au rôle (prd.md §10) : chacun voit d'abord ce qui le concerne. */
export default function Accueil({
  utilisateur,
  perimetre,
}: {
  utilisateur: Moi;
  perimetre: Perimetre;
}) {
  const { t } = useTranslation();
  const a = (role: string) => perimetre.roles.includes(role as never);
  const siege = a('admin_siege') || a('direction_siege');
  const pilotagePays = a('admin_pays') || a('responsable_pays') || (siege && perimetre.pays_actif);
  const terrain = a('delegue') || a('superviseur');

  return (
    <Stack spacing={2}>
      <Bandeau utilisateur={utilisateur} perimetre={perimetre} />
      {perimetre.roles.length === 0 && (
        <Alert severity="warning" role="alert">
          {t('roles.aucun')}
        </Alert>
      )}
      {perimetre.actions.includes('notifications.lire') && perimetre.pays_actif && (
        <MesNotifications />
      )}
      {siege && perimetre.vue_consolidee && <LesPays />}
      {perimetre.actions.includes('organisation.lire') && !a('superviseur') && (
        <ChiffresOrganisation perimetre={perimetre} />
      )}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' },
          alignItems: 'start',
        }}
      >
        <Stack spacing={2}>
          {pilotagePays && <AFaire perimetre={perimetre} />}
          {perimetre.actions.includes('prospects.gerer') && perimetre.pays_actif && (
            <QualiteDonnees pays={perimetre.pays_actif.code} />
          )}
          {a('superviseur') && <MonEquipe perimetre={perimetre} />}
          {(terrain || a('df') || a('dm')) && <MonPoste perimetre={perimetre} />}
          {a('delegue') && <MaSemaine />}
          {!terrain && <FeuilleDeRoute />}
        </Stack>
        <Stack spacing={2}>
          <MonCompte utilisateur={utilisateur} perimetre={perimetre} />
          {terrain && <FeuilleDeRoute />}
          <EtatService />
        </Stack>
      </Box>
    </Stack>
  );
}
