import type { IndicateursPeriode, LigneEquipe, TableauEquipe } from '@innov/api-client';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import {
  Box,
  Button,
  Card,
  IconButton,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { BarreChiffres, Chiffre, EnTetePage, Etiquette, EtatVide } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useSession } from '../contexteSession';

/**
 * « Pilotage » du superviseur (DSH-002, DSH-012 ; 0.7.2) : les taux de la semaine de chaque
 * délégué de son équipe, côte à côte, par ordre alphabétique, et le total de l'équipe tiré des
 * sommes. Ni note, ni appréciation, ni classement (DC-49) ; chaque taux dit ce qu'il compte.
 */
export default function Pilotage() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [parametres, setParametres] = useSearchParams();
  const semaine = parametres.get('semaine') ?? '';
  const tableau = useQuery({
    queryKey: ['pilotage-equipe', semaine],
    queryFn: () => client.pilotage.equipe(semaine || undefined),
  });
  const titre = t('navigation.pilotage');
  if (tableau.isError) {
    return (
      <Stack spacing={2.5}>
        <EnTetePage titre={titre} />
        <ErreurChargement erreur={tableau.error} reessayer={() => void tableau.refetch()} />
      </Stack>
    );
  }
  if (!tableau.data) {
    return (
      <Stack spacing={2.5}>
        <EnTetePage titre={titre} />
        <Skeleton variant="rounded" height={72} />
        <Skeleton variant="rounded" height={260} />
      </Stack>
    );
  }
  const d = tableau.data;
  const jour = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' });
  const date = (iso: string) => jour.format(new Date(`${iso}T12:00:00`));
  const aller = (lundi: string) =>
    setParametres(
      (p) => {
        const suite = new URLSearchParams(p);
        if (lundi) suite.set('semaine', lundi);
        else suite.delete('semaine');
        return suite;
      },
      { replace: true },
    );
  const decaler = (iso: string, jours: number) => {
    const x = new Date(`${iso}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + jours);
    return x.toISOString().slice(0, 10);
  };
  const suivante = decaler(d.debut, 7);
  const enCours = d.fin >= d.aujourdhui;
  const total = d.total.semaine;
  const pourcent = new Intl.NumberFormat(i18n.language, { style: 'percent' });
  const taux = (v: number | null) => (v === null ? '—' : pourcent.format(v));

  return (
    <Stack spacing={2.5}>
      <EnTetePage
        titre={titre}
        sousTitre={t('pilotage.semaine', { debut: date(d.debut), fin: date(d.fin) })}
        actions={
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Tooltip title={t('pilotage.precedente')}>
              <IconButton
                aria-label={t('pilotage.precedente')}
                onClick={() => aller(decaler(d.debut, -7))}
              >
                <ChevronLeftRounded />
              </IconButton>
            </Tooltip>
            {!enCours && (
              <Button variant="text" onClick={() => aller('')}>
                {t('pilotage.cetteSemaine')}
              </Button>
            )}
            <Tooltip title={t('pilotage.suivante')}>
              <span>
                <IconButton
                  aria-label={t('pilotage.suivante')}
                  disabled={enCours}
                  // La semaine en cours se lit sans paramètre : l'adresse reste « /pilotage ».
                  onClick={() => aller(decaler(suivante, 7) > d.aujourdhui ? '' : suivante)}
                >
                  <ChevronRightRounded />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        }
      />
      {/* Sur téléphone, l'en-tête masque son sous-titre : la semaine se redit ici. */}
      <Typography
        variant="body2"
        sx={{ color: 'text.secondary', display: { xs: 'block', sm: 'none' }, mt: -1.5 }}
      >
        {t('pilotage.semaine', { debut: date(d.debut), fin: date(d.fin) })}
      </Typography>
      {d.delegues.length === 0 ? (
        <Card>
          <EtatVide titre={t('pilotage.sansEquipe')} texte={t('pilotage.sansEquipeDetail')} />
        </Card>
      ) : (
        <>
          <BarreChiffres>
            <Chiffre
              libelle={t('pilotage.visitesFaites')}
              valeur={total.visites.effectuees}
              detail={
                total.visites.imprevues
                  ? t('pilotage.dontImprevues', { count: total.visites.imprevues })
                  : undefined
              }
            />
            <Chiffre
              libelle={t('pilotage.colonnes.realisation')}
              valeur={taux(total.taux.realisation)}
              detail={sur(t, total.visites.effectuees_prevues, total.visites.echues)}
            />
            <Chiffre
              libelle={t('pilotage.colonnes.ecarts')}
              valeur={taux(total.taux.ecarts_justifies)}
              detail={sur(t, total.visites.ecarts_justifies, total.visites.ecarts)}
            />
            <Chiffre
              libelle={t('pilotage.colonnes.rapports')}
              valeur={taux(total.taux.rapports_dans_delai)}
              detail={sur(
                t,
                total.rapports.dans_delai,
                total.rapports.soumis + total.rapports.en_retard,
              )}
            />
            <Chiffre
              libelle={t('pilotage.couvertureCycle')}
              valeur={taux(d.total.cycle.taux.couverture)}
              detail={sur(t, d.total.cycle.couverture.visitees, d.total.cycle.couverture.cibles)}
            />
          </BarreChiffres>
          <TableauDelegues tableau={d} taux={taux} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('pilotage.note', {
              count: d.cycle.semaines,
              debut: date(d.cycle.debut),
              fin: date(d.cycle.fin),
            })}
          </Typography>
        </>
      )}
    </Stack>
  );
}

function TableauDelegues({
  tableau,
  taux,
}: {
  tableau: TableauEquipe;
  taux: (v: number | null) => string;
}) {
  const { t } = useTranslation();
  const colonnes = [
    'visites',
    'realisation',
    'ecarts',
    'geolocalisation',
    'rapports',
    'couverture',
    'aSuivre',
  ] as const;
  return (
    <Card>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label={t('pilotage.tableau')}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...celluleNom, verticalAlign: 'bottom' }}>
                {t('pilotage.colonnes.delegue')}
              </TableCell>
              {colonnes.map((c) => (
                <TableCell
                  key={c}
                  align={c === 'aSuivre' ? 'left' : 'right'}
                  sx={{ lineHeight: 1.35, verticalAlign: 'bottom' }}
                >
                  {t(`pilotage.colonnes.${c}`)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {tableau.delegues.map((ligne) => (
              <Ligne key={ligne.delegue.id} ligne={ligne} taux={taux} />
            ))}
            <Ligne
              total
              ligne={{
                delegue: { id: 'equipe', prenom: t('pilotage.equipe'), nom: '' },
                poste: {
                  id: 'equipe',
                  libelle: t('pilotage.delegues', { count: tableau.delegues.length }),
                },
                semaine: tableau.total.semaine,
                cycle: tableau.total.cycle,
              }}
              taux={taux}
            />
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

const celluleNom = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  bgcolor: 'background.paper',
  minWidth: { xs: 140, md: 180 },
} as const;

function Ligne({
  ligne,
  taux,
  total,
}: {
  ligne: LigneEquipe;
  taux: (v: number | null) => string;
  total?: boolean;
}) {
  const { t } = useTranslation();
  const s: IndicateursPeriode = ligne.semaine;
  const c = ligne.cycle;
  const fort = total ? { fontWeight: 700 } : {};
  const bord = total ? { borderTop: 2, borderColor: 'divider', borderBottom: 0 } : {};
  const nom = (
    <TableCell sx={{ ...celluleNom, ...bord }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {`${ligne.delegue.prenom} ${ligne.delegue.nom}`.trim()}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {ligne.poste.libelle}
      </Typography>
    </TableCell>
  );
  if (!s.activite && !total) {
    return (
      <TableRow>
        {nom}
        <TableCell colSpan={5} sx={{ color: 'text.secondary' }}>
          {t('pilotage.aucuneActivite')}
        </TableCell>
        <Taux
          valeur={taux(c.taux.couverture)}
          detail={sur(t, c.couverture.visitees, c.couverture.cibles)}
        />
        <TableCell />
      </TableRow>
    );
  }
  return (
    <TableRow>
      {nom}
      <TableCell align="right" sx={{ ...fort, ...bord }}>
        {s.visites.effectuees}
        {s.visites.imprevues > 0 && (
          <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }}>
            {t('pilotage.dontImprevues', { count: s.visites.imprevues })}
          </Typography>
        )}
      </TableCell>
      <Taux
        sx={{ ...fort, ...bord }}
        valeur={taux(s.taux.realisation)}
        detail={sur(t, s.visites.effectuees_prevues, s.visites.echues)}
      />
      <Taux
        sx={{ ...fort, ...bord }}
        valeur={taux(s.taux.ecarts_justifies)}
        detail={sur(t, s.visites.ecarts_justifies, s.visites.ecarts)}
      />
      <Taux
        sx={{ ...fort, ...bord }}
        valeur={taux(s.taux.geolocalisation)}
        detail={sur(t, s.visites.geolocalisees, s.visites.effectuees)}
      />
      <Taux
        sx={{ ...fort, ...bord }}
        valeur={taux(s.taux.rapports_dans_delai)}
        detail={sur(t, s.rapports.dans_delai, s.rapports.soumis + s.rapports.en_retard)}
      />
      <Taux
        sx={{ ...fort, ...bord }}
        valeur={taux(c.taux.couverture)}
        detail={sur(t, c.couverture.visitees, c.couverture.cibles)}
      />
      <TableCell sx={bord}>
        <Stack spacing={0.25}>
          {s.visites.a_justifier > 0 && (
            <Etiquette ton="warning">
              {t('pilotage.aJustifier', { count: s.visites.a_justifier })}
            </Etiquette>
          )}
          {s.rapports.en_retard > 0 && (
            <Etiquette ton="warning">
              {t('pilotage.enRetard', { count: s.rapports.en_retard })}
            </Etiquette>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
}

/** « n sur total » ; rien quand il n'y a pas de base (le taux affiche déjà « — »). */
function sur(t: TFunction, n: number, total: number) {
  return total ? t('pilotage.sur', { n, total }) : undefined;
}

function Taux({ valeur, detail, sx }: { valeur: string; detail?: string; sx?: object }) {
  return (
    <TableCell align="right" sx={{ whiteSpace: 'nowrap', ...sx }}>
      <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {valeur}
      </Box>
      {detail && (
        <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }}>
          {detail}
        </Typography>
      )}
    </TableCell>
  );
}
