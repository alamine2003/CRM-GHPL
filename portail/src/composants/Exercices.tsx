import type { Etablissement, Exercice, Prospect } from '@innov/api-client';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import StarOutlineRounded from '@mui/icons-material/StarOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  FormControlLabel,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';
import DialogueFormulaire from './Dialogue';
import { Potentiel } from './Elements';
import { aujourdhuiIso, dateCourte } from './formats';

function useRafraichir() {
  const requetes = useQueryClient();
  return () => {
    void requetes.invalidateQueries({ queryKey: ['prospects'] });
    void requetes.invalidateQueries({ queryKey: ['etablissements'] });
    void requetes.invalidateQueries({ queryKey: ['exercices'] });
  };
}

/** Choix d'un établissement par recherche (nom, localité, téléphone). */
function ChoixEtablissement({
  valeur,
  changer,
}: {
  valeur: Etablissement | null;
  changer: (e: Etablissement | null) => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [saisie, setSaisie] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const minuteur = setTimeout(() => setQ(saisie), 250);
    return () => clearTimeout(minuteur);
  }, [saisie]);
  const resultats = useQuery({
    queryKey: ['etablissements', 'choix', q],
    queryFn: () => client.etablissements.liste({ q }),
  });
  return (
    <Autocomplete
      value={valeur}
      onChange={(_, e) => changer(e)}
      onInputChange={(_, texte) => setSaisie(texte)}
      options={(resultats.data?.resultats ?? []).filter((e) => e.statut !== 'archive')}
      filterOptions={(x) => x}
      getOptionLabel={(e) => e.nom}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      loading={resultats.isFetching}
      noOptionsText={t('exercice.aucunEtablissement')}
      renderOption={({ key, ...props }, e) => (
        <Box component="li" key={key} {...props}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {e.nom}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {[e.type_libelle, e.secteur.libelle, e.localite?.libelle].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField {...params} label={t('exercice.etablissement')} required autoFocus />
      )}
    />
  );
}

function DialogueExercice({
  prospect,
  premier,
  surFermer,
}: {
  prospect: Prospect;
  premier: boolean;
  surFermer: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const rafraichir = useRafraichir();
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null);
  const [debut, setDebut] = useState(aujourdhuiIso());
  const [presence, setPresence] = useState('');
  const [principal, setPrincipal] = useState(premier);
  return (
    <DialogueFormulaire
      ouvert
      titre={t('exercice.ajouter')}
      aide={t('exercice.aide')}
      invalide={!etablissement || !debut}
      surFermer={surFermer}
      surValider={async () => {
        await client.exercices.ajouter(prospect.id, {
          etablissement: etablissement!.id,
          debut,
          presence,
          principal,
        });
        rafraichir();
      }}
    >
      <ChoixEtablissement valeur={etablissement} changer={setEtablissement} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          type="date"
          label={t('exercice.depuis')}
          value={debut}
          onChange={(e) => setDebut(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          required
          sx={{ minWidth: 180 }}
        />
        <TextField
          label={t('exercice.presence')}
          value={presence}
          onChange={(e) => setPresence(e.target.value)}
          helperText={t('exercice.presenceAide')}
          fullWidth
        />
      </Stack>
      <FormControlLabel
        control={<Checkbox checked={principal} onChange={(e) => setPrincipal(e.target.checked)} />}
        label={t('exercice.principalChoix')}
      />
    </DialogueFormulaire>
  );
}

function DialogueFin({ exercice, surFermer }: { exercice: Exercice; surFermer: () => void }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const rafraichir = useRafraichir();
  const [fin, setFin] = useState(aujourdhuiIso());
  return (
    <DialogueFormulaire
      ouvert
      titre={t('exercice.terminerTitre', { etablissement: exercice.etablissement.nom })}
      aide={t('exercice.terminerAide')}
      libelleValider={t('exercice.terminer')}
      invalide={!fin}
      surFermer={surFermer}
      surValider={async () => {
        await client.exercices.terminer(exercice.id, fin);
        rafraichir();
      }}
    >
      <TextField
        type="date"
        label={t('exercice.jusquau')}
        value={fin}
        onChange={(e) => setFin(e.target.value)}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: exercice.debut } }}
        required
      />
    </DialogueFormulaire>
  );
}

function LigneExercice({
  exercice,
  gerer,
  surTerminer,
}: {
  exercice: Exercice;
  gerer: boolean;
  surTerminer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const rafraichir = useRafraichir();
  const e = exercice.etablissement;
  async function rendrePrincipal() {
    try {
      await client.exercices.modifier(exercice.id, { principal: true });
      rafraichir();
    } catch (erreur) {
      notifier(messageErreur(erreur, t('erreurs.reseau')), 'error');
    }
  }
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        alignItems: 'center',
        py: 1.25,
        pl: 1.5,
        borderTop: 1,
        borderColor: 'divider',
        boxShadow: (theme) =>
          exercice.principal ? `inset 2px 0 0 ${theme.palette.secondary.main}` : 'none',
        '&:first-of-type': { borderTop: 0 },
      }}
    >
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600 }}>{e.nom}</Typography>
          {exercice.principal && (
            <Typography variant="caption" sx={{ color: 'secondary.main', fontWeight: 600 }}>
              {t('exercice.principal')}
            </Typography>
          )}
          {e.statut === 'a_valider' && (
            <Chip size="small" variant="outlined" label={t('prospect.statuts.a_valider')} />
          )}
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {[e.type_libelle, e.localite ?? e.secteur].filter(Boolean).join(' · ')}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {[
            t('exercice.depuisLe', { date: dateCourte(exercice.debut, i18n.language) }),
            exercice.presence,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      </Box>
      {gerer && (
        <Stack direction="row">
          {!exercice.principal && (
            <Tooltip title={t('exercice.rendrePrincipal')}>
              <IconButton
                size="small"
                aria-label={`${t('exercice.rendrePrincipal')} · ${e.nom}`}
                onClick={() => void rendrePrincipal()}
              >
                <StarOutlineRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={t('exercice.terminer')}>
            <IconButton
              size="small"
              aria-label={`${t('exercice.terminer')} · ${e.nom}`}
              onClick={surTerminer}
            >
              <EventBusyRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Stack>
  );
}

/** Lieux d'exercice d'un prospect (PRP-004) : en cours d'abord, puis l'historique. */
export function LieuxExercice({ prospect }: { prospect: Prospect }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [ajout, setAjout] = useState(false);
  const [fin, setFin] = useState<Exercice | null>(null);
  const [historique, setHistorique] = useState(false);
  const exercices = useQuery({
    queryKey: ['exercices', 'prospect', prospect.id],
    queryFn: () => client.exercices.duProspect(prospect.id),
  });
  const gerer = prospect.modifiable && prospect.statut !== 'archive';
  const enCours = (exercices.data ?? []).filter((e) => e.actif);
  const anciens = (exercices.data ?? []).filter((e) => !e.actif);

  if (exercices.isLoading) return <Skeleton variant="rounded" height={64} />;
  return (
    <Stack spacing={1}>
      {enCours.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('exercice.aucun')}
        </Typography>
      )}
      {enCours.length > 0 && (
        <Box>
          {enCours.map((e) => (
            <LigneExercice key={e.id} exercice={e} gerer={gerer} surTerminer={() => setFin(e)} />
          ))}
        </Box>
      )}
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        {gerer ? (
          <Button size="small" onClick={() => setAjout(true)}>
            {t('exercice.ajouter')}
          </Button>
        ) : (
          <span />
        )}
        {anciens.length > 0 && (
          <Button
            size="small"
            color="inherit"
            endIcon={
              <ExpandMoreRounded
                sx={{ transform: historique ? 'rotate(180deg)' : 'none', transition: '.2s' }}
              />
            }
            onClick={() => setHistorique((h) => !h)}
            aria-expanded={historique}
          >
            {t('exercice.historique', { count: anciens.length })}
          </Button>
        )}
      </Stack>
      <Collapse in={historique} unmountOnExit>
        <Stack spacing={0.5} sx={{ pl: 1 }}>
          {anciens.map((e) => (
            <Typography key={e.id} variant="body2" sx={{ color: 'text.secondary' }}>
              {t('exercice.periode', {
                etablissement: e.etablissement.nom,
                debut: dateCourte(e.debut, i18n.language),
                fin: dateCourte(e.fin, i18n.language),
              })}
            </Typography>
          ))}
        </Stack>
      </Collapse>
      {ajout && (
        <DialogueExercice
          prospect={prospect}
          premier={enCours.length === 0}
          surFermer={() => setAjout(false)}
        />
      )}
      {fin && <DialogueFin exercice={fin} surFermer={() => setFin(null)} />}
    </Stack>
  );
}

/** Prospects qui exercent dans un établissement (PRP-004). */
export function ProspectsExercant({ etablissement }: { etablissement: string }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const exercices = useQuery({
    queryKey: ['exercices', 'etablissement', etablissement],
    queryFn: () => client.exercices.deLEtablissement(etablissement),
  });
  if (exercices.isLoading) return <Skeleton variant="rounded" height={64} />;
  const enCours = (exercices.data ?? []).filter((e) => e.actif);
  if (enCours.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('exercice.aucunProspect')}
      </Typography>
    );
  }
  return (
    <Stack spacing={1}>
      {enCours.map(({ id, prospect: p, principal, presence }) => (
        <Stack
          key={id}
          direction="row"
          spacing={1.25}
          sx={{ alignItems: 'center', py: 0.75, borderBottom: 1, borderColor: 'divider' }}
        >
          <Potentiel valeur={p.potentiel} />
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {[p.civilite ? t(`prospect.civilites.${p.civilite}`) : '', p.prenom, p.nom]
                .filter(Boolean)
                .join(' ')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {[p.specialite_libelle ?? p.type_libelle, presence].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          {principal && (
            <Tooltip title={t('exercice.lieuPrincipal')}>
              <StarRounded
                fontSize="small"
                color="secondary"
                aria-label={t('exercice.lieuPrincipal')}
              />
            </Tooltip>
          )}
        </Stack>
      ))}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {t('exercice.nombreProspects', { count: enCours.length })}
      </Typography>
    </Stack>
  );
}
