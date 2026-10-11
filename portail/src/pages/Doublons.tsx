import type { DoublonProbable, Fusion, Perimetre } from '@innov/api-client';
import { Alert, Box, Button, Card, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DialogueFormulaire from '../composants/Dialogue';
import { EnTetePage, EtatVide, Etiquette, Potentiel } from '../composants/Elements';
import { ErreurChargement } from '../composants/Erreurs';
import { dateCourte, depuis } from '../composants/formats';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

type Fiche = DoublonProbable['fiche'];

const CHAMPS: { cle: keyof Fiche; libelle: string }[] = [
  { cle: 'type_libelle', libelle: 'prospect.champs.type' },
  { cle: 'specialite_libelle', libelle: 'prospect.champs.specialite' },
  { cle: 'numero_ordre', libelle: 'prospect.champs.numeroOrdre' },
  { cle: 'telephone_mobile', libelle: 'prospect.champs.telephoneMobile' },
  { cle: 'telephone_pro', libelle: 'prospect.champs.telephonePro' },
  { cle: 'courriel', libelle: 'prospect.champs.courriel' },
  { cle: 'secteur', libelle: 'etablissement.champs.secteur' },
  { cle: 'localite', libelle: 'etablissement.champs.localite' },
];

function nom(f: Pick<Fiche, 'civilite' | 'prenom' | 'nom'>, t: (c: string) => string) {
  return [f.civilite ? t(`prospect.civilites.${f.civilite}`) : '', f.prenom, f.nom]
    .filter(Boolean)
    .join(' ');
}

function texte(valeur: unknown): string {
  return valeur === null || valeur === undefined || valeur === '' ? '—' : String(valeur);
}

/** Comparaison côte à côte (PRP-009 CA1) : les valeurs qui diffèrent ressortent. */
function Comparaison({ paire }: { paire: DoublonProbable }) {
  const { t, i18n } = useTranslation();
  const { fiche, candidat } = paire;
  const lignes: { libelle: string; a: string; b: string }[] = [
    ...CHAMPS.map((c) => ({
      libelle: t(c.libelle),
      a: texte(fiche[c.cle]),
      b: texte(candidat[c.cle]),
    })),
    {
      libelle: t('doublons.lieux'),
      a: fiche.lieux.join(', ') || '—',
      b: candidat.lieux.join(', ') || '—',
    },
    {
      libelle: t('doublons.cibles'),
      a: String(fiche.cibles),
      b: String(candidat.cibles),
    },
    {
      libelle: t('doublons.creee'),
      a: `${fiche.cree_par.prenom} ${fiche.cree_par.nom} · ${dateCourte(fiche.cree_le, i18n.language)}`,
      b: `${candidat.cree_par.prenom} ${candidat.cree_par.nom} · ${dateCourte(candidat.cree_le, i18n.language)}`,
    },
  ];
  const colonnes = { xs: '1fr 1fr', md: '200px 1fr 1fr' };
  return (
    <Box role="table" aria-label={t('doublons.comparaison')}>
      <Box
        role="row"
        sx={{
          display: 'grid',
          gridTemplateColumns: colonnes,
          columnGap: 2,
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: { xs: 'none', md: 'block' } }} />
        {[
          { f: fiche, titre: t('doublons.nouvelle') },
          { f: candidat, titre: t('doublons.existante') },
        ].map(({ f, titre }) => (
          <Box key={f.id} role="columnheader" sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {titre} · {t(`prospect.statuts.${f.statut}`)}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Potentiel valeur={f.potentiel} />
              <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                {nom(f, t)}
              </Typography>
            </Stack>
          </Box>
        ))}
      </Box>
      {/* Une ligne vide des deux côtés n'aide pas à trancher. */}
      {lignes
        .filter((l) => l.a !== '—' || l.b !== '—')
        .map((l) => {
          const differe = l.a !== l.b;
          return (
            <Box
              key={l.libelle}
              role="row"
              sx={{
                display: 'grid',
                gridTemplateColumns: colonnes,
                columnGap: 2,
                px: 2,
                py: 0.75,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Typography
                role="rowheader"
                variant="body2"
                sx={{ color: 'text.secondary', gridColumn: { xs: '1 / -1', md: 'auto' } }}
              >
                {l.libelle}
              </Typography>
              {[l.a, l.b].map((v, i) => (
                <Typography
                  key={i}
                  role="cell"
                  variant="body2"
                  sx={{
                    overflowWrap: 'anywhere',
                    fontWeight: differe && v !== '—' ? 600 : 400,
                    color: differe && v !== '—' ? 'text.primary' : 'text.secondary',
                  }}
                >
                  {v}
                </Typography>
              ))}
            </Box>
          );
        })}
    </Box>
  );
}

function PaireATrancher({ paire }: { paire: DoublonProbable }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const [envoi, setEnvoi] = useState(false);

  async function trancher(decision: 'fusionner' | 'separer' | 'refuser') {
    setEnvoi(true);
    try {
      await client.doublons.trancher(paire.id, decision);
      notifier(t(`doublons.decisions.${decision}`));
      void requetes.invalidateQueries({ queryKey: ['doublons'] });
      void requetes.invalidateQueries({ queryKey: ['prospects'] });
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Card component="article">
      <Stack
        direction="row"
        sx={{
          px: 2,
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" component="h2">
          {t('doublons.score', { score: paire.score })}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {paire.criteres.map((c) => t(`doublons.criteres.${c}`)).join(' · ')}
        </Typography>
      </Stack>
      <Comparaison paire={paire} />
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', p: 2 }}>
        <Button variant="contained" disabled={envoi} onClick={() => void trancher('fusionner')}>
          {t('doublons.fusionner')}
        </Button>
        <Button variant="outlined" disabled={envoi} onClick={() => void trancher('separer')}>
          {t('doublons.separer')}
        </Button>
        <Button color="error" disabled={envoi} onClick={() => void trancher('refuser')}>
          {t('doublons.refuser')}
        </Button>
      </Stack>
    </Card>
  );
}

function ListeFusions({ fusions }: { fusions: Fusion[] }) {
  const { t, i18n } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const requetes = useQueryClient();
  const [cible, setCible] = useState<Fusion | null>(null);
  if (fusions.length === 0) {
    return (
      <Card>
        <EtatVide titre={t('doublons.aucuneFusion')} />
      </Card>
    );
  }
  return (
    <Card>
      {fusions.map((f, i) => (
        <Stack
          key={f.id}
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 0.5, sm: 2 }}
          sx={{
            px: 2,
            py: 1.25,
            minHeight: 56,
            alignItems: { sm: 'center' },
            borderTop: i ? 1 : 0,
            borderColor: 'divider',
            opacity: f.defaite_le ? 0.6 : 1,
          }}
        >
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography sx={{ fontWeight: 600 }}>
              {nom(f.absorbee, t)} → {nom(f.conservee, t)}
            </Typography>
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
              {[
                f.automatique
                  ? t('doublons.automatique')
                  : t('doublons.parPersonne', {
                      personne: f.par ? `${f.par.prenom} ${f.par.nom}` : '—',
                    }),
                depuis(f.cree_le, i18n.language),
                f.criteres.map((c) => t(`doublons.criteres.${c}`)).join(', '),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Typography>
          </Box>
          {f.defaite_le ? (
            <Etiquette>
              {t('doublons.defaite', { date: dateCourte(f.defaite_le, i18n.language) })}
            </Etiquette>
          ) : (
            <Button
              size="small"
              onClick={() => setCible(f)}
              sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
            >
              {t('doublons.defaire')}
            </Button>
          )}
        </Stack>
      ))}
      {cible && (
        <DialogueFormulaire
          ouvert
          titre={t('doublons.defaireTitre')}
          aide={t('doublons.defaireAide', {
            absorbee: nom(cible.absorbee, t),
            conservee: nom(cible.conservee, t),
          })}
          libelleValider={t('doublons.defaire')}
          surFermer={() => setCible(null)}
          surValider={async () => {
            try {
              await client.fusions.defaire(cible.id);
              void requetes.invalidateQueries({ queryKey: ['fusions'] });
              void requetes.invalidateQueries({ queryKey: ['prospects'] });
            } catch (e) {
              notifier(messageErreur(e, t('erreurs.reseau')), 'error');
              throw e;
            }
          }}
        />
      )}
    </Card>
  );
}

/** Doublons probables à trancher (PRP-009) et fusions défaisables (PRP-010). */
export default function Doublons({ perimetre }: { perimetre: Perimetre }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const [onglet, setOnglet] = useState<'file' | 'fusions'>('file');
  const cle = perimetre.pays_actif?.code ?? 'consolide';
  const file = useQuery({
    queryKey: ['doublons', cle],
    queryFn: () => client.doublons.liste(),
    enabled: perimetre.pays_actif !== null,
  });
  const fusions = useQuery({
    queryKey: ['fusions', cle],
    queryFn: client.fusions.liste,
    enabled: perimetre.pays_actif !== null && onglet === 'fusions',
  });
  const requete = onglet === 'file' ? file : fusions;

  return (
    <Stack spacing={2}>
      <EnTetePage
        titre={t('doublons.titre')}
        sousTitre={
          file.data ? t('doublons.resume', { count: file.data.length }) : perimetre.pays_actif?.nom
        }
      />
      {!perimetre.pays_actif ? (
        <Alert severity="info">{t('doublons.choisirPays')}</Alert>
      ) : (
        <>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={onglet} onChange={(_, v) => setOnglet(v)} textColor="inherit">
              <Tab value="file" label={t('doublons.onglets.file')} />
              <Tab value="fusions" label={t('doublons.onglets.fusions')} />
            </Tabs>
          </Box>
          {requete.isError ? (
            <ErreurChargement erreur={requete.error} reessayer={() => void requete.refetch()} />
          ) : !requete.data ? (
            <Skeleton variant="rounded" height={240} />
          ) : onglet === 'file' ? (
            file.data!.length === 0 ? (
              <Card>
                <EtatVide titre={t('doublons.fileVide')} texte={t('doublons.fileVideTexte')} />
              </Card>
            ) : (
              <>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('doublons.aideFusion')}
                </Typography>
                {file.data!.map((paire) => (
                  <PaireATrancher key={paire.id} paire={paire} />
                ))}
              </>
            )
          ) : (
            <ListeFusions fusions={fusions.data!} />
          )}
        </>
      )}
    </Stack>
  );
}
