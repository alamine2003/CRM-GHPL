import { useTranslation } from 'react-i18next';
import { Ecran } from '../src/Ecran';
import { EcranMesChiffres } from '../src/MesChiffres';

export default function EcranChiffres() {
  const { t } = useTranslation();
  return (
    <Ecran titre={t('mobile.onglets.chiffres')}>
      <EcranMesChiffres />
    </Ecran>
  );
}
