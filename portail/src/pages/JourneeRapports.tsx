import type { Journee, RapportLu, VisiteJournee } from '@innov/api-client';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Checkbox,
  FormControlLabel,
  FormGroup,
  TextField,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur } from 'react-router';
import { texteEcart } from '../composants/conformiteTextes';
import { EnTeteCarte, Etiquette } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

type Traduire = ReturnType<typeof useTranslation>['t'];

/**
 * Une journée d'un délégué, ouverte depuis « À traiter » (0.6.2) : ses contrôles, puis chaque
 * visite avec ce qui s'est passé et son rapport soumis, en entier — produits et retours,
 * remises, résultat, suite prévue, champs du pays, pièces jointes (RPT-007 CA2), retard et
 * horodatage douteux (RPT-010 CA1). Un brouillon reste au délégué : seul son état s'affiche.
 */
export default function JourneeRapports({ cle }: { cle: string }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const [delegue, date] = cle.split('/') as [string, string];
  const journee = useQuery({
    queryKey: ['rapports-journee', delegue, date],
    queryFn: () => client.rapports.journee(delegue, date),
  });
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const [confirmation, setConfirmation] = useState(false);
  const rafraichir = () =>
    Promise.all([
      requetes.invalidateQueries({ queryKey: ['rapports-journee', delegue, date] }),
      requetes.invalidateQueries({ queryKey: ['rapports-a-traiter'] }),
    ]);
  const jour = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`));
  const retour = (
    <Button component={LienRouteur} to="/a-traiter" startIcon={<ArrowBackRounded />}>
      {t('navigation.aTraiter')}
    </Button>
  );

  if (journee.isError) {
    return (
      <Stack spacing={2}>
        <Box>{retour}</Box>
        <ErreurChargement erreur={journee.error} reessayer={() => void journee.refetch()} />
      </Stack>
    );
  }
  if (!journee.data) {
    return (
      <Stack spacing={2}>
        <Box>{retour}</Box>
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={320} />
      </Stack>
    );
  }
  const j = journee.data;
  // RPT-014, RPT-016 : renvoyés pour correction ou rouverts, ils attendent le délégué.
  const renvoyes = j.visites.filter(
    (v) => v.rapport_statut === 'a_corriger' || v.rapport_statut === 'rouvert',
  ).length;
  // RPT-016 : le DM lit la journée pour en rouvrir un rapport, sans la valider.
  const consultation = j.mode === 'consultation';
  const conforme = j.classement === 'conforme';
  async function validerJournee() {
    setConfirmation(false);
    try {
      const r = await client.rapports.validerJournee(delegue, date);
      notifier(t('validationRapports.journeeFaite', { count: r.rapports }));
      await rafraichir();
    } catch (erreur) {
      notifier(messageErreur(erreur, t('erreurs.reseau')), 'error');
    }
  }
  return (
    <Stack spacing={2.5}>
      <Box sx={{ ml: -1 }}>{retour}</Box>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1">
            {j.delegue.prenom} {j.delegue.nom}
          </Typography>
          <Typography
            sx={{ color: 'text.secondary', '&::first-letter': { textTransform: 'uppercase' } }}
          >
            {jour}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {!consultation && (
            <Button variant="outlined" component={LienRouteur} to={`/validation/${j.planning}`}>
              {t('aTraiter.consulter')}
            </Button>
          )}
          {!j.fige && !consultation && (
            <Button
              variant="contained"
              disabled={j.rapports_manquants > 0}
              onClick={() => setConfirmation(true)}
            >
              {t('validationRapports.journee')}
            </Button>
          )}
        </Stack>
      </Stack>
      {j.fige ? (
        <Alert severity="success">{t('validationRapports.journeeValidee')}</Alert>
      ) : j.rapports_manquants > 0 ? (
        <Alert severity="info">
          {/* Un rapport renvoyé au délégué a été soumis : il attend sa nouvelle version. */}
          {renvoyes === j.rapports_manquants
            ? t('validationRapports.renvoyes', { count: renvoyes })
            : t('validationRapports.manquants', { count: j.rapports_manquants })}
        </Alert>
      ) : null}
      {j.mode !== 'direct' && (
        <Alert severity="info">{t(`validationRapports.titres.${j.mode}`)}</Alert>
      )}
      <Dialog open={confirmation} onClose={() => setConfirmation(false)}>
        <DialogTitle>{t('validationRapports.confirmerJournee')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('validationRapports.confirmerJourneeTexte', {
              count: j.visites.filter((v) => v.rapport?.statut === 'soumis').length,
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(false)}>{t('commun.annuler')}</Button>
          <Button variant="contained" onClick={() => void validerJournee()}>
            {t('validationRapports.journee')}
          </Button>
        </DialogActions>
      </Dialog>

      <Card component="section" aria-labelledby="controles-journee">
        <Box sx={{ px: 2, py: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {conforme ? (
              <CheckCircleRounded sx={{ color: 'success.main', fontSize: 20 }} />
            ) : (
              <ErrorOutlineRounded sx={{ color: 'warning.main', fontSize: 20 }} />
            )}
            <Typography id="controles-journee" variant="h6" component="h2">
              {t('journee.controles')}
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: conforme ? 'success.main' : 'warning.main' }}
            >
              {conforme
                ? t('conformite.conforme')
                : t('conformite.aVerifier', { count: j.ecarts.length })}
            </Typography>
          </Stack>
          {j.ecarts.map((e, i) => (
            <Typography
              key={`${e.code}-${e.visite ?? i}`}
              variant="body2"
              sx={{ pl: 3.5, pt: 0.5, overflowWrap: 'anywhere' }}
            >
              {texteEcart(e, t)}
            </Typography>
          ))}
          {j.activites.map((a) => (
            <Typography
              key={a.id}
              variant="body2"
              sx={{ pl: 3.5, pt: 0.5, color: 'text.secondary' }}
            >
              {t('activites.ligne', {
                type: t(`activites.types.${a.type}`),
                periode: t(`activites.periodes.${a.periode ?? 'journee'}`),
              })}
            </Typography>
          ))}
        </Box>
      </Card>

      <Stack spacing={1.5} component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {j.visites.map((v) => (
          <Box component="li" key={v.id}>
            <CarteVisite
              visite={v}
              ecarts={j.ecarts.filter((e) => e.visite === v.id)}
              fige={j.fige || consultation}
              surValide={rafraichir}
            />
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

function heureLocale(iso: string | null | undefined, langue: string) {
  return iso
    ? new Intl.DateTimeFormat(langue, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : null;
}

/** Ce qui s'est passé pendant la visite : heures, durée, distance au lieu, ou le motif. */
function deroulement(v: VisiteJournee, t: Traduire, langue: string): string[] {
  const lignes: string[] = [];
  const debut = heureLocale(v.debut_le, langue);
  const fin = heureLocale(v.fin_le, langue);
  if (debut && fin && v.debut_le && v.fin_le) {
    const minutes = Math.round((Date.parse(v.fin_le) - Date.parse(v.debut_le)) / 60000);
    const distance = Math.max(v.distance_debut_m ?? 0, v.distance_fin_m ?? 0);
    lignes.push(
      [
        t('journee.deroulement', { debut, fin, minutes }),
        v.sans_gps
          ? t('journee.sansGps')
          : v.distance_debut_m !== null || v.distance_fin_m !== null
            ? t('journee.distance', { distance })
            : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
  }
  if (v.motif_ecart) {
    lignes.push(
      [t('journee.motif', { motif: v.motif_ecart }), v.commentaire_ecart]
        .filter(Boolean)
        .join(' — '),
    );
  }
  if (v.est_imprevue && v.justification) {
    lignes.push(t('journee.imprevue', { justification: v.justification }));
  }
  return lignes;
}

function CarteVisite({
  visite: v,
  ecarts,
  fige,
  surValide,
}: {
  visite: VisiteJournee;
  ecarts: Journee['ecarts'];
  fige: boolean;
  surValide: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Card component="article" aria-label={[v.heure, v.prospect].filter(Boolean).join(' · ')}>
      <EnTeteCarte
        titre={[v.heure, v.prospect ?? t('visites.sansProspect')].filter(Boolean).join(' · ')}
        action={
          <Stack direction="row" spacing={1.5}>
            {v.est_imprevue && <Etiquette ton="info">{t('visites.imprevue')}</Etiquette>}
            <Etiquette ton={v.statut === 'effectuee' ? 'success' : 'neutre'}>
              {t(`visites.statuts.${v.statut}`)}
            </Etiquette>
          </Stack>
        }
      />
      <Box sx={{ px: 2, pb: 1.5 }}>
        {v.etablissement && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {v.etablissement}
          </Typography>
        )}
        {deroulement(v, t, i18n.language).map((ligne) => (
          <Typography key={ligne} variant="body2" sx={{ pt: 0.5 }}>
            {ligne}
          </Typography>
        ))}
        {ecarts.map((e) => (
          <Stack key={e.code} direction="row" spacing={0.75} sx={{ pt: 0.5, alignItems: 'center' }}>
            <ErrorOutlineRounded sx={{ color: 'warning.main', fontSize: 18 }} />
            <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 600 }}>
              {texteEcart(e, t)}
            </Typography>
          </Stack>
        ))}
        {v.rapport ? (
          <Rapport rapport={v.rapport} fige={fige} surValide={surValide} />
        ) : v.rapport_statut ? (
          <Typography variant="body2" sx={{ pt: 1, color: 'warning.main', fontWeight: 600 }}>
            {v.rapport_statut === 'brouillon' ? t('journee.brouillon') : t('journee.attendu')}
          </Typography>
        ) : null}
      </Box>
    </Card>
  );
}

function Rapport({
  rapport: r,
  fige,
  surValide,
}: {
  rapport: RapportLu;
  fige: boolean;
  surValide: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const [enCours, setEnCours] = useState(false);
  const [correction, setCorrection] = useState(false);
  const [precedente, setPrecedente] = useState(false);
  const [reouverture, setReouverture] = useState(false);
  const dateCourte = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  async function valider() {
    setEnCours(true);
    try {
      await client.rapports.valider(r.id);
      notifier(t('validationRapports.rapportFait'));
      await surValide();
    } catch (erreur) {
      notifier(messageErreur(erreur, t('erreurs.reseau')), 'error');
    } finally {
      setEnCours(false);
    }
  }
  const valideLe = r.valide_le
    ? new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(r.valide_le))
    : null;
  const soumis = r.soumis_le
    ? new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(r.soumis_le))
    : null;
  const derniere = r.historique[r.historique.length - 1];
  const vide = '—';
  return (
    <Box component="section" sx={{ mt: 1.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
      <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" component="h3">
          {t('journee.rapport')}
        </Typography>
        {soumis && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('journee.soumisLe', { date: soumis })}
          </Typography>
        )}
        {r.en_retard && <Etiquette ton="warning">{t('chronologie.enRetard')}</Etiquette>}
        {r.horodatage_douteux && (
          <Etiquette ton="warning">{t('journee.horodatageDouteux')}</Etiquette>
        )}
        {r.versions > 1 && <Etiquette>{t('journee.versions', { count: r.versions })}</Etiquette>}
        {r.statut === 'soumis' && !fige && (
          <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
            <Button size="small" disabled={enCours} onClick={() => setCorrection(true)}>
              {t('correction.demander')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={enCours}
              onClick={() => void valider()}
            >
              {t('validationRapports.rapport')}
            </Button>
          </Stack>
        )}
      </Stack>
      {r.correction && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('correction.demandee', {
              date: dateCourte(r.correction.le),
              par: r.correction.par,
            })}
          </Typography>
          <Typography variant="body2">« {r.correction.commentaire} »</Typography>
          {r.correction.champs.length > 0 && (
            <Typography variant="body2">
              {t('correction.aRevoir', {
                champs: r.correction.champs.map((c) => libellePartie(c, r, t)).join(', '),
              })}
            </Typography>
          )}
        </Alert>
      )}
      {correction && (
        <DialogueCorrection
          rapport={r}
          surFermer={() => setCorrection(false)}
          surEnvoye={surValide}
        />
      )}
      {r.statut === 'valide' && valideLe && (
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, pt: 0.5 }}
        >
          <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
            {t('validationRapports.valideLe', {
              date: valideLe,
              par: r.valide_par ?? '—',
              mode: t(`validationRapports.modes.${r.mode_validation || 'unitaire'}`),
            })}
          </Typography>
          {r.rouvrable && (
            <Button size="small" onClick={() => setReouverture(true)}>
              {t('reouvertureRapport.rouvrir')}
            </Button>
          )}
        </Stack>
      )}
      {r.reouverture && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('reouvertureRapport.rouvertLe', {
              date: dateCourte(r.reouverture.le),
              par: r.reouverture.par,
            })}
          </Typography>
          <Typography variant="body2">« {r.reouverture.motif} »</Typography>
        </Alert>
      )}
      {reouverture && (
        <DialogueReouverture
          rapport={r}
          surFermer={() => setReouverture(false)}
          surEnvoye={surValide}
        />
      )}
      {r.horodatage_douteux && (
        <Typography variant="body2" sx={{ color: 'text.secondary', pt: 0.5 }}>
          {t('journee.horodatageDetail', {
            telephone: heureLocale(r.heure_telephone, i18n.language) ?? vide,
            recu: heureLocale(r.recu_le, i18n.language) ?? vide,
          })}
        </Typography>
      )}
      {derniere?.correction && (
        <Alert severity="info" sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t(
              derniere.correction.reouverture
                ? 'rapportCorrige.reponseReouverture'
                : 'rapportCorrige.reponse',
              { version: derniere.numero, date: dateCourte(derniere.soumis_le) },
            )}
          </Typography>
          <Typography variant="body2">
            {t(
              derniere.correction.reouverture ? 'rapportCorrige.motif' : 'rapportCorrige.demande',
              {
                par: derniere.correction.par,
                date: dateCourte(derniere.correction.le),
                commentaire: derniere.correction.commentaire,
              },
            )}
          </Typography>
          <Typography variant="body2">
            {r.modifies.length
              ? t('rapportCorrige.modifies', {
                  parties: r.modifies.map((c) => libellePartie(c, r, t)).join(', '),
                })
              : t('rapportCorrige.rienModifie')}
          </Typography>
        </Alert>
      )}
      <LignesContenu
        c={r}
        modifies={r.modifies}
        pieces={
          r.pieces_jointes.length > 0 ? (
            <Stack spacing={0.5} sx={{ alignItems: 'flex-start', ml: -0.75 }}>
              {r.pieces_jointes.map((p) => (
                <BoutonPiece key={p.id} id={p.id} nom={p.nom} />
              ))}
            </Stack>
          ) : null
        }
      />
      {r.precedente && (
        <Box sx={{ mt: 1 }}>
          <Button
            size="small"
            aria-expanded={precedente}
            startIcon={precedente ? <ExpandLessRounded /> : <ExpandMoreRounded />}
            onClick={() => setPrecedente((v) => !v)}
            sx={{ ml: -0.75 }}
          >
            {t(precedente ? 'rapportCorrige.masquer' : 'rapportCorrige.voir', {
              version: r.versions - 1,
            })}
          </Button>
          <Collapse in={precedente} unmountOnExit>
            <Box
              role="region"
              aria-label={t('rapportCorrige.titre', { version: r.versions - 1 })}
              sx={{ mt: 1, px: 2, py: 1, bgcolor: 'action.hover', borderRadius: 1 }}
            >
              <Typography variant="subtitle2" component="h4">
                {t('rapportCorrige.titre', { version: r.versions - 1 })}
              </Typography>
              <LignesContenu
                c={r.precedente}
                modifies={[]}
                pieces={
                  r.precedente.pieces_jointes.length > 0
                    ? r.precedente.pieces_jointes.join(', ')
                    : null
                }
              />
            </Box>
          </Collapse>
        </Box>
      )}
    </Box>
  );
}

/** Le contenu d'un rapport, ou d'une version précédente (RPT-015), ligne par ligne ; une
 * partie modifiée depuis la version d'avant est marquée. */
function LignesContenu({
  c,
  modifies,
  pieces,
}: {
  c: ContenuAffiche;
  modifies: string[];
  pieces: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const echeance = c.prochaine_action_echeance
    ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(
        new Date(`${c.prochaine_action_echeance}T12:00:00`),
      )
    : null;
  const vide = '—';
  return (
    <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
      {c.objectif_prevu && <Ligne libelle={t('rapport.objectifPrevu')} valeur={c.objectif_prevu} />}
      <Ligne
        libelle={t('rapport.produits')}
        modifie={modifies.includes('presentations')}
        valeur={
          c.presentations.length ? (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {c.presentations.map((p, i) => (
                <li key={`${p.produit ?? p.libelle}-${i}`}>
                  {p.retour ? `${p.libelle} — ${t(`rapport.retours.${p.retour}`)}` : p.libelle}
                </li>
              ))}
            </Box>
          ) : (
            vide
          )
        }
      />
      {c.remises.length > 0 && (
        <Ligne
          libelle={t('rapport.remises')}
          modifie={modifies.includes('remises')}
          valeur={
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {c.remises.map((x, i) => (
                <li key={`${x.produit ?? x.article}-${i}`}>
                  {t('journee.remise', {
                    type: t(`rapport.typesRemise.${x.type}`),
                    libelle: x.libelle,
                    quantite: x.quantite,
                  })}
                </li>
              ))}
            </Box>
          }
        />
      )}
      <Ligne
        libelle={t('journee.resultat')}
        modifie={modifies.includes('resultat')}
        valeur={[c.resultat, c.resultat_obtenu].filter(Boolean).join(' — ') || vide}
      />
      {c.resume && (
        <Ligne
          libelle={t('rapport.resume')}
          valeur={c.resume}
          modifie={modifies.includes('resume')}
        />
      )}
      <Ligne
        libelle={t('rapport.prochaineAction')}
        modifie={modifies.includes('prochaine_action')}
        valeur={
          <>
            {[c.prochaine_action_type, c.prochaine_action].filter(Boolean).join(' — ') || vide}
            {(echeance || c.visite_proposee) && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {[
                  echeance ? t('journee.echeance', { date: echeance }) : null,
                  c.visite_proposee ? t('rapport.visiteProposeeLue') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
            )}
          </>
        }
      />
      {c.champs.map((x) => (
        <Ligne
          key={x.code}
          libelle={x.libelle}
          valeur={valeurChamp(x.valeur, t) ?? vide}
          modifie={modifies.includes(x.code)}
        />
      ))}
      {pieces && (
        <Ligne
          libelle={t('journee.pieces')}
          valeur={pieces}
          modifie={modifies.includes('pieces_jointes')}
        />
      )}
    </Stack>
  );
}

type ContenuAffiche = Pick<
  RapportLu,
  | 'objectif_prevu'
  | 'presentations'
  | 'remises'
  | 'resultat'
  | 'resultat_obtenu'
  | 'resume'
  | 'prochaine_action_type'
  | 'prochaine_action'
  | 'prochaine_action_echeance'
  | 'visite_proposee'
  | 'champs'
>;

/** Libellé à gauche, texte aligné à gauche : un résumé de plusieurs lignes reste lisible. */
function Ligne({
  libelle,
  valeur,
  modifie = false,
}: {
  libelle: string;
  valeur: ReactNode;
  modifie?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '200px minmax(0, 1fr)' },
        columnGap: 2,
        rowGap: 0.25,
        py: 1,
      }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {libelle}
        {modifie && (
          <Box component="span" sx={{ display: 'block', mt: 0.25 }}>
            <Etiquette ton="info">{t('rapportCorrige.modifie')}</Etiquette>
          </Box>
        )}
      </Typography>
      <Typography component="div" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
        {valeur}
      </Typography>
    </Box>
  );
}

/** RPT-014 : les parties du socle qu'une correction peut viser, puis les champs du pays. */
const PARTIES = [
  'presentations',
  'remises',
  'resultat',
  'resume',
  'prochaine_action',
  'pieces_jointes',
] as const;

function libellePartie(code: string, r: RapportLu, t: Traduire): string {
  if ((PARTIES as readonly string[]).includes(code)) return t(`correction.parties.${code}`);
  return r.champs.find((c) => c.code === code)?.libelle ?? code;
}

/** RPT-014 : commentaire obligatoire (CA1), champs à revoir facultatifs, sans échéance. */
function DialogueCorrection({
  rapport: r,
  surFermer,
  surEnvoye,
}: {
  rapport: RapportLu;
  surFermer: () => void;
  surEnvoye: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const [commentaire, setCommentaire] = useState('');
  const [champs, setChamps] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const codes = [...PARTIES, ...r.champs.map((c) => c.code)];
  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    try {
      await client.rapports.demanderCorrection(r.id, commentaire, champs);
      notifier(t('correction.envoyee'));
      surFermer();
      await surEnvoye();
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }
  return (
    <Dialog open onClose={surFermer} fullWidth maxWidth="sm">
      <DialogTitle>{t('correction.titre')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <DialogContentText>{t('correction.aide')}</DialogContentText>
          {erreur && <Alert severity="error">{erreur}</Alert>}
          <TextField
            label={t('correction.commentaire')}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            multiline
            minRows={3}
            required
            autoFocus
          />
          <FormGroup aria-label={t('correction.champs')}>
            <Typography variant="body2" sx={{ color: 'text.secondary', pb: 0.5 }}>
              {t('correction.champs')}
            </Typography>
            {codes.map((code) => (
              <FormControlLabel
                key={code}
                control={
                  <Checkbox
                    checked={champs.includes(code)}
                    onChange={(e) =>
                      setChamps((l) =>
                        e.target.checked ? [...l, code] : l.filter((x) => x !== code),
                      )
                    }
                  />
                }
                label={libellePartie(code, r, t)}
              />
            ))}
          </FormGroup>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={surFermer}>{t('commun.annuler')}</Button>
        <Button
          variant="contained"
          disabled={envoi || !commentaire.trim()}
          onClick={() => void envoyer()}
        >
          {t('correction.envoyer')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** RPT-016 : rouvrir un rapport validé ; le motif est obligatoire. */
function DialogueReouverture({
  rapport: r,
  surFermer,
  surEnvoye,
}: {
  rapport: RapportLu;
  surFermer: () => void;
  surEnvoye: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    try {
      await client.rapports.rouvrir(r.id, motif);
      notifier(t('reouvertureRapport.fait'));
      surFermer();
      await surEnvoye();
    } catch (e) {
      setErreur(messageErreur(e, t('erreurs.reseau')));
    } finally {
      setEnvoi(false);
    }
  }
  return (
    <Dialog open onClose={surFermer} fullWidth maxWidth="sm">
      <DialogTitle>{t('reouvertureRapport.titre')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <DialogContentText>{t('reouvertureRapport.aide')}</DialogContentText>
          {erreur && <Alert severity="error">{erreur}</Alert>}
          <TextField
            label={t('reouvertureRapport.motif')}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            multiline
            minRows={3}
            required
            autoFocus
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={surFermer}>{t('commun.annuler')}</Button>
        <Button
          variant="contained"
          disabled={envoi || !motif.trim()}
          onClick={() => void envoyer()}
        >
          {t('reouvertureRapport.envoyer')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function valeurChamp(valeur: unknown, t: Traduire): string | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  if (typeof valeur === 'boolean') return valeur ? t('rapport.oui') : t('rapport.non');
  if (Array.isArray(valeur)) return valeur.join(', ');
  return String(valeur);
}

/** RPT-007 CA2 : la pièce se lit avec la session ; elle s'ouvre dans un nouvel onglet. */
function BoutonPiece({ id, nom }: { id: string; nom: string }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  async function ouvrir() {
    // L'onglet s'ouvre tout de suite, dans le geste de l'utilisateur ; le fichier suit.
    const onglet = window.open('', '_blank');
    try {
      const fichier = await client.rapports.piece(id);
      const adresse = URL.createObjectURL(fichier);
      if (onglet) onglet.location.href = adresse;
      else window.location.href = adresse;
    } catch (erreur) {
      onglet?.close();
      notifier(messageErreur(erreur, t('erreurs.reseau')), 'error');
    }
  }
  return (
    <Button
      size="small"
      startIcon={<PictureAsPdfRounded />}
      onClick={() => void ouvrir()}
      sx={{ textAlign: 'left' }}
    >
      {nom}
    </Button>
  );
}
