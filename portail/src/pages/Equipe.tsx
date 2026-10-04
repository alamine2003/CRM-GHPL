import type {
  Affectation,
  Appareil,
  Perimetre,
  RoleAttribue,
  Utilisateur,
} from '@innov/api-client';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import { BarreChiffres, Chiffre, EnTetePage, EtatVide, Section } from '../composants/Elements';
import { aujourdhuiIso, dateCourte, depuis } from '../composants/formats';
import { ErreurChargement } from '../composants/Erreurs';
import { messageErreur, useSession } from '../contexteSession';

const ROLES_PAYS = ['responsable_pays', 'admin_pays', 'df', 'dm', 'superviseur', 'delegue'];
const ROLES_SIEGE = ['admin_siege', 'direction_siege', 'admin_technique'];
const ROLES_DU_SIEGE_SEULEMENT = ['responsable_pays', 'admin_pays', ...ROLES_SIEGE];

type Filtre = 'tous' | 'sansRole' | 'suspendus';

function Personne({
  compte,
  detail,
}: {
  compte: Pick<Utilisateur, 'prenom' | 'nom'>;
  detail: ReactNode;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600 }} noWrap>
        {compte.prenom} {compte.nom}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap component="p">
        {detail}
      </Typography>
    </Box>
  );
}

function PastillesRoles({ roles }: { roles: string[] }) {
  const { t } = useTranslation();
  if (!roles.length)
    return (
      <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 500 }}>
        {t('equipe.aucunRole')}
      </Typography>
    );
  return <Typography variant="body2">{roles.map((r) => t(`roles.${r}`)).join(', ')}</Typography>;
}

function Etat({ actif }: { actif: boolean }) {
  const { t } = useTranslation();
  return (
    <Typography
      variant="body2"
      sx={{ color: actif ? 'text.secondary' : 'error.main', fontWeight: actif ? 400 : 600 }}
    >
      {actif ? t('equipe.actif') : t('equipe.suspendu')}
    </Typography>
  );
}

// --- Fiche d'un compte ----------------------------------------------------------------------

function FicheCompte({
  compte,
  perimetre,
  surFermer,
}: {
  compte: Utilisateur;
  perimetre: Perimetre;
  surFermer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; texte: string } | null>(null);
  const [dialogue, setDialogue] = useState<'role' | 'affectation' | 'transfert' | null>(null);
  const gerer = perimetre.actions.includes('utilisateurs.gerer');
  const attribuer = perimetre.actions.includes('roles.attribuer');
  const designer = perimetre.actions.includes('pays.designer_responsables');
  const affecter = perimetre.actions.includes('affectations.gerer');
  const cle = ['equipe', perimetre.pays_actif?.code ?? 'consolide', compte.id];
  const roles = useQuery({
    queryKey: [...cle, 'roles'],
    queryFn: () => client.comptes.roles(compte.id),
  });
  const affectations = useQuery({
    queryKey: [...cle, 'affectations'],
    queryFn: () => client.comptes.affectations(compte.id),
    enabled: !compte.pays_principal ? false : true,
  });
  const transferts = useQuery({
    queryKey: [...cle, 'transferts'],
    queryFn: () => client.comptes.transferts(compte.id),
    enabled: Boolean(compte.pays_principal),
  });
  const rafraichir = () => requetes.invalidateQueries({ queryKey: ['equipe'] });

  async function agir(action: () => Promise<unknown>, succes?: string) {
    setMessage(null);
    try {
      await action();
      if (succes) setMessage({ type: 'success', texte: succes });
      await rafraichir();
    } catch (e) {
      setMessage({ type: 'error', texte: messageErreur(e, t('erreurs.reseau')) });
    }
  }

  const rolesPossibles = (compte.pays_principal ? ROLES_PAYS : ROLES_SIEGE).filter(
    (r) => designer || !ROLES_DU_SIEGE_SEULEMENT.includes(r),
  );
  const periode = (debut: string | undefined, fin?: string | null) =>
    fin
      ? t('equipe.fiche.periode', {
          debut: dateCourte(debut, i18n.language),
          fin: dateCourte(fin, i18n.language),
        })
      : t('equipe.fiche.depuis', { date: dateCourte(debut, i18n.language) });

  return (
    <Stack spacing={2} sx={{ p: 2, width: { xs: '100vw', sm: 440 }, maxWidth: '100vw' }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Personne
            compte={compte}
            detail={`${compte.identifiant} · ${compte.courriel || t('profil.nonRenseigne')}`}
          />
        </Box>
        <IconButton aria-label={t('commun.fermer')} onClick={surFermer}>
          <CloseRounded />
        </IconButton>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
        <Etat actif={compte.actif} />
        {compte.pays_principal && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            · {compte.pays_principal.nom}
          </Typography>
        )}
      </Stack>
      {message && <Alert severity={message.type}>{message.texte}</Alert>}
      {gerer && (
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          {compte.actif ? (
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={() => void agir(() => client.comptes.operation(compte.id, 'suspendre'))}
            >
              {t('equipe.fiche.suspendre')}
            </Button>
          ) : (
            <Button
              variant="outlined"
              size="small"
              onClick={() => void agir(() => client.comptes.operation(compte.id, 'reactiver'))}
            >
              {t('equipe.fiche.reactiver')}
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            onClick={() =>
              void agir(
                () => client.comptes.operation(compte.id, 'reinitialiser'),
                t('equipe.fiche.lienEnvoye'),
              )
            }
          >
            {t('equipe.fiche.reinitialiser')}
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() =>
              void agir(
                () => client.comptes.operation(compte.id, 'fermer_sessions'),
                t('equipe.fiche.sessionsFermees'),
              )
            }
          >
            {t('equipe.fiche.fermerSessions')}
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="warning"
            onClick={() =>
              void agir(
                () => client.comptes.operation(compte.id, 'reinitialiser_double_auth'),
                t('equipe.fiche.doubleAuthReinitialisee'),
              )
            }
          >
            {t('equipe.fiche.reinitialiserDoubleAuth')}
          </Button>
        </Stack>
      )}
      <Section
        titre={t('equipe.fiche.roles')}
        action={
          attribuer && (
            <Button size="small" onClick={() => setDialogue('role')}>
              {t('equipe.fiche.attribuer')}
            </Button>
          )
        }
      >
        {roles.isPending ? (
          <Skeleton height={40} />
        ) : (
          <Stack spacing={1}>
            {(roles.data ?? []).map((role: RoleAttribue) => (
              <Stack
                key={role.id}
                direction="row"
                sx={{ alignItems: 'center', gap: 1, opacity: role.actif ? 1 : 0.55 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {`${t(`roles.${role.role}`)}${role.pays ? ` · ${role.pays}` : ''}`}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', flexGrow: 1 }}>
                  {periode(role.debut, role.fin)}
                </Typography>
                {role.actif && attribuer && (
                  <Button
                    size="small"
                    color="error"
                    onClick={() => void agir(() => client.comptes.retirerRole(role.id))}
                  >
                    {t('equipe.fiche.retirer')}
                  </Button>
                )}
              </Stack>
            ))}
            {!roles.data?.length && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('equipe.aucunRole')}
              </Typography>
            )}
          </Stack>
        )}
      </Section>
      {compte.pays_principal && (
        <>
          <Section
            titre={t('equipe.fiche.affectations')}
            action={
              affecter && (
                <Button size="small" onClick={() => setDialogue('affectation')}>
                  {t('equipe.fiche.accorder')}
                </Button>
              )
            }
          >
            <Stack spacing={1}>
              {(affectations.data ?? []).map((a: Affectation) => (
                <Box key={a.id}>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0, opacity: a.active ? 1 : 0.6 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                        {a.pays} · {a.motif}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {periode(a.debut, a.fin)}
                      </Typography>
                    </Box>
                    {affecter && a.active && (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => void agir(() => client.comptes.terminerAffectation(a.id))}
                      >
                        {t('equipe.fiche.terminer')}
                      </Button>
                    )}
                  </Stack>
                </Box>
              ))}
              {affectations.isSuccess && !affectations.data.length && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('equipe.fiche.aucuneAffectation')}
                </Typography>
              )}
            </Stack>
          </Section>
          {(affecter || (transferts.data ?? []).length > 0) && (
            <>
              <Section
                titre={t('equipe.fiche.transferts')}
                action={
                  affecter && (
                    <Button size="small" onClick={() => setDialogue('transfert')}>
                      {t('equipe.fiche.transferer')}
                    </Button>
                  )
                }
              >
                <Stack spacing={0.75}>
                  {(transferts.data ?? []).map((tr) => (
                    <Typography key={tr.id} variant="body2">
                      {tr.pays_origine} → {tr.pays_destination} · {dateCourte(tr.le, i18n.language)}{' '}
                      ·{' '}
                      <Box component="span" sx={{ color: 'text.secondary' }}>
                        {tr.motif}
                      </Box>
                    </Typography>
                  ))}
                </Stack>
              </Section>
            </>
          )}
        </>
      )}

      {dialogue === 'role' && (
        <DialogueRole
          roles={rolesPossibles}
          surFermer={() => setDialogue(null)}
          surValider={(role) => client.comptes.attribuerRole(compte.id, role).then(rafraichir)}
        />
      )}
      {dialogue === 'affectation' && (
        <DialogueAffectation
          pays={perimetre.pays_accessibles.filter((p) => p.code !== compte.pays_principal?.code)}
          surFermer={() => setDialogue(null)}
          surValider={(a) => client.comptes.accorderAffectation(compte.id, a).then(rafraichir)}
        />
      )}
      {dialogue === 'transfert' && (
        <DialogueTransfert
          pays={perimetre.pays_accessibles.filter((p) => p.code !== compte.pays_principal?.code)}
          surFermer={() => setDialogue(null)}
          surValider={(pays, motif, role) =>
            client.comptes.transferer(compte.id, pays, motif, role).then(() => {
              void rafraichir();
              surFermer();
            })
          }
        />
      )}
    </Stack>
  );
}

function DialogueRole({
  roles,
  surFermer,
  surValider,
}: {
  roles: string[];
  surFermer: () => void;
  surValider: (role: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [role, setRole] = useState(roles[0] ?? '');
  return (
    <DialogueFormulaire
      ouvert
      titre={t('equipe.fiche.attribuer')}
      surFermer={surFermer}
      surValider={() => surValider(role)}
      invalide={!role}
    >
      <TextField
        select
        label={t('equipe.champs.role')}
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {roles.map((r) => (
          <MenuItem key={r} value={r}>
            {t(`roles.${r}`)}
          </MenuItem>
        ))}
      </TextField>
    </DialogueFormulaire>
  );
}

function DialogueAffectation({
  pays,
  surFermer,
  surValider,
}: {
  pays: { code: string; nom: string }[];
  surFermer: () => void;
  surValider: (a: {
    pays: string;
    role: string;
    motif: string;
    debut: string;
    fin: string | null;
  }) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState(pays[0]?.code ?? '');
  const [role, setRole] = useState('delegue');
  const [motif, setMotif] = useState('');
  const [debut, setDebut] = useState(aujourdhuiIso());
  const [fin, setFin] = useState('');
  return (
    <DialogueFormulaire
      ouvert
      titre={t('equipe.fiche.accorder')}
      surFermer={surFermer}
      invalide={!code || !motif.trim()}
      surValider={() => surValider({ pays: code, role, motif, debut, fin: fin || null })}
    >
      <TextField
        select
        label={t('equipe.champs.pays')}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      >
        {pays.map((p) => (
          <MenuItem key={p.code} value={p.code}>
            {p.nom}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label={t('equipe.champs.role')}
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {ROLES_PAYS.map((r) => (
          <MenuItem key={r} value={r}>
            {t(`roles.${r}`)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label={t('equipe.champs.motif')}
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        required
      />
      <Stack direction="row" spacing={1.5}>
        <TextField
          type="date"
          label={t('equipe.champs.debut')}
          value={debut}
          onChange={(e) => setDebut(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
        <TextField
          type="date"
          label={t('equipe.champs.fin')}
          value={fin}
          onChange={(e) => setFin(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
      </Stack>
    </DialogueFormulaire>
  );
}

function DialogueTransfert({
  pays,
  surFermer,
  surValider,
}: {
  pays: { code: string; nom: string }[];
  surFermer: () => void;
  surValider: (pays: string, motif: string, role?: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState(pays[0]?.code ?? '');
  const [role, setRole] = useState('');
  const [motif, setMotif] = useState('');
  return (
    <DialogueFormulaire
      ouvert
      titre={t('equipe.fiche.transferer')}
      aide={t('equipe.fiche.transfertAide')}
      libelleValider={t('commun.confirmer')}
      surFermer={surFermer}
      invalide={!code || !motif.trim()}
      surValider={() => surValider(code, motif, role || undefined)}
    >
      <TextField
        select
        label={t('equipe.champs.pays')}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      >
        {pays.map((p) => (
          <MenuItem key={p.code} value={p.code}>
            {p.nom}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label={t('equipe.champs.role')}
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        <MenuItem value="">—</MenuItem>
        {ROLES_PAYS.map((r) => (
          <MenuItem key={r} value={r}>
            {t(`roles.${r}`)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label={t('equipe.champs.motif')}
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        required
      />
    </DialogueFormulaire>
  );
}

function DialogueNouveauCompte({ surFermer }: { surFermer: () => void }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [courriel, setCourriel] = useState('');
  const [langue, setLangue] = useState<'fr' | 'en'>(i18n.language === 'en' ? 'en' : 'fr');
  const propose = `${prenom}.${nom}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z.]/g, '');
  return (
    <DialogueFormulaire
      ouvert
      titre={t('equipe.nouveauCompte')}
      aide={t('equipe.nouveauCompteAide')}
      libelleValider={t('commun.creer')}
      surFermer={surFermer}
      invalide={!prenom.trim() || !nom.trim()}
      surValider={async () => {
        await client.comptes.creer({
          identifiant: identifiant || propose,
          prenom,
          nom,
          courriel: courriel || undefined,
          langue,
        });
        await requetes.invalidateQueries({ queryKey: ['equipe'] });
      }}
    >
      <Stack direction="row" spacing={1.5}>
        <TextField
          label={t('equipe.champs.prenom')}
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          required
          fullWidth
          autoFocus
        />
        <TextField
          label={t('equipe.champs.nom')}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
          fullWidth
        />
      </Stack>
      <TextField
        label={t('equipe.champs.identifiant')}
        value={identifiant}
        placeholder={propose}
        onChange={(e) => setIdentifiant(e.target.value.toLowerCase())}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        type="email"
        label={t('equipe.champs.courriel')}
        value={courriel}
        onChange={(e) => setCourriel(e.target.value)}
      />
      <TextField
        select
        label={t('equipe.champs.langue')}
        value={langue}
        onChange={(e) => setLangue(e.target.value as 'fr' | 'en')}
      >
        <MenuItem value="fr">{t('commun.langues.fr')}</MenuItem>
        <MenuItem value="en">{t('commun.langues.en')}</MenuItem>
      </TextField>
    </DialogueFormulaire>
  );
}

// --- Listes ------------------------------------------------------------------------------------

function ListeComptes({
  comptes,
  consolide,
  ouvrir,
}: {
  comptes: Utilisateur[];
  consolide: boolean;
  ouvrir: (c: Utilisateur) => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const large = useMediaQuery(theme.breakpoints.up('lg'));
  const colonnes = consolide ? '1.6fr 1.6fr 0.8fr 1fr 0.7fr' : '1.6fr 1.8fr 1fr 0.7fr';
  if (!large) {
    return (
      <Card>
        {comptes.map((c, i) => (
          <Box
            key={c.id}
            component="button"
            onClick={() => ouvrir(c)}
            sx={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
              bgcolor: 'transparent',
              border: 0,
              borderTop: i ? 1 : 0,
              borderColor: 'divider',
              px: 2,
              py: 1.25,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
              <Personne compte={c} detail={c.identifiant} />
              <Etat actif={c.actif} />
            </Stack>
            <Box sx={{ mt: 0.5 }}>
              <PastillesRoles roles={c.roles} />
            </Box>
          </Box>
        ))}
      </Card>
    );
  }
  const enTete = consolide
    ? ['personne', 'roles', 'pays', 'connexion', 'etat']
    : ['personne', 'roles', 'connexion', 'etat'];
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
            {t(`equipe.colonnes.${c}`)}
          </Typography>
        ))}
      </Box>
      {comptes.map((c) => (
        <Box
          key={c.id}
          role="row"
          tabIndex={0}
          onClick={() => ouvrir(c)}
          onKeyDown={(e) => e.key === 'Enter' && ouvrir(c)}
          aria-label={`${c.prenom} ${c.nom}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: colonnes,
            gap: 2,
            px: 2,
            py: 1,
            minHeight: 52,
            alignItems: 'center',
            cursor: 'pointer',
            borderBottom: 1,
            borderColor: 'divider',
            '&:last-of-type': { borderBottom: 0 },
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Personne compte={c} detail={c.identifiant} />
          <PastillesRoles roles={c.roles} />
          {consolide && (
            <Typography variant="body2">{c.pays_principal?.code ?? t('session.siege')}</Typography>
          )}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {c.last_login ? depuis(c.last_login, i18n.language) : t('commun.jamais')}
          </Typography>
          <Etat actif={c.actif} />
        </Box>
      ))}
    </Card>
  );
}

function ListeAppareils({ appareils, revoquer }: { appareils: Appareil[]; revoquer: boolean }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [cible, setCible] = useState<Appareil | null>(null);
  if (!appareils.length) {
    return (
      <Card>
        <EtatVide titre={t('appareils.vide')} texte={t('appareils.videTexte')} />
      </Card>
    );
  }
  return (
    <Stack spacing={1.25}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('appareils.contactAide')}
      </Typography>
      <Card>
        {appareils.map((a, i) => (
          <Stack
            key={a.id}
            direction={{ xs: 'column', sm: 'row' }}
            spacing={{ xs: 1, sm: 2 }}
            sx={{
              px: 2,
              py: 1.25,
              alignItems: { sm: 'center' },
              borderTop: i ? 1 : 0,
              borderColor: 'divider',
              opacity: a.revoque ? 0.6 : 1,
            }}
          >
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography sx={{ fontWeight: 600 }} noWrap>
                {a.modele || a.plateforme_libelle}
                <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
                  {' · '}
                  {a.prenom} {a.nom}
                </Box>
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">
                {[
                  a.systeme || a.plateforme_libelle,
                  `v${a.version_app || '?'}`,
                  a.identifiant,
                ].join(' · ')}
                {' · '}
                <Tooltip title={dateCourte(a.dernier_contact, i18n.language)}>
                  <span>{depuis(a.dernier_contact, i18n.language)}</span>
                </Tooltip>
              </Typography>
            </Box>
            <Box sx={{ flex: 'none' }}>
              {a.revoque ? (
                <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
                  {t('appareils.revoqueLe', {
                    date: dateCourte(a.revoque_le, i18n.language),
                  })}
                </Typography>
              ) : (
                revoquer && (
                  <Button size="small" color="error" onClick={() => setCible(a)}>
                    {t('appareils.revoquer')}
                  </Button>
                )
              )}
            </Box>
          </Stack>
        ))}
      </Card>
      {cible && (
        <DialogueFormulaire
          ouvert
          titre={`${t('appareils.revoquer')} · ${cible.modele || cible.plateforme_libelle}`}
          aide={t('appareils.confirmer', { personne: `${cible.prenom} ${cible.nom}` })}
          libelleValider={t('appareils.revoquer')}
          surFermer={() => setCible(null)}
          surValider={async () => {
            await client.appareils.revoquer(cible.id);
            await requetes.invalidateQueries({ queryKey: ['equipe'] });
          }}
        />
      )}
    </Stack>
  );
}

// --- Page --------------------------------------------------------------------------------------

export default function Equipe({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const comptes = useQuery({
    queryKey: ['equipe', cle, 'comptes'],
    queryFn: () => client.utilisateurs(),
  });
  const appareils = useQuery({
    queryKey: ['equipe', cle, 'appareils'],
    queryFn: () => client.appareils.liste(),
  });
  const [onglet, setOnglet] = useState<'comptes' | 'appareils'>('comptes');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const gerer = perimetre.actions.includes('utilisateurs.gerer');
  const consolide = perimetre.pays_actif === null;

  const liste = useMemo(() => comptes.data ?? [], [comptes.data]);
  const visibles = useMemo(() => {
    const texte = recherche.trim().toLowerCase();
    return liste.filter((c) => {
      if (filtre === 'sansRole' && c.roles.length) return false;
      if (filtre === 'suspendus' && c.actif) return false;
      return !texte || `${c.prenom} ${c.nom} ${c.identifiant}`.toLowerCase().includes(texte);
    });
  }, [liste, filtre, recherche]);
  const compteOuvert = liste.find((c) => c.id === ouvert) ?? null;

  return (
    <Stack spacing={2}>
      <EnTetePage
        titre={t('equipe.titre')}
        sousTitre={perimetre.pays_actif?.nom ?? t('pays.consolide')}
        actions={
          gerer && (
            <Button variant="contained" onClick={() => setCreation(true)}>
              {t('equipe.nouveauCompte')}
            </Button>
          )
        }
      />
      <BarreChiffres>
        <Chiffre
          libelle={t('equipe.chiffres.comptes')}
          valeur={comptes.data ? liste.length : <Skeleton width={40} />}
          detail={
            comptes.data
              ? t('equipe.chiffres.actifs', { count: liste.filter((c) => c.actif).length })
              : undefined
          }
        />
        <Chiffre
          libelle={t('equipe.chiffres.sansRole')}
          valeur={
            comptes.data ? liste.filter((c) => !c.roles.length).length : <Skeleton width={40} />
          }
          ton="warning"
        />
        <Chiffre
          libelle={t('equipe.chiffres.suspendus')}
          valeur={comptes.data ? liste.filter((c) => !c.actif).length : <Skeleton width={40} />}
          ton="error"
        />
        <Chiffre
          libelle={t('equipe.chiffres.telephones')}
          valeur={
            appareils.data ? (
              appareils.data.filter((a) => !a.revoque).length
            ) : (
              <Skeleton width={40} />
            )
          }
        />
      </BarreChiffres>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={onglet} onChange={(_, v) => setOnglet(v)} textColor="inherit">
          <Tab value="comptes" label={t('equipe.onglets.comptes')} />
          <Tab value="appareils" label={t('equipe.onglets.appareils')} />
        </Tabs>
      </Box>

      {(onglet === 'comptes' ? comptes : appareils).isError ? (
        <ErreurChargement
          erreur={(onglet === 'comptes' ? comptes : appareils).error}
          reessayer={() => void (onglet === 'comptes' ? comptes : appareils).refetch()}
        />
      ) : onglet === 'comptes' ? (
        comptes.isPending ? (
          <Skeleton variant="rounded" height={200} />
        ) : (
          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.5}
              sx={{ alignItems: { md: 'center' } }}
            >
              <TextField
                size="small"
                placeholder={t('equipe.recherche')}
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
                onChange={(_, v: Filtre | null) => v && setFiltre(v)}
                sx={{ overflowX: 'auto', maxWidth: '100%' }}
              >
                {(['tous', 'sansRole', 'suspendus'] as const).map((f) => (
                  <ToggleButton key={f} value={f}>
                    {t(`equipe.filtres.${f}`)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>
            {visibles.length ? (
              <ListeComptes
                comptes={visibles}
                consolide={consolide}
                ouvrir={(c) => setOuvert(c.id)}
              />
            ) : (
              <Card>
                <EtatVide titre={t('equipe.vide')} />
              </Card>
            )}
          </Stack>
        )
      ) : appareils.isPending ? (
        <Skeleton variant="rounded" height={200} />
      ) : (
        <ListeAppareils
          appareils={appareils.data ?? []}
          revoquer={perimetre.actions.includes('appareils.revoquer')}
        />
      )}

      <Drawer anchor="right" open={compteOuvert !== null} onClose={() => setOuvert(null)}>
        {compteOuvert && (
          <FicheCompte
            key={compteOuvert.id}
            compte={compteOuvert}
            perimetre={perimetre}
            surFermer={() => setOuvert(null)}
          />
        )}
      </Drawer>
      {creation && <DialogueNouveauCompte surFermer={() => setCreation(false)} />}
    </Stack>
  );
}
