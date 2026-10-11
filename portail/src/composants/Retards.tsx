import type { JourneeEnRetard, RapportEnRetard } from '@innov/api-client';
import { Box, Button, Card, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur } from 'react-router';
import { useSession } from '../contexteSession';
import { EnTeteCarte, Etiquette, EtatVide } from './Elements';
import { ErreurChargement } from './Erreurs';

/**
 * Onglet « Retards » de « À traiter » (RPT-017, 35.A) : les rapports pas encore soumis après
 * leur échéance, puis les journées de plus de 4 semaines non validées (20.A). CA1 : filtrable par
 * délégué.
 */
export default function Retards({
  delegue,
  surDelegue,
}: {
  delegue: string;
  surDelegue: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const retards = useQuery({
    queryKey: ['rapports-retards', delegue],
    queryFn: () => client.rapports.retards(delegue || undefined),
  });
  if (retards.isError)
    return <ErreurChargement erreur={retards.error} reessayer={() => void retards.refetch()} />;
  if (!retards.data) return <Skeleton variant="rounded" height={220} />;
  const { delegues, rapports, journees } = retards.data;
  const jour = (iso: string) => {
    const texte = new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${iso}T12:00:00`));
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  };
  const avecNom = !delegue;
  return (
    <Stack spacing={2}>
      <TextField
        select
        size="small"
        label={t('retards.delegue')}
        value={delegue}
        onChange={(e) => surDelegue(e.target.value)}
        // « Tous les délégués » s'affiche : le libellé reste au-dessus de la valeur vide.
        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        sx={{ maxWidth: 320 }}
      >
        <MenuItem value="">{t('retards.tous')}</MenuItem>
        {delegues.map((d) => (
          <MenuItem key={d.id} value={d.id}>
            {d.prenom} {d.nom}
          </MenuItem>
        ))}
      </TextField>
      {rapports.length === 0 && journees.length === 0 ? (
        <Card>
          <EtatVide titre={t('retards.aucun')} texte={t('retards.aucunTexte')} />
        </Card>
      ) : null}
      {rapports.length > 0 && (
        <Card>
          <EnTeteCarte titre={t('retards.rapports', { count: rapports.length })} />
          <Typography variant="body2" sx={{ px: 2, pt: 1.25, color: 'text.secondary' }}>
            {t('retards.rapportsAide')}
          </Typography>
          <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {rapports.map((r) => (
              <LigneRapport key={r.visite} rapport={r} jour={jour} avecNom={avecNom} />
            ))}
          </Stack>
        </Card>
      )}
      {journees.length > 0 && (
        <Card>
          <EnTeteCarte titre={t('retards.journees', { count: journees.length })} />
          <Typography variant="body2" sx={{ px: 2, pt: 1.25, color: 'text.secondary' }}>
            {t('retards.journeesAide')}
          </Typography>
          <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {journees.map((j) => (
              <LigneJournee
                key={`${j.delegue.id}-${j.date}`}
                journee={j}
                jour={jour}
                avecNom={avecNom}
              />
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function LigneRapport({
  rapport: r,
  jour,
  avecNom,
}: {
  rapport: RapportEnRetard;
  jour: (iso: string) => string;
  avecNom: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Box
      component="li"
      sx={{
        px: 2,
        py: 1.25,
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
      }}
    >
      {/* Étroit, le lien passe sous le texte plutôt que de l'écraser. */}
      <Box sx={{ minWidth: 0, flex: '1 1 260px' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600 }}>
            {[jour(r.date), r.heure].filter(Boolean).join(' · ')}
          </Typography>
          <Etiquette ton="warning">{t('retards.depuis', { count: r.jours_de_retard })}</Etiquette>
          <Etiquette>{t(`retards.etats.${r.etat}`)}</Etiquette>
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {[avecNom ? `${r.delegue.prenom} ${r.delegue.nom}` : null, r.prospect, r.etablissement]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      </Box>
      <Button size="small" component={LienRouteur} to={`/a-traiter/${r.delegue.id}/${r.date}`}>
        {t('journee.ouvrir')}
      </Button>
    </Box>
  );
}

function LigneJournee({
  journee: j,
  jour,
  avecNom,
}: {
  journee: JourneeEnRetard;
  jour: (iso: string) => string;
  avecNom: boolean;
}) {
  const { t } = useTranslation();
  const details = [
    avecNom ? `${j.delegue.prenom} ${j.delegue.nom}` : null,
    j.rapports_a_valider ? t('aTraiter.aValider', { count: j.rapports_a_valider }) : null,
    j.rapports_attendus ? t('aTraiter.attendus', { count: j.rapports_attendus }) : null,
  ].filter(Boolean);
  return (
    <Box
      component="li"
      sx={{
        px: 2,
        py: 1.25,
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
      }}
    >
      {/* Étroit, le lien passe sous le texte plutôt que de l'écraser. */}
      <Box sx={{ minWidth: 0, flex: '1 1 260px' }}>
        <Typography sx={{ fontWeight: 600 }}>{jour(j.date)}</Typography>
        {details.length > 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {details.join(' · ')}
          </Typography>
        )}
      </Box>
      <Button size="small" component={LienRouteur} to={`/a-traiter/${j.delegue.id}/${j.date}`}>
        {t('journee.ouvrir')}
      </Button>
    </Box>
  );
}
