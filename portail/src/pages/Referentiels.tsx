import type {
  ListeReferentiel,
  Perimetre,
  Portefeuille,
  Produit,
  ValeurReferentiel,
} from '@innov/api-client';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import UnarchiveRounded from '@mui/icons-material/UnarchiveRounded';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import {
  BarreChiffres,
  Chiffre,
  EnTeteCarte,
  EnTetePage,
  EtatVide,
  Etiquette,
} from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

const LISTES: ListeReferentiel[] = [
  'type_prospect',
  'specialite',
  'grade',
  'type_etablissement',
  'classe_therapeutique',
  'motif_ecart',
];

type Onglet = 'produits' | 'portefeuilles' | 'listes';

/** Recherche insensible aux accents et à la casse. */
function normaliser(texte: string) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Teinte stable par classe thérapeutique : la même classe a la même couleur partout. */
function useReferentiel(cle: string) {
  const { client } = useSession();
  const r = client.referentiel;
  return {
    produits: useQuery({ queryKey: ['referentiel', cle, 'produits'], queryFn: r.produits }),
    portefeuilles: useQuery({
      queryKey: ['referentiel', cle, 'portefeuilles'],
      queryFn: r.portefeuilles,
    }),
    valeurs: useQuery({ queryKey: ['referentiel', cle, 'valeurs'], queryFn: () => r.valeurs() }),
  };
}

// --- Produits ----------------------------------------------------------------------------------

function DialogueProduit({
  produit,
  classes,
  portefeuilles,
  surFermer,
}: {
  produit: Produit | null;
  classes: ValeurReferentiel[];
  portefeuilles: Portefeuille[];
  surFermer: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [libelle, setLibelle] = useState(produit?.libelle ?? '');
  const [code, setCode] = useState('');
  const [classe, setClasse] = useState<string | null>(produit?.classe ?? null);
  const [reseaux, setReseaux] = useState<string[]>(produit?.reseaux.map((r) => r.id) ?? []);
  const options = portefeuilles.map((p) => p.reseau);
  return (
    <DialogueFormulaire
      ouvert
      titre={produit ? t('referentiel.produit.modifier') : t('referentiel.produit.nouveau')}
      invalide={!libelle.trim()}
      surFermer={surFermer}
      surValider={async () => {
        if (produit) {
          await client.referentiel.modifierProduit(produit.id, { libelle, classe, reseaux });
        } else {
          await client.referentiel.creerProduit({ libelle, code, classe, reseaux });
        }
        await requetes.invalidateQueries({ queryKey: ['referentiel'] });
      }}
    >
      <TextField
        label={t('referentiel.produit.libelle')}
        value={libelle}
        onChange={(e) => setLibelle(e.target.value)}
        required
        autoFocus
      />
      {!produit && (
        <TextField
          label={t('referentiel.produit.code')}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          helperText={t('referentiel.produit.codeAide')}
        />
      )}
      <TextField
        select
        label={t('referentiel.produit.classe')}
        value={classe ?? ''}
        onChange={(e) => setClasse(e.target.value || null)}
      >
        <MenuItem value="">
          <em>{t('referentiel.produit.sansClasse')}</em>
        </MenuItem>
        {classes.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.libelle}
          </MenuItem>
        ))}
      </TextField>
      <Autocomplete
        multiple
        options={options}
        value={options.filter((o) => reseaux.includes(o.id))}
        onChange={(_, valeur) => setReseaux(valeur.map((v) => v.id))}
        getOptionLabel={(o) => o.libelle}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t('referentiel.produit.reseaux')}
            helperText={t('referentiel.produit.reseauxAide')}
          />
        )}
      />
    </DialogueFormulaire>
  );
}

function OngletProduits({
  produits,
  classes,
  portefeuilles,
  gerer,
}: {
  produits: Produit[];
  classes: ValeurReferentiel[];
  portefeuilles: Portefeuille[];
  gerer: boolean;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const [recherche, setRecherche] = useState('');
  const [classe, setClasse] = useState('');
  const [reseau, setReseau] = useState('');
  const [archives, setArchives] = useState(false);
  const [dialogue, setDialogue] = useState<{ produit: Produit | null } | null>(null);
  const [menu, setMenu] = useState<{ ancre: HTMLElement; produit: Produit } | null>(null);

  const visibles = useMemo(() => {
    const q = normaliser(recherche.trim());
    return produits.filter(
      (p) =>
        (archives || !p.archive) &&
        (!classe || p.classe === classe) &&
        (!reseau || p.reseaux.some((r) => r.id === reseau)) &&
        (!q || normaliser(`${p.libelle} ${p.code}`).includes(q)),
    );
  }, [produits, recherche, classe, reseau, archives]);

  const basculerArchive = async (produit: Produit) => {
    setMenu(null);
    try {
      if (produit.archive) await client.referentiel.reactiver('produits', produit.id);
      else await client.referentiel.archiver('produits', produit.id);
      notifier(t('commun.enregistre'));
      await requetes.invalidateQueries({ queryKey: ['referentiel'] });
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
        <TextField
          size="small"
          placeholder={t('referentiel.produit.rechercher')}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          sx={{ flexGrow: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            },
            htmlInput: { 'aria-label': t('referentiel.produit.rechercher') },
          }}
        />
        <TextField
          select
          size="small"
          value={classe}
          onChange={(e) => setClasse(e.target.value)}
          sx={{ minWidth: 200 }}
          slotProps={{
            select: { displayEmpty: true },
            htmlInput: { 'aria-label': t('referentiel.produit.classe') },
          }}
        >
          <MenuItem value="">{t('referentiel.produit.toutesClasses')}</MenuItem>
          {classes.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.libelle}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={reseau}
          onChange={(e) => setReseau(e.target.value)}
          sx={{ minWidth: 200 }}
          slotProps={{
            select: { displayEmpty: true },
            htmlInput: { 'aria-label': t('referentiel.produit.reseaux') },
          }}
        >
          <MenuItem value="">{t('referentiel.produit.tousReseaux')}</MenuItem>
          {portefeuilles.map((p) => (
            <MenuItem key={p.reseau.id} value={p.reseau.id}>
              {p.reseau.libelle}
            </MenuItem>
          ))}
        </TextField>
        {gerer && (
          <Button
            variant="contained"
            onClick={() => setDialogue({ produit: null })}
            sx={{ flex: 'none' }}
          >
            {t('referentiel.produit.nouveau')}
          </Button>
        )}
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('referentiel.produit.nombre', { count: visibles.length })}
        </Typography>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={archives}
              onChange={(e) => setArchives(e.target.checked)}
            />
          }
          label={<Typography variant="body2">{t('referentiel.produit.archives')}</Typography>}
        />
      </Stack>

      <Card>
        {produits.length === 0 ? (
          <EtatVide
            titre={t('referentiel.produit.vide')}
            texte={t('referentiel.produit.videTexte')}
          />
        ) : visibles.length === 0 ? (
          <EtatVide titre={t('referentiel.produit.aucunResultat')} />
        ) : (
          visibles.map((p, i) => (
            <Box key={p.id}>
              {i > 0 && <Divider />}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr auto',
                    md: 'minmax(220px, 2fr) 1.2fr 2.5fr auto',
                  },
                  gap: { xs: 1, md: 2 },
                  alignItems: 'center',
                  px: 2,
                  py: 1,
                  minHeight: 56,
                  opacity: p.archive ? 0.55 : 1,
                }}
              >
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }} noWrap>
                      {p.libelle}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontFamily: 'monospace' }}
                    >
                      {p.code}
                      {p.archive && ` · ${t('referentiel.valeur.archivee')}`}
                    </Typography>
                  </Box>
                </Stack>
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  {p.classe_libelle ? (
                    <Typography variant="body2">{p.classe_libelle}</Typography>
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                      {t('referentiel.produit.sansClasse')}
                    </Typography>
                  )}
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    display: { xs: 'none', md: 'block' },
                    color: p.reseaux.length ? 'text.secondary' : 'warning.main',
                  }}
                >
                  {p.reseaux.length === 0
                    ? t('referentiel.produit.aucunReseau')
                    : p.reseaux.map((r) => r.libelle).join(', ')}
                </Typography>
                {gerer ? (
                  <IconButton
                    aria-label={t('commun.actions')}
                    onClick={(e) => setMenu({ ancre: e.currentTarget, produit: p })}
                  >
                    <MoreVertRounded />
                  </IconButton>
                ) : (
                  <Box />
                )}
              </Box>
            </Box>
          ))
        )}
      </Card>

      <Menu anchorEl={menu?.ancre} open={menu !== null} onClose={() => setMenu(null)}>
        {menu && !menu.produit.archive && (
          <MenuItem
            onClick={() => {
              setDialogue({ produit: menu.produit });
              setMenu(null);
            }}
          >
            <ListItemIcon>
              <EditRounded fontSize="small" />
            </ListItemIcon>
            {t('referentiel.produit.modifier')}
          </MenuItem>
        )}
        {menu && (
          <MenuItem onClick={() => void basculerArchive(menu.produit)}>
            <ListItemIcon>
              {menu.produit.archive ? (
                <UnarchiveRounded fontSize="small" />
              ) : (
                <ArchiveRounded fontSize="small" />
              )}
            </ListItemIcon>
            {menu.produit.archive
              ? t('referentiel.valeur.reactiver')
              : t('referentiel.valeur.archiver')}
          </MenuItem>
        )}
      </Menu>
      {dialogue && (
        <DialogueProduit
          produit={dialogue.produit}
          classes={classes}
          portefeuilles={portefeuilles}
          surFermer={() => setDialogue(null)}
        />
      )}
    </Stack>
  );
}

// --- Portefeuilles (ORG-004) ---------------------------------------------------------------------

function DialoguePortefeuille({
  portefeuille,
  produits,
  surFermer,
}: {
  portefeuille: Portefeuille;
  produits: Produit[];
  surFermer: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [choisis, setChoisis] = useState(() => new Set(portefeuille.produits.map((p) => p.id)));
  const [recherche, setRecherche] = useState('');
  const actifs = produits.filter((p) => !p.archive);
  const q = normaliser(recherche.trim());
  // Regroupés par classe : un réseau porte souvent une ou deux classes entières.
  const groupes = useMemo(() => {
    const parClasse = new Map<string, Produit[]>();
    for (const p of actifs) {
      if (q && !normaliser(`${p.libelle} ${p.code}`).includes(q)) continue;
      const cle = p.classe_libelle ?? '';
      parClasse.set(cle, [...(parClasse.get(cle) ?? []), p]);
    }
    return [...parClasse.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [actifs, q]);
  const basculer = (id: string) =>
    setChoisis((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });
  return (
    <DialogueFormulaire
      ouvert
      titre={t('referentiel.portefeuille.titreDialogue', { reseau: portefeuille.reseau.libelle })}
      aide={t('referentiel.portefeuille.aide')}
      surFermer={surFermer}
      surValider={async () => {
        await client.referentiel.definirPortefeuille(portefeuille.reseau.id, [...choisis]);
        await requetes.invalidateQueries({ queryKey: ['referentiel'] });
      }}
    >
      <Stack spacing={1}>
        <TextField
          size="small"
          placeholder={t('referentiel.produit.rechercher')}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          sx={{ flexGrow: 1 }}
          slotProps={{ htmlInput: { 'aria-label': t('referentiel.produit.rechercher') } }}
        />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {t('referentiel.portefeuille.selection', { count: choisis.size })}
        </Typography>
      </Stack>
      <Box sx={{ maxHeight: 380, overflowY: 'auto', mx: -1 }}>
        {groupes.map(([classe, liste]) => (
          <Box key={classe} sx={{ mb: 1 }}>
            <Typography
              variant="overline"
              sx={{ px: 1, color: 'text.secondary' }}
            >
              {classe || t('referentiel.produit.sansClasse')}
            </Typography>
            {liste.map((p) => (
              <FormControlLabel
                key={p.id}
                sx={{
                  display: 'flex',
                  mx: 0,
                  px: 1,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                control={
                  <Checkbox
                    size="small"
                    checked={choisis.has(p.id)}
                    onChange={() => basculer(p.id)}
                  />
                }
                label={
                  <Typography variant="body2">
                    {p.libelle}{' '}
                    <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>
                      {p.code}
                    </Typography>
                  </Typography>
                }
              />
            ))}
          </Box>
        ))}
      </Box>
    </DialogueFormulaire>
  );
}

function OngletPortefeuilles({
  portefeuilles,
  produits,
  gerer,
}: {
  portefeuilles: Portefeuille[];
  produits: Produit[];
  gerer: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [ouvert, setOuvert] = useState<Portefeuille | null>(null);
  if (portefeuilles.length === 0) {
    return (
      <Card>
        <EtatVide
          titre={t('referentiel.portefeuille.aucunReseau')}
          texte={t('referentiel.portefeuille.aucunReseauTexte')}
        />
      </Card>
    );
  }
  const divisions = [...new Set(portefeuilles.map((p) => p.division))];
  const max = Math.max(25, ...portefeuilles.map((p) => p.produits.length));
  return (
    <Stack spacing={3}>
      {divisions.map((division) => (
        <Box key={division}>
          <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            {division}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr' },
            }}
          >
            {portefeuilles
              .filter((p) => p.division === division)
              .map((p) => {
                const n = p.produits.length;
                const hors = n < 6 || n > 25;
                return (
                  <Card key={p.reseau.id} sx={{ display: 'flex', flexDirection: 'column' }}>
                    <EnTeteCarte
                      titre={p.reseau.libelle}
                      action={
                        <Etiquette ton={n === 0 ? 'warning' : 'neutre'}>
                          {n === 0
                            ? t('referentiel.portefeuille.vide')
                            : t('referentiel.produit.nombre', { count: n })}
                        </Etiquette>
                      }
                    />
                    <CardContent
                      sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flexGrow: 1 }}
                    >
                      <Tooltip title={t('referentiel.portefeuille.conseil')}>
                        <Box
                          role="img"
                          aria-label={t('referentiel.produit.nombre', { count: n })}
                          sx={{
                            height: 4,
                            bgcolor: 'divider',
                            overflow: 'hidden',
                          }}
                        >
                          <Box
                            sx={{
                              height: '100%',
                              width: `${(n / max) * 100}%`,
                              bgcolor: hors
                                ? theme.palette.warning.main
                                : theme.palette.primary.main,
                            }}
                          />
                        </Box>
                      </Tooltip>
                      {n === 0 ? (
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {t('referentiel.portefeuille.videTexte')}
                        </Typography>
                      ) : (
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {p.produits
                            .slice(0, 10)
                            .map((produit) => produit.libelle)
                            .join(', ')}
                          {n > 10 && ` · ${t('referentiel.portefeuille.plus', { count: n - 10 })}`}
                        </Typography>
                      )}
                      {gerer && (
                        <Button
                          size="small"
                          onClick={() => setOuvert(p)}
                          sx={{ alignSelf: 'flex-start', mt: 'auto' }}
                        >
                          {t('referentiel.portefeuille.gerer')}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </Box>
        </Box>
      ))}
      {ouvert && (
        <DialoguePortefeuille
          portefeuille={ouvert}
          produits={produits}
          surFermer={() => setOuvert(null)}
        />
      )}
    </Stack>
  );
}

// --- Listes de valeurs (PRP-001) ----------------------------------------------------------------

function OngletListes({ valeurs, gerer }: { valeurs: ValeurReferentiel[]; gerer: boolean }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const [liste, setListe] = useState<ListeReferentiel>('type_prospect');
  const [nouvelle, setNouvelle] = useState('');
  const [parent, setParent] = useState('');
  const [renommage, setRenommage] = useState<ValeurReferentiel | null>(null);
  const [libelle, setLibelle] = useState('');
  const elements = valeurs.filter((v) => v.liste === liste);
  const types = valeurs.filter((v) => v.liste === 'type_prospect' && !v.archive);
  const libelleParent = (id: string | null) => types.find((v) => v.id === id)?.libelle;

  const rafraichir = () => requetes.invalidateQueries({ queryKey: ['referentiel'] });
  const executer = async (action: () => Promise<unknown>) => {
    try {
      await action();
      notifier(t('commun.enregistre'));
      await rafraichir();
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    }
  };
  const ajouter = (e: FormEvent) => {
    e.preventDefault();
    if (!nouvelle.trim()) return;
    void executer(async () => {
      await client.referentiel.creerValeur({
        liste,
        libelle: nouvelle.trim(),
        parent: liste === 'specialite' && parent ? parent : null,
      });
      setNouvelle('');
    });
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', md: '280px 1fr' },
        alignItems: 'start',
      }}
    >
      <Card>
        <List disablePadding aria-label={t('referentiel.onglets.listes')}>
          {LISTES.map((code) => {
            const nombre = valeurs.filter((v) => v.liste === code && !v.archive).length;
            return (
              <ListItemButton key={code} selected={code === liste} onClick={() => setListe(code)}>
                <ListItemText
                  primary={t(`referentiel.listes.${code}`)}
                  slotProps={{ primary: { sx: { fontWeight: code === liste ? 700 : 500 } } }}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {nombre}
                </Typography>
              </ListItemButton>
            );
          })}
        </List>
      </Card>
      <Card>
        <EnTeteCarte
          titre={t(`referentiel.listes.${liste}`)}
        />
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t(`referentiel.aides.${liste}`)}
          </Typography>
          {gerer && (
            <Stack
              component="form"
              onSubmit={ajouter}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
            >
              <TextField
                size="small"
                label={t('referentiel.valeur.nouvelle')}
                value={nouvelle}
                onChange={(e) => setNouvelle(e.target.value)}
                sx={{ flexGrow: 1 }}
              />
              {liste === 'specialite' && (
                <TextField
                  select
                  size="small"
                  label={t('referentiel.valeur.parent')}
                  value={parent}
                  onChange={(e) => setParent(e.target.value)}
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="">{t('referentiel.valeur.tousTypes')}</MenuItem>
                  {types.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.libelle}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <Button
                type="submit"
                variant="contained"
                disabled={!nouvelle.trim()}
              >
                {t('referentiel.valeur.ajouter')}
              </Button>
            </Stack>
          )}
          <Box>
            {elements.length === 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
                {t('referentiel.valeur.vide')}
              </Typography>
            )}
            {elements.map((v, i) => (
              <Box key={v.id}>
                {i > 0 && <Divider />}
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{ alignItems: 'center', py: 1.1, opacity: v.archive ? 0.55 : 1 }}
                >
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 500 }} noWrap>
                      {v.libelle}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      <Box component="span" sx={{ fontFamily: 'monospace' }}>
                        {v.code}
                      </Box>
                      {v.utilisations > 0 &&
                        ` · ${t('referentiel.valeur.utilisee', { count: v.utilisations })}`}
                    </Typography>
                  </Box>
                  {v.parent && libelleParent(v.parent) && (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {libelleParent(v.parent)}
                    </Typography>
                  )}
                  {v.archive && <Etiquette>{t('referentiel.valeur.archivee')}</Etiquette>}
                  {gerer && !v.archive && (
                    <Tooltip title={t('referentiel.valeur.renommer')}>
                      <IconButton
                        size="small"
                        aria-label={`${t('referentiel.valeur.renommer')} ${v.libelle}`}
                        onClick={() => {
                          setRenommage(v);
                          setLibelle(v.libelle);
                        }}
                      >
                        <EditRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {gerer && (
                    <Tooltip
                      title={
                        v.archive
                          ? t('referentiel.valeur.reactiver')
                          : t('referentiel.valeur.archiverAide')
                      }
                    >
                      <IconButton
                        size="small"
                        aria-label={`${v.archive ? t('referentiel.valeur.reactiver') : t('referentiel.valeur.archiver')} ${v.libelle}`}
                        onClick={() =>
                          void executer(() =>
                            v.archive
                              ? client.referentiel.reactiver('valeurs', v.id)
                              : client.referentiel.archiver('valeurs', v.id),
                          )
                        }
                      >
                        {v.archive ? (
                          <UnarchiveRounded fontSize="small" />
                        ) : (
                          <ArchiveRounded fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
      {renommage && (
        <DialogueFormulaire
          ouvert
          titre={t('referentiel.valeur.renommer')}
          invalide={!libelle.trim()}
          surFermer={() => setRenommage(null)}
          surValider={async () => {
            await client.referentiel.modifierValeur(renommage.id, { libelle });
            await rafraichir();
          }}
        >
          <TextField
            label={t('referentiel.valeur.libelle')}
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            autoFocus
            required
          />
        </DialogueFormulaire>
      )}
    </Box>
  );
}

// --- Page ----------------------------------------------------------------------------------------

/** Référentiels du pays (PRP-001) et portefeuilles de produits des réseaux (ORG-004). */
export default function Referentiels({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const peutGerer = perimetre.actions.includes('referentiels.gerer');
  const gerer = peutGerer && perimetre.pays_actif !== null;
  const { produits, portefeuilles, valeurs } = useReferentiel(cle);
  const [onglet, setOnglet] = useState<Onglet>('produits');

  const listeProduits = produits.data ?? [];
  const listePortefeuilles = portefeuilles.data ?? [];
  const listeValeurs = valeurs.data ?? [];
  const classes = listeValeurs.filter((v) => v.liste === 'classe_therapeutique' && !v.archive);
  const actifs = listeProduits.filter((p) => !p.archive);
  const couverts = listePortefeuilles.filter((p) => p.produits.length > 0).length;
  const charge = produits.data && portefeuilles.data && valeurs.data;
  const erreur = [produits, portefeuilles, valeurs].find((q) => q.isError);

  return (
    <Stack spacing={3}>
      <EnTetePage
        titre={t('referentiel.titre')}
        sousTitre={perimetre.pays_actif?.nom ?? t('pays.consolide')}
      />
      <BarreChiffres>
        <Chiffre
          libelle={t('referentiel.chiffres.produits')}
          valeur={charge ? actifs.length : <Skeleton width={40} />}
        />
        <Chiffre
          libelle={t('referentiel.chiffres.classes')}
          valeur={charge ? classes.length : <Skeleton width={40} />}
        />
        <Chiffre
          libelle={t('referentiel.chiffres.reseauxCouverts')}
          valeur={charge ? couverts : <Skeleton width={40} />}
          ton={charge && couverts < listePortefeuilles.length ? 'warning' : 'neutre'}
          detail={
            charge
              ? t('referentiel.chiffres.surTotal', { total: listePortefeuilles.length })
              : undefined
          }
        />
        <Chiffre
          libelle={t('referentiel.chiffres.multiReseaux')}
          valeur={
            charge ? actifs.filter((p) => p.reseaux.length > 1).length : <Skeleton width={40} />
          }
        />
      </BarreChiffres>

      {peutGerer && !gerer && <Alert severity="info">{t('referentiel.choisirPays')}</Alert>}
      {!peutGerer && <Alert severity="info">{t('referentiel.lectureSeule')}</Alert>}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={onglet}
          onChange={(_, valeur: Onglet) => setOnglet(valeur)}
          textColor="inherit"
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {(['produits', 'portefeuilles', 'listes'] as const).map((valeur) => (
            <Tab key={valeur} value={valeur} label={t(`referentiel.onglets.${valeur}`)} />
          ))}
        </Tabs>
      </Box>

      {erreur ? (
        <ErreurChargement erreur={erreur.error} reessayer={() => void erreur.refetch()} />
      ) : !charge ? (
        <Card aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} sx={{ px: 2, py: 1.5, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
              <Skeleton width="35%" />
              <Skeleton width="20%" />
            </Box>
          ))}
        </Card>
      ) : onglet === 'produits' ? (
        <OngletProduits
          produits={listeProduits}
          classes={classes}
          portefeuilles={listePortefeuilles}
          gerer={gerer}
        />
      ) : onglet === 'portefeuilles' ? (
        <OngletPortefeuilles
          portefeuilles={listePortefeuilles}
          produits={listeProduits}
          gerer={gerer}
        />
      ) : (
        <OngletListes valeurs={listeValeurs} gerer={gerer} />
      )}
    </Stack>
  );
}
