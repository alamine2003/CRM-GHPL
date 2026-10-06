import type { PlanningEnAttente, SemaineFermee } from '@innov/api-client';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { Box, Card, CardActionArea, Chip, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur } from 'react-router';
import { EnTetePage } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { BoutonRouvrir } from '../composants/Reouverture';
import { ListeActivites } from '../composants/SemainePlanning';
import { libelleVersion, texteEscalade } from '../composants/planningTextes';
import { useSession } from '../contexteSession';

type Traduire = ReturnType<typeof useTranslation>['t'];

/**
 * File des plannings en attente du superviseur (PLN-011, 0.3.1) : les plannings soumis de son
 * équipe, du plus ancien au plus récent (CA1), avec leurs alertes et leurs activités connexes
 * expliquées (PLN-018). Chaque carte ouvre la consultation du planning (0.3.2). Dessous, les
 * semaines fermées le lundi 0 h sans planning validé, que le superviseur peut rouvrir (0.3.9).
 */
export default function Validation() {
  const { t } = useTranslation();
  const { client } = useSession();
  const file = useQuery({ queryKey: ['plannings-a-valider'], queryFn: client.plannings.aValider });
  const fermes = useQuery({ queryKey: ['plannings-fermes'], queryFn: client.plannings.fermes });
  // L'heure d'ouverture de la page sert de repère à l'ancienneté de chaque soumission.
  const [maintenant] = useState(() => Date.now());

  return (
    <Stack spacing={2.5}>
      <EnTetePage
        titre={t('navigation.validation')}
        sousTitre={
          file.data?.length ? t('validation.enAttente', { count: file.data.length }) : undefined
        }
      />
      {file.isError ? (
        <ErreurChargement erreur={file.error} reessayer={() => void file.refetch()} />
      ) : !file.data ? (
        <Skeleton variant="rounded" height={180} />
      ) : file.data.length === 0 ? (
        <Card sx={{ p: 3 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('validation.aucun')}
          </Typography>
        </Card>
      ) : (
        <Stack spacing={1.5} component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {file.data.map((ligne) => (
            <Box component="li" key={ligne.planning.id}>
              <CartePlanning ligne={ligne} maintenant={maintenant} />
            </Box>
          ))}
        </Stack>
      )}
      {!!fermes.data?.length && <SemainesFermees lignes={fermes.data} />}
    </Stack>
  );
}

function SemainesFermees({ lignes }: { lignes: SemaineFermee[] }) {
  const { t } = useTranslation();
  return (
    <Stack spacing={1.5} component="section" aria-labelledby="semaines-fermees">
      <Box>
        <Typography id="semaines-fermees" variant="h6" component="h2">
          {t('fermeture.liste')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('fermeture.listeAide')}
        </Typography>
      </Box>
      <Stack spacing={1} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {lignes.map((ligne) => (
          <Card component="li" key={ligne.delegue.id} sx={{ p: 2 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>
                  {ligne.delegue.prenom} {ligne.delegue.nom}
                </Typography>
                <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {ligne.planning
                      ? t(`semaine.statuts.${ligne.planning.statut}`)
                      : t('fermeture.sansPlanning')}
                  </Typography>
                  {ligne.demande && (
                    <Chip size="small" color="warning" label={t('fermeture.demandeRecue')} />
                  )}
                </Stack>
              </Box>
              <BoutonRouvrir
                delegue={ligne.delegue}
                semaine={ligne.semaine}
                variante={ligne.demande ? 'contained' : 'outlined'}
              />
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}

function CartePlanning({ ligne, maintenant }: { ligne: PlanningEnAttente; maintenant: number }) {
  const { t, i18n } = useTranslation();
  const { planning, delegue } = ligne;
  const jour = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, options).format(new Date(`${iso}T12:00:00`));
  const soumisLe = planning.soumis_le
    ? new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: ligne.fuseau,
      }).format(new Date(planning.soumis_le))
    : '';
  const fin = new Date(`${planning.semaine}T12:00:00`);
  fin.setDate(fin.getDate() + 4);
  const alertes = ligne.signalements.filter((s) => s.code !== 'soumis_en_retard');
  // Ancienneté de la soumission (PLN-011 CA1), en jours entiers.
  const jours = planning.soumis_le
    ? Math.floor((maintenant - new Date(planning.soumis_le).getTime()) / 86_400_000)
    : 0;
  return (
    <Card>
      <CardActionArea
        component={LienRouteur}
        to={`/validation/${planning.id}`}
        sx={{
          p: 2,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          justifyContent: 'stretch',
          gap: 1.5,
          textAlign: 'left',
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'baseline' } }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
              {delegue.prenom} {delegue.nom}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {[
                ligne.remplace
                  ? t('remplacements.pour', {
                      nom: `${ligne.remplace.prenom} ${ligne.remplace.nom}`,
                    })
                  : '',
                ligne.postes.join(', '),
                t('semaine.periode', {
                  debut: jour(planning.semaine, { day: 'numeric', month: 'short' }),
                  fin: fin.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }),
                }),
                t('validation.visites', { count: ligne.visites }),
                libelleVersion(planning, t),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Typography>
          </Box>
          <Box sx={{ flex: 'none', textAlign: { sm: 'right' } }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {jours > 0
                ? t('validation.depuis', { count: jours })
                : t('validation.depuisAujourdhui')}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'baseline', justifyContent: { sm: 'flex-end' } }}
            >
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('soumission.soumisLe', { date: soumisLe })}
              </Typography>
              {planning.en_retard && (
                <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 600 }}>
                  {t('soumission.enRetard')}
                </Typography>
              )}
            </Stack>
          </Box>
        </Stack>
        {ligne.escalade && (
          <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 600 }}>
            {texteEscalade(ligne.escalade, t, i18n.language, ligne.fuseau)}
          </Typography>
        )}
        {alertes.length > 0 && (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            {alertes.map((a) => (
              <Chip
                key={a.code}
                size="small"
                variant="outlined"
                color="warning"
                label={libelleAlerte(a.code, a.nombre, t)}
              />
            ))}
          </Stack>
        )}
        {ligne.activites.length > 0 && <ListeActivites activites={ligne.activites} />}
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'primary.main' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('consultation.ouvrir')}
          </Typography>
          <ChevronRightRounded fontSize="small" />
        </Stack>
      </CardActionArea>
    </Card>
  );
}

function libelleAlerte(code: string, nombre: number, t: Traduire) {
  return t(`validation.alertes.${code}`, { count: nombre, defaultValue: code });
}
