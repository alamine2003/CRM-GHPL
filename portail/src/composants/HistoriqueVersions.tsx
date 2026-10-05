import type { DetailVersion, VersionPlanning, VisiteFigee } from '@innov/api-client';
import AddCircleOutlineRounded from '@mui/icons-material/AddCircleOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import {
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';
import { EnTeteCarte } from './Elements';

type Traduire = ReturnType<typeof useTranslation>['t'];

const COULEURS = { approuve: 'success', a_reviser: 'warning' } as const;

/** « 1 ajoutée · 1 retirée · 1 déplacée » ; rien si la version est la première. */
function resume(changements: VersionPlanning['changements'], t: Traduire) {
  if (!changements) return t('versions.premiere');
  const parties = (['ajoutees', 'retirees', 'deplacees', 'modifiees'] as const)
    .filter((c) => changements[c] > 0)
    .map((c) => t(`versions.compte.${c}`, { count: changements[c] }));
  return parties.length ? parties.join(' · ') : t('versions.aucunChangement');
}

/**
 * Historique des versions figées d'un planning (PLN-014, RG-037) : chacune avec sa soumission,
 * sa décision et ce qui a changé depuis la précédente ; « Voir » ouvre son contenu et la
 * comparaison détaillée (CA1, CA2). Rien tant qu'il n'y a qu'une version.
 */
export function HistoriqueVersions({ planning, fuseau }: { planning: string; fuseau: string }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [ouverte, setOuverte] = useState<number | null>(null);
  const versions = useQuery({
    queryKey: ['planning-versions', planning],
    queryFn: () => client.plannings.versions(planning),
  });
  if (!versions.data || versions.data.length < 2) return null;
  const quand = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: fuseau,
    }).format(new Date(iso));

  return (
    <Card>
      <EnTeteCarte titre={t('versions.titre', { count: versions.data.length })} />
      <Stack component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {versions.data.map((v) => (
          <Stack
            component="li"
            key={v.numero}
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{
              px: 2,
              py: 1.25,
              borderTop: 1,
              borderColor: 'divider',
              alignItems: { sm: 'center' },
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {t('versions.ligne', { numero: v.numero })}
                </Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  color={v.decision ? COULEURS[v.decision] : 'default'}
                  label={t(`versions.decisions.${v.decision ?? 'aucune'}`)}
                />
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('versions.soumise', { date: quand(v.soumis_le) })} · {resume(v.changements, t)}
              </Typography>
            </Box>
            <Button
              size="small"
              onClick={() => setOuverte(v.numero)}
              sx={{
                flex: 'none',
                alignSelf: { xs: 'flex-start', sm: 'center' },
                ml: { xs: -0.625, sm: 0 },
              }}
            >
              {t('versions.voir', { numero: v.numero })}
            </Button>
          </Stack>
        ))}
      </Stack>
      {ouverte !== null && (
        <DetailDeVersion
          planning={planning}
          version={versions.data.find((v) => v.numero === ouverte)!}
          quand={quand}
          surFermer={() => setOuverte(null)}
        />
      )}
    </Card>
  );
}

function DetailDeVersion({
  planning,
  version,
  quand,
  surFermer,
}: {
  planning: string;
  version: VersionPlanning;
  quand: (iso: string) => string;
  surFermer: () => void;
}) {
  const numero = version.numero;
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const detail = useQuery({
    queryKey: ['planning-version', planning, numero],
    queryFn: () => client.plannings.version(planning, numero),
  });
  const jour = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric' }).format(
      new Date(`${iso}T12:00:00`),
    );
  // Insécables : « ven. 9 09:30 » ne se coupe jamais.
  const moment = (date: string, heure: string | null) =>
    `${jour(date)}${heure ? ` ${heure}` : ''}`.replace(/ /g, '\u00a0');
  const qui = (v: VisiteFigee) => v.prospect?.nom ?? t('visites.sansProspect');

  return (
    <Dialog open onClose={surFermer} fullWidth maxWidth="sm">
      <DialogTitle>{t('versions.ligne', { numero })}</DialogTitle>
      <DialogContent>
        <Decision version={version} quand={quand} />
        {!detail.data ? (
          <Skeleton variant="rounded" height={200} />
        ) : (
          <Stack spacing={2.5}>
            <Comparaison detail={detail.data} moment={moment} qui={qui} />
            <Box>
              <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
                {t('versions.contenu', { count: detail.data.contenu_visites.length })}
              </Typography>
              <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2.5 }}>
                {detail.data.contenu_visites.map((v) => (
                  <Typography component="li" variant="body2" key={v.id}>
                    <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {moment(v.date, v.heure)}
                    </Box>{' '}
                    · {qui(v)}
                    {v.etablissement?.nom ? ` · ${v.etablissement.nom}` : ''}
                  </Typography>
                ))}
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={surFermer}>{t('commun.fermer')}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** PLN-014 CA1 : ajoutées, retirées, déplacées (avant → après), modifiées. */
function Comparaison({
  detail,
  moment,
  qui,
}: {
  detail: DetailVersion;
  moment: (date: string, heure: string | null) => string;
  qui: (v: VisiteFigee) => string;
}) {
  const { t } = useTranslation();
  const c = detail.comparaison;
  // La première version n'a rien à comparer : la ligne de l'historique le dit déjà.
  if (!c) return null;
  const vide =
    !c.ajoutees.length && !c.retirees.length && !c.deplacees.length && !c.modifiees.length;
  return (
    <Box>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
        {t('versions.depuis', { numero: detail.numero - 1 })}
      </Typography>
      {vide ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('versions.aucunChangement')}
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          <Section
            icone={<AddCircleOutlineRounded fontSize="small" color="success" />}
            titre={t('versions.sections.ajoutees', { count: c.ajoutees.length })}
            lignes={c.ajoutees.map((v) => ({
              cle: v.id,
              texte: `${moment(v.date, v.heure)} · ${qui(v)}`,
            }))}
          />
          <Section
            icone={<RemoveCircleOutlineRounded fontSize="small" color="error" />}
            titre={t('versions.sections.retirees', { count: c.retirees.length })}
            lignes={c.retirees.map((v) => ({
              cle: v.id,
              texte: `${moment(v.date, v.heure)} · ${qui(v)}`,
            }))}
          />
          <Section
            icone={<SwapHorizRounded fontSize="small" color="primary" />}
            titre={t('versions.sections.deplacees', { count: c.deplacees.length })}
            lignes={c.deplacees.map((d) => ({
              cle: d.visite.id,
              texte: `${qui(d.visite)} : ${moment(d.avant.date, d.avant.heure)} → ${moment(
                d.visite.date,
                d.visite.heure,
              )}`,
            }))}
          />
          <Section
            icone={<EditOutlined fontSize="small" color="action" />}
            titre={t('versions.sections.modifiees', { count: c.modifiees.length })}
            lignes={c.modifiees.map((m) => ({
              cle: m.visite.id,
              texte: `${moment(m.visite.date, m.visite.heure)} · ${qui(m.visite)} : ${m.champs
                .map((x) => t(`versions.champs.${x}`))
                .join(', ')}`,
            }))}
          />
        </Stack>
      )}
    </Box>
  );
}

function Section({
  icone,
  titre,
  lignes,
}: {
  icone: ReactNode;
  titre: string;
  lignes: { cle: string; texte: string }[];
}) {
  if (lignes.length === 0) return null;
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        {icone}
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {titre}
        </Typography>
      </Stack>
      <Stack component="ul" spacing={0.25} sx={{ m: 0, mt: 0.5, pl: 4.5 }}>
        {lignes.map((l) => (
          <Typography component="li" variant="body2" key={l.cle}>
            {l.texte}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

/** PLN-014 CA2 : la soumission et la décision de la version, avec le commentaire du décideur. */
function Decision({
  version,
  quand,
}: {
  version: VersionPlanning;
  quand: (iso: string) => string;
}) {
  const { t } = useTranslation();
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('versions.soumise', { date: quand(version.soumis_le) })}
      </Typography>
      {version.decision && version.decide_le && (
        <>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t(`versions.decidee.${version.decision}`, {
              date: quand(version.decide_le),
              par: version.par ?? '',
            })}
            {version.mode === 'remplacement' ? ` · ${t('versions.enRemplacement')}` : ''}
          </Typography>
          {version.commentaire && (
            <Typography
              variant="body2"
              sx={{
                mt: 1,
                pl: 1.5,
                borderLeft: 3,
                borderColor: `${COULEURS[version.decision]}.main`,
              }}
            >
              {version.commentaire}
            </Typography>
          )}
          {version.remarques.length > 0 && (
            <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
              {t('versions.remarques', { count: version.remarques.length })}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
