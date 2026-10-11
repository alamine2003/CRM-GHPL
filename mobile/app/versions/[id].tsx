import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ecran } from '../../src/Ecran';
import { VueVersions } from '../../src/Versions';

/** Historique des versions d'un planning (PLN-014). */
export default function EcranVersions() {
  const { t } = useTranslation();
  const { id, fuseau } = useLocalSearchParams<{ id: string; fuseau?: string }>();
  return (
    <Ecran titre={t('versions.titre', { count: 2 })} retour>
      <VueVersions planning={id} fuseau={fuseau} />
    </Ecran>
  );
}
