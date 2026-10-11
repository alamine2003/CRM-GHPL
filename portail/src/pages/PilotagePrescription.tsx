import type { PointAttention, TendanceProduit } from '@innov/api-client';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import {
  Box,
  Button,
  Card,
  Collapse,
  Divider,
  Link,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur } from 'react-router';
import { Etiquette } from '../composants/Elements';
import { useSession } from '../contexteSession';

/**
 * DC-53, DC-57 (0.7.9) : sur la sélection du tableau de pilotage (périmètre, période, filtres),
 * les points d'attention calculés par des règles, chacun relié à ses visites, et la tendance de
 * prescription par produit, agrégée, sans nom de prescripteur.
 */
export default function PilotagePrescription({
  demande,
  ouvrirJournee,
}: {
  demande: Record<string, string>;
  /** Seul l'encadrement qui valide ouvre la journée d'un délégué (RPT-012). */
  ouvrirJournee: boolean;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const { par: _par, statut: _statut, ...selection } = demande;
  const donnees = useQuery({
    queryKey: ['pilotage-prescription', selection],
    queryFn: () => client.pilotage.prescription(selection),
    refetchInterval: 5 * 60 * 1000,
  });
  if (donnees.isError) return null;
  if (!donnees.data) return <Skeleton variant="rounded" height={96} />;
  const { points, tendance } = donnees.data;
  return (
    <>
      <Stack spacing={1.25} component="section" aria-labelledby="titre-attention">
        <Typography id="titre-attention" variant="h6" component="h2">
          {t('pilotage.attention.titre')}
        </Typography>
        <Card>
          {points.length === 0 ? (
            <Typography variant="body2" sx={{ p: 2, color: 'text.secondary' }}>
              {t('pilotage.attention.aucun')}
            </Typography>
          ) : (
            points.map((p, i) => (
              <Fragment key={`${p.regle}-${p.produit}`}>
                {i > 0 && <Divider />}
                <Point point={p} ouvrirJournee={ouvrirJournee} />
              </Fragment>
            ))
          )}
        </Card>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('pilotage.attention.note')}
        </Typography>
      </Stack>
      {tendance.length > 0 && <Tendance produits={tendance} />}
    </>
  );
}

const TON = {
  actions_en_retard: 'warning',
  passages_prescrit: 'success',
  retours_en_baisse: 'warning',
} as const;

function Point({ point: p, ouvrirJournee }: { point: PointAttention; ouvrirJournee: boolean }) {
  const { t, i18n } = useTranslation();
  const [ouvert, setOuvert] = useState(false);
  const jour = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const reste = p.nombre - p.visites.length;
  return (
    <Box sx={{ px: 2, py: 1.25 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>
          <Etiquette ton={TON[p.regle]}>{p.nombre}</Etiquette>{' '}
          {t(`pilotage.attention.regles.${p.regle}`, { count: p.nombre, produit: p.produit })}
        </Typography>
        <Button
          size="small"
          endIcon={ouvert ? <ExpandLessRounded /> : <ExpandMoreRounded />}
          aria-expanded={ouvert}
          onClick={() => setOuvert(!ouvert)}
        >
          {t('pilotage.attention.visites', { count: p.nombre })}
        </Button>
      </Stack>
      <Collapse in={ouvert} unmountOnExit>
        <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.5 }}>
          {regrouper(p.visites).map(({ v, nombre }) => {
            const texte = [jour.format(new Date(`${v.date}T12:00:00`)), v.delegue, v.prospect]
              .filter(Boolean)
              .join(' · ');
            const libelle =
              nombre > 1
                ? `${texte} ${t('pilotage.attention.nVisites', { count: nombre })}`
                : texte;
            return (
              <Typography key={v.visite} component="li" variant="body2">
                {ouvrirJournee ? (
                  <Link component={LienRouteur} to={`/a-traiter/${v.delegue_id}/${v.date}`}>
                    {libelle}
                  </Link>
                ) : (
                  libelle
                )}
              </Typography>
            );
          })}
          {reste > 0 && (
            <Typography component="li" variant="body2" sx={{ color: 'text.secondary' }}>
              {t('pilotage.attention.etAutres', { count: reste })}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

/** Une ligne par journée d'un délégué : deux visites du même jour mènent à la même page. */
function regrouper(visites: PointAttention['visites']) {
  const lignes: { v: PointAttention['visites'][number]; nombre: number }[] = [];
  for (const v of visites) {
    const meme = lignes.find(
      (x) => x.v.delegue_id === v.delegue_id && x.v.date === v.date && x.v.prospect === v.prospect,
    );
    if (meme) meme.nombre += 1;
    else lignes.push({ v, nombre: 1 });
  }
  return lignes;
}

function Tendance({ produits }: { produits: TendanceProduit[] }) {
  const { t, i18n } = useTranslation();
  const pourcent = new Intl.NumberFormat(i18n.language, { style: 'percent' });
  const part = (v: number | null) => (v === null ? '—' : pourcent.format(v));
  const retours = ['tres_bien', 'prescrit', 'peu', 'non_prescrit'] as const;
  return (
    <Stack spacing={1.25} component="section" aria-labelledby="titre-tendance">
      <Typography id="titre-tendance" variant="h6" component="h2">
        {t('pilotage.tendance.titre')}
      </Typography>
      <Card>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-labelledby="titre-tendance">
            <TableHead>
              <TableRow>
                <TableCell>{t('pilotage.tendance.produit')}</TableCell>
                <TableCell>{t('pilotage.tendance.retours')}</TableCell>
                <TableCell align="right">{t('pilotage.tendance.favorable')}</TableCell>
                <TableCell align="right">{t('pilotage.tendance.precedente')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {produits.map((p) => (
                <TableRow key={p.produit ?? p.libelle}>
                  <TableCell sx={{ fontWeight: 600 }}>{p.libelle}</TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {retours
                        .filter((r) => p.periode[r] > 0)
                        .map((r) => t(`pilotage.tendance.niveaux.${r}`, { count: p.periode[r] }))
                        .join(' · ')}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {part(p.favorable_periode)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary' }}>
                    {part(p.favorable_precedente)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('pilotage.tendance.note')}
      </Typography>
    </Stack>
  );
}
