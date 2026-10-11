import 'leaflet/dist/leaflet.css';
import { useTheme } from '@mui/material/styles';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';

export interface PointCarte {
  id: string;
  latitude: number;
  longitude: number;
  libelle: string;
  /** Point mis en avant (sélection, fiche ouverte). */
  actif?: boolean;
  /** Point secondaire (pointage d'une visite) : plus petit, plus pâle. */
  discret?: boolean;
}

function Cadrage({ points }: { points: PointCarte[] }) {
  const carte = useMap();
  // Le cadre suit les points de fond : choisir ou déplacer le point mis en avant ne recadre pas.
  const fond = points.some((p) => !p.actif) ? points.filter((p) => !p.actif) : points;
  const cle = fond.map((p) => `${p.latitude},${p.longitude}`).join(';');
  useEffect(() => {
    const coins = cle
      ? cle.split(';').map((c) => c.split(',').map(Number) as [number, number])
      : [];
    if (coins.length === 1) {
      carte.setView(coins[0]!, 15);
    } else if (coins.length > 1) {
      carte.fitBounds(coins, { padding: [24, 24], maxZoom: 17 });
    }
  }, [carte, cle]);
  return null;
}

function Clic({ surClic }: { surClic: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: (e) => surClic(e.latlng.lat, e.latlng.lng) });
  return null;
}

/**
 * Carte OpenStreetMap des établissements (PRP-003) ; chargée à la demande, elle ne pèse
 * pas sur le reste du portail. Un clic peut fixer une position de référence.
 */
export default function Carte({
  points,
  hauteur = 320,
  surClic,
  surSelection,
}: {
  points: PointCarte[];
  hauteur?: number;
  surClic?: (latitude: number, longitude: number) => void;
  /** Clic sur un point : ouvrir sa fiche. */
  surSelection?: (id: string) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const centre: [number, number] = points[0]
    ? [points[0].latitude, points[0].longitude]
    : [14.7, -17.4];
  return (
    <MapContainer
      center={centre}
      zoom={12}
      scrollWheelZoom={false}
      style={{ height: hauteur, width: '100%', borderRadius: 12, zIndex: 0 }}
      aria-label={t('etablissement.fiche.carte')}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Cadrage points={points} />
      {surClic && <Clic surClic={surClic} />}
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.latitude, p.longitude]}
          radius={p.actif ? 10 : p.discret ? 5 : 7}
          eventHandlers={surSelection ? { click: () => surSelection(p.id) } : undefined}
          pathOptions={{
            color: '#FFFFFF',
            weight: 2,
            fillColor: p.actif ? theme.palette.secondary.main : theme.palette.primary.main,
            fillOpacity: p.discret ? 0.6 : 0.95,
          }}
        >
          <Tooltip>{p.libelle}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
