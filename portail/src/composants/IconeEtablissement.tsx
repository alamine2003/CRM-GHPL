import ApartmentRounded from '@mui/icons-material/ApartmentRounded';
import LocalHospitalRounded from '@mui/icons-material/LocalHospitalRounded';
import LocalPharmacyRounded from '@mui/icons-material/LocalPharmacyRounded';
import MedicalServicesRounded from '@mui/icons-material/MedicalServicesRounded';
import StoreRounded from '@mui/icons-material/StoreRounded';
import type { ReactNode } from 'react';

/** Icône par type d'établissement ; une valeur ajoutée par le pays prend l'icône générique. */
export default function IconeType({ code }: { code: string }) {
  const icones: Record<string, ReactNode> = {
    hopital: <LocalHospitalRounded />,
    clinique: <MedicalServicesRounded />,
    pharmacie: <LocalPharmacyRounded />,
    grossiste: <StoreRounded />,
  };
  return <>{icones[code] ?? <ApartmentRounded />}</>;
}
