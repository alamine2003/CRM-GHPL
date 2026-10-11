import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '../contexteSession';

/** Vrai sur une instance de démonstration (DEM-001, RSK-11). */
export function useDemonstration(): boolean {
  const { i18n } = useTranslation();
  const { client } = useSession();
  const informations = useQuery({
    queryKey: ['informations', i18n.language],
    queryFn: () => client.informations(),
    staleTime: 5 * 60 * 1000,
  });
  return informations.data?.environnement === 'demonstration';
}
