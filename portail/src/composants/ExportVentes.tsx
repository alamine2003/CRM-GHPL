import type { FiltresVentes } from '@innov/api-client';
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded';
import { Button, ListItemText, ListSubheader, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifier } from '../contexteNotifications';
import { messageErreur, useSession } from '../contexteSession';

const CONTENUS = ['ventilation', 'mensuel', 'lignes'] as const;
const FICHIERS = ['xlsx', 'csv'] as const;

/**
 * VNT-006 (1.6.2) : exporter ce que la synthèse montre — la ventilation, les ventes mensuelles ou
 * les lignes du cumul — avec la même période et les mêmes filtres, en classeur Excel ou en CSV. Le
 * serveur limite au périmètre et inscrit chaque export au journal d'audit.
 */
export default function ExportVentes({ demande }: { demande: FiltresVentes }) {
  const { t } = useTranslation();
  const { client } = useSession();
  const notifier = useNotifier();
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function exporter(contenu: (typeof CONTENUS)[number], fichier: (typeof FICHIERS)[number]) {
    setAncre(null);
    setEnvoi(true);
    try {
      const blob = await client.ventes.exporter({ ...demande, contenu, fichier });
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = `ventes-${contenu}-${demande.annee}-${String(demande.mois_fin).padStart(2, '0')}.${fichier}`;
      lien.click();
      URL.revokeObjectURL(lien.href);
      notifier(t('ventes.export.fait'));
    } catch (e) {
      notifier(messageErreur(e, t('erreurs.reseau')), 'error');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<FileDownloadRounded />}
        disabled={envoi}
        aria-haspopup="menu"
        onClick={(e) => setAncre(e.currentTarget)}
      >
        {envoi ? t('ventes.export.enCours') : t('ventes.export.bouton')}
      </Button>
      <Menu anchorEl={ancre} open={!!ancre} onClose={() => setAncre(null)}>
        <ListSubheader
          disableSticky
          sx={{ lineHeight: 1.4, py: 1, maxWidth: 280, whiteSpace: 'normal' }}
        >
          {t('ventes.export.aide')}
        </ListSubheader>
        {CONTENUS.flatMap((contenu) =>
          FICHIERS.map((fichier) => (
            <MenuItem key={`${contenu}-${fichier}`} onClick={() => void exporter(contenu, fichier)}>
              <ListItemText
                primary={t(`ventes.export.${contenu}`)}
                secondary={t(`ventes.export.${fichier}`)}
              />
            </MenuItem>
          )),
        )}
      </Menu>
    </>
  );
}
