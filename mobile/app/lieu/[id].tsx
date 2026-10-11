import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ecran } from '../../src/Ecran';
import { FicheEtablissement } from '../../src/Fiches';

/** Fiche d'un établissement : où aller, qui appeler, qui y exerce. */
export default function EcranFicheEtablissement() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Ecran titre={t('fiche.titreEtablissement')} retour>
      <FicheEtablissement id={id} />
    </Ecran>
  );
}
