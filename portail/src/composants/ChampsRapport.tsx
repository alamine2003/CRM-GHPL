import type { ChampRapport, TypeChamp } from '@innov/api-client';
import {
  Box,
  Button,
  Card,
  FormControlLabel,
  MenuItem,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';
import DialogueFormulaire from './Dialogue';
import { EnTeteCarte, Etiquette } from './Elements';
import { ErreurChargement } from './Erreurs';

const TYPES: TypeChamp[] = ['texte', 'nombre', 'liste', 'case'];

type Saisie = { libelle: string; type: TypeChamp; options: string; obligatoire: boolean };

const optionsDe = (texte: string) =>
  texte
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean);

/**
 * Champs supplémentaires du rapport de visite, propres au pays (RPT-008). Ils s'ajoutent au
 * socle commun ; un rapport garde les champs de sa création, si bien qu'une modification ne
 * touche que les rapports suivants (CA1). Lus avec les paramètres, gérés par qui les modifie.
 */
export default function ChampsRapport({ pays, modifier }: { pays: string; modifier: boolean }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const [edition, setEdition] = useState<{ champ: ChampRapport | null; saisie: Saisie } | null>(
    null,
  );
  const liste = useQuery({
    queryKey: ['champs-rapport', pays],
    queryFn: () => client.rapports.champs(),
  });
  const rafraichir = () => void requetes.invalidateQueries({ queryKey: ['champs-rapport', pays] });

  async function archiver(champ: ChampRapport) {
    try {
      await client.rapports.archiverChamp(champ.id);
      notifier(t('champsRapport.archive', { libelle: champ.libelle }));
      rafraichir();
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
  }

  const saisie = edition?.saisie;
  const invalide =
    !saisie?.libelle.trim() || (saisie.type === 'liste' && optionsDe(saisie.options).length < 2);

  return (
    <Card>
      <EnTeteCarte
        titre={t('champsRapport.titre')}
        action={
          modifier && (
            <Button
              size="small"
              onClick={() =>
                setEdition({
                  champ: null,
                  saisie: { libelle: '', type: 'texte', options: '', obligatoire: false },
                })
              }
            >
              {t('champsRapport.ajouter')}
            </Button>
          )
        }
      />
      <Typography variant="body2" sx={{ color: 'text.secondary', px: 2, pt: 1.5 }}>
        {t('champsRapport.aide')}
      </Typography>
      {liste.isError ? (
        <Box sx={{ p: 2 }}>
          <ErreurChargement erreur={liste.error} reessayer={() => void liste.refetch()} />
        </Box>
      ) : !liste.data ? (
        <Skeleton variant="rounded" height={120} sx={{ m: 2 }} />
      ) : liste.data.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', px: 2, py: 2 }}>
          {t('champsRapport.vide')}
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mt: 1 }}>
          {liste.data.map((champ) => {
            const options = Array.isArray(champ.options) ? (champ.options as string[]) : [];
            return (
              <Stack
                component="li"
                key={champ.id}
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
                }}
              >
                <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {champ.libelle}
                    </Typography>
                    {champ.obligatoire && (
                      <Etiquette ton="secondary">{t('champsRapport.obligatoire')}</Etiquette>
                    )}
                  </Stack>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {[t(`champsRapport.types.${champ.type}`), options.join(' · ')]
                      .filter(Boolean)
                      .join(' — ')}
                  </Typography>
                </Box>
                {modifier && (
                  <Stack direction="row" spacing={0.5} sx={{ flex: 'none', ml: 'auto' }}>
                    <Button
                      size="small"
                      onClick={() =>
                        setEdition({
                          champ,
                          saisie: {
                            libelle: champ.libelle,
                            type: champ.type,
                            options: options.join('\n'),
                            obligatoire: champ.obligatoire,
                          },
                        })
                      }
                    >
                      {t('parametres.modifier')}
                    </Button>
                    <Button size="small" color="error" onClick={() => void archiver(champ)}>
                      {t('champsRapport.retirer')}
                    </Button>
                  </Stack>
                )}
              </Stack>
            );
          })}
        </Box>
      )}
      {edition && saisie && (
        <DialogueFormulaire
          ouvert
          titre={t(edition.champ ? 'champsRapport.modifierTitre' : 'champsRapport.ajouterTitre')}
          aide={t('champsRapport.aideDialogue')}
          libelleValider={t('commun.enregistrer')}
          invalide={invalide}
          surFermer={() => setEdition(null)}
          surValider={async () => {
            const options = saisie.type === 'liste' ? optionsDe(saisie.options) : [];
            if (edition.champ)
              await client.rapports.modifierChamp(edition.champ.id, {
                libelle: saisie.libelle.trim(),
                obligatoire: saisie.obligatoire,
                ...(saisie.type === 'liste' ? { options } : {}),
              });
            else
              await client.rapports.creerChamp({
                libelle: saisie.libelle.trim(),
                type: saisie.type,
                options,
                obligatoire: saisie.obligatoire,
              });
            rafraichir();
          }}
        >
          <TextField
            label={t('champsRapport.libelle')}
            value={saisie.libelle}
            onChange={(e) =>
              setEdition({ ...edition, saisie: { ...saisie, libelle: e.target.value } })
            }
            slotProps={{ htmlInput: { maxLength: 120 } }}
            autoFocus
          />
          <TextField
            select
            label={t('champsRapport.type')}
            value={saisie.type}
            disabled={!!edition.champ}
            helperText={edition.champ ? t('champsRapport.typeFige') : undefined}
            onChange={(e) =>
              setEdition({ ...edition, saisie: { ...saisie, type: e.target.value as TypeChamp } })
            }
          >
            {TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {t(`champsRapport.types.${type}`)}
              </MenuItem>
            ))}
          </TextField>
          {saisie.type === 'liste' && (
            <TextField
              multiline
              minRows={3}
              label={t('champsRapport.options')}
              helperText={t('champsRapport.optionsAide')}
              value={saisie.options}
              onChange={(e) =>
                setEdition({ ...edition, saisie: { ...saisie, options: e.target.value } })
              }
            />
          )}
          <FormControlLabel
            control={
              <Switch
                checked={saisie.obligatoire}
                onChange={(e) =>
                  setEdition({ ...edition, saisie: { ...saisie, obligatoire: e.target.checked } })
                }
              />
            }
            label={t('champsRapport.obligatoireAvant')}
          />
        </DialogueFormulaire>
      )}
    </Card>
  );
}
