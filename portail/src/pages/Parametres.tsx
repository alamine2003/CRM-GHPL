import type { Parametre, Perimetre } from '@innov/api-client';
import {
  Alert,
  Box,
  Button,
  Card,
  FormControlLabel,
  MenuItem,
  Skeleton,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import { EnTeteCarte, EnTetePage, Etiquette } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import ChampsRapport from '../composants/ChampsRapport';
import JoursFeries from '../composants/JoursFeries';
import { useSession } from '../contexteSession';

type Valeur = unknown;
type Seuil = { min: number; max: number };
type Seuils = Record<string, Seuil>;
const seuilDe = (s: Seuils, type: string): Seuil => s[type] ?? { min: 0, max: 0 };

const GROUPES: { cle: string; parametres: string[] }[] = [
  {
    cle: 'calendrier',
    parametres: ['format_date', 'jours_ouvres'],
  },
  {
    cle: 'planning',
    parametres: ['echeance_soumission_planning', 'delai_escalade_heures_ouvrees'],
  },
  {
    cle: 'visites',
    parametres: [
      'seuils_visites_jour',
      'plage_horaire_visites',
      'visites_sans_gps_tolerees',
      'distance_pointage_m',
      'duree_visite_minutes',
      'geolocalisation_active',
      'attente_gps_secondes',
    ],
  },
  { cle: 'rapports', parametres: ['heure_limite_rapport', 'produit_autre_autorise'] },
  { cle: 'telephone', parametres: ['verrouillage_minutes'] },
  { cle: 'conservation', parametres: ['conservation'] },
];
const TYPES_POSTE = ['vm', 'vm_otc', 'kam', 'dermo'];
const JOURS = [1, 2, 3, 4, 5, 6, 7];

/** Valeur lisible d'un paramètre. */
function Apercu({ cle, valeur }: { cle: string; valeur: Valeur }) {
  const { t } = useTranslation();
  const jour = (n: number) => t(`parametres.jours.${n}`);
  const v = valeur as Record<string, unknown>;
  switch (cle) {
    case 'jours_ouvres':
      return (
        <>
          {JOURS.filter((n) => (valeur as number[]).includes(n))
            .map(jour)
            .join(', ')}
        </>
      );
    // Depuis 0.3.9, la soumission se lit dans la semaine du planning (prd.md §14.21).
    case 'echeance_soumission_planning':
      return (
        <>{t('parametres.semaineDuPlanning', { jour: jour(v.jour as number), heure: v.heure })}</>
      );
    case 'verrouillage_minutes':
      return <>{t('parametres.minutesN', { n: valeur })}</>;
    case 'attente_gps_secondes':
      return <>{t('parametres.secondes', { n: valeur })}</>;
    case 'plage_horaire_visites':
      return <>{t('parametres.de', { debut: v.debut, fin: v.fin })}</>;
    case 'duree_visite_minutes':
      return <>{t('parametres.minutes', { min: v.min, max: v.max })}</>;
    case 'geolocalisation_active':
    case 'produit_autre_autorise':
      return <>{valeur ? t('commun.oui') : t('commun.non')}</>;
    case 'seuils_visites_jour':
      return (
        <>
          {TYPES_POSTE.map(
            (type) =>
              `${t(`organisation.typesPoste.${type}`)} ${seuilDe(valeur as Seuils, type).min}–${seuilDe(valeur as Seuils, type).max}`,
          ).join(' · ')}
        </>
      );
    case 'conservation':
      return (
        <Stack spacing={0.25}>
          <span>{t('parametres.activite', { n: v.activite_annees })}</span>
          <span>{t('parametres.gps', { n: v.gps_mois })}</span>
          <span>{t('parametres.pieces', { n: v.pieces_jointes_annees })}</span>
        </Stack>
      );
    default:
      return <>{String(valeur)}</>;
  }
}

/** Champ de saisie adapté au type du paramètre. */
function Editeur({
  cle,
  valeur,
  changer,
}: {
  cle: string;
  valeur: Valeur;
  changer: (v: Valeur) => void;
}) {
  const { t } = useTranslation();
  const v = valeur as Record<string, unknown>;
  const heure = (libelle: string, actuelle: string, surChange: (h: string) => void) => (
    <TextField
      type="time"
      label={libelle}
      value={actuelle}
      onChange={(e) => surChange(e.target.value)}
      slotProps={{ inputLabel: { shrink: true } }}
      fullWidth
    />
  );
  const entier = (libelle: string, actuel: number, surChange: (n: number) => void) => (
    <TextField
      type="number"
      label={libelle}
      value={actuel}
      onChange={(e) => surChange(Number.parseInt(e.target.value || '0', 10))}
      fullWidth
    />
  );
  switch (cle) {
    case 'format_date':
      return (
        <TextField
          select
          label={t('parametres.champs.valeur')}
          value={valeur}
          onChange={(e) => changer(e.target.value)}
        >
          {['JJ/MM/AAAA', 'AAAA-MM-JJ', 'MM/JJ/AAAA'].map((f) => (
            <MenuItem key={f} value={f}>
              {f}
            </MenuItem>
          ))}
        </TextField>
      );
    case 'jours_ouvres':
      return (
        <ToggleButtonGroup
          value={valeur as number[]}
          onChange={(_, jours: number[]) => changer([...jours].sort())}
          sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', px: 1.4 } }}
        >
          {JOURS.map((n) => (
            <ToggleButton key={n} value={n}>
              {t(`parametres.jours.${n}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      );
    case 'echeance_soumission_planning':
      return (
        <Stack direction="row" spacing={1.5}>
          <TextField
            select
            label={t('parametres.champs.jour')}
            value={v.jour}
            onChange={(e) => changer({ ...v, jour: Number(e.target.value) })}
            fullWidth
          >
            {JOURS.map((n) => (
              <MenuItem key={n} value={n}>
                {t(`parametres.jours.${n}`)}
              </MenuItem>
            ))}
          </TextField>
          {heure(t('parametres.champs.heure'), v.heure as string, (h) =>
            changer({ ...v, heure: h }),
          )}
        </Stack>
      );
    case 'heure_limite_rapport':
      return heure(t('parametres.champs.heure'), valeur as string, changer);
    case 'plage_horaire_visites':
      return (
        <Stack direction="row" spacing={1.5}>
          {heure(t('parametres.champs.debut'), v.debut as string, (h) =>
            changer({ ...v, debut: h }),
          )}
          {heure(t('parametres.champs.fin'), v.fin as string, (h) => changer({ ...v, fin: h }))}
        </Stack>
      );
    case 'duree_visite_minutes':
      return (
        <Stack direction="row" spacing={1.5}>
          {entier(t('parametres.min'), v.min as number, (n) => changer({ ...v, min: n }))}
          {entier(t('parametres.max'), v.max as number, (n) => changer({ ...v, max: n }))}
        </Stack>
      );
    case 'geolocalisation_active':
    case 'produit_autre_autorise':
      return (
        <FormControlLabel
          control={<Switch checked={Boolean(valeur)} onChange={(e) => changer(e.target.checked)} />}
          label={t(`parametres.cles.${cle}`)}
        />
      );
    case 'seuils_visites_jour': {
      const seuils = valeur as Seuils;
      return (
        <Stack spacing={1.25}>
          {TYPES_POSTE.map((type) => (
            <Stack key={type} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography sx={{ flex: '0 0 150px' }} variant="body2">
                {t(`organisation.typesPoste.${type}`)}
              </Typography>
              {entier(t('parametres.min'), seuilDe(seuils, type).min, (n) =>
                changer({ ...seuils, [type]: { ...seuilDe(seuils, type), min: n } }),
              )}
              {entier(t('parametres.max'), seuilDe(seuils, type).max, (n) =>
                changer({ ...seuils, [type]: { ...seuilDe(seuils, type), max: n } }),
              )}
            </Stack>
          ))}
        </Stack>
      );
    }
    case 'conservation':
      return (
        <Stack spacing={1.5}>
          {entier(t('parametres.champs.activite'), v.activite_annees as number, (n) =>
            changer({ ...v, activite_annees: n }),
          )}
          {entier(t('parametres.champs.gps'), v.gps_mois as number, (n) =>
            changer({ ...v, gps_mois: n }),
          )}
          {entier(t('parametres.champs.pieces'), v.pieces_jointes_annees as number, (n) =>
            changer({ ...v, pieces_jointes_annees: n }),
          )}
        </Stack>
      );
    default:
      return entier(t('parametres.champs.valeur'), valeur as number, changer);
  }
}

function DialogueParametre({
  pays,
  parametre,
  surFermer,
}: {
  pays: string;
  parametre: Parametre;
  surFermer: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [valeur, setValeur] = useState<Valeur>(parametre.valeur);
  return (
    <DialogueFormulaire
      ouvert
      titre={t(`parametres.cles.${parametre.cle}`)}
      aide={parametre.description}
      surFermer={surFermer}
      surValider={async () => {
        await client.pays.modifierParametre(pays, parametre.cle, valeur);
        await requetes.invalidateQueries({ queryKey: ['parametres'] });
      }}
    >
      <Editeur cle={parametre.cle} valeur={valeur} changer={setValeur} />
    </DialogueFormulaire>
  );
}

export default function Parametres({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const pays = perimetre.pays_actif;
  const parametres = useQuery({
    queryKey: ['parametres', pays?.code],
    queryFn: () => client.pays.parametres(pays!.code),
    enabled: pays !== null,
  });
  const [edition, setEdition] = useState<Parametre | null>(null);
  const modifier = perimetre.actions.includes('parametres.modifier');
  const joursFeries = perimetre.actions.includes('jours_feries.gerer');
  const parCle = new Map((parametres.data ?? []).map((p) => [p.cle, p]));

  return (
    <Stack spacing={2}>
      <EnTetePage titre={t('parametres.titre')} sousTitre={pays?.nom} />
      {!pays ? (
        <Alert severity="info">{t('parametres.choisirPays')}</Alert>
      ) : parametres.isError ? (
        <ErreurChargement erreur={parametres.error} reessayer={() => void parametres.refetch()} />
      ) : parametres.isPending ? (
        <Skeleton variant="rounded" height={240} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
            alignItems: 'start',
          }}
        >
          {GROUPES.flatMap((groupe) => [
            <Card key={groupe.cle}>
              <EnTeteCarte titre={t(`parametres.groupes.${groupe.cle}`)} />
              {groupe.parametres
                .map((cle) => parCle.get(cle))
                .filter((p): p is Parametre => p !== undefined)
                .map((p) => (
                  <Stack
                    key={p.cle}
                    direction="row"
                    spacing={2}
                    sx={{
                      px: 2,
                      py: 1.25,
                      borderBottom: 1,
                      borderColor: 'divider',
                      alignItems: 'center',
                      '&:last-of-type': { borderBottom: 0 },
                    }}
                  >
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        <Typography sx={{ fontWeight: 500 }}>
                          {t(`parametres.cles.${p.cle}`)}
                        </Typography>
                        {p.personnalise && (
                          <Etiquette ton="secondary">{t('parametres.personnalise')}</Etiquette>
                        )}
                        {p.hypothese && (
                          <Etiquette ton="warning">{t('parametres.hypothese')}</Etiquette>
                        )}
                      </Stack>
                      <Box sx={{ color: 'text.secondary', mt: 0.5, typography: 'body2' }}>
                        <Apercu cle={p.cle} valeur={p.valeur} />
                      </Box>
                    </Box>
                    {modifier && (
                      <Button size="small" onClick={() => setEdition(p)}>
                        {t('parametres.modifier')}
                      </Button>
                    )}
                  </Stack>
                ))}
            </Card>,
            // ORG-012 : le calendrier des jours fériés suit les jours ouvrés du pays.
            groupe.cle === 'calendrier' && joursFeries ? (
              <JoursFeries key="jours-feries" pays={pays.code} />
            ) : null,
            // RPT-008 : les champs du rapport propres au pays, à côté de son heure limite.
            groupe.cle === 'rapports' ? (
              <ChampsRapport key="champs-rapport" pays={pays.code} modifier={modifier} />
            ) : null,
          ])}
        </Box>
      )}
      {edition && pays && (
        <DialogueParametre
          pays={pays.code}
          parametre={edition}
          surFermer={() => setEdition(null)}
        />
      )}
    </Stack>
  );
}
