import type { MoisVentes } from '@innov/api-client';
import { Box, Stack, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { compact, montant, nomDuMois } from './formatsVentes';

const L = 720;
const H = 240;
const MARGE = { haut: 12, droite: 12, bas: 28, gauche: 52 };

/**
 * Les ventes mois par mois (prd.md §14.84) : une barre par mois de l'année, un trait pour le
 * même mois de l'an passé. Les mois après la date de coupe restent vides. Le graphique est un
 * complément : le tableau du détail mensuel porte les mêmes chiffres.
 */
export default function GraphiqueVentes({
  mensuel,
  moisFin,
  annee,
  devise,
}: {
  mensuel: MoisVentes[];
  moisFin: number;
  annee: number;
  devise: string;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const valeurs = mensuel.map((m) => Number(m.montant_ttc));
  const precedents = mensuel.map((m) => Number(m.precedent_montant_ttc));
  const maximum = Math.max(1, ...valeurs, ...precedents);
  const largeur = L - MARGE.gauche - MARGE.droite;
  const hauteur = H - MARGE.haut - MARGE.bas;
  const pas = largeur / 12;
  const y = (v: number) => MARGE.haut + hauteur - (v / maximum) * hauteur;
  const x = (i: number) => MARGE.gauche + pas * i + pas / 2;
  const total = valeurs.slice(0, moisFin).reduce((a, b) => a + b, 0);
  const trait = precedents.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  return (
    <Stack spacing={1}>
      <Box
        component="svg"
        viewBox={`0 0 ${L} ${H}`}
        role="img"
        aria-label={t('ventes.graphique.aria', {
          annee,
          total: montant(total, i18n.language, devise),
        })}
        sx={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <g key={r}>
            <line
              x1={MARGE.gauche}
              x2={L - MARGE.droite}
              y1={y(maximum * r)}
              y2={y(maximum * r)}
              stroke={theme.palette.divider}
              strokeWidth={1}
            />
            <text
              x={MARGE.gauche - 6}
              y={y(maximum * r) + 4}
              textAnchor="end"
              fontSize={11}
              fill={theme.palette.text.secondary}
            >
              {compact(maximum * r, i18n.language)}
            </text>
          </g>
        ))}
        {valeurs.map((v, i) => {
          const mois = mensuel[i]!;
          const dans = i < moisFin;
          return (
            <g key={mois.mois}>
              <rect
                x={x(i) - pas * 0.3}
                y={y(dans ? v : 0)}
                width={pas * 0.6}
                height={Math.max(0, MARGE.haut + hauteur - y(dans ? v : 0))}
                rx={2}
                fill={theme.palette.primary.main}
                opacity={dans ? 1 : 0.15}
              >
                <title>
                  {`${nomDuMois(mois.mois, i18n.language, true)} : ${montant(v, i18n.language, devise)}`}
                </title>
              </rect>
              <text
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                fontSize={11}
                fill={theme.palette.text.secondary}
              >
                {nomDuMois(mois.mois, i18n.language)}
              </text>
            </g>
          );
        })}
        <path
          d={trait}
          fill="none"
          stroke={theme.palette.secondary.main}
          strokeWidth={2}
          strokeDasharray="5 4"
        />
        {precedents.map((v, i) => (
          <circle
            key={mensuel[i]!.mois}
            cx={x(i)}
            cy={y(v)}
            r={3}
            fill={theme.palette.secondary.main}
          />
        ))}
      </Box>
      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          <Box component="span" sx={{ color: 'primary.main' }} aria-hidden>
            ■
          </Box>{' '}
          {annee}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          <Box component="span" sx={{ color: 'secondary.main' }} aria-hidden>
            ◆
          </Box>{' '}
          {annee - 1}
        </Typography>
      </Stack>
    </Stack>
  );
}
