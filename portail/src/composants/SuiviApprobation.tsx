import type { Semaine } from '@innov/api-client';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import { Alert, Box, Card, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { EnTeteCarte } from './Elements';
import { nom } from './planningTextes';

/**
 * Un planning approuvé modifié (PLN-015 CA2, RG-018) : ce qui attend la décision — visites
 * ajoutées, déplacées ou modifiées, retraits — tandis que les autres restent prévues selon la
 * version approuvée. Au portail, le délégué apprend aussi où modifier un planning approuvé.
 */
export function AttenteApprobation({
  semaine: s,
  jourCourt,
  delegue = false,
}: {
  semaine: Semaine;
  jourCourt: (iso: string) => string;
  delegue?: boolean;
}) {
  const { t } = useTranslation();
  const suivi = s.approbation;
  if (!suivi) return null;
  const moment = (date: string, heure: string | null) =>
    `${jourCourt(date)}${heure ? ` ${heure}` : ''}`.replace(/ /g, ' ');
  const concernees = s.visites.filter((v) => suivi.en_attente.includes(v.id));
  if (concernees.length === 0 && suivi.retraits.length === 0) {
    return delegue && suivi.modifiable ? (
      <Alert severity="info" variant="outlined">
        {t('apresApprobation.surTelephone')}
      </Alert>
    ) : null;
  }
  return (
    <Alert severity="info" variant="outlined">
      {concernees.length > 0 && (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {t('apresApprobation.aDecider', {
            liste: concernees
              .map((v) => `${moment(v.date, v.heure)} · ${nom(v.prospect, t)}`)
              .join(', '),
          })}
        </Typography>
      )}
      {suivi.retraits.length > 0 && (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {t('apresApprobation.retraits', {
            count: suivi.retraits.length,
            liste: suivi.retraits
              .map(
                (v) =>
                  `${moment(v.date, v.heure)} · ${v.prospect?.nom ?? t('visites.sansProspect')}`,
              )
              .join(', '),
          })}
        </Typography>
      )}
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {t('apresApprobation.reference', { numero: suivi.reference })}
      </Typography>
    </Alert>
  );
}

/** PLN-015 CA1 : les heures changées depuis l'approbation, libres mais tracées. */
export function HeuresChangees({
  semaine: s,
  jourCourt,
}: {
  semaine: Semaine;
  jourCourt: (iso: string) => string;
}) {
  const { t } = useTranslation();
  const mineures = s.approbation?.mineures ?? [];
  if (mineures.length === 0) return null;
  return (
    <Card>
      <EnTeteCarte titre={t('apresApprobation.titreMineures', { count: mineures.length })} />
      <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', m: 0, px: 2, py: 1.5 }}>
        {mineures.map((m) => (
          <Stack
            component="li"
            key={`${m.visite}-${m.le}`}
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center' }}
          >
            <ScheduleRounded fontSize="small" color="action" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2">
                {t('apresApprobation.ligneMineure', {
                  prospect: m.prospect ?? t('visites.sansProspect'),
                  jour: jourCourt(m.date),
                  avant: m.avant ?? t('apresApprobation.sansHeure'),
                  apres: m.apres ?? t('apresApprobation.sansHeure'),
                })}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}
