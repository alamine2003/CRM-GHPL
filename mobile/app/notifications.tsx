import { useTranslation } from 'react-i18next';
import { CentreNotifications } from '../src/CentreNotifications';
import { Ecran } from '../src/Ecran';

/** Centre de notifications (NOT-001). */
export default function EcranNotifications() {
  const { t } = useTranslation();
  return (
    <Ecran titre={t('notifications.centre')} retour>
      <CentreNotifications />
    </Ecran>
  );
}
