import type { CompteDO, DroitsDO, Perimetre } from '@innov/api-client';
import {
  Alert,
  Box,
  Card,
  Divider,
  FormControlLabel,
  Skeleton,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { EnTetePage, EtatVide } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

const GROUPES: (keyof DroitsDO)[] = ['ventes', 'pilotage', 'rapports', 'prospects'];

/**
 * « Droits du DO » (1.6.1, prd.md §14.85) : le siège seul ouvre ou ferme, pour chaque compte DF
 * (le DO), les ventes, le pilotage, les rapports et les prospects. Tout est ouvert par défaut ; le
 * serveur applique le réglage, l'interface ne fait que le montrer.
 */
export default function DroitsDOPage({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const comptes = useQuery({
    queryKey: ['droits-do', cle],
    queryFn: client.droitsDo.liste,
  });
  const regler = useMutation({
    mutationFn: ({ id, droits }: { id: string; droits: Partial<DroitsDO> }) =>
      client.droitsDo.regler(id, droits),
    onSuccess: (compte) => {
      requetes.setQueryData<CompteDO[]>(['droits-do', cle], (liste) =>
        liste?.map((c) => (c.id === compte.id ? compte : c)),
      );
      notifier(t('droitsDo.enregistre'));
    },
    onError: (e) => notifier(messageErreur(e, t('erreurs.reseau')), 'error'),
  });
  const titre = t('navigation.droitsDo');
  if (comptes.isError)
    return (
      <Stack spacing={2}>
        <EnTetePage titre={titre} />
        <ErreurChargement erreur={comptes.error} reessayer={() => void comptes.refetch()} />
      </Stack>
    );
  return (
    <Stack spacing={2}>
      <EnTetePage titre={titre} sousTitre={t('droitsDo.sousTitre')} />
      <Alert severity="info">{t('droitsDo.aide')}</Alert>
      {!comptes.data ? (
        <Skeleton variant="rounded" height={200} />
      ) : comptes.data.length === 0 ? (
        <Card>
          <EtatVide titre={t('droitsDo.aucun')} texte={t('droitsDo.aucunAide')} />
        </Card>
      ) : (
        <Card>
          {comptes.data.map((c, i) => (
            <Fragment key={c.id}>
              {i > 0 && <Divider />}
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={{ xs: 1, md: 3 }}
                sx={{ p: 2, alignItems: { md: 'center' } }}
              >
                <Box sx={{ minWidth: 0, flex: '0 0 200px' }}>
                  <Typography sx={{ fontWeight: 600 }}>
                    {c.prenom} {c.nom}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {c.identifiant}
                    {c.pays ? ` · ${c.pays.nom}` : ''}
                  </Typography>
                </Box>
                <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
                  {GROUPES.map((g) => (
                    <FormControlLabel
                      key={g}
                      label={t(`droitsDo.groupes.${g}`)}
                      control={
                        <Switch
                          checked={c.droits[g]}
                          disabled={regler.isPending}
                          onChange={(e) =>
                            regler.mutate({ id: c.id, droits: { [g]: e.target.checked } })
                          }
                          slotProps={{
                            input: {
                              'aria-label': `${c.prenom} ${c.nom} : ${t(`droitsDo.groupes.${g}`)}`,
                            },
                          }}
                        />
                      }
                    />
                  ))}
                </Stack>
              </Stack>
            </Fragment>
          ))}
        </Card>
      )}
    </Stack>
  );
}
