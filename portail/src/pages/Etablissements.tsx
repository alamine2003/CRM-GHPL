import type {
  Etablissement,
  FiltresEtablissements,
  TriEtablissements,
  Perimetre,
  SaisieEtablissement,
  SecteurSaisie,
  StatutFiche,
} from '@innov/api-client';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Link,
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
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import { BarreChiffres, Chiffre, EnTetePage, EtatVide, Ligne, Section } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { ProspectsExercant } from '../composants/Exercices';
import { BarrePagination } from '../composants/Recherche';
import { ChampsLieu, ChoixActivite, SelectSecteur } from '../composants/Lieu';
import { depuis } from '../composants/formats';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

// Leaflet n'est chargé que si une carte s'affiche.
const Carte = lazy(() => import('../composants/Carte'));

type FiltreStatut = 'tous' | StatutFiche;

function ChargementCarte({ hauteur }: { hauteur: number }) {
  return <Skeleton variant="rounded" height={hauteur} />;
}

// --- Saisie ------------------------------------------------------------------------------------

function DialogueEtablissement({
  fiche,
  delegue,
  types,
  secteurs,
  surFermer,
  surEnregistre,
}: {
  fiche: Etablissement | null;
  delegue: boolean;
  types: { id: string; libelle: string }[];
  secteurs: SecteurSaisie[];
  surFermer: () => void;
  surEnregistre: (e: Etablissement) => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [f, setF] = useState<SaisieEtablissement>({
    nom: fiche?.nom ?? '',
    type: fiche?.type ?? types[0]?.id ?? null,
    secteur: fiche?.secteur.id ?? null,
    adresse: fiche?.adresse ?? '',
    localite: fiche?.localite?.id ?? null,
    activite: fiche?.activite ?? '',
    latitude: fiche?.latitude ?? null,
    longitude: fiche?.longitude ?? null,
    telephone: fiche?.telephone ?? '',
  });
  const [localisation, setLocalisation] = useState<'attente' | 'erreur' | null>(null);
  const [precision, setPrecision] = useState<number | null>(null);
  const changer = <K extends keyof SaisieEtablissement>(cle: K, valeur: SaisieEtablissement[K]) =>
    setF((avant) => ({ ...avant, [cle]: valeur }));
  const position = (latitude: number, longitude: number) =>
    setF((avant) => ({
      ...avant,
      latitude: Math.round(latitude * 1e6) / 1e6,
      longitude: Math.round(longitude * 1e6) / 1e6,
    }));
  const maPosition = () => {
    if (!('geolocation' in navigator)) {
      setLocalisation('erreur');
      return;
    }
    setLocalisation('attente');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        position(p.coords.latitude, p.coords.longitude);
        setPrecision(Math.round(p.coords.accuracy));
        setLocalisation(null);
      },
      () => setLocalisation('erreur'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const nombre = (texte: string) => (texte.trim() === '' ? null : Number(texte.replace(',', '.')));
  const placee = f.latitude != null && f.longitude != null;

  return (
    <DialogueFormulaire
      ouvert
      titre={fiche ? t('prospect.fiche.modifierTitre') : t('etablissement.nouveau')}
      invalide={!f.nom.trim() || !f.type || !f.secteur}
      surFermer={surFermer}
      surValider={async () => {
        const enregistre = fiche
          ? await client.etablissements.modifier(fiche.id, f)
          : await client.etablissements.creer(f);
        surEnregistre(enregistre);
      }}
    >
      {delegue && !fiche && <Alert severity="info">{t('etablissement.aides.aValider')}</Alert>}
      <TextField
        label={t('etablissement.champs.nom')}
        value={f.nom}
        onChange={(e) => changer('nom', e.target.value)}
        required
        autoFocus
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          select
          label={t('etablissement.champs.type')}
          value={f.type ?? ''}
          onChange={(e) => changer('type', e.target.value)}
          required
          fullWidth
        >
          {types.map((v) => (
            <MenuItem key={v.id} value={v.id}>
              {v.libelle}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <ChampsLieu
        secteurs={secteurs}
        secteur={f.secteur}
        localite={f.localite ?? null}
        changer={(secteur, localite) => setF((a) => ({ ...a, secteur, localite }))}
        requis
      />
      <TextField
        label={t('etablissement.champs.adresse')}
        value={f.adresse}
        onChange={(e) => changer('adresse', e.target.value)}
      />
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { sm: 'flex-end' } }}
      >
        <TextField
          label={t('etablissement.champs.telephone')}
          value={f.telephone}
          onChange={(e) => changer('telephone', e.target.value)}
          type="tel"
          fullWidth
        />
        <ChoixActivite valeur={f.activite ?? ''} changer={(v) => changer('activite', v)} />
      </Stack>

      <Box
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
        }}
      >
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {t('etablissement.champs.position')}
          </Typography>
          <Button
            size="small"
            sx={{ flex: 'none', whiteSpace: 'nowrap' }}
            onClick={maPosition}
            disabled={localisation === 'attente'}
          >
            {localisation === 'attente'
              ? t('etablissement.aides.positionEnCours')
              : t('etablissement.aides.maPosition')}
          </Button>
        </Stack>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {t('etablissement.aides.position')}
        </Typography>
        {localisation === 'erreur' && (
          <Alert severity="warning">{t('etablissement.aides.positionImpossible')}</Alert>
        )}
        <Stack direction="row" spacing={1.5}>
          <TextField
            size="small"
            label={t('etablissement.champs.latitude')}
            value={f.latitude ?? ''}
            onChange={(e) => changer('latitude', nombre(e.target.value))}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            fullWidth
          />
          <TextField
            size="small"
            label={t('etablissement.champs.longitude')}
            value={f.longitude ?? ''}
            onChange={(e) => changer('longitude', nombre(e.target.value))}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            fullWidth
          />
        </Stack>
        {precision !== null && (
          <Typography variant="caption" sx={{ color: 'success.main' }}>
            {t('etablissement.aides.precision', { metres: precision })}
          </Typography>
        )}
        {placee && (
          <Suspense fallback={<ChargementCarte hauteur={180} />}>
            <Carte
              hauteur={180}
              points={[
                {
                  id: 'saisie',
                  latitude: f.latitude!,
                  longitude: f.longitude!,
                  libelle: f.nom,
                  actif: true,
                },
              ]}
              surClic={position}
            />
          </Suspense>
        )}
      </Box>
    </DialogueFormulaire>
  );
}

// --- Fiche -------------------------------------------------------------------------------------

function FicheEtablissement({
  id,
  gerer,
  surFermer,
  surModifier,
}: {
  id: string;
  gerer: boolean;
  surFermer: () => void;
  surModifier: (e: Etablissement) => void;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const [archivage, setArchivage] = useState(false);
  const [motif, setMotif] = useState('');
  const fiche = useQuery({
    queryKey: ['etablissements', 'fiche', id],
    queryFn: () => client.etablissements.detail(id),
  });
  const e = fiche.data;
  const rafraichir = () => requetes.invalidateQueries({ queryKey: ['etablissements'] });
  const aucun = (
    <Typography sx={{ color: 'text.disabled' }}>{t('prospect.fiche.aucun')}</Typography>
  );

  return (
    <Box
      sx={{
        width: { xs: '100vw', sm: 460 },
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {!e ? (
        <Stack spacing={1.5}>
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={220} />
        </Stack>
      ) : (
        <>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h4" component="h2">
                {e.nom}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                {[e.type_libelle, e.localite?.libelle, `${e.secteur.zone} · ${e.secteur.libelle}`]
                  .filter(Boolean)
                  .join(' · ')}
                {e.statut !== 'actif' && (
                  <Box
                    component="span"
                    sx={{
                      fontWeight: 600,
                      color: e.statut === 'a_valider' ? 'warning.main' : 'text.secondary',
                    }}
                  >
                    {' · '}
                    {t(`prospect.statuts.${e.statut}`)}
                  </Box>
                )}
              </Typography>
            </Box>
            <IconButton aria-label={t('commun.fermer')} onClick={surFermer}>
              <CloseRounded />
            </IconButton>
          </Stack>

          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {gerer && e.statut === 'a_valider' && (
              <Button
                variant="contained"
                onClick={() =>
                  void client.etablissements
                    .valider(id)
                    .then(() => {
                      notifier(t('etablissement.fiche.validee'));
                      return rafraichir();
                    })
                    .catch((err: unknown) =>
                      notifier(messageErreur(err, t('erreurs.reseau')), 'error'),
                    )
                }
              >
                {t('prospect.fiche.valider')}
              </Button>
            )}
            {e.modifiable && (
              <Button variant="outlined" onClick={() => surModifier(e)}>
                {e.a_coordonnees
                  ? t('prospect.fiche.modifier')
                  : t('etablissement.fiche.positionner')}
              </Button>
            )}
            {gerer && e.statut !== 'archive' && (
              <Button color="error" onClick={() => setArchivage(true)}>
                {t('prospect.fiche.archiver')}
              </Button>
            )}
          </Stack>

          {e.a_coordonnees ? (
            <Box>
              <Suspense fallback={<ChargementCarte hauteur={220} />}>
                <Carte
                  hauteur={220}
                  points={[
                    {
                      id: e.id,
                      latitude: e.latitude!,
                      longitude: e.longitude!,
                      libelle: e.nom,
                      actif: true,
                    },
                  ]}
                />
              </Suspense>
              <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.75 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {e.latitude?.toFixed(5)}, {e.longitude?.toFixed(5)}
                </Typography>
                <Link
                  variant="caption"
                  href={`https://www.openstreetmap.org/?mlat=${e.latitude}&mlon=${e.longitude}#map=17/${e.latitude}/${e.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('etablissement.fiche.ouvrirCarte')}
                </Link>
              </Stack>
            </Box>
          ) : (
            <Alert severity="warning">
              <strong>{t('etablissement.fiche.sansPosition')}</strong> —{' '}
              {t('etablissement.fiche.sansPositionTexte')}
            </Alert>
          )}

          <Section titre={t('etablissement.fiche.coordonnees')}>
            <Ligne libelle={t('etablissement.champs.adresse')} valeur={e.adresse || aucun} />
            <Ligne
              libelle={t('etablissement.champs.localite')}
              valeur={e.localite?.libelle ?? aucun}
            />
            <Ligne
              libelle={t('lieu.exercice')}
              valeur={e.activite ? t(`lieu.exercices.${e.activite}`) : aucun}
            />
            <Ligne
              libelle={t('etablissement.champs.telephone')}
              valeur={
                e.telephone ? (
                  <Link href={`tel:${e.telephone}`} underline="hover">
                    {e.telephone}
                  </Link>
                ) : (
                  aucun
                )
              }
            />
          </Section>
          <Section titre={t('etablissement.fiche.prospects')}>
            <ProspectsExercant etablissement={e.id} />
          </Section>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('prospect.fiche.creePar', {
              personne: `${e.cree_par.prenom} ${e.cree_par.nom}`,
              quand: depuis(e.cree_le, i18n.language),
            })}
          </Typography>
        </>
      )}
      {archivage && (
        <DialogueFormulaire
          ouvert
          titre={t('prospect.fiche.archiverTitre')}
          aide={t('prospect.fiche.archiverAide')}
          surFermer={() => setArchivage(false)}
          surValider={async () => {
            await client.etablissements.archiver(id, motif);
            await rafraichir();
            surFermer();
          }}
        >
          <TextField
            label={t('prospect.fiche.motif')}
            value={motif}
            onChange={(ev) => setMotif(ev.target.value)}
          />
        </DialogueFormulaire>
      )}
    </Box>
  );
}

// --- Page --------------------------------------------------------------------------------------

/** Fiches établissements (PRP-003) : un secteur chacun, une position GPS de référence. */
export default function Etablissements({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const peutCreer = perimetre.actions.includes('prospects.creer') && perimetre.pays_actif !== null;
  const gerer = perimetre.actions.includes('prospects.gerer') && perimetre.pays_actif !== null;
  const delegue = perimetre.roles.includes('delegue') && !gerer;

  const [saisie, setSaisie] = useState('');
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState<FiltreStatut>('tous');
  const [type, setType] = useState('');
  const [secteur, setSecteur] = useState('');
  const [sansGps, setSansGps] = useState(false);
  const [vue, setVue] = useState<'liste' | 'carte'>('liste');
  const [tri, setTri] = useState<TriEtablissements>('nom');

  const [ouverte, setOuverte] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<{ fiche: Etablissement | null } | null>(null);

  useEffect(() => {
    const minuteur = setTimeout(() => setQ(saisie), 300);
    return () => clearTimeout(minuteur);
  }, [saisie]);

  const valeurs = useQuery({
    queryKey: ['referentiel', 'valeurs-etablissements'],
    queryFn: () => client.referentiel.valeurs('type_etablissement'),
  });
  const types = (valeurs.data ?? []).filter((v) => !v.archive);
  const secteurs = useQuery({
    queryKey: ['etablissements', cle, 'secteurs'],
    queryFn: client.etablissements.secteurs,
  });
  // Un nouveau filtre ramène à la première page (PRP-005) : la page retenue ne vaut que pour
  // la combinaison de filtres où elle a été choisie.
  const cleFiltres = JSON.stringify([q, statut, type, secteur, sansGps, tri]);
  const [pagination, setPagination] = useState({ cle: cleFiltres, page: 1 });
  const page = pagination.cle === cleFiltres ? pagination.page : 1;
  const setPage = (p: number) => setPagination({ cle: cleFiltres, page: p });
  const filtres: FiltresEtablissements = {
    q,
    statut: statut === 'tous' ? undefined : statut,
    type: type || undefined,
    secteur: secteur || undefined,
    sans_coordonnees: sansGps ? '1' : undefined,
    tri: tri === 'nom' ? undefined : tri,
    // La carte montre jusqu'à 100 établissements à la fois ; la liste, 20 par page.
    page: vue === 'carte' ? 1 : page,
    taille: vue === 'carte' ? 100 : undefined,
  };
  const liste = useQuery({
    queryKey: ['etablissements', cle, 'liste', filtres],
    queryFn: () => client.etablissements.liste(filtres),
    placeholderData: (precedent) => precedent,
  });
  const synthese = useQuery({
    queryKey: ['etablissements', cle, 'synthese'],
    queryFn: client.etablissements.synthese,
  });
  const s = synthese.data;
  const fiches = liste.data?.resultats ?? [];
  const placees = fiches.filter((e) => e.a_coordonnees);

  return (
    <Stack spacing={2}>
      <EnTetePage
        titre={t('etablissement.titre')}
        sousTitre={perimetre.pays_actif?.nom ?? t('pays.consolide')}
        actions={
          peutCreer && (
            <Button variant="contained" onClick={() => setDialogue({ fiche: null })}>
              {t('etablissement.nouveau')}
            </Button>
          )
        }
      />
      <BarreChiffres>
        <Chiffre
          libelle={t('etablissement.chiffres.actifs')}
          valeur={s ? s.actifs : <Skeleton width={40} />}
        />
        <Chiffre
          libelle={
            delegue ? t('etablissement.chiffres.mesAValider') : t('etablissement.chiffres.aValider')
          }
          valeur={s ? delegue ? s.mes_a_valider : s.a_valider : <Skeleton width={40} />}
          ton="warning"
        />
        <Chiffre
          libelle={t('etablissement.chiffres.sansCoordonnees')}
          valeur={s ? s.sans_coordonnees : <Skeleton width={40} />}
          ton="warning"
        />
        <Chiffre
          libelle={t('etablissement.chiffres.secteurs')}
          valeur={s ? s.secteurs_couverts : <Skeleton width={40} />}
          detail={
            secteurs.data
              ? t('referentiel.chiffres.surTotal', { total: secteurs.data.length })
              : undefined
          }
        />
      </BarreChiffres>

      <Card sx={{ p: 1.5 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <TextField
              size="small"
              type="search"
              placeholder={t('etablissement.rechercher')}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              sx={{ flexGrow: 1 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRounded fontSize="small" />
                    </InputAdornment>
                  ),
                },
                htmlInput: { 'aria-label': t('etablissement.rechercher') },
              }}
            />
            <ToggleButtonGroup
              exclusive
              size="small"
              value={vue}
              onChange={(_, v: 'liste' | 'carte' | null) => v && setVue(v)}
              aria-label={t('etablissement.vue')}
            >
              <ToggleButton value="liste">{t('etablissement.vues.liste')}</ToggleButton>
              <ToggleButton value="carte">{t('etablissement.vues.carte')}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Box
            sx={{
              display: 'grid',
              gap: 1.25,
              alignItems: 'center',
              gridTemplateColumns: {
                xs: '1fr 1fr',
                md: 'auto repeat(3, minmax(0, 1fr)) auto',
              },
            }}
          >
            <Box sx={{ overflowX: 'auto', gridColumn: { xs: '1 / -1', md: 'auto' } }}>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={statut}
                onChange={(_, valeur: FiltreStatut | null) => valeur && setStatut(valeur)}
                aria-label={t('prospect.champs.statut')}
              >
                {(
                  [
                    'tous',
                    'a_valider',
                    'actif',
                    ...(gerer ? (['archive'] as const) : []),
                  ] as FiltreStatut[]
                ).map((v) => (
                  <ToggleButton key={v} value={v} sx={{ px: 1.25 }}>
                    {t(`prospect.filtres.${v}`)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <TextField
              select
              size="small"
              value={type}
              onChange={(e) => setType(e.target.value)}
              slotProps={{
                select: { displayEmpty: true },
                htmlInput: { 'aria-label': t('etablissement.champs.type') },
              }}
            >
              <MenuItem value="">{t('etablissement.tousTypes')}</MenuItem>
              {types.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.libelle}
                </MenuItem>
              ))}
            </TextField>
            <SelectSecteur
              secteurs={secteurs.data ?? []}
              valeur={secteur}
              changer={setSecteur}
              libelle={t('etablissement.champs.secteur')}
              vide={t('etablissement.tousSecteurs')}
              taille="small"
            />
            <TextField
              select
              size="small"
              value={tri}
              onChange={(e) => setTri(e.target.value as TriEtablissements)}
              slotProps={{ htmlInput: { 'aria-label': t('recherche.trierPar') } }}
            >
              {(['nom', 'type', 'secteur', 'recents'] as const).map((v) => (
                <MenuItem key={v} value={v}>
                  {t(`recherche.tris.${v}`)}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              sx={{ mr: 0, ml: 0.5 }}
              control={
                <Switch size="small" checked={sansGps} onChange={() => setSansGps((v) => !v)} />
              }
              label={<Typography variant="body2">{t('etablissement.sansGps')}</Typography>}
            />
          </Box>
        </Stack>
      </Card>

      {liste.isError ? (
        <ErreurChargement erreur={liste.error} reessayer={() => void liste.refetch()} />
      ) : !liste.data ? (
        <Card aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Box key={i} sx={{ px: 2, py: 1.5, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
              <Skeleton width="40%" />
              <Skeleton width="25%" />
            </Box>
          ))}
        </Card>
      ) : (
        <>
          <BarrePagination
            total={liste.data.total}
            page={liste.data.page}
            taille={liste.data.taille}
            changer={setPage}
          />
          {vue === 'carte' ? (
            <Card sx={{ overflow: 'hidden' }}>
              <Suspense fallback={<ChargementCarte hauteur={520} />}>
                <Carte
                  hauteur={520}
                  surSelection={setOuverte}
                  points={placees.map((e) => ({
                    id: e.id,
                    latitude: e.latitude!,
                    longitude: e.longitude!,
                    libelle: e.nom,
                    actif: e.id === ouverte,
                  }))}
                />
              </Suspense>
            </Card>
          ) : (
            <Card>
              {fiches.length === 0 ? (
                q || type || secteur || sansGps || statut !== 'tous' ? (
                  <EtatVide titre={t('etablissement.aucunResultat')} />
                ) : (
                  <EtatVide
                    titre={t('etablissement.vide')}
                    texte={t('etablissement.videTexte')}
                  />
                )
              ) : (
                fiches.map((e, i) => (
                  <Box key={e.id}>
                    {i > 0 && <Divider />}
                    <ButtonBase
                      onClick={() => setOuverte(e.id)}
                      sx={{
                        width: '100%',
                        textAlign: 'left',
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr auto', md: '2fr 1.3fr 120px' },
                        columnGap: 2,
                        alignItems: 'center',
                        px: 2,
                        py: 1,
                        minHeight: 56,
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600 }} noWrap>
                          {e.nom}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary' }}
                          noWrap
                          component="p"
                        >
                          {[e.type_libelle, e.localite?.libelle].filter(Boolean).join(' · ')}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{ display: { xs: 'none', md: 'block' }, color: 'text.secondary' }}
                        noWrap
                      >
                        {`${e.secteur.zone} · ${e.secteur.libelle}`}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          textAlign: 'right',
                          fontWeight: 600,
                          color: e.statut === 'a_valider' ? 'warning.main' : 'text.secondary',
                        }}
                      >
                        {e.statut !== 'actif'
                          ? t(`prospect.statuts.${e.statut}`)
                          : !e.a_coordonnees && t('etablissement.sansGps')}
                      </Typography>
                    </ButtonBase>
                  </Box>
                ))
              )}
            </Card>
          )}
          {vue === 'liste' && liste.data.total > liste.data.taille && (
            <BarrePagination
              total={liste.data.total}
              page={liste.data.page}
              taille={liste.data.taille}
              changer={(p) => {
                setPage(p);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}
        </>
      )}

      <Drawer anchor="right" open={ouverte !== null} onClose={() => setOuverte(null)}>
        {ouverte && (
          <FicheEtablissement
            id={ouverte}
            gerer={gerer}
            surFermer={() => setOuverte(null)}
            surModifier={(e) => setDialogue({ fiche: e })}
          />
        )}
      </Drawer>
      {dialogue && (
        <DialogueEtablissement
          fiche={dialogue.fiche}
          delegue={delegue}
          types={types}
          secteurs={secteurs.data ?? []}
          surFermer={() => setDialogue(null)}
          surEnregistre={(e) => {
            void requetes.invalidateQueries({ queryKey: ['etablissements'] });
            setOuverte(e.id);
          }}
        />
      )}
    </Stack>
  );
}
