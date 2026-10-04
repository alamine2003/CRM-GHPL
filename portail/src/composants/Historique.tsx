import type { ChangementFiche } from '@innov/api-client';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { Box, Button, Collapse, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';
import { depuis } from './formats';

/** Libellé d'un champ historisé : celui du formulaire quand il existe. */
const LIBELLES: Record<string, string> = {
  civilite: 'prospect.champs.civilite',
  nom: 'prospect.champs.nom',
  prenom: 'prospect.champs.prenom',
  type: 'prospect.champs.type',
  specialite: 'prospect.champs.specialite',
  numero_ordre: 'prospect.champs.numeroOrdre',
  telephone_mobile: 'prospect.champs.telephoneMobile',
  telephone_pro: 'prospect.champs.telephonePro',
  courriel: 'prospect.champs.courriel',
  potentiel: 'prospect.champs.potentiel',
  activite: 'lieu.exercice',
  grade: 'prospect.champs.grade',
  secteur: 'etablissement.champs.secteur',
  localite: 'etablissement.champs.localite',
  adresse: 'etablissement.champs.adresse',
  telephone: 'etablissement.champs.telephone',
  latitude: 'etablissement.champs.position',
  longitude: 'etablissement.champs.position',
  statut: 'prospect.champs.statut',
};

/** Historique champ par champ d'une fiche (PRP-012), replié par défaut. */
export default function Historique({
  objet,
  id,
}: {
  objet: 'prospect' | 'etablissement';
  id: string;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [ouvert, setOuvert] = useState(false);
  const lignes = useQuery<ChangementFiche[]>({
    queryKey: [objet === 'prospect' ? 'prospects' : 'etablissements', 'historique', id],
    queryFn: () =>
      objet === 'prospect' ? client.prospects.historique(id) : client.etablissements.historique(id),
    enabled: ouvert,
  });
  return (
    <Box>
      <Button
        size="small"
        color="inherit"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        endIcon={
          <ExpandMoreRounded
            sx={{ transform: ouvert ? 'rotate(180deg)' : 'none', transition: '.2s' }}
          />
        }
      >
        {t('historique.titre')}
      </Button>
      <Collapse in={ouvert} unmountOnExit>
        {!lignes.data ? (
          <Skeleton height={48} />
        ) : lignes.data.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>
            {t('historique.vide')}
          </Typography>
        ) : (
          <Stack component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {lignes.data.map((c) => {
              const valeur = (v: string) =>
                c.champ === 'statut' && v ? t(`prospect.statuts.${v}`) : v || '—';
              return (
                <Box
                  component="li"
                  key={c.id}
                  sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}
                >
                  <Typography variant="body2">
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      {t(LIBELLES[c.champ] ?? c.champ, { defaultValue: c.champ })}
                    </Box>{' '}
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {valeur(c.ancienne)}
                    </Box>
                    {' → '}
                    {valeur(c.nouvelle)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {[
                      c.auteur ? `${c.auteur.prenom} ${c.auteur.nom}` : t('historique.systeme'),
                      depuis(c.le, i18n.language),
                      c.origine !== 'saisie' ? t(`historique.origines.${c.origine}`) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        )}
      </Collapse>
    </Box>
  );
}
