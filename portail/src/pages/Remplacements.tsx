import type { Remplacement } from '@innov/api-client';
import {
  Box,
  Button,
  Card,
  Chip,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EnTeteCarte, EnTetePage } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

type Traduire = ReturnType<typeof useTranslation>['t'];

const nomDe = (p: { prenom: string; nom: string }) => `${p.prenom} ${p.nom}`;

/**
 * Remplaçants datés des superviseurs (ORG-013, RG-020) : pendant la période, le remplaçant voit
 * et décide les plannings du superviseur remplacé ; ses décisions portent le mode
 * « remplacement ». Le superviseur désigne pour lui-même, le DM pour les superviseurs de ses
 * réseaux, l'administrateur pays pour tous (prd.md §6.3).
 */
export default function Remplacements() {
  const { t } = useTranslation();
  const { client } = useSession();
  const liste = useQuery({ queryKey: ['remplacements'], queryFn: client.remplacements.liste });

  return (
    <Stack spacing={2.5}>
      <EnTetePage titre={t('remplacements.titre')} sousTitre={t('remplacements.sousTitre')} />
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 360px' },
          alignItems: 'start',
        }}
      >
        {liste.isError ? (
          <ErreurChargement erreur={liste.error} reessayer={() => void liste.refetch()} />
        ) : !liste.data ? (
          <Skeleton variant="rounded" height={160} />
        ) : liste.data.length === 0 ? (
          <Card sx={{ p: 3 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('remplacements.aucun')}
            </Typography>
          </Card>
        ) : (
          <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {liste.data.map((r) => (
              <Box component="li" key={r.id}>
                <LigneRemplacement remplacement={r} />
              </Box>
            ))}
          </Stack>
        )}
        <Designation />
      </Box>
    </Stack>
  );
}

function periode(r: { debut: string; fin: string }, langue: string, t: Traduire) {
  const jour = (iso: string) =>
    new Intl.DateTimeFormat(langue, { weekday: 'short', day: 'numeric', month: 'long' }).format(
      new Date(`${iso}T12:00:00`),
    );
  return t('remplacements.periode', { debut: jour(r.debut), fin: jour(r.fin) });
}

function LigneRemplacement({ remplacement: r }: { remplacement: Remplacement }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const [envoi, setEnvoi] = useState(false);

  async function terminer() {
    setEnvoi(true);
    try {
      await client.remplacements.terminer(r.id);
      notifier(t(r.etat === 'a_venir' ? 'remplacements.retire' : 'remplacements.termine'));
      await requetes.invalidateQueries({ queryKey: ['remplacements'] });
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
    setEnvoi(false);
  }

  return (
    <Card sx={{ p: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
              {nomDe(r.remplacant)}
            </Typography>
            <Chip
              size="small"
              label={t(`remplacements.etats.${r.etat}`)}
              color={r.etat === 'en_cours' ? 'success' : 'default'}
              variant={r.etat === 'en_cours' ? 'filled' : 'outlined'}
            />
          </Stack>
          <Typography variant="body2">
            {t('remplacements.pour', { nom: nomDe(r.superviseur) })} ·{' '}
            {periode(r, i18n.language, t)}
          </Typography>
          {r.designe_par && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('remplacements.designePar', { nom: nomDe(r.designe_par) })}
            </Typography>
          )}
        </Box>
        {r.terminable && (
          <Button
            color="error"
            disabled={envoi}
            onClick={() => void terminer()}
            sx={{ flex: 'none', alignSelf: { xs: 'flex-start', sm: 'center' } }}
          >
            {t(r.etat === 'a_venir' ? 'remplacements.retirer' : 'remplacements.terminer')}
          </Button>
        )}
      </Stack>
    </Card>
  );
}

/** Désigner un remplaçant : qui est remplacé, par qui, du … au … inclus. */
function Designation() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const candidats = useQuery({
    queryKey: ['remplacements-candidats'],
    queryFn: client.remplacements.candidats,
  });
  const [superviseur, setSuperviseur] = useState('');
  const [remplacant, setRemplacant] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const superviseurs = candidats.data?.superviseurs ?? [];
  // Un superviseur ne désigne que pour lui-même : le choix est fait.
  const remplace = superviseurs.length === 1 ? superviseurs[0]!.id : superviseur;
  const remplacants = (candidats.data?.remplacants ?? []).filter((p) => p.id !== remplace);
  const complet = remplace && remplacant && debut && fin;

  async function designer() {
    setEnvoi(true);
    try {
      const r = await client.remplacements.designer({
        superviseur: remplace,
        remplacant,
        debut,
        fin,
      });
      notifier(
        t('remplacements.designe', {
          remplacant: nomDe(r.remplacant),
          superviseur: nomDe(r.superviseur),
          ...Object.fromEntries(
            (['debut', 'fin'] as const).map((c) => [
              c,
              new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(
                new Date(`${r[c]}T12:00:00`),
              ),
            ]),
          ),
        }),
      );
      setRemplacant('');
      setDebut('');
      setFin('');
      await requetes.invalidateQueries({ queryKey: ['remplacements'] });
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
    setEnvoi(false);
  }

  return (
    <Card>
      <EnTeteCarte titre={t('remplacements.designer')} />
      {candidats.isError ? (
        <Box sx={{ p: 2 }}>
          <ErreurChargement erreur={candidats.error} reessayer={() => void candidats.refetch()} />
        </Box>
      ) : !candidats.data ? (
        <Skeleton variant="rounded" height={240} sx={{ m: 2 }} />
      ) : (
        <Stack spacing={2} sx={{ p: 2 }}>
          {superviseurs.length > 1 && (
            <TextField
              select
              label={t('remplacements.superviseur')}
              value={superviseur}
              onChange={(e) => {
                setSuperviseur(e.target.value);
                if (e.target.value === remplacant) setRemplacant('');
              }}
            >
              {superviseurs.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {nomDe(p)}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            label={t('remplacements.remplacant')}
            value={remplacant}
            onChange={(e) => setRemplacant(e.target.value)}
          >
            {remplacants.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {nomDe(p)}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1.5}>
            <TextField
              type="date"
              label={t('remplacements.debut')}
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              type="date"
              label={t('remplacements.fin')}
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: debut || undefined } }}
              fullWidth
            />
          </Stack>
          <Box>
            <Button
              variant="contained"
              disabled={!complet || envoi}
              onClick={() => void designer()}
            >
              {t('remplacements.designer')}
            </Button>
          </Box>
        </Stack>
      )}
    </Card>
  );
}
