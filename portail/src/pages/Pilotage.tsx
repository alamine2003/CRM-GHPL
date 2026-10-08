import type { IndicateursPeriode, LigneEquipe, Perimetre, TableauEquipe } from '@innov/api-client';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  IconButton,
  ListItemText,
  ListSubheader,
  Menu,
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
import { Fragment, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { BarreChiffres, Chiffre, EnTetePage, Etiquette, EtatVide } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

/** DSH-003 : à plat, ou par réseau, zone, secteur du poste. */
const REGROUPEMENTS = ['delegue', 'reseau', 'zone', 'secteur'] as const;
type Regroupement = (typeof REGROUPEMENTS)[number];

/**
 * « Pilotage » (DSH-002, DSH-003, DSH-012 ; 0.7.2, 0.7.3) : les taux de la semaine de chaque
 * délégué piloté (équipe du superviseur, réseaux du DM et du DF, pays du responsable), côte à
 * côte par ordre alphabétique, regroupés au besoin par réseau, zone ou secteur ; chaque total
 * est tiré des sommes. Ni note, ni appréciation, ni classement (DC-49).
 */
export default function Pilotage({ perimetre }: { perimetre: Perimetre }) {
  // DSH-004 : le siège, sans pays choisi, ne voit que des agrégés par pays.
  if (perimetre.vue_consolidee) return <PilotageSiege />;
  return <PilotagePerimetre siege={perimetre.roles.some((r) => r.endsWith('_siege'))} />;
}

function PilotagePerimetre({ siege }: { siege: boolean }) {
  const { t, i18n } = useTranslation();
  const { client, choisirPays } = useSession();
  const [parametres, setParametres] = useSearchParams();
  const brut = parametres.get('par') ?? '';
  const par: Regroupement = (REGROUPEMENTS as readonly string[]).includes(brut)
    ? (brut as Regroupement)
    : 'delegue';
  const demande = lireParametres(parametres, CLES_PILOTAGE);
  const tableau = useQuery({
    queryKey: ['pilotage-equipe', demande],
    queryFn: () => client.pilotage.equipe(demande),
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
  // Plusieurs clés d'un coup : deux appels successifs repartiraient de la même adresse.
  const changer = (cle: string | Record<string, string>, valeur = '') =>
    setParametres(
      (p) => {
        const suite = new URLSearchParams(p);
        for (const [k, v] of Object.entries(typeof cle === 'string' ? { [cle]: valeur } : cle)) {
          if (v) suite.set(k, v);
          else suite.delete(k);
        }
        return suite;
      },
      { replace: true },
    );
  const aller = (lundi: string) => changer('semaine', lundi);
  const total = d.total.semaine;
  const pourcent = new Intl.NumberFormat(i18n.language, { style: 'percent' });
  const taux = (v: number | null) => (v === null ? '—' : pourcent.format(v));

  return (
    <Stack spacing={2.5}>
      <EnTetePage
        titre={titre}
        sousTitre={libellePeriode(t, d.periode, date(d.debut), date(d.fin))}
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
            {d.periode === 'semaine' && (
              <FlechesSemaine debut={d.debut} fin={d.fin} aujourdhui={d.aujourdhui} aller={aller} />
            )}
            <MenuExport demande={demande} debut={d.debut} fin={d.fin} />
          </Stack>
        }
      />
      {siege && (
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              sx={{ whiteSpace: 'nowrap' }}
              onClick={() => void choisirPays(null)}
            >
              {t('pilotage.tousPays')}
            </Button>
          }
        >
          {t('pilotage.auditSiege')}
        </Alert>
      )}
      <BarreFiltres
        valeurs={parametres}
        changer={changer}
        options={d.options}
        bornes={[d.debut, d.fin]}
        effacer={() => setParametres(new URLSearchParams(par === 'delegue' ? {} : { par }))}
      />
      {/* Sur téléphone, l'en-tête masque son sous-titre : la période se redit ici. */}
      <Typography
        variant="body2"
        sx={{ color: 'text.secondary', display: { xs: 'block', sm: 'none' }, mt: -1.5 }}
      >
        {libellePeriode(t, d.periode, date(d.debut), date(d.fin))}
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
          <DelaisValidation delais={d.delais} />
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
            {d.periode !== 'semaine' && d.cycle.debut === d.debut
              ? t('pilotage.notePeriode')
              : t('pilotage.note', {
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
  action,
}: {
  ligne: LigneEquipe;
  taux: (v: number | null) => string;
  /** `groupe` : total d'un réseau, d'une zone ou d'un secteur ; `retrait` : un de ses délégués. */
  variante?: 'delegue' | 'retrait' | 'groupe' | 'total' | 'pays';
  ouvert?: boolean;
  basculer?: () => void;
  /** DSH-004 : sous le nom d'un pays, le lien de descente au nominatif. */
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  const s: IndicateursPeriode = ligne.semaine;
  const c = ligne.cycle;
  const total = variante !== 'delegue' && variante !== 'retrait';
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
          {action}
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

/**
 * DSH-004 : la consolidation du siège, par pays (ordre alphabétique, sans classement), sans
 * aucun nom ; « Voir les délégués » choisit le pays et descend au nominatif, consultation
 * inscrite au journal d'audit.
 */
function PilotageSiege() {
  const { t, i18n } = useTranslation();
  const { client, choisirPays } = useSession();
  const [parametres, setParametres] = useSearchParams();
  const demande = lireParametres(parametres, CLES_PERIODE);
  const tableau = useQuery({
    queryKey: ['pilotage-siege', demande],
    queryFn: () => client.pilotage.siege(demande),
  });
  const titre = t('navigation.pilotage');
  if (tableau.isError)
    return (
      <Stack spacing={2.5}>
        <EnTetePage titre={titre} />
        <ErreurChargement erreur={tableau.error} reessayer={() => void tableau.refetch()} />
      </Stack>
    );
  if (!tableau.data)
    return (
      <Stack spacing={2.5}>
        <EnTetePage titre={titre} />
        <Skeleton variant="rounded" height={260} />
      </Stack>
    );
  const d = tableau.data;
  const jour = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' });
  const date = (iso: string) => jour.format(new Date(`${iso}T12:00:00`));
  const pourcent = new Intl.NumberFormat(i18n.language, { style: 'percent' });
  const taux = (v: number | null) => (v === null ? '—' : pourcent.format(v));
  const aujourdhui = new Date().toISOString().slice(0, 10);
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
  const ligne = (id: string, libelle: string, nombre: number, total: TableauEquipe['total']) => ({
    delegue: { id, prenom: libelle, nom: '' },
    poste: { id, libelle: t('pilotage.delegues', { count: nombre }) },
    semaine: total.semaine,
    cycle: total.cycle,
  });
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
    <Stack spacing={2.5}>
      <EnTetePage
        titre={titre}
        sousTitre={libellePeriode(t, d.periode, date(d.debut), date(d.fin))}
        actions={
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            {d.periode === 'semaine' && (
              <FlechesSemaine debut={d.debut} fin={d.fin} aujourdhui={aujourdhui} aller={aller} />
            )}
          </Stack>
        }
      />
      <BarreFiltres
        valeurs={parametres}
        changer={(cle, valeur = '') =>
          setParametres(
            (p) => {
              const suite = new URLSearchParams(p);
              const valeurs = typeof cle === 'string' ? { [cle]: valeur } : cle;
              for (const [k, v] of Object.entries(valeurs)) {
                if (v) suite.set(k, v);
                else suite.delete(k);
              }
              return suite;
            },
            { replace: true },
          )
        }
        bornes={[d.debut, d.fin]}
        effacer={() => setParametres(new URLSearchParams())}
      />
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('pilotage.siegeIntro')}
      </Typography>
      <Card>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label={t('pilotage.tableauSiege')}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...celluleNom, verticalAlign: 'bottom' }}>
                  {t('pilotage.colonnes.pays')}
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
              {d.pays.map((x) => (
                <Ligne
                  key={x.pays.code}
                  variante="pays"
                  ligne={ligne(x.pays.code, x.pays.nom, x.delegues, x.total)}
                  taux={taux}
                  action={
                    x.delegues > 0 && (
                      <Button
                        size="small"
                        variant="text"
                        sx={{ px: 0, minWidth: 0, display: 'block' }}
                        onClick={() => void choisirPays(x.pays.code)}
                      >
                        {t('pilotage.voirDelegues')}
                      </Button>
                    )
                  }
                />
              ))}
              <Ligne
                variante="total"
                ligne={ligne('total', t('pilotage.tousPays'), d.delegues, d.total)}
                taux={taux}
              />
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      <DelaisValidation
        delais={d.delais}
        pays={d.pays.map((x) => ({ code: x.pays.code, nom: x.pays.nom, delais: x.delais }))}
      />
    </Stack>
  );
}

/**
 * RPT-019, DSH-008 (0.7.8) : exporter le tableau ou les rapports de ses délégués, avec la même
 * période et les mêmes filtres, en CSV ou en classeur Excel. Le serveur limite au périmètre et
 * inscrit chaque export au journal d'audit.
 */
function MenuExport({
  demande,
  debut,
  fin,
}: {
  demande: Record<string, string>;
  debut: string;
  fin: string;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  const [envoi, setEnvoi] = useState(false);
  async function exporter(contenu: 'indicateurs' | 'rapports', fichier: 'csv' | 'xlsx') {
    setAncre(null);
    setEnvoi(true);
    try {
      const { par: _par, ...filtres } = demande;
      const blob = await client.pilotage.exporter({ ...filtres, contenu, fichier });
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = `${contenu}-${debut}-${fin}.${fichier}`;
      lien.click();
      URL.revokeObjectURL(lien.href);
      notifier(t('pilotage.export.fait'));
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    } finally {
      setEnvoi(false);
    }
  }
  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<FileDownloadRounded />}
        disabled={envoi}
        aria-haspopup="menu"
        onClick={(e) => setAncre(e.currentTarget)}
        sx={{ ml: 1, whiteSpace: 'nowrap' }}
      >
        {envoi ? t('pilotage.export.enCours') : t('pilotage.export.bouton')}
      </Button>
      <Menu anchorEl={ancre} open={!!ancre} onClose={() => setAncre(null)}>
        <ListSubheader
          disableSticky
          sx={{ lineHeight: 1.4, py: 1, maxWidth: 260, whiteSpace: 'normal' }}
        >
          {t('pilotage.export.aide')}
        </ListSubheader>
        {(['indicateurs', 'rapports'] as const).flatMap((contenu) =>
          (['xlsx', 'csv'] as const).map((fichier) => (
            <MenuItem key={`${contenu}-${fichier}`} onClick={() => void exporter(contenu, fichier)}>
              <ListItemText
                primary={t(`pilotage.export.${contenu}`)}
                secondary={t(`pilotage.export.${fichier}`)}
              />
            </MenuItem>
          )),
        )}
      </Menu>
    </>
  );
}

type Delais = TableauEquipe['delais'];

/** Une médiane en heures ouvrées : en heures sous un jour ouvré, en jours au-delà. */
function duree(t: TFunction, langue: string, heures: number | null) {
  if (heures === null) return '—';
  if (heures < 1) return t('pilotage.delais.moinsDUneHeure');
  if (heures < 24) return t('pilotage.delais.heures', { count: Math.round(heures) });
  const jours = Math.round((heures / 24) * 10) / 10;
  return t('pilotage.delais.jours', {
    count: jours,
    valeur: new Intl.NumberFormat(langue).format(jours),
  });
}

/** Une médiane au-delà d'un jour ouvré manque la cible de KPI-02 et KPI-09. */
function horsCible(x: Delais['plannings']) {
  return x.mediane !== null && x.mediane > 24;
}

function detailDelai(t: TFunction, x: Delais['plannings']) {
  return x.decisions
    ? t('pilotage.delais.dansCible', { n: x.dans_cible, count: x.decisions })
    : t('pilotage.delais.aucuneDecision');
}

/**
 * DSH-007 (0.7.7) : délais de validation des plannings (KPI-02) et des rapports (KPI-09),
 * médiane en heures ouvrées du pays, avec la part des décisions prises en moins d'un jour ouvré.
 * Au siège, un pays par ligne.
 */
function DelaisValidation({
  delais,
  pays,
}: {
  delais: Delais;
  pays?: { code: string; nom: string; delais: Delais }[];
}) {
  const { t, i18n } = useTranslation();
  const lire = (h: number | null) => duree(t, i18n.language, h);
  return (
    <Stack spacing={1.25} component="section" aria-labelledby="titre-delais">
      <Typography id="titre-delais" variant="h6" component="h2">
        {t('pilotage.delais.titre')}
      </Typography>
      {pays ? (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-labelledby="titre-delais">
              <TableHead>
                <TableRow>
                  <TableCell>{t('pilotage.colonnes.pays')}</TableCell>
                  <TableCell align="right">{t('pilotage.delais.plannings')}</TableCell>
                  <TableCell align="right">{t('pilotage.delais.rapports')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...pays, { code: 'total', nom: t('pilotage.tousPays'), delais }].map((x) => (
                  <TableRow key={x.code}>
                    <TableCell sx={{ fontWeight: x.code === 'total' ? 600 : undefined }}>
                      {x.nom}
                    </TableCell>
                    {(['plannings', 'rapports'] as const).map((k) => (
                      <TableCell key={k} align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color: horsCible(x.delais[k]) ? 'warning.main' : undefined,
                          }}
                        >
                          {lire(x.delais[k].mediane)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {detailDelai(t, x.delais[k])}
                        </Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      ) : (
        <BarreChiffres>
          {(['plannings', 'rapports'] as const).map((k) => (
            <Chiffre
              key={k}
              libelle={t(`pilotage.delais.${k}`)}
              valeur={lire(delais[k].mediane)}
              ton={horsCible(delais[k]) ? 'warning' : 'neutre'}
              detail={detailDelai(t, delais[k])}
            />
          ))}
        </BarreChiffres>
      )}
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('pilotage.delais.note')}
      </Typography>
    </Stack>
  );
}

/** Clés de l'adresse transmises au serveur (DSH-005) : période, regroupement, filtres. */
const CLES_PERIODE = ['semaine', 'periode', 'du', 'au'] as const;
const CLES_PILOTAGE = [
  ...CLES_PERIODE,
  'par',
  'zone',
  'secteur',
  'division',
  'reseau',
  'superviseur',
  'delegue',
  'statut',
] as const;
const PERIODES = ['semaine', '30j', '90j', '6m', '1a', 'dates'] as const;
const FILTRES = [
  ['zone', 'zones'],
  ['secteur', 'secteurs'],
  ['division', 'divisions'],
  ['reseau', 'reseaux'],
  ['superviseur', 'superviseurs'],
  ['delegue', 'delegues'],
] as const;

function lireParametres(parametres: URLSearchParams, cles: readonly string[]) {
  const lus: Record<string, string> = {};
  for (const cle of cles) {
    const valeur = parametres.get(cle);
    if (valeur) lus[cle] = valeur;
  }
  return lus;
}

function libellePeriode(t: TFunction, periode: string, debut: string, fin: string) {
  return periode === 'semaine'
    ? t('pilotage.semaine', { debut, fin })
    : t('pilotage.periodeDu', { debut, fin });
}

function decalerJours(iso: string, jours: number) {
  const x = new Date(`${iso}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + jours);
  return x.toISOString().slice(0, 10);
}

/** La semaine précédente, la suivante (jamais au-delà d'aujourd'hui), la semaine en cours. */
function FlechesSemaine({
  debut,
  fin,
  aujourdhui,
  aller,
}: {
  debut: string;
  fin: string;
  aujourdhui: string;
  aller: (lundi: string) => void;
}) {
  const { t } = useTranslation();
  const enCours = fin >= aujourdhui;
  const suivante = decalerJours(debut, 7);
  return (
    <>
      <Tooltip title={t('pilotage.precedente')}>
        <IconButton
          aria-label={t('pilotage.precedente')}
          onClick={() => aller(decalerJours(debut, -7))}
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
            onClick={() => aller(decalerJours(suivante, 7) > aujourdhui ? '' : suivante)}
          >
            <ChevronRightRounded />
          </IconButton>
        </span>
      </Tooltip>
    </>
  );
}

/**
 * DSH-005 : la période, puis les filtres du périmètre ; une liste n'apparaît que si elle offre
 * un vrai choix. Les valeurs vivent dans l'adresse de la page.
 */
function BarreFiltres({
  valeurs,
  changer,
  options,
  bornes,
  effacer,
}: {
  valeurs: URLSearchParams;
  changer: (cle: string | Record<string, string>, valeur?: string) => void;
  options?: TableauEquipe['options'];
  /** La période affichée : « Dates choisies » part de ces dates, toujours valides. */
  bornes: [string, string];
  effacer: () => void;
}) {
  const { t } = useTranslation();
  const periode = valeurs.get('periode') ?? 'semaine';
  const actifs = [...CLES_PILOTAGE].filter((c) => c !== 'par' && c !== 'semaine' && valeurs.get(c));
  const liste = (cle: string, libelle: string, choix: { id: string; libelle: string }[]) => (
    <TextField
      key={cle}
      select
      size="small"
      label={libelle}
      value={valeurs.get(cle) ?? ''}
      onChange={(e) => changer(cle, e.target.value)}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
      sx={{ minWidth: 160, maxWidth: 240 }}
    >
      <MenuItem value="">{t('pilotage.filtres.tous')}</MenuItem>
      {choix.map((c) => (
        <MenuItem key={c.id} value={c.id}>
          {c.libelle}
        </MenuItem>
      ))}
    </TextField>
  );
  // Sur téléphone, les filtres se replient derrière un bouton ; la période reste visible.
  const [ouverts, setOuverts] = useState(false);
  const filtresActifs = [...FILTRES.map(([cle]) => cle), 'statut'].filter((c) =>
    valeurs.get(c),
  ).length;
  const replies = { display: { xs: ouverts ? 'contents' : 'none', sm: 'contents' } };
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
      <TextField
        select
        size="small"
        label={t('pilotage.filtres.periode')}
        value={periode}
        onChange={(e) => {
          const dates = e.target.value === 'dates';
          changer({
            semaine: '',
            periode: e.target.value === 'semaine' ? '' : e.target.value,
            du: dates ? bornes[0] : '',
            au: dates ? bornes[1] : '',
          });
        }}
        sx={{ minWidth: 160 }}
      >
        {PERIODES.map((p) => (
          <MenuItem key={p} value={p}>
            {t(`pilotage.periodes.${p}`)}
          </MenuItem>
        ))}
      </TextField>
      {periode === 'dates' && (
        <>
          <TextField
            type="date"
            size="small"
            label={t('pilotage.filtres.du')}
            value={valeurs.get('du') ?? ''}
            onChange={(e) => changer('du', e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            size="small"
            label={t('pilotage.filtres.au')}
            value={valeurs.get('au') ?? ''}
            onChange={(e) => changer('au', e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </>
      )}
      {options && (
        <Button
          variant="outlined"
          onClick={() => setOuverts((o) => !o)}
          aria-expanded={ouverts}
          sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
        >
          {filtresActifs
            ? t('pilotage.filtres.boutonN', { count: filtresActifs })
            : t('pilotage.filtres.bouton')}
        </Button>
      )}
      <Box sx={replies}>
        {options &&
          FILTRES.map(([cle, cleOptions]) =>
            options[cleOptions].length > 1 || valeurs.get(cle)
              ? liste(cle, t(`pilotage.filtres.${cle}`), options[cleOptions])
              : null,
          )}
        {options &&
          liste('statut', t('pilotage.filtres.statut'), [
            { id: 'actif', libelle: t('pilotage.filtres.actif') },
            { id: 'sans_activite', libelle: t('pilotage.filtres.sansActivite') },
          ])}
        {actifs.length > 0 && (
          <Button variant="text" onClick={effacer}>
            {t('pilotage.filtres.effacer')}
          </Button>
        )}
      </Box>
    </Stack>
  );
}
