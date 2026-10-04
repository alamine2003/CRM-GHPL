import type {
  Civilite,
  FiltresProspects,
  Perimetre,
  Potentiel,
  Prospect,
  SaisieProspect,
  StatutFiche,
  ValeurReferentiel,
} from '@innov/api-client';
import AddRounded from '@mui/icons-material/AddRounded';
import ApartmentRounded from '@mui/icons-material/ApartmentRounded';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import LocalHospitalRounded from '@mui/icons-material/LocalHospitalRounded';
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded';
import PhoneRounded from '@mui/icons-material/PhoneRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import TodayRounded from '@mui/icons-material/TodayRounded';
import WrongLocationRounded from '@mui/icons-material/WrongLocationRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import {
  Alert,
  Avatar,
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
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import { LieuxExercice } from '../composants/Exercices';
import { ChampsLieu, ChoixActivite } from '../composants/Lieu';
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
import { depuis } from '../composants/formats';
import { initiales } from '../composants/initiales';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

const POTENTIELS: Potentiel[] = ['A', 'B', 'C'];
const CIVILITES: Civilite[] = ['dr', 'pr', 'm', 'mme'];
type FiltreStatut = 'tous' | StatutFiche;

/** Couleur du potentiel : A ressort, C s'efface. */
function usePotentiel() {
  const theme = useTheme();
  return (p: Potentiel) =>
    p === 'A'
      ? theme.palette.secondary.main
      : p === 'B'
        ? theme.palette.info.main
        : theme.palette.text.secondary;
}

function nomAffiche(p: Pick<Prospect, 'civilite' | 'prenom' | 'nom'>, t: (c: string) => string) {
  return [p.civilite ? t(`prospect.civilites.${p.civilite}`) : '', p.prenom, p.nom]
    .filter(Boolean)
    .join(' ');
}

function PastillePotentiel({ potentiel }: { potentiel: Potentiel }) {
  const { t } = useTranslation();
  const couleur = usePotentiel()(potentiel);
  return (
    <Box
      role="img"
      aria-label={t(`prospect.potentiels.${potentiel}`)}
      sx={{
        width: 30,
        height: 30,
        flex: 'none',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 800,
        fontSize: 14,
        color: couleur,
        bgcolor: alpha(couleur, 0.12),
        border: `2px solid ${alpha(couleur, 0.4)}`,
      }}
    >
      {potentiel}
    </Box>
  );
}

function useValeurs() {
  const { client } = useSession();
  const valeurs = useQuery({
    queryKey: ['referentiel', 'valeurs-prospects'],
    queryFn: () => client.referentiel.valeurs(),
  });
  const actives = (valeurs.data ?? []).filter((v) => !v.archive);
  return {
    types: actives.filter((v) => v.liste === 'type_prospect'),
    specialites: actives.filter((v) => v.liste === 'specialite'),
    grades: actives.filter((v) => v.liste === 'grade'),
  };
}

// --- Saisie ------------------------------------------------------------------------------------

function DialogueProspect({
  prospect,
  delegue,
  types,
  specialites,
  grades,
  surFermer,
  surEnregistre,
}: {
  prospect: Prospect | null;
  delegue: boolean;
  types: ValeurReferentiel[];
  specialites: ValeurReferentiel[];
  grades: ValeurReferentiel[];
  surFermer: () => void;
  surEnregistre: (p: Prospect) => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [f, setF] = useState<SaisieProspect>({
    civilite: prospect?.civilite ?? 'dr',
    nom: prospect?.nom ?? '',
    prenom: prospect?.prenom ?? '',
    type: prospect?.type ?? types[0]?.id ?? null,
    specialite: prospect?.specialite ?? null,
    numero_ordre: prospect?.numero_ordre ?? '',
    telephone_mobile: prospect?.telephone_mobile ?? '',
    telephone_pro: prospect?.telephone_pro ?? '',
    courriel: prospect?.courriel ?? '',
    potentiel: prospect?.potentiel ?? 'B',
    activite: prospect?.activite ?? '',
    grade: prospect?.grade ?? null,
    secteur: prospect?.secteur?.id ?? null,
    localite: prospect?.localite?.id ?? null,
  });
  const secteurs = useQuery({
    queryKey: ['etablissements', 'saisie', 'secteurs'],
    queryFn: () => client.etablissements.secteurs(),
  });
  const changer = <K extends keyof SaisieProspect>(cle: K, valeur: SaisieProspect[K]) =>
    setF((avant) => ({ ...avant, [cle]: valeur }));
  // Spécialités proposées : celles du type choisi, et celles qui valent pour tous les types.
  const proposees = specialites.filter((s) => !s.parent || s.parent === f.type);
  return (
    <DialogueFormulaire
      ouvert
      titre={prospect ? t('prospect.fiche.modifierTitre') : t('prospect.nouveau')}
      invalide={!f.nom.trim() || !f.type}
      surFermer={surFermer}
      surValider={async () => {
        const fiche = prospect
          ? await client.prospects.modifier(prospect.id, f)
          : await client.prospects.creer(f);
        surEnregistre(fiche);
      }}
    >
      {delegue && !prospect && <Alert severity="info">{t('prospect.aides.aValider')}</Alert>}
      <Stack direction="row" spacing={1.5}>
        <TextField
          select
          label={t('prospect.champs.civilite')}
          value={f.civilite ?? ''}
          onChange={(e) => changer('civilite', e.target.value as Civilite)}
          sx={{ width: 120, flex: 'none' }}
        >
          {CIVILITES.map((c) => (
            <MenuItem key={c} value={c}>
              {t(`prospect.civilites.${c}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={t('prospect.champs.prenom')}
          value={f.prenom}
          onChange={(e) => changer('prenom', e.target.value)}
          fullWidth
        />
      </Stack>
      <TextField
        label={t('prospect.champs.nom')}
        value={f.nom}
        onChange={(e) => changer('nom', e.target.value)}
        helperText={t('prospect.champs.nomAide')}
        required
        autoFocus
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          select
          label={t('prospect.champs.type')}
          value={f.type ?? ''}
          onChange={(e) => setF((a) => ({ ...a, type: e.target.value, specialite: null }))}
          required
          fullWidth
        >
          {types.map((v) => (
            <MenuItem key={v.id} value={v.id}>
              {v.libelle}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label={t('prospect.champs.specialite')}
          value={f.specialite ?? ''}
          onChange={(e) => changer('specialite', e.target.value || null)}
          disabled={proposees.length === 0}
          fullWidth
        >
          {proposees.map((v) => (
            <MenuItem key={v.id} value={v.id}>
              {v.libelle}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { sm: 'flex-end' } }}
      >
        <TextField
          select
          label={t('prospect.champs.grade')}
          value={f.grade ?? ''}
          onChange={(e) => changer('grade', e.target.value || null)}
          fullWidth
        >
          <MenuItem value="">—</MenuItem>
          {grades.map((v) => (
            <MenuItem key={v.id} value={v.id}>
              {v.libelle}
            </MenuItem>
          ))}
        </TextField>
        <ChoixActivite valeur={f.activite ?? ''} changer={(v) => changer('activite', v)} />
      </Stack>
      <ChampsLieu
        secteurs={secteurs.data ?? []}
        secteur={f.secteur ?? null}
        localite={f.localite ?? null}
        changer={(secteur, localite) => setF((a) => ({ ...a, secteur, localite }))}
      />
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
          {t('prospect.champs.potentiel')}
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={f.potentiel}
          onChange={(_, valeur: Potentiel | null) => valeur && changer('potentiel', valeur)}
          aria-label={t('prospect.champs.potentiel')}
          sx={{ '& .MuiToggleButton-root': { px: 3, fontWeight: 800 } }}
        >
          {POTENTIELS.map((p) => (
            <ToggleButton key={p} value={p} aria-label={t(`prospect.potentiels.${p}`)}>
              {p}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
          {t('prospect.aides.potentiel')}
        </Typography>
      </Box>
      <TextField
        label={t('prospect.champs.numeroOrdre')}
        value={f.numero_ordre}
        onChange={(e) => changer('numero_ordre', e.target.value)}
        helperText={t('prospect.champs.numeroOrdreAide')}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          label={t('prospect.champs.telephoneMobile')}
          value={f.telephone_mobile}
          onChange={(e) => changer('telephone_mobile', e.target.value)}
          helperText={t('prospect.champs.telephoneAide')}
          type="tel"
          fullWidth
        />
        <TextField
          label={t('prospect.champs.telephonePro')}
          value={f.telephone_pro}
          onChange={(e) => changer('telephone_pro', e.target.value)}
          type="tel"
          fullWidth
        />
      </Stack>
      <TextField
        label={t('prospect.champs.courriel')}
        value={f.courriel}
        onChange={(e) => changer('courriel', e.target.value)}
        type="email"
      />
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

function FicheProspect({
  id,
  gerer,
  surFermer,
  surModifier,
}: {
  id: string;
  gerer: boolean;
  surFermer: () => void;
  surModifier: (p: Prospect) => void;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const [archivage, setArchivage] = useState(false);
  const [motif, setMotif] = useState('');
  const fiche = useQuery({
    queryKey: ['prospects', 'fiche', id],
    queryFn: () => client.prospects.detail(id),
  });
  const p = fiche.data;
  const rafraichir = () => requetes.invalidateQueries({ queryKey: ['prospects'] });
  const valider = async () => {
    try {
      await client.prospects.valider(id);
      notifier(t('prospect.fiche.validee'));
      await rafraichir();
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
  };
  const aucun = (
    <Typography sx={{ color: 'text.disabled' }}>{t('prospect.fiche.aucun')}</Typography>
  );
  const telephone = (n: string | undefined) =>
    n ? (
      <Link href={`tel:${n}`} underline="hover" sx={{ fontFamily: 'monospace' }}>
        {n}
      </Link>
    ) : (
      aucun
    );

  return (
    <Box
      sx={{
        width: { xs: '100vw', sm: 460 },
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {!p ? (
        <Stack spacing={1.5}>
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={160} />
        </Stack>
      ) : (
        <>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
            <Avatar sx={{ width: 52, height: 52, bgcolor: 'primary.main', fontWeight: 700 }}>
              {initiales(p.prenom || p.nom, p.nom)}
            </Avatar>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h6" component="h2" sx={{ lineHeight: 1.2 }}>
                {nomAffiche(p, t)}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {[p.type_libelle, p.specialite_libelle].filter(Boolean).join(' · ')}
              </Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                <PastillePotentiel potentiel={p.potentiel} />
                <Chip
                  size="small"
                  color={
                    p.statut === 'actif'
                      ? 'success'
                      : p.statut === 'a_valider'
                        ? 'warning'
                        : 'default'
                  }
                  icon={
                    p.statut === 'actif' ? (
                      <VerifiedRounded />
                    ) : p.statut === 'a_valider' ? (
                      <HourglassTopRounded />
                    ) : undefined
                  }
                  label={t(`prospect.statuts.${p.statut}`)}
                  sx={{ alignSelf: 'center' }}
                />
              </Stack>
            </Box>
            <IconButton aria-label={t('commun.fermer')} onClick={surFermer}>
              <CloseRounded />
            </IconButton>
          </Stack>

          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {gerer && p.statut === 'a_valider' && (
              <Button
                variant="contained"
                color="success"
                startIcon={<TaskAltRounded />}
                onClick={() => void valider()}
              >
                {t('prospect.fiche.valider')}
              </Button>
            )}
            {p.modifiable && (
              <Button variant="outlined" startIcon={<EditRounded />} onClick={() => surModifier(p)}>
                {t('prospect.fiche.modifier')}
              </Button>
            )}
            {gerer && p.statut !== 'archive' && (
              <Button
                color="error"
                startIcon={<ArchiveRounded />}
                onClick={() => setArchivage(true)}
              >
                {t('prospect.fiche.archiver')}
              </Button>
            )}
          </Stack>
          {!p.modifiable && p.statut === 'actif' && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('prospect.fiche.communeAide')}
            </Typography>
          )}

          <Section titre={t('prospect.fiche.identite')} icone={<LocalHospitalRounded />}>
            <Ligne libelle={t('prospect.champs.type')} valeur={p.type_libelle} />
            <Ligne
              libelle={t('prospect.champs.specialite')}
              valeur={p.specialite_libelle ?? aucun}
            />
            <Ligne libelle={t('prospect.champs.grade')} valeur={p.grade_libelle ?? aucun} />
            <Ligne
              libelle={t('lieu.exercice')}
              valeur={p.activite ? t(`lieu.exercices.${p.activite}`) : aucun}
            />
            <Ligne
              libelle={t('lieu.lieu')}
              valeur={
                [p.localite?.libelle, p.secteur?.libelle].filter(Boolean).join(' · ') || aucun
              }
            />
            <Ligne
              libelle={t('prospect.champs.numeroOrdre')}
              valeur={
                p.numero_ordre ? (
                  <Box sx={{ fontFamily: 'monospace' }}>{p.numero_ordre}</Box>
                ) : (
                  aucun
                )
              }
            />
            <Ligne
              libelle={t('prospect.champs.potentiel')}
              valeur={t(`prospect.potentiels.${p.potentiel}`)}
            />
          </Section>
          <Section titre={t('prospect.fiche.coordonnees')} icone={<PhoneRounded />}>
            <Ligne
              libelle={t('prospect.champs.telephoneMobile')}
              valeur={telephone(p.telephone_mobile)}
            />
            <Ligne
              libelle={t('prospect.champs.telephonePro')}
              valeur={telephone(p.telephone_pro)}
            />
            <Ligne
              libelle={t('prospect.champs.courriel')}
              valeur={
                p.courriel ? (
                  <Link href={`mailto:${p.courriel}`} underline="hover">
                    {p.courriel}
                  </Link>
                ) : (
                  aucun
                )
              }
            />
          </Section>
          <Section titre={t('prospect.fiche.etablissements')} icone={<ApartmentRounded />}>
            <LieuxExercice prospect={p} />
          </Section>
          <Section titre={t('prospect.fiche.visites')} icone={<TodayRounded />}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('prospect.fiche.visitesTexte')}
            </Typography>
          </Section>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('prospect.fiche.creePar', {
              personne: `${p.cree_par.prenom} ${p.cree_par.nom}`,
              quand: depuis(p.cree_le, i18n.language),
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
            await client.prospects.archiver(id, motif);
            await rafraichir();
            surFermer();
          }}
        >
          <TextField
            label={t('prospect.fiche.motif')}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
        </DialogueFormulaire>
      )}
    </Box>
  );
}

// --- Page --------------------------------------------------------------------------------------

/** Fiches prospects (PRP-002) ; création par le délégué au statut « à valider » (PRP-006). */
export default function Prospects({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const couleur = usePotentiel();
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const peutCreer = perimetre.actions.includes('prospects.creer') && perimetre.pays_actif !== null;
  const gerer = perimetre.actions.includes('prospects.gerer') && perimetre.pays_actif !== null;
  const delegue = perimetre.roles.includes('delegue') && !gerer;
  const { types, specialites, grades } = useValeurs();

  const [saisie, setSaisie] = useState('');
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState<FiltreStatut>('tous');
  const [type, setType] = useState('');
  const [potentiel, setPotentiel] = useState<Potentiel | ''>('');
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<{ prospect: Prospect | null } | null>(null);

  // La recherche part 300 ms après la dernière frappe.
  useEffect(() => {
    const minuteur = setTimeout(() => setQ(saisie), 300);
    return () => clearTimeout(minuteur);
  }, [saisie]);

  const filtres: FiltresProspects = {
    q,
    statut: statut === 'tous' ? undefined : statut,
    type: type || undefined,
    potentiel: potentiel || undefined,
  };
  const liste = useQuery({
    queryKey: ['prospects', cle, 'liste', filtres],
    queryFn: () => client.prospects.liste(filtres),
    placeholderData: (precedent) => precedent,
  });
  const synthese = useQuery({
    queryKey: ['prospects', cle, 'synthese'],
    queryFn: client.prospects.synthese,
  });
  const s = synthese.data;
  const fiches = liste.data?.resultats ?? [];

  return (
    <Stack spacing={3}>
      <EnTetePage
        titre={t('prospect.titre')}
        sousTitre={
          perimetre.pays_actif
            ? t('prospect.sousTitre', { pays: perimetre.pays_actif.nom })
            : t('prospect.sousTitreConsolide')
        }
        actions={
          peutCreer && (
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              onClick={() => setDialogue({ prospect: null })}
            >
              {t('prospect.nouveau')}
            </Button>
          )
        }
      />
      <GrilleTuiles>
        <Tuile
          libelle={t('prospect.chiffres.actifs')}
          valeur={s ? s.actifs : <Skeleton width={40} />}
          icone={<PeopleAltRounded />}
          detail={
            s
              ? t('prospect.chiffres.repartition', {
                  a: s.potentiels.A,
                  b: s.potentiels.B,
                  c: s.potentiels.C,
                })
              : undefined
          }
        />
        <Tuile
          libelle={delegue ? t('prospect.chiffres.mesAValider') : t('prospect.chiffres.aValider')}
          valeur={s ? delegue ? s.mes_a_valider : s.a_valider : <Skeleton width={40} />}
          icone={<HourglassTopRounded />}
          ton="warning"
        />
        <Tuile
          libelle={t('prospect.chiffres.potentielA')}
          valeur={s ? s.potentiels.A : <Skeleton width={40} />}
          icone={<StarRounded />}
          ton="secondary"
        />
        <Tuile
          libelle={t('prospect.chiffres.sansLieu')}
          valeur={s ? s.sans_lieu : <Skeleton width={40} />}
          icone={<WrongLocationRounded />}
          ton="info"
          detail={t('prospect.chiffres.sansLieuDetail')}
        />
      </GrilleTuiles>
      {perimetre.actions.includes('prospects.creer') && !perimetre.pays_actif && (
        <Alert severity="info">{t('prospect.choisirPays')}</Alert>
      )}

      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        spacing={1.25}
        sx={{ alignItems: { lg: 'center' } }}
      >
        <TextField
          size="small"
          placeholder={t('prospect.rechercher')}
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
            htmlInput: { 'aria-label': t('prospect.rechercher') },
          }}
        />
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
          sx={{ minWidth: 170 }}
          slotProps={{
            select: { displayEmpty: true },
            htmlInput: { 'aria-label': t('prospect.champs.type') },
          }}
        >
          <MenuItem value="">{t('prospect.tousTypes')}</MenuItem>
          {types.map((v) => (
            <MenuItem key={v.id} value={v.id}>
              {v.libelle}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={potentiel}
          onChange={(e) => setPotentiel(e.target.value as Potentiel | '')}
          sx={{ minWidth: 160 }}
          slotProps={{
            select: { displayEmpty: true },
            htmlInput: { 'aria-label': t('prospect.champs.potentiel') },
          }}
        >
          <MenuItem value="">{t('prospect.tousPotentiels')}</MenuItem>
          {POTENTIELS.map((p) => (
            <MenuItem key={p} value={p}>
              {t(`prospect.potentiels.${p}`)}
            </MenuItem>
          ))}
        </TextField>
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
              ? t('prospect.limite', { limite: liste.data.limite, total: liste.data.total })
              : t('prospect.nombre', { count: liste.data.total })}
          </Typography>
          <Card>
            {fiches.length === 0 ? (
              q || type || potentiel || statut !== 'tous' ? (
                <EtatVide icone={<SearchRounded />} titre={t('prospect.aucunResultat')} />
              ) : (
                <EtatVide
                  icone={<PeopleAltRounded />}
                  titre={t('prospect.vide')}
                  texte={t('prospect.videTexte')}
                />
              )
            ) : (
              fiches.map((p, i) => (
                <Box key={p.id}>
                  {i > 0 && <Divider />}
                  <ButtonBase
                    onClick={() => setOuverte(p.id)}
                    sx={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'grid',
                      gridTemplateColumns: { xs: 'auto 1fr auto', md: 'auto 2fr 1.4fr 1fr auto' },
                      gap: 2,
                      alignItems: 'center',
                      px: 2.5,
                      py: 1.25,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 38,
                        height: 38,
                        fontSize: 13,
                        fontWeight: 700,
                        bgcolor: alpha(couleur(p.potentiel), 0.14),
                        color: couleur(p.potentiel),
                      }}
                    >
                      {initiales(p.prenom || p.nom, p.nom)}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700 }} noWrap>
                        {nomAffiche(p, t)}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary' }}
                        noWrap
                        component="p"
                      >
                        {[
                          p.specialite_libelle ?? p.type_libelle,
                          p.lieu_principal?.libelle ?? p.localite?.libelle ?? p.secteur?.libelle,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        display: { xs: 'none', md: 'block' },
                        fontFamily: 'monospace',
                        color: 'text.secondary',
                      }}
                      noWrap
                    >
                      {p.telephone_mobile || p.telephone_pro || p.numero_ordre}
                    </Typography>
                    <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                      {p.statut !== 'actif' && (
                        <Chip
                          size="small"
                          color={p.statut === 'a_valider' ? 'warning' : 'default'}
                          variant="outlined"
                          label={t(`prospect.statuts.${p.statut}`)}
                        />
                      )}
                    </Box>
                    <PastillePotentiel potentiel={p.potentiel} />
                  </ButtonBase>
                </Box>
              ))
            )}
          </Card>
        </>
      )}

      <Drawer anchor="right" open={ouverte !== null} onClose={() => setOuverte(null)}>
        {ouverte && (
          <FicheProspect
            id={ouverte}
            gerer={gerer}
            surFermer={() => setOuverte(null)}
            surModifier={(p) => setDialogue({ prospect: p })}
          />
        )}
      </Drawer>
      {dialogue && (
        <DialogueProspect
          prospect={dialogue.prospect}
          delegue={delegue}
          types={types}
          specialites={specialites}
          grades={grades}
          surFermer={() => setDialogue(null)}
          surEnregistre={(p) => {
            void requetes.invalidateQueries({ queryKey: ['prospects'] });
            setOuverte(p.id);
          }}
        />
      )}
    </Stack>
  );
}
