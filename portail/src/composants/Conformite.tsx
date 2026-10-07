/**
 * Conformité des journées (VIS-010, RG-029) : chaque journée passée du délégué, « conforme »
 * ou « à vérifier », avec ses écarts lisibles (hors plage, distance, durée, imprévue, à
 * justifier, sans GPS). Les seuils sont ceux du pays ; une journée validée ne bouge plus.
 */
import type { Semaine } from '@innov/api-client';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import { Box, Card, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { EnTeteCarte } from './Elements';

type Journee = Semaine['conformite'][number];
type Ecart = Journee['ecarts'][number];

export function texteEcart(e: Ecart, t: ReturnType<typeof useTranslation>['t']) {
  const qui = [e.heure, e.prospect].filter(Boolean).join(' · ');
  switch (e.code) {
    case 'hors_plage':
      return t('conformite.ecarts.hors_plage', {
        qui,
        heures: [e.debut, e.fin].filter(Boolean).join(' – '),
      });
    case 'distance':
      return t('conformite.ecarts.distance', { qui, distance: e.distance_m, seuil: e.seuil_m });
    case 'duree_courte':
    case 'duree_longue':
      return t(`conformite.ecarts.${e.code}`, { qui, minutes: e.minutes, seuil: e.seuil });
    case 'imprevue':
      return t('conformite.ecarts.imprevue', { qui, justification: e.justification });
    case 'a_justifier':
      return t('conformite.ecarts.a_justifier', { qui });
    case 'sans_gps':
      return [
        t('conformite.ecarts.sans_gps', { count: e.nombre, tolerees: e.tolerees }),
        // DC-55 : dont les positions trop imprécises pour juger de la distance.
        e.imprecises ? t('conformite.ecarts.dontImprecises', { count: e.imprecises }) : '',
      ]
        .filter(Boolean)
        .join(' ');
  }
}

export function CarteConformite({
  semaine,
  jourLong,
}: {
  semaine: Semaine;
  jourLong: (iso: string) => string;
}) {
  const { t } = useTranslation();
  if (semaine.conformite.length === 0) return null;
  const aVerifier = semaine.conformite.filter((j) => j.classement === 'a_verifier').length;
  return (
    <Card>
      <EnTeteCarte titre={t('conformite.titre')} />
      <Typography variant="body2" sx={{ px: 2, pt: 1.25, color: 'text.secondary' }}>
        {aVerifier
          ? t('conformite.resume', { count: semaine.conformite.length, aVerifier })
          : t('conformite.toutesConformes', { count: semaine.conformite.length })}
      </Typography>
      <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
        {semaine.conformite.map((j) => {
          const conforme = j.classement === 'conforme';
          // La journée du jour n'est pas finie : sans écart, rien n'est encore acquis.
          const enCours = conforme && !j.terminee;
          return (
            <Stack key={j.date} spacing={0.5} sx={{ px: 2, py: 1.25 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {enCours ? (
                  <ScheduleRounded sx={{ color: 'text.secondary', fontSize: 20 }} />
                ) : conforme ? (
                  <CheckCircleRounded sx={{ color: 'success.main', fontSize: 20 }} />
                ) : (
                  <ErrorOutlineRounded sx={{ color: 'warning.main', fontSize: 20 }} />
                )}
                <Typography sx={{ fontWeight: 600 }}>{jourLong(j.date)}</Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: enCours ? 'text.secondary' : conforme ? 'success.main' : 'warning.main',
                    fontWeight: 600,
                  }}
                >
                  {enCours
                    ? t('conformite.enCours')
                    : conforme
                      ? t('conformite.conforme')
                      : t('conformite.aVerifier', { count: j.ecarts.length })}
                </Typography>
                {j.fige && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {t('conformite.fige')}
                  </Typography>
                )}
              </Stack>
              {j.ecarts.map((e, i) => (
                <Typography
                  key={`${e.code}-${e.visite ?? i}`}
                  variant="body2"
                  sx={{ pl: 3.5, color: 'text.secondary', overflowWrap: 'anywhere' }}
                >
                  {texteEcart(e, t)}
                </Typography>
              ))}
            </Stack>
          );
        })}
      </Stack>
    </Card>
  );
}
