import type { Etablissement } from '@innov/api-client';
import { Alert, Box, Button, Card, Link, Skeleton, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

const Carte = lazy(() => import('./Carte'));

interface Point {
  latitude: number;
  longitude: number;
}

/** Distance à vol d'oiseau, en mètres (haversine). */
function distanceM(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

/**
 * DC-52 : la position de référence proposée d'un établissement sans position, à partir des
 * pointages de démarrage de deux personnes au moins ; l'administrateur pays la vérifie sur la
 * carte, la déplace d'un clic au besoin, et la valide.
 */
export default function PositionProposee({ fiche }: { fiche: Etablissement }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const [choisi, setChoisi] = useState<Point | null>(null);
  const proposee = useQuery({
    queryKey: ['etablissements', 'position-proposee', fiche.id],
    queryFn: () => client.etablissements.positionProposee(fiche.id),
  });
  const valider = useMutation({
    mutationFn: (point?: Point) => client.etablissements.validerPosition(fiche.id, point),
    onSuccess: () => {
      notifier(t('etablissement.proposee.validee'));
      return requetes.invalidateQueries({ queryKey: ['etablissements'] });
    },
    onError: (err: unknown) => notifier(messageErreur(err, t('erreurs.reseau')), 'error'),
  });

  const p = proposee.data;
  if (!p && !proposee.isError) return <Skeleton variant="rounded" height={120} />;
  // Sans proposition (ou sans réseau pour la lire), le signalement habituel.
  if (!p || p.latitude == null || p.longitude == null) {
    return (
      <Alert severity="warning">
        <strong>{t('etablissement.fiche.sansPosition')}</strong> —{' '}
        {t('etablissement.fiche.sansPositionTexte')}{' '}
        {!p
          ? null
          : p.utilisables === 0
            ? t('etablissement.proposee.aucunPointage')
            : t('etablissement.proposee.attente', {
                count: p.utilisables,
                personnes: p.personnes,
              })}
      </Alert>
    );
  }
  const propose = { latitude: p.latitude, longitude: p.longitude };
  const point = choisi ?? propose;
  const deplace = choisi ? distanceM(propose, choisi) : 0;
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });

  return (
    <Card variant="outlined" sx={{ p: 1.5, borderColor: 'secondary.main' }}>
      <Stack spacing={1.25}>
        <Box>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
            {t('etablissement.proposee.titre')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('etablissement.proposee.fondement', {
              count: p.pointages.length,
              personnes: p.personnes,
            })}{' '}
            {t('etablissement.proposee.ecart', { metres: p.ecart_max_m })}
          </Typography>
        </Box>
        <Suspense fallback={<Skeleton variant="rounded" height={240} />}>
          <Carte
            hauteur={240}
            surClic={(latitude, longitude) =>
              setChoisi({
                latitude: Math.round(latitude * 1e6) / 1e6,
                longitude: Math.round(longitude * 1e6) / 1e6,
              })
            }
            points={[
              ...p.pointages.map((x, i) => ({
                id: `pointage-${i}`,
                latitude: x.latitude,
                longitude: x.longitude,
                discret: true,
                libelle: [
                  t('etablissement.proposee.pointage', { date: date(x.le) }),
                  x.precision_m != null
                    ? t('etablissement.proposee.precision', { metres: x.precision_m })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              })),
              { id: 'propose', ...point, libelle: t('etablissement.proposee.point'), actif: true },
            ]}
          />
        </Suspense>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)} ·{' '}
          {choisi ? (
            <>
              {t('etablissement.proposee.deplace', { metres: deplace })}{' '}
              <Link component="button" variant="caption" onClick={() => setChoisi(null)}>
                {t('etablissement.proposee.revenir')}
              </Link>
            </>
          ) : (
            t('etablissement.proposee.aide')
          )}
        </Typography>
        <Box>
          <Button
            variant="contained"
            disabled={valider.isPending}
            onClick={() => valider.mutate(choisi ?? undefined)}
          >
            {t('etablissement.proposee.valider')}
          </Button>
        </Box>
      </Stack>
    </Card>
  );
}
