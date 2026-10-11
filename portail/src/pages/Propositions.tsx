import type { Perimetre, Proposition } from '@innov/api-client';
import {
  Alert,
  Box,
  Button,
  Card,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import { EnTetePage, EtatVide } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { depuis } from '../composants/formats';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

type Filtre = 'en_attente' | 'acceptee' | 'refusee';

function libelleFiche(p: Proposition, t: (c: string) => string) {
  if (p.prospect) {
    const f = p.prospect;
    return [f.civilite ? t(`prospect.civilites.${f.civilite}`) : '', f.prenom, f.nom]
      .filter(Boolean)
      .join(' ');
  }
  return p.etablissement?.nom ?? '—';
}

function LigneProposition({ p, decider }: { p: Proposition; decider: (p: Proposition) => void }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const [envoi, setEnvoi] = useState(false);
  const champs = Object.entries(p.changements);

  async function accepter() {
    setEnvoi(true);
    try {
      await client.propositions.trancher(p.id, 'accepter');
      notifier(t('propositions.acceptee'));
      void requetes.invalidateQueries({ queryKey: ['propositions'] });
      void requetes.invalidateQueries({ queryKey: ['prospects'] });
      void requetes.invalidateQueries({ queryKey: ['etablissements'] });
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Box component="article" sx={{ px: 2, py: 1.5 }}>
      {/* Le filtre affiche déjà le statut : pas d'étiquette répétée sur chaque ligne. */}
      <Typography sx={{ fontWeight: 600 }}>{libelleFiche(p, t)}</Typography>
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
        {t('propositions.par', {
          personne: `${p.auteur.prenom} ${p.auteur.nom}`,
          quand: depuis(p.cree_le, i18n.language),
        })}
      </Typography>
      <Box
        component="dl"
        sx={{
          m: 0,
          mt: 1,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' },
          columnGap: 2,
          rowGap: 0.25,
        }}
      >
        {champs.map(([champ, valeur]) => (
          <Box key={champ} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" sx={{ color: 'text.secondary' }}>
              {t(`propositions.champs.${champ}`)}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
              {p.actuels[champ] && (
                <>
                  <Box
                    component="span"
                    sx={{ color: 'text.secondary', textDecoration: 'line-through' }}
                  >
                    {p.actuels[champ]}
                  </Box>
                  {' → '}
                </>
              )}
              <Box component="span" sx={{ fontWeight: 600 }}>
                {valeur || '—'}
              </Box>
            </Typography>
          </Box>
        ))}
        {p.nouvel_exercice && (
          <Box sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" sx={{ color: 'text.secondary' }}>
              {t('propositions.nouvelExercice')}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 600 }}>
              {p.nouvel_exercice.nom}
            </Typography>
          </Box>
        )}
      </Box>
      {p.commentaire && (
        <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
          « {p.commentaire} »
        </Typography>
      )}
      {p.statut !== 'en_attente' && (
        <Typography variant="caption" component="p" sx={{ mt: 0.5, color: 'text.secondary' }}>
          {t('propositions.decidee', {
            personne: p.decide_par ? `${p.decide_par.prenom} ${p.decide_par.nom}` : '—',
            quand: p.decide_le ? depuis(p.decide_le, i18n.language) : '',
          })}
          {p.motif && ` · ${p.motif}`}
        </Typography>
      )}
      {p.decidable && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
          <Button variant="contained" size="small" disabled={envoi} onClick={() => void accepter()}>
            {t('propositions.accepter')}
          </Button>
          <Button size="small" color="error" disabled={envoi} onClick={() => decider(p)}>
            {t('propositions.refuser')}
          </Button>
        </Stack>
      )}
    </Box>
  );
}

/** Propositions de modification des fiches communes (PRP-014). */
export default function Propositions({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [filtre, setFiltre] = useState<Filtre>('en_attente');
  const [refus, setRefus] = useState<Proposition | null>(null);
  const [motif, setMotif] = useState('');
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const liste = useQuery({
    queryKey: ['propositions', cle, filtre],
    queryFn: () => client.propositions.liste(filtre),
    enabled: perimetre.pays_actif !== null,
  });
  const auteur = perimetre.actions.includes('propositions.creer');

  // CA2 : ouvrir la page vaut lecture des décisions pour le délégué.
  useEffect(() => {
    if (!auteur || !perimetre.pays_actif) return;
    void client.propositions
      .marquerVues()
      .then(() => requetes.invalidateQueries({ queryKey: ['propositions', cle, 'non-vues'] }))
      .catch(() => undefined);
  }, [auteur, client, cle, perimetre.pays_actif, requetes]);

  return (
    <Stack spacing={2}>
      <EnTetePage titre={t('propositions.titre')} sousTitre={perimetre.pays_actif?.nom} />
      {!perimetre.pays_actif ? (
        <Alert severity="info">{t('doublons.choisirPays')}</Alert>
      ) : (
        <>
          <Box sx={{ overflowX: 'auto' }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={filtre}
              onChange={(_, v: Filtre | null) => v && setFiltre(v)}
              aria-label={t('prospect.champs.statut')}
            >
              {(['en_attente', 'acceptee', 'refusee'] as const).map((f) => (
                <ToggleButton key={f} value={f}>
                  {t(`propositions.filtres.${f}`)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
          {liste.isError ? (
            <ErreurChargement erreur={liste.error} reessayer={() => void liste.refetch()} />
          ) : !liste.data ? (
            <Skeleton variant="rounded" height={200} />
          ) : liste.data.length === 0 ? (
            <Card>
              <EtatVide
                titre={t(`propositions.vides.${filtre}`)}
                texte={auteur ? t('propositions.videAuteur') : undefined}
              />
            </Card>
          ) : (
            <Card>
              {liste.data.map((p, i) => (
                <Box key={p.id} sx={{ borderTop: i ? 1 : 0, borderColor: 'divider' }}>
                  <LigneProposition p={p} decider={setRefus} />
                </Box>
              ))}
            </Card>
          )}
        </>
      )}
      {refus && (
        <DialogueFormulaire
          ouvert
          titre={t('propositions.refuserTitre')}
          libelleValider={t('propositions.refuser')}
          surFermer={() => {
            setRefus(null);
            setMotif('');
          }}
          surValider={async () => {
            await client.propositions.trancher(refus.id, 'refuser', motif);
            void requetes.invalidateQueries({ queryKey: ['propositions'] });
          }}
        >
          <TextField
            label={t('propositions.motif')}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            autoFocus
          />
        </DialogueFormulaire>
      )}
    </Stack>
  );
}
