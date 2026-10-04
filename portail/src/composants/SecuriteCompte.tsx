import type { Activite, SessionOuverte } from '@innov/api-client';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ComputerRounded from '@mui/icons-material/ComputerRounded';
import GppMaybeRounded from '@mui/icons-material/GppMaybeRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import PhoneAndroidRounded from '@mui/icons-material/PhoneAndroidRounded';
import SecurityRounded from '@mui/icons-material/SecurityRounded';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifier } from '../contexteNotifications';
import { useSession } from '../contexteSession';
import AssistantDoubleAuth from './AssistantDoubleAuth';
import ChampCode from './ChampCode';
import DialogueFormulaire from './Dialogue';
import { EnTeteCarte, PastilleIcone } from './Elements';
import { depuis } from './formats';

/** Double authentification du compte : état, activation, codes de secours, désactivation. */
export function CarteDoubleAuth() {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const etat = useQuery({
    queryKey: ['securite', 'double-auth'],
    queryFn: () => client.doubleAuth.etat(),
  });
  const [assistant, setAssistant] = useState(false);
  const [action, setAction] = useState<'codes' | 'desactiver' | null>(null);
  const [code, setCode] = useState('');
  const [nouveauxCodes, setNouveauxCodes] = useState<string[] | null>(null);
  const e = etat.data;
  const rafraichir = () => requetes.invalidateQueries({ queryKey: ['securite'] });

  return (
    <Card>
      <EnTeteCarte
        titre={t('doubleAuth.titre')}
        action={
          e && (
            <Stack direction="row" spacing={0.75}>
              {e.requise && (
                <Chip
                  size="small"
                  color="secondary"
                  variant="outlined"
                  label={t('doubleAuth.obligatoire')}
                />
              )}
              <Chip
                size="small"
                color={e.active ? 'success' : 'default'}
                icon={e.active ? <CheckCircleRounded /> : <GppMaybeRounded />}
                label={e.active ? t('doubleAuth.active') : t('doubleAuth.inactive')}
              />
            </Stack>
          )
        }
      />
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <PastilleIcone icone={<SecurityRounded />} ton={e?.active ? 'success' : 'warning'} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('doubleAuth.description')}
          </Typography>
        </Stack>
        {!e ? (
          <Skeleton height={36} />
        ) : e.active ? (
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              {t('doubleAuth.codesRestants', { count: e.codes_secours_restants })}
            </Typography>
            <Button size="small" onClick={() => setAction('codes')}>
              {t('doubleAuth.regenerer')}
            </Button>
            {!e.requise && (
              <Button size="small" color="error" onClick={() => setAction('desactiver')}>
                {t('doubleAuth.desactiver')}
              </Button>
            )}
          </Stack>
        ) : (
          <Button
            variant="contained"
            onClick={() => setAssistant(true)}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t('doubleAuth.activer')}
          </Button>
        )}
      </CardContent>
      <Dialog open={assistant} onClose={() => setAssistant(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>{t('doubleAuth.activer')}</DialogTitle>
        <DialogContent>
          <AssistantDoubleAuth
            surTermine={() => {
              setAssistant(false);
              notifier(t('doubleAuth.activee'));
              void rafraichir();
            }}
          />
        </DialogContent>
      </Dialog>
      {action && (
        <DialogueFormulaire
          ouvert
          titre={action === 'codes' ? t('doubleAuth.regenerer') : t('doubleAuth.desactiver')}
          aide={t('doubleAuth.confirmerTexte')}
          invalide={code.length !== 6}
          surFermer={() => {
            setAction(null);
            setCode('');
            void rafraichir();
          }}
          surValider={async () => {
            if (action === 'codes')
              setNouveauxCodes((await client.doubleAuth.codesSecours(code)).codes_secours);
            else {
              await client.doubleAuth.desactiver(code);
              notifier(t('doubleAuth.desactivee'));
            }
          }}
        >
          <ChampCode valeur={code} changer={setCode} />
        </DialogueFormulaire>
      )}
      <Dialog open={nouveauxCodes !== null} onClose={() => setNouveauxCodes(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>{t('doubleAuth.etapes.codes')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {t('doubleAuth.codesTexte')}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 1,
              fontFamily: 'monospace',
              fontSize: 16,
            }}
          >
            {nouveauxCodes?.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </Box>
          <Button sx={{ mt: 2 }} variant="contained" onClick={() => setNouveauxCodes(null)}>
            {t('doubleAuth.terminer')}
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Sessions ouvertes et révocation à distance (SEC-004). */
export function CarteSessions() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const sessions = useQuery({
    queryKey: ['securite', 'sessions'],
    queryFn: () => client.sessions.liste(),
  });
  const fermer = async (session?: SessionOuverte) => {
    if (session) await client.sessions.revoquer(session.id);
    else await client.sessions.revoquerAutres();
    notifier(t('sessionsPage.revoquee'));
    await sessions.refetch();
  };
  const liste = sessions.data ?? [];
  return (
    <Card>
      <EnTeteCarte
        titre={t('sessionsPage.titre')}
        action={
          liste.length > 1 && (
            <Button size="small" color="error" onClick={() => void fermer()}>
              {t('sessionsPage.revoquerAutres')}
            </Button>
          )
        }
      />
      <CardContent sx={{ py: 0.5 }}>
        {sessions.isPending && <Skeleton height={48} />}
        {liste.map((s, i) => (
          <Box key={s.id}>
            {i > 0 && <Divider />}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.25 }}>
              <PastilleIcone
                icone={s.client === 'mobile' ? <PhoneAndroidRounded /> : <ComputerRounded />}
                ton={s.courante ? 'success' : 'info'}
                taille={36}
              />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>
                  {s.appareil ?? t(`sessionsPage.${s.client}`)}
                  {s.courante && (
                    <Chip
                      size="small"
                      color="success"
                      label={t('sessionsPage.cetAppareil')}
                      sx={{ ml: 1 }}
                    />
                  )}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {t('sessionsPage.activite', { quand: depuis(s.utilisee_le, i18n.language) })}
                  {s.adresse && ` · ${s.adresse}`}
                </Typography>
              </Box>
              {!s.courante && (
                <Button size="small" color="error" onClick={() => void fermer(s)}>
                  {t('sessionsPage.revoquer')}
                </Button>
              )}
            </Stack>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}

function cleAction(a: Activite) {
  const base = a.action.replace(/\./g, '_');
  return a.action === 'connexion' && a.resultat === 'echec' ? 'connexion_echec' : base;
}

/** Activité récente du compte : repérer une connexion inconnue (AUD-001). */
export function CarteActivite() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const activite = useQuery({
    queryKey: ['securite', 'activite'],
    queryFn: () => client.activite(),
  });
  const liste = activite.data ?? [];
  return (
    <Card>
      <EnTeteCarte
        titre={t('activitePage.titre')}
        action={<PastilleIcone icone={<HistoryRounded />} ton="info" taille={32} />}
      />
      <CardContent>
        {activite.isPending && <Skeleton height={48} />}
        {activite.isSuccess && liste.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('activitePage.vide')}
          </Typography>
        )}
        <Stack spacing={0}>
          {liste.map((a, i) => (
            <Stack
              key={`${a.le}-${i}`}
              direction="row"
              spacing={1.5}
              sx={{ position: 'relative', pb: 1.75 }}
            >
              <Box sx={{ position: 'relative', width: 12, flex: 'none' }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    mt: 0.75,
                    borderRadius: '50%',
                    bgcolor: a.resultat === 'echec' ? 'error.main' : 'success.main',
                  }}
                />
                {i < liste.length - 1 && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 4,
                      top: 18,
                      bottom: -6,
                      width: 2,
                      bgcolor: 'divider',
                    }}
                  />
                )}
              </Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t(`activitePage.actions.${cleAction(a)}`, { defaultValue: a.action })}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {depuis(a.le, i18n.language)}
                  {a.client && ` · ${t(`sessionsPage.${a.client}`)}`}
                  {a.adresse && ` · ${a.adresse}`}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
