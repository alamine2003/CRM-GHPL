import type { JourFerie } from '@innov/api-client';
import {
  Box,
  Button,
  Card,
  FormControlLabel,
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
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';
import DialogueFormulaire from './Dialogue';
import { EnTeteCarte } from './Elements';
import { ErreurChargement } from './Erreurs';

type Saisie = { date: string; libelle: string; variable: boolean };

function jourLong(iso: string, langue: string) {
  return new Intl.DateTimeFormat(langue, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${iso}T12:00:00`));
}

/** Date proposée à l'ajout : demain dans l'année en cours (une date passée est refusée,
 * ORG-012 CA2), sinon le 1er janvier de l'année choisie. */
function premiereDateLibre(annee: number) {
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  if (demain.getFullYear() !== annee) return `${annee}-01-01`;
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${annee}-${deux(demain.getMonth() + 1)}-${deux(demain.getDate())}`;
}

/**
 * Calendrier des jours fériés du pays (ORG-012), tenu par l'administrateur pays. Un jour
 * férié n'est pas planifiable et sort des contrôles de la semaine (CA1) ; sa date se modifie
 * jusqu'à la veille (CA2), ce qui sert aux fêtes à date variable.
 */
export default function JoursFeries({ pays }: { pays: string }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const cetteAnnee = new Date().getFullYear();
  const [annee, setAnnee] = useState(cetteAnnee);
  const [edition, setEdition] = useState<{ jour: JourFerie | null; saisie: Saisie } | null>(null);
  const liste = useQuery({
    queryKey: ['jours-feries', pays, annee],
    queryFn: () => client.joursFeries.liste(annee),
  });
  const rafraichir = () => void requetes.invalidateQueries({ queryKey: ['jours-feries', pays] });

  async function retirer(jour: JourFerie) {
    try {
      await client.joursFeries.retirer(jour.id);
      notifier(t('joursFeries.retire', { libelle: jour.libelle }));
      rafraichir();
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
  }

  return (
    <Card>
      <EnTeteCarte
        titre={t('joursFeries.titre')}
        action={
          <Button
            size="small"
            onClick={() =>
              setEdition({
                jour: null,
                saisie: { date: premiereDateLibre(annee), libelle: '', variable: false },
              })
            }
          >
            {t('joursFeries.ajouter')}
          </Button>
        }
      />
      <Box sx={{ px: 2, pt: 1.5 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={annee}
          onChange={(_, v: number | null) => v && setAnnee(v)}
          aria-label={t('joursFeries.annee')}
        >
          {[cetteAnnee, cetteAnnee + 1].map((a) => (
            <ToggleButton key={a} value={a}>
              {a}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      {liste.isError ? (
        <Box sx={{ p: 2 }}>
          <ErreurChargement erreur={liste.error} reessayer={() => void liste.refetch()} />
        </Box>
      ) : !liste.data ? (
        <Skeleton variant="rounded" height={160} sx={{ m: 2 }} />
      ) : liste.data.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', px: 2, py: 2 }}>
          {t('joursFeries.vide', { annee })}
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mt: 1 }}>
          {liste.data.map((jour) => (
            <Stack
              component="li"
              key={jour.id}
              direction="row"
              spacing={2}
              sx={{
                px: 2,
                py: 1,
                alignItems: 'center',
                flexWrap: 'wrap',
                rowGap: 0.5,
                borderTop: 1,
                borderColor: 'divider',
                color: jour.modifiable ? 'text.primary' : 'text.secondary',
              }}
            >
              <Typography variant="body2" sx={{ width: 112, flex: 'none' }}>
                {jourLong(jour.date, i18n.language)}
              </Typography>
              <Box sx={{ flex: '1 1 140px', minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                  {jour.libelle}
                </Typography>
                {jour.variable && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {t('joursFeries.variable')}
                  </Typography>
                )}
              </Box>
              {jour.modifiable && (
                <Stack direction="row" spacing={0.5} sx={{ flex: 'none', ml: 'auto' }}>
                  <Button
                    size="small"
                    onClick={() =>
                      setEdition({
                        jour,
                        saisie: {
                          date: jour.date,
                          libelle: jour.libelle,
                          variable: !!jour.variable,
                        },
                      })
                    }
                  >
                    {t('parametres.modifier')}
                  </Button>
                  <Button size="small" color="error" onClick={() => void retirer(jour)}>
                    {t('joursFeries.retirer')}
                  </Button>
                </Stack>
              )}
            </Stack>
          ))}
        </Box>
      )}
      {edition && (
        <DialogueFormulaire
          ouvert
          titre={edition.jour ? t('joursFeries.modifierTitre') : t('joursFeries.ajouterTitre')}
          aide={t('joursFeries.aide')}
          libelleValider={t('commun.enregistrer')}
          invalide={!edition.saisie.date || !edition.saisie.libelle.trim()}
          surFermer={() => setEdition(null)}
          surValider={async () => {
            if (edition.jour) await client.joursFeries.modifier(edition.jour.id, edition.saisie);
            else await client.joursFeries.creer(edition.saisie);
            setAnnee(Number(edition.saisie.date.slice(0, 4)) || annee);
            rafraichir();
          }}
        >
          <TextField
            type="date"
            label={t('joursFeries.date')}
            value={edition.saisie.date}
            onChange={(e) =>
              setEdition({ ...edition, saisie: { ...edition.saisie, date: e.target.value } })
            }
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label={t('joursFeries.libelle')}
            value={edition.saisie.libelle}
            onChange={(e) =>
              setEdition({ ...edition, saisie: { ...edition.saisie, libelle: e.target.value } })
            }
            autoFocus
          />
          <FormControlLabel
            control={
              <Switch
                checked={edition.saisie.variable}
                onChange={(e) =>
                  setEdition({
                    ...edition,
                    saisie: { ...edition.saisie, variable: e.target.checked },
                  })
                }
              />
            }
            label={t('joursFeries.dateVariable')}
          />
        </DialogueFormulaire>
      )}
    </Card>
  );
}
