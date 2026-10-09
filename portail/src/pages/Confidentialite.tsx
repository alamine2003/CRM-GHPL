import { LANGUES } from '@innov/i18n';
import { marque } from '@innov/design';
import { Box, Card, CardContent, Link, Stack, Typography } from '@mui/material';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as LienRouteur, useSearchParams } from 'react-router';
import BandeauDemonstration from '../composants/BandeauDemonstration';
import ChoixLangue from '../composants/ChoixLangue';
import Logo from '../composants/Logo';

/** Sections dans l'ordre de lecture : une liste de points, un texte, ou les deux. */
const SECTIONS: { cle: string; points?: string[]; texte?: false }[] = [
  { cle: 'responsable' },
  {
    cle: 'donnees',
    points: ['collaborateurs', 'visites', 'professionnels', 'patients'],
    texte: false,
  },
  { cle: 'finalites' },
  { cle: 'acces' },
  { cle: 'lieux' },
  { cle: 'conservation', points: ['activite', 'positions', 'pieces'] },
  { cle: 'telephone' },
  { cle: 'securite' },
  { cle: 'droits' },
];

/**
 * Politique de confidentialité publique (1.0.0, prd.md §21.2 condition 7) : les magasins
 * exigent une adresse web lisible sans compte, et l'application y renvoie. Le contenu reprend
 * le dossier CDP (docs/dossier-cdp.md) ; l'adresse de contact vient de la configuration.
 */
export default function Confidentialite() {
  const { t, i18n } = useTranslation();
  const [parametres] = useSearchParams();
  const demandee = parametres.get('langue');
  useEffect(() => {
    // L'application mobile ouvre la page dans la langue de l'utilisateur.
    if (demandee && (LANGUES as readonly string[]).includes(demandee)) {
      void i18n.changeLanguage(demandee);
    }
  }, [demandee, i18n]);
  useEffect(() => {
    document.title = `${t('confidentialite.titre')} · ${t('commun.produit')}`;
  }, [t]);
  const organisation = t('marque.organisation');
  const contact = import.meta.env.VITE_CONTACT_DONNEES;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="header"
        sx={{ bgcolor: marque.bleuMarine, color: '#FFFFFF', px: { xs: 2, md: 6 }, py: 1.5 }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: 'center', maxWidth: 760, mx: 'auto' }}
        >
          <Logo taille={28} />
          <Typography sx={{ flexGrow: 1, color: '#FFFFFF', fontWeight: 600 }}>
            {t('commun.produit')}
          </Typography>
          <ChoixLangue surFonce />
        </Stack>
      </Box>
      <Box component="main" sx={{ px: 2, py: { xs: 3, md: 5 } }}>
        <Card sx={{ maxWidth: 760, mx: 'auto' }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 }, '&:last-child': { pb: { xs: 3, sm: 4 } } }}>
            <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
              {t('confidentialite.titre')}
            </Typography>
            <Typography sx={{ color: 'text.secondary', mb: 1 }}>
              {t('confidentialite.intro', { organisation })}
            </Typography>
            {SECTIONS.map(({ cle, points, texte }) => (
              <Box component="section" key={cle} sx={{ mt: 3 }}>
                <Typography variant="h6" component="h2" sx={{ mb: 0.75 }}>
                  {t(`confidentialite.sections.${cle}.titre`)}
                </Typography>
                {points && (
                  <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
                    {points.map((p) => (
                      <Typography component="li" key={p}>
                        {t(`confidentialite.sections.${cle}.${p}`)}
                      </Typography>
                    ))}
                  </Box>
                )}
                {texte !== false && (
                  <Typography sx={{ mt: points ? 1 : 0 }}>
                    {t(`confidentialite.sections.${cle}.texte`, { organisation })}
                  </Typography>
                )}
              </Box>
            ))}
            <Box component="section" sx={{ mt: 3 }}>
              <Typography variant="h6" component="h2" sx={{ mb: 0.75 }}>
                {t('confidentialite.sections.contact.titre')}
              </Typography>
              <Typography>
                {contact
                  ? t('confidentialite.sections.contact.avecAdresse', { contact })
                  : t('confidentialite.sections.contact.sansAdresse')}
              </Typography>
            </Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ mt: 4, justifyContent: 'space-between' }}
            >
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('confidentialite.version', { version: __INNOV_VERSION__ })}
              </Typography>
              <Link component={LienRouteur} to="/connexion">
                {t('confidentialite.retour')}
              </Link>
            </Stack>
          </CardContent>
        </Card>
        <Box sx={{ maxWidth: 760, mx: 'auto', mt: 1.5, px: 0.5 }}>
          <BandeauDemonstration />
        </Box>
      </Box>
    </Box>
  );
}
