import type { EvenementJournal, FiltresJournal, Perimetre } from '@innov/api-client';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Box,
  ButtonBase,
  Card,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EnTetePage, EtatVide, Etiquette, Ligne } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { BarrePagination } from '../composants/Recherche';
import { useSession } from '../contexteSession';

const TAILLE = 30;

function quand(iso: string, langue: string) {
  return new Date(iso).toLocaleString(langue, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Libellé lisible d'une famille d'actions ; le code reste affiché pour la recherche exacte. */
function useFamille() {
  const { t, i18n } = useTranslation();
  return (famille: string) =>
    i18n.exists(`audit.familles.${famille}`) ? t(`audit.familles.${famille}`) : famille;
}

function Detail({ evenement, surFermer }: { evenement: EvenementJournal; surFermer: () => void }) {
  const { t, i18n } = useTranslation();
  const famille = useFamille();
  const aucun = <Typography sx={{ color: 'text.disabled' }}>—</Typography>;
  const valeur = (v: unknown) =>
    typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
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
      <Stack direction="row" sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h4" component="h2" sx={{ wordBreak: 'break-word' }}>
            {evenement.action}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {famille(evenement.famille)} · {quand(evenement.le, i18n.language)}
          </Typography>
        </Box>
        <IconButton aria-label={t('commun.fermer')} onClick={surFermer}>
          <CloseRounded />
        </IconButton>
      </Stack>
      <Box>
        <Ligne
          libelle={t('audit.colonnes.resultat')}
          valeur={
            <Etiquette ton={evenement.resultat === 'echec' ? 'error' : 'success'}>
              {t(`audit.resultats.${evenement.resultat}`)}
            </Etiquette>
          }
        />
        <Ligne
          libelle={t('audit.colonnes.acteur')}
          valeur={
            evenement.acteur
              ? [evenement.acteur_nom, evenement.acteur].filter(Boolean).join(' · ')
              : t('audit.systeme')
          }
        />
        <Ligne
          libelle={t('audit.colonnes.roles')}
          valeur={evenement.roles.length ? evenement.roles.join(', ') : aucun}
        />
        <Ligne libelle={t('audit.colonnes.pays')} valeur={evenement.pays ?? t('audit.siege')} />
        <Ligne
          libelle={t('audit.colonnes.objet')}
          valeur={
            evenement.objet_id ? (
              <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {evenement.objet_type} · {evenement.objet_id}
              </Typography>
            ) : (
              aucun
            )
          }
        />
        <Ligne libelle={t('audit.colonnes.client')} valeur={evenement.client ?? aucun} />
        <Ligne libelle={t('audit.colonnes.adresse')} valeur={evenement.adresse ?? aucun} />
        <Ligne libelle={t('audit.colonnes.reference')} valeur={evenement.reference ?? aucun} />
      </Box>
      <Box>
        <Typography variant="subtitle2" component="h3" sx={{ mb: 0.75 }}>
          {t('audit.details')}
        </Typography>
        {Object.keys(evenement.details).length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('audit.sansDetails')}
          </Typography>
        ) : (
          Object.entries(evenement.details).map(([cle, v]) => (
            <Ligne
              key={cle}
              libelle={cle}
              valeur={
                <Typography variant="body2" sx={{ wordBreak: 'break-word', textAlign: 'right' }}>
                  {valeur(v)}
                </Typography>
              }
            />
          ))
        )}
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {t('audit.immuable')}
      </Typography>
    </Box>
  );
}

/**
 * AUD-002 : le journal d'audit, du plus récent au plus ancien. Le siège voit tous les pays
 * (ou le pays choisi) ; le responsable et l'administrateur pays, le leur seulement.
 */
export default function JournalAudit({ perimetre }: { perimetre: Perimetre }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const famille = useFamille();
  const [saisie, setSaisie] = useState('');
  const [q, setQ] = useState('');
  const [filtres, setFiltres] = useState<{
    famille: string;
    resultat: string;
    du: string;
    au: string;
  }>({ famille: '', resultat: '', du: '', au: '' });
  const [page, setPage] = useState(1);
  const [ouvert, setOuvert] = useState<EvenementJournal | null>(null);

  useEffect(() => {
    const minuteur = setTimeout(() => setQ(saisie), 300);
    return () => clearTimeout(minuteur);
  }, [saisie]);

  const demande: FiltresJournal = {
    q: q || undefined,
    famille: filtres.famille || undefined,
    resultat: (filtres.resultat || undefined) as FiltresJournal['resultat'],
    du: filtres.du || undefined,
    au: filtres.au || undefined,
    page,
    taille: TAILLE,
  };
  const journal = useQuery({
    queryKey: ['audit', perimetre.pays_actif?.code ?? 'siege', demande],
    queryFn: () => client.audit.journal(demande),
    placeholderData: (precedent) => precedent,
  });
  const changer = (cle: keyof typeof filtres, valeur: string) => {
    setFiltres((f) => ({ ...f, [cle]: valeur }));
    setPage(1);
  };
  const donnees = journal.data;

  return (
    <Stack spacing={2}>
      <EnTetePage
        titre={t('audit.titre')}
        sousTitre={perimetre.pays_actif?.nom ?? t('pays.consolide')}
      />
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1 }}>
        {t('audit.introduction')}
      </Typography>
      <Card sx={{ p: 1.5 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 1.25,
            gridTemplateColumns: { xs: '1fr 1fr', md: '2fr repeat(4, minmax(0, 1fr))' },
          }}
        >
          <TextField
            size="small"
            type="search"
            placeholder={t('audit.rechercher')}
            value={saisie}
            onChange={(e) => {
              setSaisie(e.target.value);
              setPage(1);
            }}
            sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded fontSize="small" />
                  </InputAdornment>
                ),
              },
              htmlInput: { 'aria-label': t('audit.rechercher') },
            }}
          />
          <TextField
            select
            size="small"
            value={filtres.famille}
            onChange={(e) => changer('famille', e.target.value)}
            slotProps={{
              select: { displayEmpty: true },
              htmlInput: { 'aria-label': t('audit.colonnes.famille') },
            }}
          >
            <MenuItem value="">{t('audit.toutesFamilles')}</MenuItem>
            {(donnees?.familles ?? []).map((f) => (
              <MenuItem key={f} value={f}>
                {famille(f)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            value={filtres.resultat}
            onChange={(e) => changer('resultat', e.target.value)}
            slotProps={{
              select: { displayEmpty: true },
              htmlInput: { 'aria-label': t('audit.colonnes.resultat') },
            }}
          >
            <MenuItem value="">{t('audit.tousResultats')}</MenuItem>
            <MenuItem value="succes">{t('audit.resultats.succes')}</MenuItem>
            <MenuItem value="echec">{t('audit.resultats.echec')}</MenuItem>
          </TextField>
          <TextField
            size="small"
            type="date"
            label={t('audit.du')}
            value={filtres.du}
            onChange={(e) => changer('du', e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            type="date"
            label={t('audit.au')}
            value={filtres.au}
            onChange={(e) => changer('au', e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
      </Card>

      {journal.isError ? (
        <ErreurChargement erreur={journal.error} reessayer={() => void journal.refetch()} />
      ) : !donnees ? (
        <Card aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height={52} sx={{ m: 1 }} />
          ))}
        </Card>
      ) : donnees.resultats.length === 0 ? (
        <Card>
          <EtatVide titre={t('audit.vide')} texte={t('audit.videTexte')} />
        </Card>
      ) : (
        <>
          <BarrePagination
            total={donnees.total}
            page={donnees.page}
            taille={TAILLE}
            changer={setPage}
          />
          <Card component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {donnees.resultats.map((e, i) => (
              <Box component="li" key={e.id}>
                {i > 0 && <Divider />}
                <ButtonBase
                  onClick={() => setOuvert(e)}
                  sx={{
                    width: '100%',
                    textAlign: 'left',
                    px: 2,
                    py: 1.25,
                    display: 'grid',
                    gap: { xs: 0.25, md: 2 },
                    alignItems: 'center',
                    gridTemplateColumns: {
                      xs: '1fr auto',
                      md: '170px minmax(0, 1.4fr) minmax(0, 1fr) 90px',
                    },
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ color: 'text.secondary', order: { xs: 3, md: 0 } }}
                  >
                    {quand(e.le, i18n.language)}
                    {perimetre.vue_consolidee && ` · ${e.pays ?? t('audit.siege')}`}
                  </Typography>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }} noWrap>
                      {famille(e.famille)}
                    </Typography>
                    <Typography
                      variant="caption"
                      noWrap
                      component="p"
                      sx={{ color: 'text.secondary', fontFamily: 'monospace' }}
                    >
                      {e.action}
                    </Typography>
                  </Box>
                  <Typography variant="body2" noWrap sx={{ display: { xs: 'none', md: 'block' } }}>
                    {e.acteur ? e.acteur_nom || e.acteur : t('audit.systeme')}
                  </Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Etiquette ton={e.resultat === 'echec' ? 'error' : 'success'}>
                      {t(`audit.resultats.${e.resultat}`)}
                    </Etiquette>
                  </Box>
                </ButtonBase>
              </Box>
            ))}
          </Card>
        </>
      )}
      <Drawer anchor="right" open={ouvert !== null} onClose={() => setOuvert(null)}>
        {ouvert && <Detail evenement={ouvert} surFermer={() => setOuvert(null)} />}
      </Drawer>
    </Stack>
  );
}
