import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ecran } from '../../src/Ecran';
import { FicheProspect } from '../../src/Fiches';

/** Fiche d'un prospect consultée par le délégué. */
export default function EcranFicheProspect() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Ecran titre={t('fiche.titreProspect')} retour>
      <FicheProspect id={id} />
    </Ecran>
  );
}
