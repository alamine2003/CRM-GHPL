import type { RapportChronologie } from '@innov/api-client';
import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';
import { Etiquette } from './Elements';
import { ErreurChargement } from './Erreurs';

/**
 * Rapports de visite d'un prospect (RPT-011), du plus récent au plus ancien : ceux que le
 * périmètre permet de lire (superviseur, DM, DF, responsable pays), jamais un brouillon d'autrui.
 */
export default function RapportsProspect({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const rapports = useQuery<RapportChronologie[]>({
    queryKey: ['prospects', 'rapports', id],
    queryFn: () => client.prospects.rapports(id),
  });
  if (rapports.isError)
    return <ErreurChargement erreur={rapports.error} reessayer={() => void rapports.refetch()} />;
  if (!rapports.data) return <Skeleton variant="rounded" height={96} />;
  if (rapports.data.length === 0)
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('chronologie.aucune')}
      </Typography>
    );
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T12:00:00Z`));
  return (
    <Stack
      component="ol"
      sx={{ listStyle: 'none', m: 0, p: 0 }}
      divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}
    >
      {rapports.data.map((r) => (
        <Box component="li" key={r.id} sx={{ py: 1.25, display: 'grid', gap: 0.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {date(r.date)}
            </Typography>
            {r.en_retard && <Etiquette ton="warning">{t('chronologie.enRetard')}</Etiquette>}
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {[r.heure, r.etablissement, r.delegue_nom].filter(Boolean).join(' · ')}
          </Typography>
          {r.resultat && (
            <Typography variant="body2">
              {[r.resultat, r.resultat_obtenu].filter(Boolean).join(' — ')}
            </Typography>
          )}
          {r.presentations.length > 0 && (
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {r.presentations.map((x) => (
                <Typography component="li" variant="body2" key={x.produit ?? x.libelle}>
                  {x.retour ? `${x.libelle} — ${t(`rapport.retours.${x.retour}`)}` : x.libelle}
                </Typography>
              ))}
            </Box>
          )}
          {r.resume && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {r.resume}
            </Typography>
          )}
          {(r.prochaine_action_type || r.prochaine_action) && (
            <Typography variant="body2">
              <Box component="span" sx={{ fontWeight: 600 }}>
                {`${t('chronologie.suite')} `}
              </Box>
              {[r.prochaine_action_type, r.prochaine_action].filter(Boolean).join(' — ')}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
}
