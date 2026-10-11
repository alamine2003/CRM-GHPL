import type {
  Perimetre,
  Personne,
  Poste,
  Reseau,
  Secteur,
  TypePoste,
  Utilisateur,
  Zone,
} from '@innov/api-client';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import PersonAddAltRounded from '@mui/icons-material/PersonAddAltRounded';
import PersonRemoveRounded from '@mui/icons-material/PersonRemoveRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import SupervisorAccountRounded from '@mui/icons-material/SupervisorAccountRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  InputAdornment,
  ListItemIcon,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import DialogueSecteur from '../composants/DialogueSecteur';
import { BarreChiffres, Chiffre, EnTeteCarte, EnTetePage, EtatVide } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useSession } from '../contexteSession';

const TYPES_POSTE: TypePoste[] = ['vm', 'vm_otc', 'kam', 'dermo'];

/** Requêtes de l'organisation, propres au pays actif. */
function useOrganisation(cle: string) {
  const { client } = useSession();
  const o = client.organisation;
  const options = <T,>(nom: string, fn: () => Promise<T>) => ({
    queryKey: ['organisation', cle, nom],
    queryFn: fn,
  });
  return {
    synthese: useQuery(options('synthese', o.synthese)),
    postes: useQuery(options('postes', o.postes)),
    zones: useQuery(options('zones', o.zones)),
    secteurs: useQuery(options('secteurs', o.secteurs)),
    divisions: useQuery(options('divisions', o.divisions)),
    reseaux: useQuery(options('reseaux', o.reseaux)),
  };
}

function nomComplet(p: Pick<Personne, 'prenom' | 'nom'>) {
  return `${p.prenom} ${p.nom}`;
}

function PersonneCourte({ personne }: { personne: Personne }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
        {nomComplet(personne)}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap component="p">
        {personne.identifiant}
      </Typography>
    </Box>
  );
}

/** Réseaux ou secteurs d'un poste : texte simple, séparé par des virgules. */
function Pastilles({
  elements,
  vide = '—',
}: {
  elements: { id: string; libelle: string }[];
  vide?: string;
}) {
  return (
    <Typography
      variant="body2"
      sx={{ color: elements.length ? 'text.primary' : 'text.disabled', minWidth: 0 }}
    >
      {elements.length ? elements.map((e) => e.libelle).join(', ') : vide}
    </Typography>
  );
}

// --- Dialogues ---------------------------------------------------------------------------------

type Dialogue =
  | { type: 'poste' }
  | { type: 'affecter' | 'rattacher'; poste: Poste }
  | { type: 'liberer'; poste: Poste }
  | { type: 'zone' }
  | { type: 'secteur'; zone: Zone }
  | { type: 'fiche-secteur'; secteur: Secteur }
  | { type: 'division' }
  | { type: 'reseau'; division: string };

function aujourdhui() {
  return new Date().toISOString().slice(0, 10);
}

function DialogueChoixPersonne({
  dialogue,
  personnes,
  surFermer,
  surValider,
}: {
  dialogue: { type: 'affecter' | 'rattacher'; poste: Poste };
  personnes: Utilisateur[];
  surFermer: () => void;
  surValider: (personne: string, debut: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [personne, setPersonne] = useState('');
  const [debut, setDebut] = useState(aujourdhui());
  const roles = dialogue.type === 'affecter' ? ['delegue', 'superviseur'] : ['superviseur', 'dm'];
  const candidats = personnes.filter((p) => p.actif && p.roles.some((r) => roles.includes(r)));
  return (
    <DialogueFormulaire
      ouvert
      titre={`${t(`organisation.actions.${dialogue.type}`)} · ${dialogue.poste.libelle}`}
      aide={t(`organisation.aides.${dialogue.type}`)}
      surFermer={surFermer}
      surValider={() => surValider(personne, debut)}
      invalide={!personne}
    >
      <TextField
        select
        label={t(
          dialogue.type === 'affecter'
            ? 'organisation.champs.personne'
            : 'organisation.champs.superviseur',
        )}
        value={personne}
        onChange={(e) => setPersonne(e.target.value)}
        required
      >
        {candidats.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.prenom} {p.nom} · {p.roles.map((r) => t(`roles.${r}`)).join(', ')}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        type="date"
        label={t('organisation.champs.debut')}
        value={debut}
        onChange={(e) => setDebut(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        required
      />
    </DialogueFormulaire>
  );
}

function DialogueNouveauPoste({
  reseaux,
  secteurs,
  surFermer,
}: {
  reseaux: Reseau[];
  secteurs: Secteur[];
  surFermer: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [libelle, setLibelle] = useState('');
  const [type, setType] = useState<TypePoste>('vm');
  const [choixReseaux, setChoixReseaux] = useState<string[]>([]);
  const [choixSecteurs, setChoixSecteurs] = useState<string[]>([]);
  const multiple = (valeurs: unknown) =>
    typeof valeurs === 'string' ? valeurs.split(',') : (valeurs as string[]);
  return (
    <DialogueFormulaire
      ouvert
      titre={t('organisation.actions.nouveauPoste')}
      libelleValider={t('commun.creer')}
      surFermer={surFermer}
      invalide={!libelle.trim()}
      surValider={() =>
        client.organisation.creerPoste({
          libelle,
          type_poste: type,
          reseaux: choixReseaux,
          secteurs: choixSecteurs,
        })
      }
    >
      <TextField
        label={t('organisation.champs.libelle')}
        value={libelle}
        onChange={(e) => setLibelle(e.target.value)}
        required
        autoFocus
      />
      <TextField
        select
        label={t('organisation.champs.type')}
        value={type}
        onChange={(e) => setType(e.target.value as TypePoste)}
      >
        {TYPES_POSTE.map((code) => (
          <MenuItem key={code} value={code}>
            {t(`organisation.typesPoste.${code}`)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label={t('organisation.champs.reseaux')}
        value={choixReseaux}
        onChange={(e) => setChoixReseaux(multiple(e.target.value))}
        slotProps={{ select: { multiple: true } }}
      >
        {reseaux
          .filter((r) => !r.archive)
          .map((r) => (
            <MenuItem key={r.id} value={r.id}>
              {r.libelle}
            </MenuItem>
          ))}
      </TextField>
      <TextField
        select
        label={t('organisation.champs.secteurs')}
        value={choixSecteurs}
        onChange={(e) => setChoixSecteurs(multiple(e.target.value))}
        slotProps={{ select: { multiple: true } }}
      >
        {secteurs
          .filter((s) => !s.archive)
          .map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.libelle} · {s.zone_libelle}
            </MenuItem>
          ))}
      </TextField>
    </DialogueFormulaire>
  );
}

function DialogueLibelle({
  titre,
  avecCode = false,
  surFermer,
  surValider,
}: {
  titre: string;
  avecCode?: boolean;
  surFermer: () => void;
  surValider: (libelle: string, code: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [libelle, setLibelle] = useState('');
  const [code, setCode] = useState('');
  return (
    <DialogueFormulaire
      ouvert
      titre={titre}
      libelleValider={t('commun.creer')}
      surFermer={surFermer}
      invalide={!libelle.trim() || (avecCode && !code.trim())}
      surValider={() => surValider(libelle, code)}
    >
      {avecCode && (
        <TextField
          label={t('organisation.champs.code')}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          autoFocus
        />
      )}
      <TextField
        label={t('organisation.champs.libelle')}
        value={libelle}
        onChange={(e) => setLibelle(e.target.value)}
        required
        autoFocus={!avecCode}
      />
    </DialogueFormulaire>
  );
}

// --- Postes ------------------------------------------------------------------------------------

type Filtre = 'tous' | 'vacants' | 'sansSuperviseur';

function MenuPoste({ poste, ouvrir }: { poste: Poste; ouvrir: (d: Dialogue) => void }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  const archiver = useMutation({
    mutationFn: () => client.organisation.archiver('postes', poste.id),
    onSettled: () => requetes.invalidateQueries({ queryKey: ['organisation'] }),
  });
  const choisir = (d: Dialogue) => {
    setAncre(null);
    ouvrir(d);
  };
  return (
    <>
      <IconButton
        aria-label={`${t('commun.actions')} · ${poste.libelle}`}
        onClick={(e) => setAncre(e.currentTarget)}
        size="small"
      >
        <MoreVertRounded fontSize="small" />
      </IconButton>
      <Menu anchorEl={ancre} open={Boolean(ancre)} onClose={() => setAncre(null)}>
        {poste.vacant ? (
          <MenuItem onClick={() => choisir({ type: 'affecter', poste })}>
            <ListItemIcon>
              <PersonAddAltRounded fontSize="small" />
            </ListItemIcon>
            {t('organisation.actions.affecter')}
          </MenuItem>
        ) : (
          <MenuItem onClick={() => choisir({ type: 'liberer', poste })}>
            <ListItemIcon>
              <PersonRemoveRounded fontSize="small" />
            </ListItemIcon>
            {t('organisation.actions.liberer')}
          </MenuItem>
        )}
        <MenuItem onClick={() => choisir({ type: 'rattacher', poste })}>
          <ListItemIcon>
            <SupervisorAccountRounded fontSize="small" />
          </ListItemIcon>
          {t('organisation.actions.rattacher')}
        </MenuItem>
        <MenuItem
          disabled={!poste.vacant}
          onClick={() => {
            setAncre(null);
            archiver.mutate();
          }}
        >
          <ListItemIcon>
            <ArchiveRounded fontSize="small" />
          </ListItemIcon>
          {t('organisation.actions.archiver')}
        </MenuItem>
      </Menu>
    </>
  );
}

function Occupant({ poste }: { poste: Poste }) {
  const { t } = useTranslation();
  return poste.occupant ? (
    <PersonneCourte personne={poste.occupant} />
  ) : (
    <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 600 }}>
      {t('organisation.vacant')}
    </Typography>
  );
}

function SuperviseurPoste({ poste }: { poste: Poste }) {
  const { t } = useTranslation();
  return poste.superviseur ? (
    <PersonneCourte personne={poste.superviseur} />
  ) : (
    <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 500 }}>
      {t('organisation.aucunSuperviseur')}
    </Typography>
  );
}

function TitrePoste({ poste }: { poste: Poste }) {
  const { t } = useTranslation();
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600 }}>{poste.libelle}</Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {t(`organisation.typesPoste.${poste.type_poste}`)}
        {poste.archive && ` · ${t('organisation.archive')}`}
      </Typography>
    </Box>
  );
}

function ListePostes({
  postes,
  gerer,
  ouvrir,
}: {
  postes: Poste[];
  gerer: boolean;
  ouvrir: (d: Dialogue) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const large = useMediaQuery(theme.breakpoints.up('lg'));
  const colonnes = gerer ? '1.5fr 1fr 1.1fr 1.1fr 1.1fr 40px' : '1.5fr 1fr 1.1fr 1.1fr 1.1fr';

  if (!large) {
    return (
      <Card>
        {postes.map((poste, i) => (
          <Box
            key={poste.id}
            sx={{
              px: 2,
              py: 1.5,
              borderTop: i ? 1 : 0,
              borderColor: 'divider',
              opacity: poste.archive ? 0.6 : 1,
            }}
          >
            <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1 }}>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <TitrePoste poste={poste} />
              </Box>
              {gerer && !poste.archive && <MenuPoste poste={poste} ouvrir={ouvrir} />}
            </Stack>
            <Box
              sx={{
                mt: 1,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1,
              }}
            >
              <Occupant poste={poste} />
              <SuperviseurPoste poste={poste} />
            </Box>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}
            >
              {[...poste.reseaux, ...poste.secteurs].map((e) => e.libelle).join(' · ')}
            </Typography>
          </Box>
        ))}
      </Card>
    );
  }

  const enTete = ['poste', 'reseaux', 'secteurs', 'occupant', 'superviseur'] as const;
  return (
    <Card>
      <Box
        role="row"
        sx={{
          display: 'grid',
          gridTemplateColumns: colonnes,
          gap: 2,
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {enTete.map((c) => (
          <Typography
            key={c}
            role="columnheader"
            variant="overline"
            sx={{ color: 'text.secondary' }}
          >
            {t(`organisation.colonnes.${c}`)}
          </Typography>
        ))}
      </Box>
      {postes.map((poste) => (
        <Box
          key={poste.id}
          role="row"
          sx={{
            display: 'grid',
            gridTemplateColumns: colonnes,
            gap: 2,
            px: 2,
            py: 1.25,
            alignItems: 'center',
            borderBottom: 1,
            borderColor: 'divider',
            opacity: poste.archive ? 0.55 : 1,
            '&:last-of-type': { borderBottom: 0 },
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <TitrePoste poste={poste} />
          <Pastilles elements={poste.reseaux} />
          <Pastilles elements={poste.secteurs} />
          <Occupant poste={poste} />
          <SuperviseurPoste poste={poste} />
          {gerer && <Box>{!poste.archive && <MenuPoste poste={poste} ouvrir={ouvrir} />}</Box>}
        </Box>
      ))}
    </Card>
  );
}

function OngletPostes({
  postes,
  gerer,
  ouvrir,
}: {
  postes: Poste[];
  gerer: boolean;
  ouvrir: (d: Dialogue) => void;
}) {
  const { t } = useTranslation();
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [recherche, setRecherche] = useState('');
  const visibles = useMemo(() => {
    const texte = recherche.trim().toLowerCase();
    return postes.filter((p) => {
      if (filtre === 'vacants' && !p.vacant) return false;
      if (filtre === 'sansSuperviseur' && p.superviseur) return false;
      if (!texte) return true;
      const champs = [
        p.libelle,
        p.occupant && nomComplet(p.occupant),
        p.superviseur && nomComplet(p.superviseur),
        ...p.secteurs.map((s) => s.libelle),
        ...p.reseaux.map((r) => r.libelle),
      ];
      return champs.some((c) => c?.toLowerCase().includes(texte));
    });
  }, [postes, filtre, recherche]);

  if (!postes.length) {
    return (
      <Card>
        <EtatVide
          titre={t('organisation.vides.postes')}
          texte={t('organisation.vides.postesTexte')}
          action={
            gerer && (
              <Button variant="contained" onClick={() => ouvrir({ type: 'poste' })}>
                {t('organisation.actions.nouveauPoste')}
              </Button>
            )
          }
        />
      </Card>
    );
  }
  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { md: 'center' } }}
      >
        <TextField
          size="small"
          placeholder={t('organisation.filtres.recherche')}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          sx={{ flexGrow: 1, maxWidth: { md: 420 } }}
          slotProps={{
            htmlInput: { 'aria-label': t('commun.rechercher') },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filtre}
          onChange={(_, valeur: Filtre | null) => valeur && setFiltre(valeur)}
          sx={{ overflowX: 'auto', maxWidth: '100%' }}
        >
          {(['tous', 'vacants', 'sansSuperviseur'] as const).map((f) => (
            <ToggleButton key={f} value={f}>
              {t(`organisation.filtres.${f}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>
      {visibles.length ? (
        <ListePostes postes={visibles} gerer={gerer} ouvrir={ouvrir} />
      ) : (
        <Card>
          <EtatVide titre={t('organisation.vides.filtre')} />
        </Card>
      )}
    </Stack>
  );
}

// --- Zones et réseaux ---------------------------------------------------------------------------

function CarteGroupe({
  titre,
  sousTitre,
  elements,
  action,
  surChoisir,
}: {
  titre: string;
  sousTitre: string;
  icone: ReactNode;
  elements: { id: string; libelle: string; archive: boolean }[];
  action?: ReactNode;
  /** Ouvre le détail d'un élément (ex. la fiche d'un secteur). */
  surChoisir?: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <EnTeteCarte
        titre={titre}
        action={
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {sousTitre}
          </Typography>
        }
      />
      <Box sx={{ p: 2 }}>
        <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          {elements.length === 0 && (
            <Typography variant="body2" sx={{ color: 'text.disabled' }}>
              {t('organisation.vides.secteurs')}
            </Typography>
          )}
          {elements.map((e) => (
            <Chip
              key={e.id}
              label={e.libelle}
              variant={e.archive ? 'outlined' : 'filled'}
              sx={e.archive ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
              title={e.archive ? t('organisation.archive') : undefined}
              onClick={surChoisir && !e.archive ? () => surChoisir(e.id) : undefined}
            />
          ))}
          {action}
        </Stack>
      </Box>
    </Card>
  );
}

function OngletZones({
  zones,
  secteurs,
  gerer,
  ouvrir,
}: {
  zones: Zone[];
  secteurs: Secteur[];
  gerer: boolean;
  ouvrir: (d: Dialogue) => void;
}) {
  const { t } = useTranslation();
  if (!zones.length) {
    return (
      <Card>
        <EtatVide
          titre={t('organisation.vides.zones')}
          texte={t('organisation.vides.zonesTexte')}
          action={
            gerer && (
              <Button variant="contained" onClick={() => ouvrir({ type: 'zone' })}>
                {t('organisation.actions.nouvelleZone')}
              </Button>
            )
          }
        />
      </Card>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      {zones.map((zone) => {
        const siens = secteurs.filter((s) => s.zone === zone.id);
        return (
          <CarteGroupe
            key={zone.id}
            titre={zone.libelle}
            sousTitre={`${siens.filter((s) => !s.archive).length} ${t('organisation.chiffres.secteurs').toLowerCase()}`}
            icone={<PlaceRounded />}
            elements={siens}
            surChoisir={(id) => {
              const secteur = siens.find((x) => x.id === id);
              if (secteur) ouvrir({ type: 'fiche-secteur', secteur });
            }}
            action={
              gerer &&
              !zone.archive && (
                <Button size="small" onClick={() => ouvrir({ type: 'secteur', zone })}>
                  {t('organisation.actions.nouveauSecteur')}
                </Button>
              )
            }
          />
        );
      })}
    </Box>
  );
}

function OngletReseaux({
  divisions,
  reseaux,
  gerer,
  ouvrir,
}: {
  divisions: { id: string; libelle: string; code: string; archive: boolean }[];
  reseaux: Reseau[];
  gerer: boolean;
  ouvrir: (d: Dialogue) => void;
}) {
  const { t } = useTranslation();
  if (!divisions.length) {
    return (
      <Card>
        <EtatVide
          titre={t('organisation.vides.reseaux')}
          texte={t('organisation.vides.reseauxTexte')}
          action={
            gerer && (
              <Button variant="contained" onClick={() => ouvrir({ type: 'division' })}>
                {t('organisation.actions.nouvelleDivision')}
              </Button>
            )
          }
        />
      </Card>
    );
  }
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      {divisions.map((division) => {
        const siens = reseaux.filter((r) => r.division === division.id);
        return (
          <CarteGroupe
            key={division.id}
            titre={`${division.libelle} · ${division.code}`}
            sousTitre={t('organisation.chiffres.reseaux', { count: siens.length })}
            icone={<HubRounded />}
            elements={siens}
            action={
              gerer &&
              !division.archive && (
                <Button
                  size="small"
                  onClick={() => ouvrir({ type: 'reseau', division: division.id })}
                >
                  {t('organisation.actions.nouveauReseau')}
                </Button>
              )
            }
          />
        );
      })}
    </Box>
  );
}

// --- Page --------------------------------------------------------------------------------------

type Onglet = 'postes' | 'zones' | 'reseaux';

export default function Organisation({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const donnees = useOrganisation(cle);
  const [onglet, setOnglet] = useState<Onglet>('postes');
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const gerer = perimetre.actions.includes('organisation.gerer') && perimetre.pays_actif !== null;
  const comptes = useQuery({
    queryKey: ['utilisateurs', cle],
    queryFn: () => client.utilisateurs(),
    enabled: gerer && (dialogue?.type === 'affecter' || dialogue?.type === 'rattacher'),
  });

  const fermer = () => {
    setDialogue(null);
    void requetes.invalidateQueries({ queryKey: ['organisation'] });
  };
  const o = client.organisation;
  const s = donnees.synthese.data;
  const taux = s && s.postes ? Math.round(((s.postes - s.postes_vacants) / s.postes) * 100) : 0;

  const boutonAjout: Record<Onglet, { libelle: string; dialogue: Dialogue }> = {
    postes: { libelle: t('organisation.actions.nouveauPoste'), dialogue: { type: 'poste' } },
    zones: { libelle: t('organisation.actions.nouvelleZone'), dialogue: { type: 'zone' } },
    reseaux: {
      libelle: t('organisation.actions.nouvelleDivision'),
      dialogue: { type: 'division' },
    },
  };

  const chargement =
    donnees.postes.isPending || donnees.zones.isPending || donnees.divisions.isPending;
  const erreur = [donnees.postes, donnees.zones, donnees.divisions].find((q) => q.isError);

  return (
    <Stack spacing={2}>
      <EnTetePage
        titre={t('organisation.titre')}
        sousTitre={perimetre.pays_actif?.nom ?? t('pays.consolide')}
        actions={
          gerer && (
            <Button variant="contained" onClick={() => setDialogue(boutonAjout[onglet].dialogue)}>
              {boutonAjout[onglet].libelle}
            </Button>
          )
        }
      />

      <BarreChiffres>
        <Chiffre
          libelle={t('organisation.chiffres.postes')}
          valeur={s ? s.postes : <Skeleton width={40} />}
          detail={s ? t('organisation.chiffres.occupes', { taux }) : undefined}
        />
        <Chiffre
          libelle={t('organisation.chiffres.vacants')}
          valeur={s ? s.postes_vacants : <Skeleton width={40} />}
          ton="warning"
        />
        <Chiffre
          libelle={t('organisation.chiffres.sansSuperviseur')}
          valeur={s ? s.postes_sans_superviseur : <Skeleton width={40} />}
          ton="error"
        />
        <Chiffre
          libelle={t('organisation.chiffres.secteurs')}
          valeur={s ? s.secteurs : <Skeleton width={40} />}
          detail={
            s
              ? `${t('organisation.chiffres.zones', { count: s.zones })} · ${t('organisation.chiffres.reseaux', { count: s.reseaux })}`
              : undefined
          }
        />
      </BarreChiffres>

      {!gerer && perimetre.actions.includes('organisation.gerer') && (
        <Alert severity="info">{t('organisation.choisirPays')}</Alert>
      )}
      {!perimetre.actions.includes('organisation.gerer') && (
        <Alert severity="info">{t('organisation.lectureSeule')}</Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={onglet}
          onChange={(_, valeur: Onglet) => setOnglet(valeur)}
          textColor="inherit"
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {(['postes', 'zones', 'reseaux'] as const).map((valeur) => (
            <Tab key={valeur} value={valeur} label={t(`organisation.onglets.${valeur}`)} />
          ))}
        </Tabs>
      </Box>

      {erreur ? (
        <ErreurChargement erreur={erreur.error} reessayer={() => void erreur.refetch()} />
      ) : chargement ? (
        <Card aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} sx={{ px: 2, py: 1.5, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
              <Skeleton width="35%" />
              <Skeleton width="20%" />
            </Box>
          ))}
        </Card>
      ) : onglet === 'postes' ? (
        <OngletPostes postes={donnees.postes.data ?? []} gerer={gerer} ouvrir={setDialogue} />
      ) : onglet === 'zones' ? (
        <OngletZones
          zones={donnees.zones.data ?? []}
          secteurs={donnees.secteurs.data ?? []}
          gerer={gerer}
          ouvrir={setDialogue}
        />
      ) : (
        <OngletReseaux
          divisions={donnees.divisions.data ?? []}
          reseaux={donnees.reseaux.data ?? []}
          gerer={gerer}
          ouvrir={setDialogue}
        />
      )}

      {dialogue?.type === 'poste' && (
        <DialogueNouveauPoste
          reseaux={donnees.reseaux.data ?? []}
          secteurs={donnees.secteurs.data ?? []}
          surFermer={fermer}
        />
      )}
      {(dialogue?.type === 'affecter' || dialogue?.type === 'rattacher') && (
        <DialogueChoixPersonne
          dialogue={dialogue}
          personnes={comptes.data ?? []}
          surFermer={fermer}
          surValider={(personne, debut) =>
            dialogue.type === 'affecter'
              ? o.occuper(dialogue.poste.id, personne, debut)
              : o.rattacher(dialogue.poste.id, personne, debut)
          }
        />
      )}
      {dialogue?.type === 'liberer' && (
        <DialogueFormulaire
          ouvert
          titre={`${t('organisation.actions.liberer')} · ${dialogue.poste.libelle}`}
          aide={t('organisation.aides.liberer', {
            personne: dialogue.poste.occupant ? nomComplet(dialogue.poste.occupant) : '',
          })}
          libelleValider={t('organisation.actions.liberer')}
          surFermer={fermer}
          surValider={async () => {
            const occupations = await o.occupations(dialogue.poste.id);
            const enCours = occupations.find((oc) => oc.actif);
            if (enCours) await o.terminerOccupation(enCours.id);
          }}
        />
      )}
      {dialogue?.type === 'zone' && (
        <DialogueLibelle
          titre={t('organisation.actions.nouvelleZone')}
          surFermer={fermer}
          surValider={(libelle) => o.creerZone(libelle)}
        />
      )}
      {dialogue?.type === 'secteur' && (
        <DialogueLibelle
          titre={`${t('organisation.actions.nouveauSecteur')} · ${dialogue.zone.libelle}`}
          surFermer={fermer}
          surValider={(libelle) => o.creerSecteur(dialogue.zone.id, libelle)}
        />
      )}
      {dialogue?.type === 'fiche-secteur' && (
        <DialogueSecteur
          secteur={dialogue.secteur}
          zones={donnees.zones.data ?? []}
          gerer={gerer}
          surFermer={fermer}
        />
      )}
      {dialogue?.type === 'division' && (
        <DialogueLibelle
          titre={t('organisation.actions.nouvelleDivision')}
          avecCode
          surFermer={fermer}
          surValider={(libelle, code) => o.creerDivision(code, libelle)}
        />
      )}
      {dialogue?.type === 'reseau' && (
        <DialogueLibelle
          titre={t('organisation.actions.nouveauReseau')}
          avecCode
          surFermer={fermer}
          surValider={(libelle, code) => o.creerReseau(dialogue.division, code, libelle)}
        />
      )}
    </Stack>
  );
}
