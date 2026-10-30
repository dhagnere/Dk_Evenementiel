import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Alert, Button, Grid, Select, Slider, Space, Spin, Typography } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useGeocodage } from '../context/GeocodageContext';
import type { Evenement } from '../types';
import { estBrouillon, estValide } from '../types';
import { COULEUR_BROUILLON, COULEUR_NON_VALIDE, COULEUR_VALIDE } from '../lib/validationColors';
import { formatDuree } from '../lib/formatDuree';
import { formatTitreEvenement } from '../lib/formatTitre';
import { regrouperParEvenement } from '../lib/regrouperEvenements';

/** Ex. « moins d'une minute », « 1 minute », « 4 minutes ». */
function formatTempsEstime(secondes: number): string {
  if (secondes < 60) return "moins d'une minute";
  const minutes = Math.ceil(secondes / 60);
  return minutes <= 1 ? '1 minute' : `${minutes} minutes`;
}

const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

// Correctif standard react-leaflet/Vite : les icônes par défaut ne se chargent pas sans ceci,
// leur chemin étant résolu de façon incorrecte par les bundlers.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/** Centre par défaut de la carte : Dunkerque. */
const CENTRE_DUNKERQUE: [number, number] = [51.0347, 2.3772];

interface LieuGeolocalise {
  lieu: string;
  latitude: number;
  longitude: number;
  evenements: Evenement[];
}

/** Regroupe les événements géocodés par lieu (adresse) exact : un marqueur par lieu distinct. */
function regrouperParLieu(evenements: Evenement[]): LieuGeolocalise[] {
  const parLieu = new Map<string, LieuGeolocalise>();
  for (const e of evenements) {
    if (e.statutGeocodage !== 'ok' || e.latitude === null || e.longitude === null) continue;
    const cle = e.lieu.trim();
    const existant = parLieu.get(cle);
    if (existant) {
      existant.evenements.push(e);
    } else {
      parLieu.set(cle, { lieu: cle, latitude: e.latitude, longitude: e.longitude, evenements: [e] });
    }
  }
  return [...parLieu.values()];
}

/** Recentre/cadre la carte selon le nombre de lieux affichés après filtrage. */
function RecentrageCarte({ lieux }: { lieux: LieuGeolocalise[] }) {
  const map = useMap();
  useEffect(() => {
    if (lieux.length === 0) {
      map.flyTo(CENTRE_DUNKERQUE, 12);
    } else if (lieux.length === 1) {
      map.flyTo([lieux[0].latitude, lieux[0].longitude], 16);
    } else {
      const limites = L.latLngBounds(lieux.map((l) => [l.latitude, l.longitude] as [number, number]));
      map.flyToBounds(limites, { padding: [40, 40], maxZoom: 15 });
    }
  }, [lieux, map]);
  return null;
}

type PasSlider = 'JOUR' | 'SEMAINE' | 'MOIS' | 'TRIMESTRE' | 'ANNEE' | 'TOUTES';

const ETAPES_SLIDER: { valeur: PasSlider; label: string; labelCourt: string; labelTresCourt: string }[] = [
  { valeur: 'JOUR', label: 'Jour', labelCourt: 'Jour', labelTresCourt: 'J' },
  { valeur: 'SEMAINE', label: 'Semaine', labelCourt: 'Semaine', labelTresCourt: 'S' },
  { valeur: 'MOIS', label: 'Mois', labelCourt: 'Mois', labelTresCourt: 'M' },
  { valeur: 'TRIMESTRE', label: 'Trimestre', labelCourt: 'Trimestre', labelTresCourt: 'T' },
  { valeur: 'ANNEE', label: 'Année', labelCourt: 'Année', labelTresCourt: 'A' },
  { valeur: 'TOUTES', label: 'Toutes les dates', labelCourt: 'Toutes', labelTresCourt: 'Tout' },
];

/** Borne de fin de la fenêtre d'affichage, `null` pour « Toutes les dates » (pas de filtrage). */
function finFenetre(pas: PasSlider, depuis: Date): Date | null {
  const fin = new Date(depuis);
  switch (pas) {
    case 'JOUR':
      fin.setDate(fin.getDate() + 1);
      return fin;
    case 'SEMAINE':
      fin.setDate(fin.getDate() + 7);
      return fin;
    case 'MOIS':
      fin.setMonth(fin.getMonth() + 1);
      return fin;
    case 'TRIMESTRE':
      fin.setMonth(fin.getMonth() + 3);
      return fin;
    case 'ANNEE':
      fin.setFullYear(fin.getFullYear() + 1);
      return fin;
    case 'TOUTES':
      return null;
  }
}

function dateReference(e: Evenement): Date | null {
  const brute = e.dateDeDebut ?? e.dateClef ?? e.dateDeFin;
  return brute ? new Date(brute) : null;
}

/** Ne garde que les événements dont la date se situe entre aujourd'hui et la fin de la fenêtre choisie. */
function filtrerParFenetre(evenements: Evenement[], pas: PasSlider): Evenement[] {
  if (pas === 'TOUTES') return evenements;
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const fin = finFenetre(pas, debut)!;
  return evenements.filter((e) => {
    const d = dateReference(e);
    return d !== null && d >= debut && d < fin;
  });
}

export default function Carte() {
  const { estAdministrateur } = useAuth();
  const breakpoint = useBreakpoint();
  const mobile = !breakpoint.sm;
  const { enCours: geocodageEnCours, secondesRestantesEstimees, derniereMiseAJour, demarrer: demarrerGeocodage } = useGeocodage();
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [quartier, setQuartier] = useState('ALL');
  const [quartiers, setQuartiers] = useState<{ label: string }[]>([]);
  const [pasIndex, setPasIndex] = useState(5); // 5 = « Toutes les dates » par défaut

  const charger = async () => {
    setChargement(true);
    try {
      const data = await api.get<{ items: Evenement[] }>('/evenements');
      setEvenements(data.items);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);

  // Un import CSV déclenche le géocodage automatiquement (voir GeocodageContext) : à chaque lot
  // traité, on recharge les événements pour faire apparaître les nouveaux marqueurs au fur et à mesure.
  useEffect(() => {
    if (derniereMiseAJour > 0) charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derniereMiseAJour]);

  useEffect(() => {
    api.get<{ quartiers: { label: string }[] }>('/evenements/options-filtres').then((res) => setQuartiers(res.quartiers));
  }, []);

  const pasSlider = ETAPES_SLIDER[pasIndex].valeur;

  // Un événement sur plusieurs jours ne doit produire qu'une seule fiche (pas une par jour occupé) ;
  // les brouillons apparaissent comme les autres, signalés par la même pastille grise qu'ailleurs.
  const evenementsUtiles = useMemo(() => regrouperParEvenement(evenements), [evenements]);

  const evenementsFiltres = useMemo(() => {
    let liste = evenementsUtiles;
    if (quartier !== 'ALL') liste = liste.filter((e) => e.quartier === quartier);
    liste = filtrerParFenetre(liste, pasSlider);
    return liste;
  }, [evenementsUtiles, quartier, pasSlider]);

  const lieux = useMemo(() => regrouperParLieu(evenementsFiltres), [evenementsFiltres]);
  const nonGeolocalises = evenements.filter((e) => e.statutGeocodage !== 'ok').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: mobile ? '100%' : 220 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Quartier</div>
          <Select
            value={quartier}
            onChange={setQuartier}
            style={{ width: '100%' }}
            options={[{ value: 'ALL', label: 'Tous les quartiers' }, ...quartiers.map((q) => ({ value: q.label, label: q.label }))]}
          />
        </div>
        <div style={{ minWidth: mobile ? '100%' : 320, flex: 1, paddingRight: mobile ? 16 : 40 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Période affichée</div>
          <Slider
            min={0}
            max={ETAPES_SLIDER.length - 1}
            step={1}
            value={pasIndex}
            onChange={setPasIndex}
            marks={Object.fromEntries(ETAPES_SLIDER.map((e, i) => [i, mobile ? e.labelTresCourt : e.labelCourt]))}
            tooltip={{ formatter: (i) => (i !== undefined ? ETAPES_SLIDER[i].label : '') }}
          />
        </div>
        {estAdministrateur && (
          <Space direction="vertical" size={4} style={{ width: mobile ? '100%' : undefined }}>
            <Button block={mobile} icon={<EnvironmentOutlined />} loading={geocodageEnCours} onClick={demarrerGeocodage}>
              Géocoder les événements
            </Button>
            {nonGeolocalises > 0 && !geocodageEnCours && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {nonGeolocalises} événement(s) non géolocalisé(s)
              </Text>
            )}
          </Space>
        )}
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        {lieux.length} lieu(x) géolocalisé(s) — {lieux.reduce((n, l) => n + l.evenements.length, 0)} événement(s) affiché(s) sur la
        carte
        {nonGeolocalises > 0 && !estAdministrateur && ` (${nonGeolocalises} événement(s) non géolocalisé(s) non affiché(s))`}
      </Text>

      <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
        {geocodageEnCours && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: 'rgba(255, 255, 255, 0.75)',
            }}
          >
            <Spin size="large" />
            <Text strong>Géolocalisation en cours…</Text>
            <Text type="secondary">
              Temps estimé : {secondesRestantesEstimees !== null ? formatTempsEstime(secondesRestantesEstimees) : '…'}
            </Text>
          </div>
        )}
        <MapContainer center={CENTRE_DUNKERQUE} zoom={12} style={{ height: mobile ? 420 : 600, width: '100%' }}>
          {/*
            Deux fournisseurs de tuiles gratuits déjà essayés et écartés ici :
            - tile.openstreetmap.org (serveur "de démo" d'OSM) : bloque (403 "App is not following
              the tile usage policy") tout usage d'application régulier, cf.
              https://operations.osmfoundation.org/policies/tiles/ ;
            - basemaps.cartocdn.com (CARTO) : n'accepte plus de requêtes anonymes, affiche désormais
              un tuile "API key required" sans compte/clé CARTO.
            Esri World Street Map ne demande ni compte ni clé et reste stable sur ce point depuis des
            années ; ses données ne viennent pas d'OpenStreetMap, d'où l'attribution différente.
          */}
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
          <RecentrageCarte lieux={lieux} />
          {lieux.map((l) => (
            <Marker key={l.lieu} position={[l.latitude, l.longitude]}>
              <Popup>
                <div style={{ maxWidth: 260 }}>
                  <Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
                    {l.lieu}
                  </Title>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {l.evenements.map((e) => (
                      <div key={e._id} style={{ fontSize: 12 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            marginRight: 6,
                            background: estBrouillon(e) ? COULEUR_BROUILLON : estValide(e) ? COULEUR_VALIDE : COULEUR_NON_VALIDE,
                          }}
                        />
                        <strong>{formatTitreEvenement(e.nom)}</strong>
                        {formatDuree(e) && (
                          <div style={{ marginLeft: 14, color: '#8c8c8c' }}>{formatDuree(e)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {!chargement && lieux.length === 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message="Aucun événement géolocalisé pour le moment."
          description={
            estAdministrateur
              ? 'Cliquez sur « Géocoder les événements » ci-dessus pour localiser les événements à partir de leur lieu.'
              : "Revenez plus tard, une fois que les lieux des événements auront été géolocalisés."
          }
        />
      )}
    </div>
  );
}
