import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ecran } from '../../src/Ecran';
import { FormulaireRapport } from '../../src/Rapport';

/** Rapport d'une visite effectuée (RPT-001). */
export default function EcranRapport() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Ecran titre={t('rapport.titre')} retour>
      <FormulaireRapport id={id} />
    </Ecran>
  );
}
