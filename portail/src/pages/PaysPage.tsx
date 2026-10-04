import type { Pays, Perimetre, StatutPays } from '@innov/api-client';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Box, Button, Card, Chip, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import DialogueFormulaire from '../composants/Dialogue';
import { EnTetePage } from '../composants/Elements';
import { dateCourte, drapeau } from '../composants/formats';
import { ErreurChargement } from '../composants/Erreurs';
import { useSession } from '../contexteSession';

const COULEUR: Record<StatutPays, 'success' | 'warning' | 'default'> = {
  actif: 'success',
  suspendu: 'warning',
  archive: 'default',
};

type Changement = { pays: Pays; statut: StatutPays };

export default function PaysPage({ perimetre }: { perimetre: Perimetre }) {
  const { t, i18n } = useTranslation();
  const { client, choisirPays } = useSession();
  const requetes = useQueryClient();
  const naviguer = useNavigate();
  const liste = useQuery({ queryKey: ['pays', 'liste'], queryFn: () => client.pays.liste() });
  const [creation, setCreation] = useState(false);
  const [code, setCode] = useState('');
  const [changement, setChangement] = useState<Changement | null>(null);
  const gerer = perimetre.actions.includes('pays.changer_statut');
  const rafraichir = () => requetes.invalidateQueries({ queryKey: ['pays'] });

  return (
    <Stack spacing={2.5}>
      <EnTetePage
        titre={t('paysPage.titre')}
        sousTitre={t('paysPage.sousTitre')}
        actions={
          perimetre.actions.includes('pays.creer') && (
            <Button
              variant="contained"
              color="secondary"
              startIcon={<AddRounded />}
              onClick={() => setCreation(true)}
            >
              {t('paysPage.nouveau')}
            </Button>
          )
        }
      />
      {liste.isError ? (
        <ErreurChargement erreur={liste.error} reessayer={() => void liste.refetch()} />
      ) : liste.isPending ? (
        <Skeleton variant="rounded" height={180} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', xl: 'repeat(3, 1fr)' },
          }}
        >
          {liste.data.map((pays) => (
            <Card
              key={pays.code}
              sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.5 }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Box aria-hidden sx={{ fontSize: 34, lineHeight: 1 }}>
                  {drapeau(pays.code)}
                </Box>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="h6" component="h2" noWrap>
                    {pays.nom}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {pays.code} · {pays.fuseau} · {pays.devise} · {pays.langue.toUpperCase()}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  color={COULEUR[pays.statut]}
                  label={t(`paysPage.statuts.${pays.statut}`)}
                />
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('paysPage.depuis', { date: dateCourte(pays.cree_le, i18n.language) })}
              </Typography>
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 'auto' }}>
                {pays.statut !== 'archive' && (
                  <Button
                    size="small"
                    variant="outlined"
                    endIcon={<ArrowForwardRounded />}
                    onClick={() => {
                      void choisirPays(pays.code);
                      void naviguer('/');
                    }}
                  >
                    {t('paysPage.ouvrir')}
                  </Button>
                )}
                {gerer && pays.statut === 'actif' && (
                  <Button
                    size="small"
                    color="warning"
                    onClick={() => setChangement({ pays, statut: 'suspendu' })}
                  >
                    {t('paysPage.suspendre')}
                  </Button>
                )}
                {gerer && pays.statut === 'suspendu' && (
                  <Button size="small" onClick={() => setChangement({ pays, statut: 'actif' })}>
                    {t('paysPage.activer')}
                  </Button>
                )}
                {gerer && pays.statut !== 'archive' && (
                  <Button
                    size="small"
                    color="error"
                    onClick={() => setChangement({ pays, statut: 'archive' })}
                  >
                    {t('paysPage.archiver')}
                  </Button>
                )}
              </Stack>
            </Card>
          ))}
        </Box>
      )}
      {creation && (
        <DialogueFormulaire
          ouvert
          titre={t('paysPage.nouveau')}
          aide={t('paysPage.codeAide')}
          libelleValider={t('commun.creer')}
          invalide={!/^[A-Z]{2}$/.test(code)}
          surFermer={() => {
            setCreation(false);
            setCode('');
          }}
          surValider={async () => {
            await client.pays.creer(code);
            await rafraichir();
          }}
        >
          <TextField
            label={t('paysPage.code')}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 2))}
            autoFocus
          />
        </DialogueFormulaire>
      )}
      {changement && (
        <DialogueFormulaire
          ouvert
          titre={`${t(`paysPage.${changement.statut === 'actif' ? 'activer' : changement.statut === 'suspendu' ? 'suspendre' : 'archiver'}`)} · ${changement.pays.nom}`}
          aide={
            changement.statut === 'suspendu'
              ? t('paysPage.confirmerSuspension', { pays: changement.pays.nom })
              : changement.statut === 'archive'
                ? t('paysPage.confirmerArchivage', { pays: changement.pays.nom })
                : undefined
          }
          libelleValider={t('commun.confirmer')}
          surFermer={() => setChangement(null)}
          surValider={async () => {
            await client.pays.changerStatut(changement.pays.code, changement.statut);
            await rafraichir();
          }}
        />
      )}
    </Stack>
  );
}
