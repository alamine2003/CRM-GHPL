import type { IndicateursPeriode, LigneEquipe, TableauEquipe } from '@innov/api-client';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import {
  Box,
  Button,
  Card,
  IconButton,
  MenuItem,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { type TFunction } from 'i18next';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { BarreChiffres, Chiffre, EnTetePage, Etiquette, EtatVide } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useSession } from '../contexteSession';

/** DSH-003 : à plat, ou par réseau, zone, secteur du poste. */
const REGROUPEMENTS = ['delegue', 'reseau', 'zone', 'secteur'] as const;
type Regroupement = (typeof REGROUPEMENTS)[number];

/**
 * « Pilotage » (DSH-002, DSH-003, DSH-012 ; 0.7.2, 0.7.3) : les taux de la semaine de chaque
 * délégué piloté (équipe du superviseur, réseaux du DM et du DF, pays du responsable), côte à
 * côte par ordre alphabétique, regroupés au besoin par réseau, zone ou secteur ; chaque total
 * est tiré des sommes. Ni note, ni appréciation, ni classement (DC-49).
 */
export default function Pilotage() {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [parametres, setParametres] = useSearchParams();
  const semaine = parametres.get('semaine') ?? '';
  const brut = parametres.get('par') ?? '';
  const par: Regroupement = (REGROUPEMENTS as readonly string[]).includes(brut)
    ? (brut as Regroupement)
    : 'delegue';
  const tableau = useQuery({
    queryKey: ['pilotage-equipe', semaine, par],
    queryFn: () => client.pilotage.equipe(semaine || undefined, par),
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
  const changer = (cle: string, valeur: string) =>
    setParametres(
      (p) => {
        const suite = new URLSearchParams(p);
        if (valeur) suite.set(cle, valeur);
        else suite.delete(cle);
        return suite;
      },
      { replace: true },
    );
  const aller = (lundi: string) => changer('semaine', lundi);
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
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              select
              size="small"
              label={t('pilotage.regrouper')}
              value={par}
              onChange={(e) => changer('par', e.target.value === 'delegue' ? '' : e.target.value)}
              sx={{ minWidth: 170, mr: 1 }}
            >
              {REGROUPEMENTS.map((r) => (
                <MenuItem key={r} value={r}>
                  {t(`pilotage.par.${r}`)}
                </MenuItem>
              ))}
            </TextField>
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
          {d.par !== 'delegue' && d.groupes.length === 0 ? (
            <Card>
              <EtatVide titre={t(`pilotage.sansGroupe.${d.par}`)} />
            </Card>
          ) : (
            <TableauDelegues
              lignes={d.delegues}
              total={d.total}
              groupes={
                d.par === 'delegue'
                  ? undefined
                  : d.groupes.map((g) => ({
                      ...g,
                      lignes: d.delegues.filter((x) => g.delegues.includes(x.delegue.id)),
                    }))
              }
              libelleTotal={d.par === 'delegue' ? t('pilotage.equipe') : t('pilotage.ensemble')}
              entete={t(`pilotage.colonnes.${d.par}`)}
              titre={t('pilotage.tableau')}
              taux={taux}
            />
          )}
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

type Groupe = TableauEquipe['groupes'][number] & { lignes: LigneEquipe[] };

function TableauDelegues({
  lignes,
  total,
  groupes,
  libelleTotal,
  entete,
  titre,
  taux,
}: {
  lignes: LigneEquipe[];
  total: TableauEquipe['total'];
  /** DSH-003 : une ligne par réseau, zone ou secteur, qui se déplie sur ses délégués. */
  groupes?: Groupe[];
  libelleTotal: string;
  /** En-tête de la première colonne : « Délégué », ou le nom du regroupement. */
  entete: string;
  titre: string;
  taux: (v: number | null) => string;
}) {
  const { t } = useTranslation();
  const [ouverts, setOuverts] = useState<string[]>([]);
  const basculer = (id: string) =>
    setOuverts((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const colonnes = [
    'visites',
    'realisation',
    'ecarts',
    'geolocalisation',
    'rapports',
    'couverture',
    'aSuivre',
  ] as const;
  const resume = (
    id: string,
    libelle: string,
    nombre: number,
    valeurs: TableauEquipe['total'],
  ) => ({
    delegue: { id, prenom: libelle, nom: '' },
    poste: { id, libelle: t('pilotage.delegues', { count: nombre }) },
    semaine: valeurs.semaine,
    cycle: valeurs.cycle,
  });
  return (
    <Card>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label={titre}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...celluleNom, verticalAlign: 'bottom' }}>{entete}</TableCell>
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
            {groupes
              ? groupes.map((g) => {
                  const ouvert = ouverts.includes(g.id);
                  return (
                    <Fragment key={g.id}>
                      <Ligne
                        variante="groupe"
                        ouvert={ouvert}
                        basculer={() => basculer(g.id)}
                        ligne={resume(g.id, g.libelle, g.lignes.length, g.total)}
                        taux={taux}
                      />
                      {ouvert &&
                        g.lignes.map((ligne) => (
                          <Ligne
                            key={ligne.delegue.id}
                            variante="retrait"
                            ligne={ligne}
                            taux={taux}
                          />
                        ))}
                    </Fragment>
                  );
                })
              : lignes.map((ligne) => <Ligne key={ligne.delegue.id} ligne={ligne} taux={taux} />)}
            <Ligne
              variante="total"
              ligne={resume('total', libelleTotal, lignes.length, total)}
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
  variante = 'delegue',
  ouvert,
  basculer,
}: {
  ligne: LigneEquipe;
  taux: (v: number | null) => string;
  /** `groupe` : total d'un réseau, d'une zone ou d'un secteur ; `retrait` : un de ses délégués. */
  variante?: 'delegue' | 'retrait' | 'groupe' | 'total';
  ouvert?: boolean;
  basculer?: () => void;
}) {
  const { t } = useTranslation();
  const s: IndicateursPeriode = ligne.semaine;
  const c = ligne.cycle;
  const total = variante === 'total' || variante === 'groupe';
  const fort = total ? { fontWeight: 700 } : {};
  const bord =
    variante === 'total' ? { borderTop: 2, borderColor: 'divider', borderBottom: 0 } : {};
  const libelle = `${ligne.delegue.prenom} ${ligne.delegue.nom}`.trim();
  const nom = (
    <TableCell sx={{ ...celluleNom, ...bord, pl: variante === 'retrait' ? 5 : undefined }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        {variante === 'groupe' && (
          <IconButton
            size="small"
            onClick={basculer}
            aria-expanded={ouvert}
            aria-label={t(ouvert ? 'pilotage.replier' : 'pilotage.deplier', { libelle })}
            sx={{ ml: -1 }}
          >
            {ouvert ? <ExpandLessRounded /> : <ExpandMoreRounded />}
          </IconButton>
        )}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {libelle}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {ligne.poste.libelle}
          </Typography>
        </Box>
      </Stack>
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
