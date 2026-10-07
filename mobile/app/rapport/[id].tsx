import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ecran } from '../../src/Ecran';
import { FormulaireRapport } from '../../src/Rapport';

/** Rapport d'une visite effectuée (RPT-001). */
export default function EcranRapport() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [garde, setGarde] = useState<string>();
  return (
    <Ecran titre={t('rapport.titre')} surTitre={garde} retour>
      <FormulaireRapport id={id} surGarde={setGarde} />
    </Ecran>
  );
}
