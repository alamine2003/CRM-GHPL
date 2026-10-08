import type { DelegueATraiter, JourneeATraiter } from '@innov/api-client';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import {
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur, useSearchParams } from 'react-router';
import { texteEcart } from '../composants/conformiteTextes';
import { BarreChiffres, Chiffre, EnTetePage, Etiquette, EtatVide } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import Retards from '../composants/Retards';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

/**
 * « À traiter » du superviseur (RPT-012, 0.6.1 ; DC-47, engagement 3) : les journées terminées
 * de son équipe, pas encore validées, par délégué et de la plus ancienne. Chaque journée dit
 * « conforme » ou « à vérifier » avec ses écarts (CA1), et l'état de ses rapports. En tête, les
 * chiffres du jour, dont les plannings qui attendent sa décision.
 */
export default function ATraiter() {
  const { t } = useTranslation();
  const { client } = useSession();
  const file = useQuery({ queryKey: ['rapports-a-traiter'], queryFn: client.rapports.aTraiter });
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const [confirmation, setConfirmation] = useState(false);
  // 35.A : les retards (RPT-017) dans un onglet ; onglet et délégué filtré restent dans l'adresse.
  const [parametres, setParametres] = useSearchParams();
  const onglet = parametres.get('onglet') === 'retards' ? 'retards' : 'journees';
  const changer = (valeurs: Record<string, string>) =>
    setParametres(
      (p) => {
        const suite = new URLSearchParams(p);
        for (const [cle, valeur] of Object.entries(valeurs)) {
          if (valeur) suite.set(cle, valeur);
          else suite.delete(cle);
        }
        return suite;
      },
      { replace: true },
    );
  // Le nombre de retards, sur l'onglet (même requête que l'onglet, sans filtre).
  const retards = useQuery({
    queryKey: ['rapports-retards', ''],
    queryFn: () => client.rapports.retards(),
  });
  const nombreRetards = retards.data
    ? retards.data.rapports.length + retards.data.journees.length
    : 0;
  const onglets = (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Tabs
        value={onglet}
        onChange={(_, v: string) => changer({ onglet: v === 'retards' ? v : '' })}
        textColor="inherit"
      >
        <Tab value="journees" label={t('aTraiter.onglets.journees')} />
        <Tab
          value="retards"
          label={
            nombreRetards
              ? t('aTraiter.onglets.retardsN', { count: nombreRetards })
              : t('aTraiter.onglets.retards')
          }
        />
      </Tabs>
    </Box>
  );
  if (onglet === 'retards') {
    return (
      <Stack spacing={2.5}>
        <EnTetePage titre={t('navigation.aTraiter')} sousTitre={t('retards.sousTitre')} />
        {onglets}
        <Retards
          delegue={parametres.get('delegue') ?? ''}
          surDelegue={(id) => changer({ delegue: id })}
        />
      </Stack>
    );
  }

  if (file.isError) {
    return (
      <Stack spacing={2.5}>
        <EnTetePage titre={t('navigation.aTraiter')} />
        <ErreurChargement erreur={file.error} reessayer={() => void file.refetch()} />
      </Stack>
    );
  }
  if (!file.data) {
    return (
      <Stack spacing={2.5}>
        <EnTetePage titre={t('navigation.aTraiter')} />
        <Skeleton variant="rounded" height={72} />
        <Skeleton variant="rounded" height={220} />
      </Stack>
    );
  }
  const journees = file.data.delegues.flatMap((d) => d.journees);
  const aVerifier = journees.filter((j) => j.classement === 'a_verifier').length;
  const rapports = journees.reduce((n, j) => n + j.rapports_a_valider, 0);
  const attendus = journees.reduce((n, j) => n + j.rapports_attendus, 0);
  const plannings = file.data.plannings_a_valider;
  // RPT-013 CA1, 23.A : le lot ne prend que les journées que le serveur dit éligibles.
  const eligibles = file.data.delegues.flatMap((d) =>
    d.journees.filter((j) => j.eligible_lot).map((j) => ({ delegue: d.delegue.id, date: j.date })),
  );
  async function validerLot() {
    setConfirmation(false);
    try {
      const r = await client.rapports.validerLot(eligibles);
      notifier(
        t('validationRapports.lotFait', {
          count: r.journees,
          rapports: t('validationRapports.rapportsN', { count: r.rapports }),
        }),
      );
      await requetes.invalidateQueries({ queryKey: ['rapports-a-traiter'] });
    } catch (erreur) {
      notifier(messageErreur(erreur, t('erreurs.reseau')), 'error');
    }
  }

  return (
    <Stack spacing={2.5}>
      <EnTetePage
        titre={t('navigation.aTraiter')}
        sousTitre={
          journees.length ? t('aTraiter.sousTitre', { count: journees.length }) : undefined
        }
        actions={
          eligibles.length > 0 ? (
            <Button variant="contained" onClick={() => setConfirmation(true)}>
              {t('validationRapports.lot', { count: eligibles.length })}
            </Button>
          ) : undefined
        }
      />
      <Dialog open={confirmation} onClose={() => setConfirmation(false)}>
        <DialogTitle>
          {t('validationRapports.confirmerLot', { count: eligibles.length })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{t('validationRapports.confirmerLotTexte')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(false)}>{t('commun.annuler')}</Button>
          <Button variant="contained" onClick={() => void validerLot()}>
            {t('validationRapports.lot', { count: eligibles.length })}
          </Button>
        </DialogActions>
      </Dialog>
      {onglets}
      <BarreChiffres>
        <Chiffre libelle={t('aTraiter.chiffres.aVerifier')} valeur={aVerifier} ton="warning" />
        <Chiffre libelle={t('aTraiter.chiffres.rapports')} valeur={rapports} />
        <Chiffre libelle={t('aTraiter.chiffres.attendus')} valeur={attendus} />
        <Chiffre libelle={t('aTraiter.chiffres.plannings')} valeur={plannings} ton="warning" />
      </BarreChiffres>
      {plannings > 0 && (
        <Card sx={{ p: 2 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
          >
            <Typography>{t('aTraiter.planningsEnAttente', { count: plannings })}</Typography>
            <Button variant="outlined" component={LienRouteur} to="/validation">
              {t('aTraiter.voirPlannings')}
            </Button>
          </Stack>
        </Card>
      )}
      {file.data.delegues.length === 0 ? (
        <Card>
          <EtatVide titre={t('aTraiter.aucun')} texte={t('aTraiter.aucunTexte')} />
        </Card>
      ) : (
        <Stack spacing={1.5} component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {file.data.delegues.map((ligne) => (
            <Box component="li" key={ligne.delegue.id}>
              <CarteDelegue ligne={ligne} />
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** Le lundi (AAAA-MM-JJ) de la semaine d'une date. */
function lundiDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Les journées regroupées par semaine, dans l'ordre reçu. */
function semaines(journees: JourneeATraiter[]): [string, JourneeATraiter[]][] {
  const groupes = new Map<string, JourneeATraiter[]>();
  for (const j of journees) {
    const lundi = lundiDe(j.date);
    groupes.set(lundi, [...(groupes.get(lundi) ?? []), j]);
  }
  return [...groupes.entries()];
}

function CarteDelegue({ ligne }: { ligne: DelegueATraiter }) {
  const { t, i18n } = useTranslation();
  const jourMois = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(
      new Date(`${iso}T12:00:00`),
    );
  const aVerifier = ligne.journees.filter((j) => j.classement === 'a_verifier').length;
  return (
    <Card component="section" aria-labelledby={`delegue-${ligne.delegue.id}`}>
      <Box sx={{ px: 2, pt: 1.75, pb: 1.25, borderBottom: 1, borderColor: 'divider' }}>
        <Typography
          id={`delegue-${ligne.delegue.id}`}
          variant="subtitle1"
          component="h2"
          sx={{ fontWeight: 700 }}
        >
          {ligne.delegue.prenom} {ligne.delegue.nom}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {[
            t('aTraiter.journees', { count: ligne.journees.length }),
            aVerifier ? t('aTraiter.dontAVerifier', { count: aVerifier }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      </Box>
      {semaines(ligne.journees).map(([lundi, journees]) => (
        <Box
          component="section"
          key={lundi}
          aria-label={t('aTraiter.semaine', { date: jourMois(lundi) })}
        >
          <Typography
            variant="overline"
            component="h3"
            sx={{ display: 'block', px: 2, pt: 1.25, color: 'text.secondary', lineHeight: 1.6 }}
          >
            {t('aTraiter.semaine', { date: jourMois(lundi) })}
          </Typography>
          <Stack component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {journees.map((j, i) => (
              <Box
                component="li"
                key={j.date}
                sx={{ borderTop: i ? 1 : 0, borderColor: 'divider', px: 2, py: 1.5 }}
              >
                <LigneJournee journee={j} delegue={ligne.delegue.id} />
              </Box>
            ))}
          </Stack>
        </Box>
      ))}
    </Card>
  );
}

function LigneJournee({ journee: j, delegue }: { journee: JourneeATraiter; delegue: string }) {
  const { t, i18n } = useTranslation();
  const conforme = j.classement === 'conforme';
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${j.date}T12:00:00`));
  const etat = [
    j.effectuees === j.visites
      ? t('aTraiter.visites', { count: j.visites })
      : `${t('aTraiter.visites', { count: j.visites })}, ${t('aTraiter.effectuees', { count: j.effectuees })}`,
    j.rapports_a_valider ? t('aTraiter.aValider', { count: j.rapports_a_valider }) : null,
    j.rapports_a_corriger ? t('aTraiter.aCorriger', { count: j.rapports_a_corriger }) : null,
    j.rapports_rouverts ? t('aTraiter.rouverts', { count: j.rapports_rouverts }) : null,
    j.rapports_attendus > j.rapports_a_corriger + j.rapports_rouverts
      ? t('aTraiter.attendus', {
          count: j.rapports_attendus - j.rapports_a_corriger - j.rapports_rouverts,
        })
      : null,
    j.rapports_en_retard ? t('aTraiter.enRetard', { count: j.rapports_en_retard }) : null,
    j.horodatages_douteux ? t('aTraiter.douteux', { count: j.horodatages_douteux }) : null,
  ].filter(Boolean);
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.5}
      sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}
    >
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {conforme ? (
            <CheckCircleRounded sx={{ color: 'success.main', fontSize: 20 }} />
          ) : (
            <ErrorOutlineRounded sx={{ color: 'warning.main', fontSize: 20 }} />
          )}
          <Typography sx={{ fontWeight: 600, '&::first-letter': { textTransform: 'uppercase' } }}>
            {date}
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, color: conforme ? 'success.main' : 'warning.main' }}
          >
            {conforme
              ? t('conformite.conforme')
              : t('conformite.aVerifier', { count: j.ecarts.length })}
          </Typography>
          {j.escalade && <Etiquette ton="info">{t('validationRapports.escalade')}</Etiquette>}
        </Stack>
        <Typography variant="body2" sx={{ pl: 3.5, color: 'text.secondary' }}>
          {etat.join(' · ')}
        </Typography>
        {j.ecarts.map((e, i) => (
          <Typography
            key={`${e.code}-${e.visite ?? i}`}
            variant="body2"
            sx={{ pl: 3.5, overflowWrap: 'anywhere' }}
          >
            {texteEcart(e, t)}
          </Typography>
        ))}
      </Stack>
      {/* Sur téléphone, le bouton s'aligne sur le texte de la journée, sous l'icône (la pile
          remet à zéro la marge de ses enfants : le retrait passe par une boîte). */}
      <Box
        sx={{
          flexShrink: 0,
          alignSelf: { xs: 'flex-start', sm: 'center' },
          pl: { xs: 2.5, sm: 0 },
        }}
      >
        <Button size="small" component={LienRouteur} to={`/a-traiter/${delegue}/${j.date}`}>
          {t('journee.ouvrir')}
        </Button>
      </Box>
    </Stack>
  );
}
