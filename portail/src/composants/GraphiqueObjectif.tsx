import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { compact, montant, nomDuMois } from './formatsVentes';

const L = 720;
const H = 240;
const MARGE = { haut: 12, droite: 12, bas: 28, gauche: 52 };

/** Le cumul de janvier à chaque mois. */
function cumul(valeurs: number[]): number[] {
  let total = 0;
  return valeurs.map((v) => (total += v));
}

/**
 * Cible / réalisé (1.8.0, prd.md §14.89) : l'attendu cumulé de l'année (trait pointillé, sur les
 * douze mois) face au réalisé cumulé (trait plein, jusqu'au mois choisi). L'écart se lit à l'œil ;
 * le tableau sous le graphique porte les mêmes chiffres, mois par mois.
 */
export default function GraphiqueObjectif({
  libelle,
  cible,
  realise,
  moisFin,
  annee,
  devise,
}: {
  libelle: string;
  cible: number[];
  realise: number[];
  moisFin: number;
  annee: number;
  devise: string;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const attendu = cumul(cible);
  const reel = cumul(realise).slice(0, moisFin);
  const maximum = Math.max(1, ...attendu, ...reel);
  const largeur = L - MARGE.gauche - MARGE.droite;
  const hauteur = H - MARGE.haut - MARGE.bas;
  const pas = largeur / 12;
  const y = (v: number) => MARGE.haut + hauteur - (v / maximum) * hauteur;
  const x = (i: number) => MARGE.gauche + pas * i + pas / 2;
  const trait = (valeurs: number[]) =>
    valeurs.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const mois = (i: number) => `${annee}-${String(i + 1).padStart(2, '0')}`;
  const m = (v: number) => montant(v, i18n.language, devise);
  const fin = moisFin - 1;
  return (
    <Stack spacing={1} sx={{ p: 2 }}>
      <Box
        component="svg"
        viewBox={`0 0 ${L} ${H}`}
        role="img"
        aria-label={t('ventes.objectifs.courbeAria', {
          libelle,
          mois: nomDuMois(mois(fin), i18n.language, true),
          realise: m(reel[fin] ?? 0),
          attendu: m(attendu[fin] ?? 0),
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
        {attendu.map((_, i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize={11}
            fill={theme.palette.text.secondary}
          >
            {nomDuMois(mois(i), i18n.language)}
          </text>
        ))}
        <path
          d={trait(attendu)}
          fill="none"
          stroke={theme.palette.text.secondary}
          strokeWidth={2}
          strokeDasharray="5 4"
        />
        <path d={trait(reel)} fill="none" stroke={theme.palette.primary.main} strokeWidth={2.5} />
        {reel.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill={theme.palette.primary.main}>
            <title>{`${nomDuMois(mois(i), i18n.language, true)} : ${m(v)} / ${m(attendu[i]!)}`}</title>
          </circle>
        ))}
      </Box>
      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          <Box component="span" sx={{ color: 'primary.main' }} aria-hidden>
            ●
          </Box>{' '}
          {t('ventes.objectifs.legendeRealise')}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          <Box component="span" aria-hidden>
            ┄
          </Box>{' '}
          {t('ventes.objectifs.legendeAttendu')}
        </Typography>
      </Stack>
      {/* L'équivalent en texte du graphique, pour les lecteurs d'écran. */}
      <Box sx={visuellementMasque}>
        <Table size="small" aria-label={t('ventes.objectifs.courbeTableau', { libelle })}>
          <TableHead>
            <TableRow>
              <TableCell>{t('ventes.mensuel.mois')}</TableCell>
              <TableCell>{t('ventes.objectifs.legendeAttendu')}</TableCell>
              <TableCell>{t('ventes.objectifs.legendeRealise')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {attendu.map((a, i) => (
              <TableRow key={i}>
                <TableCell>{nomDuMois(mois(i), i18n.language, true)}</TableCell>
                <TableCell>{m(a)}</TableCell>
                <TableCell>{i < moisFin ? m(reel[i]!) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  );
}

const visuellementMasque = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
