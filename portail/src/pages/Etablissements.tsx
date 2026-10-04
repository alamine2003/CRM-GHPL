import type {
  Etablissement,
  FiltresEtablissements,
  Perimetre,
  SaisieEtablissement,
  SecteurSaisie,
  StatutFiche,
} from '@innov/api-client';
import AddRounded from '@mui/icons-material/AddRounded';
import ApartmentRounded from '@mui/icons-material/ApartmentRounded';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import GpsFixedRounded from '@mui/icons-material/GpsFixedRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import LocationOffRounded from '@mui/icons-material/LocationOffRounded';
import MapRounded from '@mui/icons-material/MapRounded';
import MyLocationRounded from '@mui/icons-material/MyLocationRounded';
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import ViewListRounded from '@mui/icons-material/ViewListRounded';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  Chip,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Link,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import {
  EnTeteCarte,
  EnTetePage,
  EtatVide,
  GrilleTuiles,
  Ligne,
  PastilleIcone,
  Tuile,
} from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { ProspectsExercant } from '../composants/Exercices';
import IconeType from '../composants/IconeEtablissement';
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
            startIcon={<MyLocationRounded />}
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

function Section({
  titre,
  icone,
  children,
}: {
  titre: string;
  icone: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card variant="outlined">
      <EnTeteCarte titre={titre} action={<PastilleIcone icone={icone} ton="info" taille={30} />} />
      <Box sx={{ px: 2, py: 1.5 }}>{children}</Box>
    </Card>
  );
}

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
        width: { xs: '100vw', sm: 480 },
        p: 2.5,
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
            <PastilleIcone icone={<IconeType code={e.type_code} />} ton="primary" taille={52} />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h6" component="h2" sx={{ lineHeight: 1.2 }}>
                {e.nom}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {[e.type_libelle, e.localite?.libelle].filter(Boolean).join(' · ')}
              </Typography>
              <Stack direction="row" sx={{ mt: 1, gap: 0.5, flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  icon={<PlaceRounded />}
                  label={`${e.secteur.zone} · ${e.secteur.libelle}`}
                />
                {e.statut !== 'actif' && (
                  <Chip
                    size="small"
                    color={e.statut === 'a_valider' ? 'warning' : 'default'}
                    icon={e.statut === 'a_valider' ? <HourglassTopRounded /> : undefined}
                    label={t(`prospect.statuts.${e.statut}`)}
                  />
                )}
              </Stack>
            </Box>
            <IconButton aria-label={t('commun.fermer')} onClick={surFermer}>
              <CloseRounded />
            </IconButton>
          </Stack>

          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {gerer && e.statut === 'a_valider' && (
              <Button
                variant="contained"
                color="success"
                startIcon={<TaskAltRounded />}
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
              <Button variant="outlined" startIcon={<EditRounded />} onClick={() => surModifier(e)}>
                {e.a_coordonnees
                  ? t('prospect.fiche.modifier')
                  : t('etablissement.fiche.positionner')}
              </Button>
            )}
            {gerer && e.statut !== 'archive' && (
              <Button
                color="error"
                startIcon={<ArchiveRounded />}
                onClick={() => setArchivage(true)}
              >
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
                <Typography
                  variant="caption"
                  sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                >
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
            <Alert severity="warning" icon={<LocationOffRounded />}>
              <strong>{t('etablissement.fiche.sansPosition')}</strong> —{' '}
              {t('etablissement.fiche.sansPositionTexte')}
            </Alert>
          )}

          <Section titre={t('etablissement.fiche.coordonnees')} icone={<PlaceRounded />}>
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
                  <Link
                    href={`tel:${e.telephone}`}
                    underline="hover"
                    sx={{ fontFamily: 'monospace' }}
                  >
                    {e.telephone}
                  </Link>
                ) : (
                  aucun
                )
              }
            />
          </Section>
          <Section titre={t('etablissement.fiche.prospects')} icone={<PeopleAltRounded />}>
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
  const theme = useTheme();
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
  const filtres: FiltresEtablissements = {
    q,
    statut: statut === 'tous' ? undefined : statut,
    type: type || undefined,
    secteur: secteur || undefined,
    sans_coordonnees: sansGps ? '1' : undefined,
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
    <Stack spacing={3}>
      <EnTetePage
        titre={t('etablissement.titre')}
        sousTitre={
          perimetre.pays_actif
            ? t('etablissement.sousTitre', { pays: perimetre.pays_actif.nom })
            : t('etablissement.sousTitreConsolide')
        }
        actions={
          peutCreer && (
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              onClick={() => setDialogue({ fiche: null })}
            >
              {t('etablissement.nouveau')}
            </Button>
          )
        }
      />
      <GrilleTuiles>
        <Tuile
          libelle={t('etablissement.chiffres.actifs')}
          valeur={s ? s.actifs : <Skeleton width={40} />}
          icone={<ApartmentRounded />}
        />
        <Tuile
          libelle={
            delegue ? t('etablissement.chiffres.mesAValider') : t('etablissement.chiffres.aValider')
          }
          valeur={s ? delegue ? s.mes_a_valider : s.a_valider : <Skeleton width={40} />}
          icone={<HourglassTopRounded />}
          ton="warning"
        />
        <Tuile
          libelle={t('etablissement.chiffres.sansCoordonnees')}
          valeur={s ? s.sans_coordonnees : <Skeleton width={40} />}
          icone={<LocationOffRounded />}
          ton={s && s.sans_coordonnees > 0 ? 'error' : 'success'}
          detail={t('etablissement.chiffres.sansCoordonneesDetail')}
        />
        <Tuile
          libelle={t('etablissement.chiffres.secteurs')}
          valeur={s ? s.secteurs_couverts : <Skeleton width={40} />}
          icone={<MapRounded />}
          ton="info"
          detail={
            secteurs.data
              ? t('referentiel.chiffres.surTotal', { total: secteurs.data.length })
              : undefined
          }
        />
      </GrilleTuiles>

      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <TextField
            size="small"
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
          >
            <ToggleButton value="liste" aria-label={t('etablissement.titre')}>
              <ViewListRounded fontSize="small" />
            </ToggleButton>
            <ToggleButton value="carte" aria-label={t('etablissement.fiche.carte')}>
              <MapRounded fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Stack direction="row" sx={{ gap: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={statut}
            onChange={(_, valeur: FiltreStatut | null) => valeur && setStatut(valeur)}
            sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600, px: 1.5 } }}
          >
            {(
              [
                'tous',
                'a_valider',
                'actif',
                ...(gerer ? (['archive'] as const) : []),
              ] as FiltreStatut[]
            ).map((v) => (
              <ToggleButton key={v} value={v}>
                {t(`prospect.filtres.${v}`)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField
            select
            size="small"
            value={type}
            onChange={(e) => setType(e.target.value)}
            sx={{ minWidth: 160 }}
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
          <ToggleButton
            size="small"
            value="sansGps"
            selected={sansGps}
            onChange={() => setSansGps((v) => !v)}
            sx={{ textTransform: 'none', fontWeight: 600, gap: 0.5, flex: 'none' }}
          >
            <LocationOffRounded fontSize="small" />
            {t('etablissement.sansGps')}
          </ToggleButton>
        </Stack>
      </Stack>

      {liste.isError ? (
        <ErreurChargement erreur={liste.error} reessayer={() => void liste.refetch()} />
      ) : !liste.data ? (
        <Stack spacing={1}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={64} />
          ))}
        </Stack>
      ) : (
        <>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {liste.data.total > liste.data.limite
              ? t('etablissement.limite', { limite: liste.data.limite, total: liste.data.total })
              : t('etablissement.nombre', { count: liste.data.total })}
          </Typography>
          {vue === 'carte' ? (
            <Card sx={{ p: 1 }}>
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
                  <EtatVide icone={<SearchRounded />} titre={t('etablissement.aucunResultat')} />
                ) : (
                  <EtatVide
                    icone={<ApartmentRounded />}
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
                        gridTemplateColumns: { xs: 'auto 1fr auto', md: 'auto 2fr 1.3fr 1fr auto' },
                        gap: 2,
                        alignItems: 'center',
                        px: 2.5,
                        py: 1.25,
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: 2,
                          display: 'grid',
                          placeItems: 'center',
                          color: 'primary.main',
                          bgcolor: alpha(theme.palette.primary.main, 0.08),
                        }}
                      >
                        <IconeType code={e.type_code} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700 }} noWrap>
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
                      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`${e.secteur.zone} · ${e.secteur.libelle}`}
                        />
                      </Box>
                      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                        {e.statut !== 'actif' && (
                          <Chip
                            size="small"
                            color={e.statut === 'a_valider' ? 'warning' : 'default'}
                            variant="outlined"
                            label={t(`prospect.statuts.${e.statut}`)}
                          />
                        )}
                      </Box>
                      {e.a_coordonnees ? (
                        <GpsFixedRounded
                          color="success"
                          aria-label={t('etablissement.champs.position')}
                        />
                      ) : (
                        <LocationOffRounded color="error" aria-label={t('etablissement.sansGps')} />
                      )}
                    </ButtonBase>
                  </Box>
                ))
              )}
            </Card>
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
