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
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  Collapse,
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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import { LieuxExercice } from '../composants/Exercices';
import { ChampsLieu, ChoixActivite, SelectSecteur } from '../composants/Lieu';
import { useFiltresUrl } from '../composants/filtresUrl';
import { BarrePagination, type Puce, PucesFiltres } from '../composants/Recherche';
import {
  BarreChiffres,
  Chiffre,
  EnTetePage,
  EtatVide,
  Ligne,
  Potentiel as MarquePotentiel,
  Section,
} from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { depuis } from '../composants/formats';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

const POTENTIELS: Potentiel[] = ['A', 'B', 'C'];
const CIVILITES: Civilite[] = ['dr', 'pr', 'm', 'mme'];
type FiltreStatut = 'tous' | StatutFiche;

function nomAffiche(p: Pick<Prospect, 'civilite' | 'prenom' | 'nom'>, t: (c: string) => string) {
  return [p.civilite ? t(`prospect.civilites.${p.civilite}`) : '', p.prenom, p.nom]
    .filter(Boolean)
    .join(' ');
}

function PastillePotentiel({ potentiel }: { potentiel: Potentiel }) {
  const { t } = useTranslation();
  return <MarquePotentiel valeur={potentiel} libelle={t(`prospect.potentiels.${potentiel}`)} />;
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
          sx={{ '& .MuiToggleButton-root': { px: 3, fontWeight: 700 } }}
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
      <Link href={`tel:${n}`} underline="hover">
        {n}
      </Link>
    ) : (
      aucun
    );

  return (
    <Box
      sx={{
        width: { xs: '100vw', sm: 440 },
        p: 2,
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
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h4" component="h2">
                {nomAffiche(p, t)}
              </Typography>
              <Stack
                direction="row"
                sx={{ alignItems: 'center', columnGap: 1, flexWrap: 'wrap', mt: 0.5 }}
              >
                <PastillePotentiel potentiel={p.potentiel} />
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {[p.type_libelle, p.specialite_libelle].filter(Boolean).join(' · ')}
                </Typography>
                {p.statut !== 'actif' && (
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: p.statut === 'a_valider' ? 'warning.main' : 'text.secondary',
                    }}
                  >
                    {t(`prospect.statuts.${p.statut}`)}
                  </Typography>
                )}
              </Stack>
            </Box>
            <IconButton aria-label={t('commun.fermer')} onClick={surFermer}>
              <CloseRounded />
            </IconButton>
          </Stack>

          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {gerer && p.statut === 'a_valider' && (
              <Button variant="contained" onClick={() => void valider()}>
                {t('prospect.fiche.valider')}
              </Button>
            )}
            {p.modifiable && (
              <Button variant="outlined" onClick={() => surModifier(p)}>
                {t('prospect.fiche.modifier')}
              </Button>
            )}
            {gerer && p.statut !== 'archive' && (
              <Button color="error" onClick={() => setArchivage(true)}>
                {t('prospect.fiche.archiver')}
              </Button>
            )}
          </Stack>
          {!p.modifiable && p.statut === 'actif' && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('prospect.fiche.communeAide')}
            </Typography>
          )}

          <Section titre={t('prospect.fiche.identite')}>
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
              valeur={p.numero_ordre ? p.numero_ordre : aucun}
            />
            <Ligne
              libelle={t('prospect.champs.potentiel')}
              valeur={t(`prospect.potentiels.${p.potentiel}`)}
            />
          </Section>
          <Section titre={t('prospect.fiche.coordonnees')}>
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
          <Section titre={t('prospect.fiche.etablissements')}>
            <LieuxExercice prospect={p} />
          </Section>
          <Section titre={t('prospect.fiche.visites')}>
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

const CLES_FILTRES = [
  'q',
  'statut',
  'type',
  'specialite',
  'potentiel',
  'activite',
  'secteur',
  'localite',
  'poste',
  'sans_lieu',
  'portee',
  'tri',
] as const;
const TRIS = ['nom', 'potentiel', 'specialite', 'secteur', 'recents'] as const;

/** Liste déroulante d'un filtre, avec une première option « tous ». */
function ChoixFiltre({
  libelle,
  vide,
  valeur,
  options,
  changer,
}: {
  libelle: string;
  vide: string;
  valeur: string;
  options: { id: string; libelle: string }[];
  changer: (v: string) => void;
}) {
  return (
    <TextField
      select
      size="small"
      label={libelle}
      value={options.some((o) => o.id === valeur) ? valeur : ''}
      onChange={(e) => changer(e.target.value)}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      <MenuItem value="">{vide}</MenuItem>
      {options.map((o) => (
        <MenuItem key={o.id} value={o.id}>
          {o.libelle}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Fiches prospects (PRP-002) ; création par le délégué au statut « à valider » (PRP-006). */
export default function Prospects({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const peutCreer = perimetre.actions.includes('prospects.creer') && perimetre.pays_actif !== null;
  const gerer = perimetre.actions.includes('prospects.gerer') && perimetre.pays_actif !== null;
  const delegue = perimetre.roles.includes('delegue') && !gerer;
  const { types, specialites, grades } = useValeurs();

  // Filtres dans l'adresse de la page : un lien rouvre la même recherche (PRP-005).
  const { valeurs: f, changer, effacer, page } = useFiltresUrl(CLES_FILTRES);
  const statut = (f.statut || 'tous') as FiltreStatut;
  const [saisie, setSaisie] = useState(f.q);
  const [panneau, setPanneau] = useState(false);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<{ prospect: Prospect | null } | null>(null);
  const terrain = !perimetre.roles.some((r) =>
    ['admin_pays', 'responsable_pays', 'admin_siege', 'direction_siege'].includes(r),
  );

  // La recherche part 300 ms après la dernière frappe.
  useEffect(() => {
    if (saisie === f.q) return;
    const minuteur = setTimeout(() => changer({ q: saisie }), 300);
    return () => clearTimeout(minuteur);
  }, [saisie, f.q, changer]);

  const secteurs = useQuery({
    queryKey: ['etablissements', cle, 'secteurs'],
    queryFn: () => client.etablissements.secteurs(),
    enabled: panneau || Boolean(f.secteur || f.localite),
  });
  const postes = useQuery({
    queryKey: ['ciblage', 'postes', cle],
    queryFn: () => client.ciblage.postes(),
    enabled: perimetre.actions.includes('cibles.lire') && (panneau || Boolean(f.poste)),
  });

  const filtres: FiltresProspects = {
    q: f.q || undefined,
    statut: statut === 'tous' ? undefined : statut,
    type: f.type || undefined,
    specialite: f.specialite || undefined,
    potentiel: (f.potentiel || undefined) as Potentiel | undefined,
    activite: (f.activite || undefined) as FiltresProspects['activite'],
    secteur: f.secteur || undefined,
    localite: f.localite || undefined,
    poste: f.poste || undefined,
    sans_lieu: f.sans_lieu === '1' ? '1' : undefined,
    portee: f.portee === 'pays' ? 'pays' : undefined,
    tri: (f.tri || undefined) as FiltresProspects['tri'],
    page,
  };
  const libelle = (liste: { id: string; libelle: string }[] | undefined, id: string) =>
    liste?.find((x) => x.id === id)?.libelle ?? '…';
  const localites = (secteurs.data ?? []).flatMap((x) => x.localites);
  const puces: Puce[] = [
    f.type && { cle: 'type', libelle: libelle(types, f.type) },
    f.specialite && { cle: 'specialite', libelle: libelle(specialites, f.specialite) },
    f.potentiel && { cle: 'potentiel', libelle: t(`prospect.potentiels.${f.potentiel}`) },
    f.activite && { cle: 'activite', libelle: t(`lieu.exercices.${f.activite}`) },
    f.secteur && { cle: 'secteur', libelle: libelle(secteurs.data, f.secteur) },
    f.localite && { cle: 'localite', libelle: libelle(localites, f.localite) },
    f.poste && {
      cle: 'poste',
      libelle: libelle(
        postes.data?.map((x) => ({ id: x.id, libelle: x.occupant ?? x.libelle })),
        f.poste,
      ),
    },
    f.sans_lieu && { cle: 'sans_lieu', libelle: t('prospect.chiffres.sansLieu') },
    f.portee && { cle: 'portee', libelle: t('recherche.toutLePays') },
  ].filter(Boolean) as Puce[];
  const filtresActifs = puces.length + (f.q ? 1 : 0) + (statut !== 'tous' ? 1 : 0);
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
    <Stack spacing={2}>
      <EnTetePage
        titre={t('prospect.titre')}
        sousTitre={perimetre.pays_actif?.nom ?? t('pays.consolide')}
        actions={
          peutCreer && (
            <Button variant="contained" onClick={() => setDialogue({ prospect: null })}>
              {t('prospect.nouveau')}
            </Button>
          )
        }
      />
      <BarreChiffres>
        <Chiffre
          libelle={t('prospect.chiffres.actifs')}
          valeur={s ? s.actifs : <Skeleton width={40} />}
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
        <Chiffre
          libelle={delegue ? t('prospect.chiffres.mesAValider') : t('prospect.chiffres.aValider')}
          valeur={s ? delegue ? s.mes_a_valider : s.a_valider : <Skeleton width={40} />}
          ton="warning"
        />
        <Chiffre
          libelle={t('prospect.chiffres.potentielA')}
          valeur={s ? s.potentiels.A : <Skeleton width={40} />}
          ton="secondary"
        />
        <Chiffre
          libelle={t('prospect.chiffres.sansLieu')}
          valeur={s ? s.sans_lieu : <Skeleton width={40} />}
        />
      </BarreChiffres>
      {perimetre.actions.includes('prospects.creer') && !perimetre.pays_actif && (
        <Alert severity="info">{t('prospect.choisirPays')}</Alert>
      )}

      <Card sx={{ p: 1.5 }}>
        <Stack spacing={1.25}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.25}
            sx={{ alignItems: { md: 'center' } }}
          >
            <TextField
              size="small"
              type="search"
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
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Box sx={{ overflowX: 'auto', minWidth: 0, flexShrink: 1 }}>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={statut}
                  onChange={(_, valeur: FiltreStatut | null) =>
                    valeur && changer({ statut: valeur === 'tous' ? '' : valeur })
                  }
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
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                select
                size="small"
                value={f.tri || 'nom'}
                onChange={(e) => changer({ tri: e.target.value === 'nom' ? '' : e.target.value })}
                sx={{ minWidth: 0, flexGrow: { xs: 1, md: 0 }, width: { md: 150 } }}
                slotProps={{ htmlInput: { 'aria-label': t('recherche.trierPar') } }}
              >
                {TRIS.map((tri) => (
                  <MenuItem key={tri} value={tri}>
                    {t(`recherche.tris.${tri}`)}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant={panneau ? 'contained' : 'outlined'}
                onClick={() => setPanneau((v) => !v)}
                aria-expanded={panneau}
                sx={{ flex: 'none', minHeight: 40 }}
              >
                {puces.length
                  ? t('recherche.filtresN', { count: puces.length })
                  : t('recherche.filtres')}
              </Button>
            </Stack>
          </Stack>
          <Collapse in={panneau} unmountOnExit>
            <Box
              sx={{
                display: 'grid',
                gap: 1.25,
                pt: 0.5,
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' },
              }}
            >
              <ChoixFiltre
                libelle={t('prospect.champs.type')}
                vide={t('prospect.tousTypes')}
                valeur={f.type}
                options={types}
                changer={(v) => changer({ type: v, specialite: '' })}
              />
              <ChoixFiltre
                libelle={t('prospect.champs.specialite')}
                vide={t('recherche.toutes')}
                valeur={f.specialite}
                options={specialites.filter((x) => !f.type || x.parent === f.type)}
                changer={(v) => changer({ specialite: v })}
              />
              <ChoixFiltre
                libelle={t('prospect.champs.potentiel')}
                vide={t('prospect.tousPotentiels')}
                valeur={f.potentiel}
                options={POTENTIELS.map((p) => ({ id: p, libelle: t(`prospect.potentiels.${p}`) }))}
                changer={(v) => changer({ potentiel: v })}
              />
              <ChoixFiltre
                libelle={t('lieu.exercice')}
                vide={t('recherche.toutes')}
                valeur={f.activite}
                options={(['hospitalier', 'prive'] as const).map((a) => ({
                  id: a,
                  libelle: t(`lieu.exercices.${a}`),
                }))}
                changer={(v) => changer({ activite: v })}
              />
              <SelectSecteur
                secteurs={secteurs.data ?? []}
                valeur={f.secteur}
                changer={(v) => changer({ secteur: v, localite: '' })}
                libelle={t('etablissement.champs.secteur')}
                vide={t('etablissement.tousSecteurs')}
                taille="small"
              />
              <ChoixFiltre
                libelle={t('etablissement.champs.localite')}
                vide={t('recherche.toutes')}
                valeur={f.localite}
                options={
                  f.secteur
                    ? (secteurs.data?.find((x) => x.id === f.secteur)?.localites ?? [])
                    : localites
                }
                changer={(v) => changer({ localite: v })}
              />
              {perimetre.actions.includes('cibles.lire') && (
                <ChoixFiltre
                  libelle={t('recherche.delegue')}
                  vide={t('recherche.tousDelegues')}
                  valeur={f.poste}
                  options={(postes.data ?? []).map((x) => ({
                    id: x.id,
                    libelle: x.occupant ? `${x.occupant} · ${x.libelle}` : x.libelle,
                  }))}
                  changer={(v) => changer({ poste: v })}
                />
              )}
              <Stack spacing={0}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={f.sans_lieu === '1'}
                      onChange={(e) => changer({ sans_lieu: e.target.checked ? '1' : '' })}
                    />
                  }
                  label={t('prospect.chiffres.sansLieu')}
                />
                {terrain && (
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={f.portee === 'pays'}
                        onChange={(e) => changer({ portee: e.target.checked ? 'pays' : '' })}
                      />
                    }
                    label={t('recherche.toutLePays')}
                  />
                )}
              </Stack>
            </Box>
          </Collapse>
          <PucesFiltres
            puces={puces}
            retirer={(c) => changer({ [c]: '' })}
            effacer={() => {
              setSaisie('');
              effacer();
            }}
          />
        </Stack>
      </Card>
      {terrain && f.portee !== 'pays' && (
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: -1 }}>
          {t('recherche.perimetreAide')}
        </Typography>
      )}

      {liste.isError ? (
        <ErreurChargement erreur={liste.error} reessayer={() => void liste.refetch()} />
      ) : !liste.data ? (
        <Card aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Stack
              key={i}
              direction="row"
              spacing={2}
              sx={{ px: 2, py: 1.5, borderTop: i ? 1 : 0, borderColor: 'divider' }}
            >
              <Skeleton variant="rounded" width={20} height={20} />
              <Box sx={{ flexGrow: 1 }}>
                <Skeleton width="40%" />
                <Skeleton width="25%" />
              </Box>
            </Stack>
          ))}
        </Card>
      ) : (
        <>
          <BarrePagination
            total={liste.data.total}
            page={liste.data.page}
            taille={liste.data.taille}
            changer={(p) => changer({ page: p > 1 ? String(p) : '' })}
          />
          <Card sx={{ opacity: liste.isPlaceholderData ? 0.6 : 1, transition: 'opacity .2s' }}>
            {fiches.length === 0 ? (
              filtresActifs > 0 ? (
                <EtatVide titre={t('prospect.aucunResultat')} />
              ) : (
                <EtatVide titre={t('prospect.vide')} texte={t('prospect.videTexte')} />
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
                      gridTemplateColumns: { xs: 'auto 1fr auto', md: 'auto 2fr 1.2fr 110px' },
                      columnGap: 2,
                      alignItems: 'center',
                      px: 2,
                      py: 1,
                      minHeight: 56,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <PastillePotentiel potentiel={p.potentiel} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }} noWrap>
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
                        color: 'text.secondary',
                      }}
                      noWrap
                    >
                      {p.telephone_mobile || p.telephone_pro || p.numero_ordre}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        textAlign: 'right',
                        color: p.statut === 'a_valider' ? 'warning.main' : 'text.secondary',
                      }}
                    >
                      {p.statut !== 'actif' && t(`prospect.statuts.${p.statut}`)}
                    </Typography>
                  </ButtonBase>
                </Box>
              ))
            )}
          </Card>
          {liste.data.total > liste.data.taille && (
            <BarrePagination
              total={liste.data.total}
              page={liste.data.page}
              taille={liste.data.taille}
              changer={(p) => {
                changer({ page: p > 1 ? String(p) : '' });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}
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
