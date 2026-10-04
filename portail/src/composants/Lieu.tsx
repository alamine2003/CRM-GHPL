import type { Exercice, SecteurSaisie } from '@innov/api-client';
import {
  ListSubheader,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

/** Secteurs groupés par zone ; `vide` en fait un filtre (« Tous les secteurs »). */
export function SelectSecteur({
  secteurs,
  valeur,
  changer,
  libelle,
  vide,
  taille,
  requis,
}: {
  secteurs: SecteurSaisie[];
  valeur: string;
  changer: (v: string) => void;
  libelle: string;
  vide?: string;
  taille?: 'small';
  requis?: boolean;
}) {
  const zones = [...new Set(secteurs.map((s) => s.zone))];
  return (
    <TextField
      select
      size={taille}
      label={vide ? undefined : libelle}
      value={valeur}
      onChange={(e) => changer(e.target.value)}
      required={requis}
      fullWidth={!vide}
      sx={vide ? { minWidth: 180 } : undefined}
      slotProps={
        vide ? { select: { displayEmpty: true }, htmlInput: { 'aria-label': libelle } } : undefined
      }
    >
      {vide ? <MenuItem value="">{vide}</MenuItem> : !requis && <MenuItem value="">—</MenuItem>}
      {zones.flatMap((zone) => [
        <ListSubheader key={`z-${zone}`}>{zone}</ListSubheader>,
        ...secteurs
          .filter((s) => s.zone === zone)
          .map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.libelle}
            </MenuItem>
          )),
      ])}
    </TextField>
  );
}

/** Secteur puis localité : la localité proposée est celle du secteur choisi (prd.md §14.1). */
export function ChampsLieu({
  secteurs,
  secteur,
  localite,
  changer,
  requis,
}: {
  secteurs: SecteurSaisie[];
  secteur: string | null;
  localite: string | null;
  changer: (secteur: string | null, localite: string | null) => void;
  requis?: boolean;
}) {
  const { t } = useTranslation();
  const localites = secteurs.find((s) => s.id === secteur)?.localites ?? [];
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
      <SelectSecteur
        secteurs={secteurs}
        valeur={secteur ?? ''}
        changer={(v) => changer(v || null, null)}
        libelle={t('etablissement.champs.secteur')}
        requis={requis}
      />
      <TextField
        select
        label={t('etablissement.champs.localite')}
        value={localite ?? ''}
        onChange={(e) => changer(secteur, e.target.value || null)}
        disabled={localites.length === 0}
        helperText={secteur && localites.length === 0 ? t('lieu.aucuneLocalite') : undefined}
        fullWidth
      >
        <MenuItem value="">—</MenuItem>
        {localites.map((l) => (
          <MenuItem key={l.id} value={l.id}>
            {l.libelle}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}

const EXERCICES: Exercice[] = ['hospitalier', 'prive'];

/** Exercice hospitalier ou privé (H/P), tel que le terrain le distingue. */
export function ChoixExercice({
  valeur,
  changer,
}: {
  valeur: Exercice | '';
  changer: (v: Exercice | '') => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack spacing={0.75}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {t('lieu.exercice')}
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={valeur}
        onChange={(_, v: Exercice | null) => changer(v ?? '')}
        aria-label={t('lieu.exercice')}
      >
        {EXERCICES.map((e) => (
          <ToggleButton key={e} value={e} sx={{ px: 2 }}>
            {t(`lieu.exercices.${e}`)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}
