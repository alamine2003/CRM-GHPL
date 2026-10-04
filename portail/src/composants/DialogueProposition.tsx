import { TextField } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';
import DialogueFormulaire from './Dialogue';

const CHAMPS = {
  prospect: [
    { cle: 'telephone_mobile', type: 'tel' },
    { cle: 'telephone_pro', type: 'tel' },
    { cle: 'courriel', type: 'email' },
    { cle: 'numero_ordre', type: 'text' },
  ],
  etablissement: [
    { cle: 'adresse', type: 'text' },
    { cle: 'telephone', type: 'tel' },
  ],
} as const;

/**
 * Proposer une modification d'une fiche commune (PRP-014) : la fiche ne change qu'une fois
 * la proposition acceptée par le superviseur ou l'administrateur pays (CA1).
 */
export default function DialogueProposition({
  objet,
  id,
  actuels,
  surFermer,
}: {
  objet: 'prospect' | 'etablissement';
  id: string;
  actuels: Record<string, string | null | undefined>;
  surFermer: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useSession();
  const requetes = useQueryClient();
  const [valeurs, setValeurs] = useState<Record<string, string>>(
    Object.fromEntries(CHAMPS[objet].map((c) => [c.cle, actuels[c.cle] ?? ''])),
  );
  const [commentaire, setCommentaire] = useState('');
  const changements = Object.fromEntries(
    Object.entries(valeurs).filter(([cle, v]) => v.trim() !== (actuels[cle] ?? '')),
  );
  return (
    <DialogueFormulaire
      ouvert
      titre={t('propositions.proposerTitre')}
      aide={t('propositions.proposerAide')}
      libelleValider={t('propositions.envoyer')}
      invalide={Object.keys(changements).length === 0}
      surFermer={surFermer}
      surValider={async () => {
        await client.propositions.creer({ [objet]: id, changements, commentaire });
        void requetes.invalidateQueries({ queryKey: ['propositions'] });
      }}
    >
      {CHAMPS[objet].map((c) => (
        <TextField
          key={c.cle}
          type={c.type}
          label={t(`propositions.champs.${c.cle}`)}
          value={valeurs[c.cle]}
          onChange={(e) => setValeurs((v) => ({ ...v, [c.cle]: e.target.value }))}
        />
      ))}
      <TextField
        label={t('propositions.commentaire')}
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        multiline
        minRows={2}
      />
    </DialogueFormulaire>
  );
}
