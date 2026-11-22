import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  AltitudeMode,
  APIProvider,
  ColorScheme,
  GestureHandling,
  InfoWindow,
  Map as GoogleMapView,
  Map3D,
  MapMode,
  Marker3D,
  Pin,
  Popover,
  useMap,
  useMapsLibrary,
  type MapCameraChangedEvent,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  Polygon3D,
  Polyline3D,
  type Map3DCameraChangedEvent,
  type Map3DRef,
} from '@vis.gl/react-google-maps/3d';
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clock,
  Clock3,
  Columns2,
  Compass,
  Crop,
  Download,
  Droplets,
  ExternalLink,
  Flame,
  Fuel,
  Globe,
  Hexagon,
  Layers,
  List,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  Pause,
  Phone,
  Play,
  Plus,
  Radar,
  RotateCw,
  Route as RouteIcon,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  analyzeSpatialBBox,
  buildBBoxGeoJsonFeature,
  buildDemandHotspotsGeoJson,
  buildOilcomGeoJsonExport,
  buildStationBuffersGeoJson,
  buildStationVoronoiGeoJson,
  downloadGeoJsonFile,
  extract3DOverlaysFromGeoJson,
  extractGeoJsonPoints,
  OILCOM_GIS_FEATURE_COLLECTION,
  parseAnySpatialFileToGeoJson,
  type GeoBoundingBox,
  type GeoJsonFeature,
  type GeoJsonFeatureCollection,
  type TimeSliceKey,
} from '../data/oilcomGeoJson';
import { t } from '../i18n/translations';
import { createStationRecord } from '../lib/firestoreActions';
import type { GasOrder, Language, Station } from '../types/oilcom';
import { formatTzs } from './OilcomBrand';

interface StationsMapModuleProps {
  lang: Language;
  stations: Station[];
  orders?: GasOrder[];
  googleMapsApiKey: string;
  canManageStations?: boolean;
  onOrderAtStation: (station: Station, orderKind?: 'gas' | 'fuel') => void;
}

interface DiscoveredPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  isOilcom?: boolean;
  oilcomKind?: 'fuel' | 'gas' | 'both';
  category?: string;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean | null;
  weekdayHours?: string[];
  phone?: string;
  websiteURI?: string;
  editorialSummary?: string;
  photoUrl?: string;
  businessStatus?: string;
  googleMapsURI?: string;
}

interface ActiveRouteInfo {
  targetId: string;
  targetName: string;
  distanceMeters: number;
  durationMillis: number;
  usingFallbackOrigin: boolean;
}

interface SelectedGisSummary {
  title: string;
  description?: string;
  kindLabel: string;
  eta?: string;
  feeTzs?: number;
}

const DEFAULT_CENTER = { lat: -6.7924, lng: 39.2083 };

function detectWebGL2Support(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function buildGoogleMapsPinUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${lat.toFixed(6)},${lng.toFixed(6)}`
  )}`;
}

function suggestStationCode(name: string, city: string): string {
  const cleanPart = (val: string) =>
    val
      .toUpperCase()
      .replace(/OILCOM/gi, '')
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 4);
  const cityTag = cleanPart(city) || 'TZ';
  const nameTag = cleanPart(name) || 'STN';
  const suffix = String(Date.now()).slice(-3);
  return `OIL-${cityTag}-${nameTag}-${suffix}`.slice(0, 24);
}

function parseCityRegionFromAddress(address: string): {
  city: string;
  region: string;
} {
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^tanzania$/i.test(p));
  if (parts.length >= 2) {
    const cityCandidate = parts[parts.length - 1].replace(/\d+/g, '').trim();
    if (cityCandidate.length >= 2) {
      return { city: cityCandidate, region: cityCandidate };
    }
  }
  return { city: 'Dar es Salaam', region: 'Dar es Salaam' };
}

function isOilcomBrandName(name: string): boolean {
  return /oil\s*com/i.test(name);
}

function classifyOilcomPlaceKind(
  name: string,
  address: string
): 'fuel' | 'gas' | 'both' {
  const text = `${name} ${address}`.toLowerCase();
  const hasExplicitLpg =
    /\b(lpg|gesi|cooking\s*gas|gas\s*cylinder|mitungi|oilcom\s*gas|gas\s*depot|gas\s*hub|oryx\s*gas|total\s*gas)\b/i.test(
      text
    );
  const hasExplicitFuel =
    /\b(petrol|diesel|fuel|mafuta|service\s*station|filling\s*station)\b/i.test(
      text
    );
  if (hasExplicitLpg && !hasExplicitFuel) return 'gas';
  if (hasExplicitLpg && hasExplicitFuel) return 'both';
  return 'fuel';
}

function extractQueryFromGoogleMapsInput(raw: string): {
  query: string;
  isShortMapsLink: boolean;
} {
  const trimmed = raw.trim();
  if (/https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(trimmed)) {
    return { query: trimmed, isShortMapsLink: true };
  }
  const placeMatch = trimmed.match(
    /google\.com\/maps\/place\/([^/@?]+)/i
  );
  if (placeMatch?.[1]) {
    try {
      const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
      if (decoded.length >= 2) return { query: decoded, isShortMapsLink: false };
    } catch {
      // fall back
    }
  }
  const coordMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (coordMatch?.[1] && coordMatch?.[2]) {
    return { query: `${coordMatch[1]},${coordMatch[2]}`, isShortMapsLink: false };
  }
  return { query: trimmed, isShortMapsLink: false };
}

function discoveredPlaceToStation(pl: DiscoveredPlace): Station {
  const kind = pl.oilcomKind || classifyOilcomPlaceKind(pl.name, pl.address);
  const { city, region } = parseCityRegionFromAddress(pl.address);
  return {
    id: `gplace-${pl.id}`,
    name: pl.name,
    code: suggestStationCode(pl.name, city),
    stationKind: kind,
    city,
    region,
    address: pl.address || city,
    lat: pl.lat,
    lng: pl.lng,
    open24Hours: true,
    hasGas: kind === 'gas' || kind === 'both',
    hasFuel: kind === 'fuel' || kind === 'both',
    hasLubricants: true,
    status: 'active',
  };
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    const s = String(err || '');
    return (
      s.includes('RESOURCE_EXHAUSTED') ||
      s.includes('OVER_QUERY_LIMIT') ||
      s.includes('OverQuotaMapError')
    );
  }
  const e = err as Record<string, unknown>;
  const msg = String(e.message || e.status || e.code || '');
  return (
    e.status === 429 ||
    e.code === 'RESOURCE_EXHAUSTED' ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('429')
  );
}

type GoogleMapInstance = ReturnType<typeof useMap>;

const GOOGLE_MAP_LIBRARIES = ['maps3d', 'marker'];
const INFO_WINDOW_PIXEL_OFFSET: [number, number] = [0, -34];

interface MapPolyline {
  setMap: (map: GoogleMapInstance) => void;
  setOptions: (options: Record<string, unknown>) => void;
}

interface DataLayerFeature {
  getProperty: (name: string) => unknown;
  forEachProperty: (callback: (value: unknown, key: string) => void) => void;
}

interface DataLayerMouseEvent {
  feature: DataLayerFeature;
}

interface DataLayerListener {
  remove: () => void;
}

interface DataLayerHandle {
  forEach: (callback: (feature: DataLayerFeature) => void) => void;
  remove: (feature: DataLayerFeature) => void;
  addGeoJson: (geoJson: object) => DataLayerFeature[];
  setStyle: (
    style:
      | Record<string, unknown>
      | ((feature: DataLayerFeature) => Record<string, unknown>)
  ) => void;
  revertStyle: () => void;
  overrideStyle: (
    feature: DataLayerFeature,
    style: Record<string, unknown>
  ) => void;
  addListener: (
    eventName: string,
    handler: (event: DataLayerMouseEvent) => void
  ) => DataLayerListener;
}

interface RawPlaceResult {
  id: string;
  displayName?: string | null;
  formattedAddress?: string | null;
  primaryTypeDisplayName?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  businessStatus?: string | null;
  googleMapsURI?: string | null;
  photos?: Array<{ getURI?: (opts?: { maxWidth?: number; maxHeight?: number }) => string }>;
  location?: { lat: () => number; lng: () => number } | null;
}

function MapInstanceBridge({
  onMapReady,
}: {
  onMapReady: (map: GoogleMapInstance) => void;
}) {
  const map = useMap();
  useEffect(() => {
    onMapReady(map);
    return () => {
      onMapReady(null);
    };
  }, [map, onMapReady]);
  return null;
}

function StationsMapWorkspace({
  lang,
  stations: propStations,
  orders = [],
  canManageStations = false,
  onOrderAtStation,
}: Omit<StationsMapModuleProps, 'googleMapsApiKey'>) {
  const [mapInstance, setMapInstance] = useState<GoogleMapInstance>(null);
  const map3dRef = useRef<Map3DRef | null>(null);
  const [map3dElement, setMap3dElement] = useState<EventTarget | null>(null);
  const geojsonInputRef = useRef<HTMLInputElement | null>(null);

  const handleMap3dRef = useCallback((instance: Map3DRef | null) => {
    map3dRef.current = instance;
    setMap3dElement(instance?.map3d ?? null);
  }, []);

  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const coreLib = useMapsLibrary('core');

  const [supportsWebGL2] = useState<boolean>(() => detectWebGL2Support());
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [synced2DView, setSynced2DView] = useState<{
    center: { lat: number; lng: number };
    zoom: number;
  }>({
    center: DEFAULT_CENTER,
    zoom: 11,
  });
  const [map3dCamera, setMap3dCamera] = useState({
    center: {
      lat: propStations[0]?.lat ?? DEFAULT_CENTER.lat,
      lng: propStations[0]?.lng ?? DEFAULT_CENTER.lng,
      altitude: 80,
    },
    range: 2800,
    heading: 18,
    tilt: 64,
    roll: 0,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [oilcomCategoryFilter, setOilcomCategoryFilter] = useState<
    'all' | 'fuel' | 'gas'
  >('all');
  const [showExternalPlaces, setShowExternalPlaces] = useState(false);
  const [only24h, setOnly24h] = useState(false);
  const [onlyLubricants, setOnlyLubricants] = useState(false);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // Open Geospatial (OGC GeoJSON GIS + opengeos tools) layer state
  const [showGisLayer, setShowGisLayer] = useState(true);
  const [bufferRadiusKm, setBufferRadiusKm] = useState<0 | 3 | 5 | 10>(5);
  const [showVoronoi, setShowVoronoi] = useState(false);
  const [showHotspots, setShowHotspots] = useState(false);
  const [timeSlice, setTimeSlice] = useState<TimeSliceKey>('all');
  const [timePlaying, setTimePlaying] = useState(false);

  // Interactive Spatial BBox Filter (pure React + Maps click, no deprecated DrawingManager)
  const [bboxDrawMode, setBboxDrawMode] = useState(false);
  const [bboxCorner1, setBboxCorner1] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [activeBBox, setActiveBBox] = useState<GeoBoundingBox | null>(null);

  // Split-Map Swipe Comparison (leafmap.split_map inspired, 2D mode)
  const [splitMode, setSplitMode] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [splitRightMap, setSplitRightMap] = useState<GoogleMapInstance>(null);
  const splitSyncLockRef = useRef<'left' | 'right' | null>(null);

  const [customGeoJson, setCustomGeoJson] =
    useState<GeoJsonFeatureCollection | null>(null);
  const [customGeoJsonName, setCustomGeoJsonName] = useState<string | null>(null);
  const [selectedGisFeature, setSelectedGisFeature] =
    useState<SelectedGisSummary | null>(null);

  const [optimisticStations, setOptimisticStations] = useState<Station[]>([]);
  const stations = useMemo(() => {
    const validProp = propStations.filter(
      (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)
    );
    const existingIds = new Set(validProp.map((s) => s.id));
    const pending = optimisticStations.filter(
      (s) =>
        !existingIds.has(s.id) && Number.isFinite(s.lat) && Number.isFinite(s.lng)
    );
    return pending.length > 0 ? [...validProp, ...pending] : validProp;
  }, [propStations, optimisticStations]);

  const [selectedStation, setSelectedStation] = useState<Station | null>(
    stations[0] || null
  );
  const [selectedPlace, setSelectedPlace] = useState<DiscoveredPlace | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  // Add Station Directly on Map (2D & 3D + Google Place conversion)
  const [addStationMode, setAddStationMode] = useState(false);
  const [draftStationCoords, setDraftStationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [addStationModalOpen, setAddStationModalOpen] = useState(false);
  const [addStationLookupLoading, setAddStationLookupLoading] = useState(false);
  const [savingStation, setSavingStation] = useState(false);
  const [addStationError, setAddStationError] = useState<string | null>(null);
  const [createdGoogleMapsBanner, setCreatedGoogleMapsBanner] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [stationDraft, setStationDraft] = useState({
    name: '',
    code: '',
    stationKind: 'both' as 'fuel' | 'gas' | 'both',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
    address: '',
    lat: DEFAULT_CENTER.lat,
    lng: DEFAULT_CENTER.lng,
    open24Hours: true,
    hasLubricants: true,
    petrolPriceTzs: 3150,
    dieselPriceTzs: 3050,
    pumpsCount: 6,
    lpg6kgStock: 30,
    lpg15kgStock: 25,
    lpg38kgStock: 10,
    sourceGoogleMapsURI: '',
  });

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const [oilcomPlaces, setOilcomPlaces] = useState<DiscoveredPlace[]>([]);
  const [discoveredPlaces, setDiscoveredPlaces] = useState<DiscoveredPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [poiDetailsLoading, setPoiDetailsLoading] = useState(false);
  const [placesNotice, setPlacesNotice] = useState<string | null>(null);
  const hasAutoLoadedOilcomRef = useRef(false);
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 1024px)').matches
      : true
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const [routeLoading, setRouteLoading] = useState(false);
  const [activeRoute, setActiveRoute] = useState<ActiveRouteInfo | null>(null);
  const [routePath3D, setRoutePath3D] = useState<
    { lat: number; lng: number; altitude: number }[]
  >([]);
  const polylinesRef = useRef<MapPolyline[]>([]);

  const isNative3DActive = viewMode === '3d' && supportsWebGL2;

  const hasAnyGisOverlay =
    showGisLayer ||
    bufferRadiusKm > 0 ||
    showVoronoi ||
    showHotspots ||
    Boolean(activeBBox) ||
    Boolean(customGeoJson) ||
    splitMode;

  useEffect(() => {
    if (!showHotspots) {
      setTimePlaying(false);
      return;
    }
    if (!timePlaying) return;
    const sequence: TimeSliceKey[] = ['morning', 'midday', 'evening', 'night'];
    const id = window.setInterval(() => {
      setTimeSlice((prev) => {
        const idx = sequence.indexOf(prev);
        return sequence[(idx + 1) % sequence.length];
      });
    }, 1800);
    return () => window.clearInterval(id);
  }, [timePlaying, showHotspots]);

  const summarizeGisFeature = useCallback(
    (
      props: Record<string, unknown> | null | undefined
    ): SelectedGisSummary => {
      const kind = String(props?.kind ?? 'custom');
      const kindLabel =
        kind === 'zone'
          ? lang === 'sw'
            ? 'Kanda ya Usambazaji (GIS)'
            : 'Delivery Coverage Zone (GIS)'
          : kind === 'corridor'
            ? lang === 'sw'
              ? 'Ukanda wa Usafirishaji (GIS)'
              : 'Supply Corridor (GIS)'
            : kind === 'buffer'
              ? lang === 'sw'
                ? 'Mduara wa Huduma (Service Buffer)'
                : 'Service Radius Buffer (GIS)'
              : kind === 'voronoi'
                ? lang === 'sw'
                  ? 'Eneo la Kituo (Voronoi Territory)'
                  : 'Voronoi Catchment Territory'
                : kind === 'bbox'
                  ? lang === 'sw'
                    ? 'Eneo la Uchambuzi (Spatial BBox)'
                    : 'Spatial Filter Bounding Box'
                  : kind === 'hotspot'
                    ? lang === 'sw'
                      ? 'Msongamano wa Mahitaji (Spatial Density)'
                      : 'Demand Spatial Hotspot (GIS)'
                    : customGeoJsonName
                      ? `GIS · ${customGeoJsonName}`
                      : 'GeoJSON Layer';
      const title = String(
        (lang === 'sw' ? props?.nameSw : props?.nameEn) ||
          props?.nameSw ||
          props?.nameEn ||
          props?.name ||
          props?.TITLE ||
          props?.id ||
          (lang === 'sw' ? 'Kipengele cha GIS' : 'GIS Feature')
      );
      const description =
        typeof (lang === 'sw' ? props?.descriptionSw : props?.descriptionEn) ===
        'string'
          ? String(lang === 'sw' ? props?.descriptionSw : props?.descriptionEn)
          : typeof props?.description === 'string'
            ? props.description
            : undefined;
      const eta = typeof props?.eta === 'string' ? props.eta : undefined;
      const feeTzs =
        typeof props?.feeTzs === 'number' ? props.feeTzs : undefined;
      return { title, description, kindLabel, eta, feeTzs };
    },
    [lang, customGeoJsonName]
  );

  const handleSelect3DGisFeature = useCallback(
    (feature: GeoJsonFeature) => {
      setSelectedGisFeature(summarizeGisFeature(feature.properties));
    },
    [summarizeGisFeature]
  );

  const clearRoutePolylines = useCallback(() => {
    polylinesRef.current.forEach((p) => {
      try {
        p.setMap(null);
      } catch {
        // ignore torn-down map polyline cleanup
      }
    });
    polylinesRef.current = [];
    setRoutePath3D([]);
    setActiveRoute(null);
  }, []);

  useEffect(() => {
    return () => {
      polylinesRef.current.forEach((p) => {
        try {
          p.setMap(null);
        } catch {
          // ignore unmount cleanup
        }
      });
      polylinesRef.current = [];
    };
  }, []);

  const hasActiveFilter =
    only24h || oilcomCategoryFilter !== 'all' || onlyLubricants || showExternalPlaces;

  const dedupedOilcomPlaces = useMemo(() => {
    return oilcomPlaces.filter(
      (pl) =>
        !stations.some(
          (st) => haversineKm(st.lat, st.lng, pl.lat, pl.lng) < 0.15
        )
    );
  }, [oilcomPlaces, stations]);

  const filteredOilcomPlaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = dedupedOilcomPlaces.filter((pl) => {
      const kind = pl.oilcomKind || classifyOilcomPlaceKind(pl.name, pl.address);
      if (oilcomCategoryFilter === 'gas' && kind !== 'gas' && kind !== 'both') {
        return false;
      }
      if (oilcomCategoryFilter === 'fuel' && kind !== 'fuel' && kind !== 'both') {
        return false;
      }
      if (!q) return true;
      return (
        pl.name.toLowerCase().includes(q) || pl.address.toLowerCase().includes(q)
      );
    });
    if (userCoords) {
      return [...list].sort(
        (a, b) =>
          haversineKm(userCoords.lat, userCoords.lng, a.lat, a.lng) -
          haversineKm(userCoords.lat, userCoords.lng, b.lat, b.lng)
      );
    }
    return list;
  }, [dedupedOilcomPlaces, searchQuery, oilcomCategoryFilter, userCoords]);

  const stationCategoryCounts = useMemo(() => {
    let fuel = 0;
    let gas = 0;
    stations.forEach((s) => {
      const hasFuel = s.stationKind === 'fuel' || s.stationKind === 'both' || s.hasFuel !== false;
      const hasGas = s.stationKind === 'gas' || s.stationKind === 'both' || s.hasGas !== false;
      if (hasFuel) fuel += 1;
      if (hasGas) gas += 1;
    });
    dedupedOilcomPlaces.forEach((pl) => {
      const kind = pl.oilcomKind || classifyOilcomPlaceKind(pl.name, pl.address);
      if (kind === 'fuel' || kind === 'both') fuel += 1;
      if (kind === 'gas' || kind === 'both') gas += 1;
    });
    return { all: stations.length + dedupedOilcomPlaces.length, fuel, gas };
  }, [stations, dedupedOilcomPlaces]);

  const filteredStations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = stations.filter((s) => {
      const hasGas = s.stationKind === 'gas' || s.stationKind === 'both' || s.hasGas !== false;
      const hasFuel = s.stationKind === 'fuel' || s.stationKind === 'both' || s.hasFuel !== false;
      if (only24h && !s.open24Hours) return false;
      if (oilcomCategoryFilter === 'gas' && !hasGas) return false;
      if (oilcomCategoryFilter === 'fuel' && !hasFuel) return false;
      if (onlyLubricants && !s.hasLubricants) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
      );
    });
    if (userCoords) {
      return [...list].sort(
        (a, b) =>
          haversineKm(userCoords.lat, userCoords.lng, a.lat, a.lng) -
          haversineKm(userCoords.lat, userCoords.lng, b.lat, b.lng)
      );
    }
    return list;
  }, [
    stations,
    searchQuery,
    only24h,
    oilcomCategoryFilter,
    onlyLubricants,
    userCoords,
  ]);

  const voronoiGeoJson = useMemo<GeoJsonFeatureCollection>(
    () =>
      showVoronoi
        ? buildStationVoronoiGeoJson(filteredStations)
        : { type: 'FeatureCollection', features: [] },
    [showVoronoi, filteredStations]
  );

  const hotspotGeoJson = useMemo<GeoJsonFeatureCollection>(
    () =>
      showHotspots || splitMode
        ? buildDemandHotspotsGeoJson(stations, orders, timeSlice)
        : { type: 'FeatureCollection', features: [] },
    [showHotspots, splitMode, stations, orders, timeSlice]
  );

  const bboxGeoJsonFeature = useMemo<GeoJsonFeature | null>(
    () => (activeBBox ? buildBBoxGeoJsonFeature(activeBBox) : null),
    [activeBBox]
  );

  const bboxStats = useMemo(
    () => (activeBBox ? analyzeSpatialBBox(activeBBox, stations, orders) : null),
    [activeBBox, stations, orders]
  );

  const combinedGeoJson = useMemo<GeoJsonFeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...(showGisLayer ? OILCOM_GIS_FEATURE_COLLECTION.features : []),
        ...(bufferRadiusKm > 0
          ? buildStationBuffersGeoJson(filteredStations, bufferRadiusKm).features
          : []),
        ...voronoiGeoJson.features,
        ...(showHotspots ? hotspotGeoJson.features : []),
        ...(bboxGeoJsonFeature ? [bboxGeoJsonFeature] : []),
        ...(customGeoJson?.features ?? []),
      ],
    }),
    [
      showGisLayer,
      bufferRadiusKm,
      filteredStations,
      voronoiGeoJson,
      showHotspots,
      hotspotGeoJson,
      bboxGeoJsonFeature,
      customGeoJson,
    ]
  );

  // Split-map left pane focuses on Service Buffers + Voronoi Catchments + Zones
  const leftSplitGeoJson = useMemo<GeoJsonFeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...OILCOM_GIS_FEATURE_COLLECTION.features.filter(
          (f) => f.properties?.kind === 'zone'
        ),
        ...buildStationBuffersGeoJson(
          filteredStations,
          bufferRadiusKm > 0 ? bufferRadiusKm : 5
        ).features,
        ...(voronoiGeoJson.features.length > 0
          ? voronoiGeoJson.features
          : buildStationVoronoiGeoJson(filteredStations).features),
        ...(bboxGeoJsonFeature ? [bboxGeoJsonFeature] : []),
        ...(customGeoJson?.features ?? []),
      ],
    }),
    [filteredStations, bufferRadiusKm, voronoiGeoJson, bboxGeoJsonFeature, customGeoJson]
  );

  // Split-map right pane focuses on Satellite view + Demand Hotspots & Supply Corridors
  const rightSplitGeoJson = useMemo<GeoJsonFeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...OILCOM_GIS_FEATURE_COLLECTION.features.filter(
          (f) => f.properties?.kind === 'corridor'
        ),
        ...hotspotGeoJson.features,
        ...(bboxGeoJsonFeature ? [bboxGeoJsonFeature] : []),
      ],
    }),
    [hotspotGeoJson, bboxGeoJsonFeature]
  );

  const overlays3D = useMemo(
    () => extract3DOverlaysFromGeoJson(combinedGeoJson),
    [combinedGeoJson]
  );

  const bindDataLayerGeoJson = useCallback(
    (
      targetMap: GoogleMapInstance,
      geoJson: GeoJsonFeatureCollection
    ): (() => void) | undefined => {
      if (!targetMap) return undefined;
      const dataLayer = targetMap.data as unknown as DataLayerHandle | undefined;
      if (!dataLayer) return undefined;
      try {
        dataLayer.forEach((feature: DataLayerFeature) => {
          dataLayer.remove(feature);
        });

        if (geoJson.features.length === 0) {
          return undefined;
        }

        dataLayer.addGeoJson(geoJson as unknown as object);
      } catch {
        return undefined;
      }

      dataLayer.setStyle((feature: DataLayerFeature) => {
        const strokeColor =
          (feature.getProperty('strokeColor') as string) || '#2563EB';
        const fillColor =
          (feature.getProperty('fillColor') as string) || strokeColor;
        const kind = (feature.getProperty('kind') as string) || 'zone';
        const customFillOpacity = feature.getProperty('fillOpacity');
        const fillOpacity =
          typeof customFillOpacity === 'number'
            ? customFillOpacity
            : kind === 'buffer'
              ? 0.09
              : kind === 'voronoi'
                ? 0.14
                : kind === 'bbox'
                  ? 0.14
                  : kind === 'hotspot'
                    ? 0.34
                    : kind === 'custom'
                      ? 0.24
                      : 0.16;
        return {
          fillColor,
          fillOpacity,
          strokeColor,
          strokeWeight:
            kind === 'corridor'
              ? 4
              : kind === 'bbox'
                ? 3
                : kind === 'buffer'
                  ? 1.5
                  : 2,
          strokeOpacity: kind === 'buffer' ? 0.72 : 0.92,
          zIndex:
            kind === 'bbox'
              ? 6
              : kind === 'hotspot'
                ? 5
                : kind === 'voronoi'
                  ? 3
                  : kind === 'zone'
                    ? 3
                    : 2,
        };
      });

      const overListener = dataLayer.addListener(
        'mouseover',
        (ev: DataLayerMouseEvent) => {
          try {
            dataLayer.revertStyle();
            dataLayer.overrideStyle(ev.feature, {
              strokeWeight: 3.5,
              fillOpacity: 0.36,
            });
          } catch {
            // ignore hover on stale feature
          }
        }
      );

      const outListener = dataLayer.addListener('mouseout', () => {
        try {
          dataLayer.revertStyle();
        } catch {
          // ignore mouseout on stale feature
        }
      });

      const clickListener = dataLayer.addListener(
        'click',
        (ev: DataLayerMouseEvent) => {
          try {
            const props: Record<string, unknown> = {};
            ev.feature.forEachProperty((value: unknown, key: string) => {
              props[key] = value;
            });
            setSelectedGisFeature(summarizeGisFeature(props));
          } catch {
            // ignore click on stale feature
          }
        }
      );

      return () => {
        try {
          overListener.remove();
          outListener.remove();
          clickListener.remove();
          dataLayer.forEach((feature: DataLayerFeature) => {
            dataLayer.remove(feature);
          });
        } catch {
          // ignore cleanup on destroyed map instance
        }
      };
    },
    [summarizeGisFeature]
  );

  // Sync OGC GeoJSON layer onto primary 2D Google Map Data Layer (map.data)
  useEffect(() => {
    if (!mapInstance || isNative3DActive) return;
    if (!hasAnyGisOverlay) {
      return bindDataLayerGeoJson(mapInstance, {
        type: 'FeatureCollection',
        features: [],
      });
    }
    const targetFc = splitMode ? leftSplitGeoJson : combinedGeoJson;
    return bindDataLayerGeoJson(mapInstance, targetFc);
  }, [
    mapInstance,
    isNative3DActive,
    hasAnyGisOverlay,
    splitMode,
    leftSplitGeoJson,
    combinedGeoJson,
    bindDataLayerGeoJson,
  ]);

  // Sync Split-Map Right Data Layer (Hotspots & Corridors)
  useEffect(() => {
    if (!splitRightMap || !splitMode || isNative3DActive) return;
    return bindDataLayerGeoJson(splitRightMap, rightSplitGeoJson);
  }, [splitRightMap, splitMode, isNative3DActive, rightSplitGeoJson, bindDataLayerGeoJson]);

  useEffect(() => {
    if (
      selectedStation &&
      !filteredStations.some((s) => s.id === selectedStation.id)
    ) {
      setSelectedStation(filteredStations[0] || null);
      setInfoOpen(false);
    } else if (!selectedStation && !selectedPlace && filteredStations.length > 0) {
      setSelectedStation(filteredStations[0]);
    }
  }, [filteredStations, selectedStation, selectedPlace]);

  const fly3DCameraTo = useCallback(
    (lat: number, lng: number, range = 1600, tilt = 64) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const targetCamera = {
        center: { lat, lng, altitude: 80 },
        range,
        heading: map3dCamera.heading,
        tilt,
        roll: 0,
      };
      setMap3dCamera(targetCamera);
      try {
        map3dRef.current?.flyCameraTo({
          endCamera: targetCamera,
          durationMillis: 1100,
        });
      } catch {
        // ignore if 3D map element is still initializing
      }
    },
    [map3dCamera.heading]
  );

  const focusCoords = useCallback(
    (lat: number, lng: number, zoomLevel = 14) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (isNative3DActive) {
        const range = zoomLevel >= 15 ? 950 : zoomLevel >= 13 ? 1700 : 3200;
        fly3DCameraTo(lat, lng, range, 64);
        return;
      }
      if (!mapInstance) return;
      try {
        mapInstance.panTo({ lat, lng });
        const currentZoom = mapInstance.getZoom() ?? 11;
        if (currentZoom < zoomLevel) {
          mapInstance.setZoom(zoomLevel);
        }
      } catch {
        // ignore if map is unmounting
      }
    },
    [isNative3DActive, fly3DCameraTo, mapInstance]
  );

  const toggle3DMode = useCallback(() => {
    setViewMode((prev) => {
      const next = prev === '2d' ? '3d' : '2d';
      if (next === '3d') {
        setSplitMode(false);
        const center2d = mapInstance?.getCenter();
        const anchorLat =
          center2d?.lat() ??
          selectedStation?.lat ??
          selectedPlace?.lat ??
          DEFAULT_CENTER.lat;
        const anchorLng =
          center2d?.lng() ??
          selectedStation?.lng ??
          selectedPlace?.lng ??
          DEFAULT_CENTER.lng;
        const currentZoom = Math.max(mapInstance?.getZoom() ?? 12, 10);
        const cosLat = Math.max(0.2, Math.cos((anchorLat * Math.PI) / 180));
        const computedRange = Math.min(
          Math.max(
            Math.round(((40075016 * cosLat) / Math.pow(2, currentZoom)) * 1.4),
            1200
          ),
          45000
        );
        setMap3dCamera((cam) => ({
          ...cam,
          center: { lat: anchorLat, lng: anchorLng, altitude: 80 },
          range: computedRange,
          tilt: 60,
        }));
        if (!supportsWebGL2) {
          setPlacesNotice(
            lang === 'sw'
              ? 'Kivinjari hakina WebGL2 kamili; tunaonyesha ramani ya 3D mbadala (tilted view).'
              : 'WebGL2 is unavailable on this browser; showing tilted 3D fallback view.'
          );
        }
      } else {
        const cosLat = Math.max(
          0.2,
          Math.cos((map3dCamera.center.lat * Math.PI) / 180)
        );
        const approxZoom = Math.min(
          Math.max(
            Math.round(
              Math.log2((40075016 * cosLat) / Math.max(map3dCamera.range / 1.4, 300))
            ),
            5
          ),
          18
        );
        setSynced2DView({
          center: {
            lat: map3dCamera.center.lat,
            lng: map3dCamera.center.lng,
          },
          zoom: approxZoom,
        });
      }
      return next;
    });
  }, [
    mapInstance,
    selectedStation,
    selectedPlace,
    supportsWebGL2,
    lang,
    map3dCamera.center.lat,
    map3dCamera.center.lng,
    map3dCamera.range,
  ]);

  const handleOrbit3D = useCallback(() => {
    if (!map3dRef.current) return;
    try {
      map3dRef.current.flyCameraAround({
        camera: map3dCamera,
        durationMillis: 6000,
        rounds: 0.35,
      });
    } catch {
      // ignore if 3D map element is unmounted
    }
  }, [map3dCamera]);

  const fetchFullPlaceDetails = useCallback(
    async (
      placeId: string,
      fallbackCoords?: { lat: number; lng: number },
      panToPlace = true
    ) => {
      if (!placesLib || !placeId) return;
      setPoiDetailsLoading(true);
      setPlacesNotice(null);
      try {
        const place = new placesLib.Place({
          id: placeId,
          requestedLanguage: lang,
          requestedRegion: 'tz',
        });
        await place.fetchFields({
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'primaryTypeDisplayName',
            'rating',
            'userRatingCount',
            'regularOpeningHours',
            'nationalPhoneNumber',
            'internationalPhoneNumber',
            'websiteURI',
            'googleMapsURI',
            'businessStatus',
            'editorialSummary',
            'photos',
          ],
        });

        let openNow: boolean | null = null;
        try {
          const isOpenFn = (
            place as unknown as { isOpen?: () => Promise<boolean | undefined> }
          ).isOpen;
          if (typeof isOpenFn === 'function') {
            const resOpen = await isOpenFn.call(place);
            if (typeof resOpen === 'boolean') openNow = resOpen;
          }
        } catch {
          openNow = null;
        }

        let photoUrl: string | undefined;
        try {
          photoUrl = place.photos?.[0]?.getURI({
            maxWidth: 640,
            maxHeight: 360,
          });
        } catch {
          photoUrl = undefined;
        }

        const lat = place.location?.lat() ?? fallbackCoords?.lat ?? DEFAULT_CENTER.lat;
        const lng = place.location?.lng() ?? fallbackCoords?.lng ?? DEFAULT_CENTER.lng;

        const placeName =
          place.displayName || (lang === 'sw' ? 'Eneo Lililochaguliwa' : 'Selected Place');
        const placeAddr =
          place.formattedAddress ||
          (lang === 'sw' ? 'Anwani haikupatikana' : 'Address unavailable');
        const placeIsOilcom = isOilcomBrandName(placeName);
        const detailed: DiscoveredPlace = {
          id: place.id || placeId,
          name: placeName,
          address: placeAddr,
          lat,
          lng,
          isOilcom: placeIsOilcom,
          oilcomKind: placeIsOilcom
            ? classifyOilcomPlaceKind(placeName, placeAddr)
            : undefined,
          category: place.primaryTypeDisplayName || undefined,
          rating: typeof place.rating === 'number' ? place.rating : undefined,
          userRatingCount:
            typeof place.userRatingCount === 'number'
              ? place.userRatingCount
              : undefined,
          openNow,
          weekdayHours: place.regularOpeningHours?.weekdayDescriptions?.length
            ? place.regularOpeningHours.weekdayDescriptions
            : undefined,
          phone:
            place.nationalPhoneNumber ||
            place.internationalPhoneNumber ||
            undefined,
          websiteURI: place.websiteURI || undefined,
          editorialSummary: place.editorialSummary || undefined,
          photoUrl,
          businessStatus: place.businessStatus || undefined,
          googleMapsURI: place.googleMapsURI || undefined,
        };

        if (placeIsOilcom) {
          setOilcomPlaces((prev) => {
            const idx = prev.findIndex((p) => p.id === detailed.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = { ...copy[idx], ...detailed };
              return copy;
            }
            return [detailed, ...prev];
          });
        } else {
          setDiscoveredPlaces((prev) => {
            const idx = prev.findIndex((p) => p.id === detailed.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = { ...copy[idx], ...detailed };
              return copy;
            }
            return [detailed, ...prev.slice(0, 19)];
          });
        }
        setSelectedStation(null);
        setSelectedPlace(detailed);
        setInfoOpen(true);
        setDetailsExpanded(true);
        setMobileListOpen(false);
        if (panToPlace) {
          focusCoords(lat, lng, 16);
        }
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      } finally {
        setPoiDetailsLoading(false);
      }
    },
    [placesLib, lang, focusCoords]
  );

  const handleSelectStation = useCallback(
    (station: Station) => {
      setSelectedPlace(null);
      setSelectedStation(station);
      setInfoOpen(true);
      setMobileListOpen(false);
      focusCoords(station.lat, station.lng, 14);
    },
    [focusCoords]
  );

  const handleSelectPlace = useCallback(
    (place: DiscoveredPlace) => {
      setSelectedStation(null);
      setSelectedPlace(place);
      setInfoOpen(true);
      setDetailsExpanded(true);
      setMobileListOpen(false);
      focusCoords(place.lat, place.lng, 15);
      if (!place.phone && !place.weekdayHours && !place.editorialSummary) {
        void fetchFullPlaceDetails(place.id, { lat: place.lat, lng: place.lng }, false);
      }
    },
    [focusCoords, fetchFullPlaceDetails]
  );

  const fitPointsOnMap = useCallback(
    (pts: { lat: number; lng: number }[]) => {
      if (pts.length === 0) return;
      if (isNative3DActive) {
        let minLat = 90;
        let maxLat = -90;
        let minLng = 180;
        let maxLng = -180;
        pts.forEach((p) => {
          if (p.lat < minLat) minLat = p.lat;
          if (p.lat > maxLat) maxLat = p.lat;
          if (p.lng < minLng) minLng = p.lng;
          if (p.lng > maxLng) maxLng = p.lng;
        });
        const centerLat = (minLat + maxLat) / 2;
        const centerLng = (minLng + maxLng) / 2;
        const spanKm = haversineKm(minLat, minLng, maxLat, maxLng);
        const range = Math.min(Math.max(spanKm * 1850, 2200), 1200000);
        fly3DCameraTo(centerLat, centerLng, range, spanKm > 80 ? 32 : 58);
        return;
      }
      if (!mapInstance || !coreLib) return;
      try {
        const bounds = new coreLib.LatLngBounds();
        pts.forEach((p) => {
          if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
            bounds.extend(p);
          }
        });
        mapInstance.fitBounds(bounds, 56);
      } catch {
        // ignore if map is unmounting
      }
    },
    [isNative3DActive, fly3DCameraTo, mapInstance, coreLib]
  );

  const visibleDiscoveredPlaces = useMemo(() => {
    if (!showExternalPlaces) return [];
    const oilcomIdSet = new Set(dedupedOilcomPlaces.map((p) => p.id));
    return discoveredPlaces.filter((p) => !p.isOilcom && !oilcomIdSet.has(p.id));
  }, [showExternalPlaces, discoveredPlaces, dedupedOilcomPlaces]);

  const fitAllMarkers = useCallback(() => {
    const pts: { lat: number; lng: number }[] = [
      ...filteredStations.map((s) => ({ lat: s.lat, lng: s.lng })),
      ...filteredOilcomPlaces.map((p) => ({ lat: p.lat, lng: p.lng })),
      ...visibleDiscoveredPlaces.map((p) => ({ lat: p.lat, lng: p.lng })),
    ];
    if (userCoords) pts.push(userCoords);
    fitPointsOnMap(pts);
  }, [
    filteredStations,
    filteredOilcomPlaces,
    visibleDiscoveredPlaces,
    userCoords,
    fitPointsOnMap,
  ]);

  const handleMapPointClick = useCallback(
    (lat: number, lng: number) => {
      if (!bboxDrawMode) return;
      if (!bboxCorner1) {
        setBboxCorner1({ lat, lng });
        return;
      }
      const latPad = Math.abs(bboxCorner1.lat - lat) < 0.002 ? 0.008 : 0;
      const lngPad = Math.abs(bboxCorner1.lng - lng) < 0.002 ? 0.008 : 0;
      const south = Math.min(bboxCorner1.lat, lat) - latPad;
      const north = Math.max(bboxCorner1.lat, lat) + latPad;
      const west = Math.min(bboxCorner1.lng, lng) - lngPad;
      const east = Math.max(bboxCorner1.lng, lng) + lngPad;
      setActiveBBox({ south, west, north, east });
      setBboxCorner1(null);
      setBboxDrawMode(false);
    },
    [bboxDrawMode, bboxCorner1]
  );

  const openAddStationModalAt = useCallback(
    async (
      coords: { lat: number; lng: number },
      prefill?: {
        name?: string;
        address?: string;
        city?: string;
        region?: string;
        placeId?: string;
        googleMapsURI?: string;
        stationKind?: 'fuel' | 'gas' | 'both';
      }
    ) => {
      if (!canManageStations) return;
      setAddStationMode(false);
      setBboxDrawMode(false);
      setBboxCorner1(null);
      setAddStationError(null);
      setDraftStationCoords(coords);

      const initialCityRegion = prefill?.address
        ? parseCityRegionFromAddress(prefill.address)
        : { city: 'Dar es Salaam', region: 'Dar es Salaam' };

      const baseName = prefill?.name?.trim() || '';
      const initialCity = prefill?.city || initialCityRegion.city;
      const initialRegion = prefill?.region || initialCityRegion.region;

      setStationDraft((prev) => ({
        ...prev,
        name: baseName,
        code: suggestStationCode(baseName || 'OILCOM', initialCity),
        stationKind: prefill?.stationKind || prev.stationKind || 'both',
        city: initialCity,
        region: initialRegion,
        address: prefill?.address?.trim() || '',
        lat: Number(coords.lat.toFixed(6)),
        lng: Number(coords.lng.toFixed(6)),
        sourceGoogleMapsURI:
          prefill?.googleMapsURI || buildGoogleMapsPinUrl(coords.lat, coords.lng),
      }));
      setAddStationModalOpen(true);

      if ((!prefill?.address || prefill?.placeId) && placesLib) {
        setAddStationLookupLoading(true);
        try {
          if (prefill?.placeId) {
            const place = new placesLib.Place({
              id: prefill.placeId,
              requestedLanguage: lang,
              requestedRegion: 'tz',
            });
            await place.fetchFields({
              fields: ['displayName', 'formattedAddress', 'googleMapsURI'],
            });
            const fetchedName = place.displayName || baseName;
            const fetchedAddr = place.formattedAddress || '';
            const parsed = fetchedAddr
              ? parseCityRegionFromAddress(fetchedAddr)
              : { city: initialCity, region: initialRegion };
            setStationDraft((prev) => ({
              ...prev,
              name: prev.name || fetchedName || '',
              address: prev.address || fetchedAddr || '',
              city: parsed.city,
              region: parsed.region,
              code: suggestStationCode(
                prev.name || fetchedName || 'OILCOM',
                parsed.city
              ),
              sourceGoogleMapsURI:
                place.googleMapsURI ||
                prev.sourceGoogleMapsURI ||
                buildGoogleMapsPinUrl(coords.lat, coords.lng),
            }));
          } else {
            const res = (await placesLib.Place.searchNearby({
              fields: ['displayName', 'formattedAddress'],
              locationRestriction: {
                center: coords,
                radius: 220,
              },
              maxResultCount: 1,
              language: lang,
              region: 'tz',
            })) as {
              places?: { displayName?: string; formattedAddress?: string }[];
            };
            const nearest = res?.places?.[0];
            if (nearest?.formattedAddress || nearest?.displayName) {
              const suggestedAddr = nearest.formattedAddress
                ? nearest.formattedAddress
                : `${nearest.displayName}, Tanzania`;
              const parsed = parseCityRegionFromAddress(suggestedAddr);
              setStationDraft((prev) => ({
                ...prev,
                address: prev.address || suggestedAddr,
                city: parsed.city,
                region: parsed.region,
              }));
            }
          }
        } catch {
          // Optional auto-lookup; admin can type freely
        } finally {
          setAddStationLookupLoading(false);
        }
      }
    },
    [canManageStations, placesLib, lang]
  );

  const handleSaveMapStation = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canManageStations || savingStation) return;
      if (stationDraft.name.trim().length < 2) {
        setAddStationError(
          lang === 'sw'
            ? 'Tafadhali weka jina la kituo (angalau herufi 2).'
            : 'Please enter a station name (at least 2 characters).'
        );
        return;
      }
      setSavingStation(true);
      setAddStationError(null);
      try {
        const created = await createStationRecord({
          name: stationDraft.name,
          code: stationDraft.code || suggestStationCode(stationDraft.name, stationDraft.city),
          stationKind: stationDraft.stationKind,
          city: stationDraft.city,
          region: stationDraft.region,
          address:
            stationDraft.address.trim() ||
            `${stationDraft.name.trim()}, ${stationDraft.city.trim()}`,
          lat: Number(stationDraft.lat),
          lng: Number(stationDraft.lng),
          open24Hours: stationDraft.open24Hours,
          hasLubricants: stationDraft.hasLubricants,
          petrolPriceTzs: stationDraft.petrolPriceTzs,
          dieselPriceTzs: stationDraft.dieselPriceTzs,
          pumpsCount: stationDraft.pumpsCount,
          lpg6kgStock: stationDraft.lpg6kgStock,
          lpg15kgStock: stationDraft.lpg15kgStock,
          lpg38kgStock: stationDraft.lpg38kgStock,
        });
        setOptimisticStations((prev) => [...prev, created]);
        setSearchQuery('');
        setOnly24h(false);
        setOilcomCategoryFilter('all');
        setOnlyLubricants(false);
        setDraftStationCoords(null);
        setAddStationModalOpen(false);
        setSelectedPlace(null);
        setSelectedStation(created);
        setInfoOpen(true);
        setDetailsExpanded(true);
        setMobileListOpen(false);
        focusCoords(created.lat, created.lng, 16);
        const mapsUrl =
          stationDraft.sourceGoogleMapsURI ||
          buildGoogleMapsPinUrl(created.lat, created.lng);
        setCreatedGoogleMapsBanner({
          name: created.name,
          url: mapsUrl,
        });
      } catch (err) {
        setAddStationError(
          err instanceof Error
            ? err.message
            : lang === 'sw'
              ? 'Imeshindwa kuhifadhi kituo. Hakikisha umeingia kama Admin.'
              : 'Could not save station. Please verify Admin access.'
        );
      } finally {
        setSavingStation(false);
      }
    },
    [canManageStations, savingStation, stationDraft, lang, focusCoords]
  );

  const scanCurrentViewportBBox = useCallback(() => {
    if (!isNative3DActive && mapInstance) {
      const bounds = mapInstance.getBounds();
      if (bounds) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        setActiveBBox({
          south: sw.lat(),
          west: sw.lng(),
          north: ne.lat(),
          east: ne.lng(),
        });
        setBboxCorner1(null);
        setBboxDrawMode(false);
        return;
      }
    }
    const spanDeg = Math.min(Math.max(map3dCamera.range / 111320, 0.03), 1.5);
    setActiveBBox({
      south: map3dCamera.center.lat - spanDeg * 0.65,
      north: map3dCamera.center.lat + spanDeg * 0.65,
      west: map3dCamera.center.lng - spanDeg * 0.75,
      east: map3dCamera.center.lng + spanDeg * 0.75,
    });
    setBboxCorner1(null);
    setBboxDrawMode(false);
  }, [isNative3DActive, mapInstance, map3dCamera.center.lat, map3dCamera.center.lng, map3dCamera.range]);

  const clearBBoxFilter = useCallback(() => {
    setActiveBBox(null);
    setBboxCorner1(null);
    setBboxDrawMode(false);
  }, []);

  const handleLeftCameraChanged = useCallback(
    (ev: MapCameraChangedEvent) => {
      setSynced2DView({ center: ev.detail.center, zoom: ev.detail.zoom });
      if (!splitMode || splitSyncLockRef.current === 'right' || !splitRightMap) {
        return;
      }
      splitSyncLockRef.current = 'left';
      try {
        splitRightMap.setCenter(ev.detail.center);
        splitRightMap.setZoom(ev.detail.zoom);
      } catch {
        // ignore stale split map
      }
      window.requestAnimationFrame(() => {
        splitSyncLockRef.current = null;
      });
    },
    [splitMode, splitRightMap]
  );

  const handleRightCameraChanged = useCallback(
    (ev: MapCameraChangedEvent) => {
      setSynced2DView({ center: ev.detail.center, zoom: ev.detail.zoom });
      if (!splitMode || splitSyncLockRef.current === 'left' || !mapInstance) {
        return;
      }
      splitSyncLockRef.current = 'right';
      try {
        mapInstance.setCenter(ev.detail.center);
        mapInstance.setZoom(ev.detail.zoom);
      } catch {
        // ignore stale split map
      }
      window.requestAnimationFrame(() => {
        splitSyncLockRef.current = null;
      });
    },
    [splitMode, mapInstance]
  );

  const handleGeoJsonUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const result = parseAnySpatialFileToGeoJson(text, file.name);
        if (!result) {
          setPlacesNotice(
            lang === 'sw'
              ? 'Faili halikutambuliwa. Pakia GeoJSON (.geojson/.json), CSV (yenye safu ya lat/lng), au KML (.kml).'
              : 'Unsupported spatial file. Upload GeoJSON (.geojson/.json), CSV (with lat/lng columns), or KML (.kml).'
          );
          return;
        }
        setCustomGeoJson(result.data);
        setCustomGeoJsonName(file.name);
        setShowGisLayer(true);
        const pts = extractGeoJsonPoints(result.data);
        if (pts.length > 0) {
          fitPointsOnMap(pts);
        }
        const fmtLabel = result.format.toUpperCase();
        setPlacesNotice(
          lang === 'sw'
            ? `Safu ya ${fmtLabel} imebadilishwa kuwa GeoJSON (${result.data.features.length} vipengele kutoka ${file.name}).`
            : `Converted ${fmtLabel} to GeoJSON (${result.data.features.length} features from ${file.name}).`
        );
      } catch {
        setPlacesNotice(
          lang === 'sw'
            ? 'Imeshindwa kusoma faili la GIS. Hakikisha muundo wa faili ni sahihi.'
            : 'Could not read spatial file. Please verify valid syntax.'
        );
      }
    },
    [fitPointsOnMap, lang]
  );

  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocError(
        lang === 'sw'
          ? 'Kifaa hakitumii huduma ya GPS.'
          : 'Geolocation is not supported on this device.'
      );
      return;
    }
    setLocLoading(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        setLocLoading(false);
        focusCoords(coords.lat, coords.lng, 13);
        if (stations.length > 0) {
          const nearest = [...stations].sort(
            (a, b) =>
              haversineKm(coords.lat, coords.lng, a.lat, a.lng) -
              haversineKm(coords.lat, coords.lng, b.lat, b.lng)
          )[0];
          if (nearest) {
            setSelectedPlace(null);
            setSelectedStation(nearest);
          }
        }
      },
      () => {
        setLocLoading(false);
        setLocError(
          lang === 'sw'
            ? 'Ruhusu GPS kwenye kivinjari ili kuona umbali kamili.'
            : 'Allow location permission in your browser to see exact distances.'
        );
      },
      { timeout: 7000, enableHighAccuracy: true }
    );
  }, [focusCoords, lang, stations]);

  const mapRawPlacesToDiscovered = useCallback(
    (places: RawPlaceResult[]): DiscoveredPlace[] => {
      return places
        .filter((p) => p.location != null)
        .map((p) => {
          let photoUrl: string | undefined;
          try {
            photoUrl = p.photos?.[0]?.getURI?.({ maxWidth: 640, maxHeight: 360 });
          } catch {
            photoUrl = undefined;
          }
          const name = p.displayName || 'Station';
          const address = p.formattedAddress || '';
          const placeIsOilcom = isOilcomBrandName(name);
          return {
            id: p.id,
            name,
            address,
            lat: p.location!.lat(),
            lng: p.location!.lng(),
            isOilcom: placeIsOilcom,
            oilcomKind: placeIsOilcom
              ? classifyOilcomPlaceKind(name, address)
              : undefined,
            category: p.primaryTypeDisplayName || undefined,
            rating: typeof p.rating === 'number' ? p.rating : undefined,
            userRatingCount:
              typeof p.userRatingCount === 'number'
                ? p.userRatingCount
                : undefined,
            photoUrl,
            businessStatus: p.businessStatus || undefined,
            googleMapsURI: p.googleMapsURI || undefined,
          };
        });
    },
    []
  );

  // Live automated discovery of official OILCOM stations & LPG gas outlets across Tanzania
  useEffect(() => {
    if (!placesLib || hasAutoLoadedOilcomRef.current) return;
    hasAutoLoadedOilcomRef.current = true;
    let cancelled = false;

    const fields = [
      'id',
      'displayName',
      'location',
      'formattedAddress',
      'primaryTypeDisplayName',
      'rating',
      'userRatingCount',
      'businessStatus',
      'googleMapsURI',
      'photos',
    ];
    const tanzaniaBounds = {
      south: -11.75,
      west: 29.3,
      north: -0.99,
      east: 40.45,
    };

    const queries = [
      {
        textQuery: 'Oilcom',
        includedType: 'gas_station',
        fields,
        locationBias: { center: DEFAULT_CENTER, radius: 40000 },
        maxResultCount: 20,
        language: lang,
        region: 'tz',
      },
      {
        textQuery: 'Oilcom petrol station Tanzania',
        fields,
        locationBias: tanzaniaBounds,
        maxResultCount: 20,
        language: lang,
        region: 'tz',
      },
      {
        textQuery: 'Oilcom Gas LPG Tanzania',
        fields,
        locationBias: tanzaniaBounds,
        maxResultCount: 20,
        language: lang,
        region: 'tz',
      },
    ];

    void (async () => {
      try {
        const settled = await Promise.allSettled(
          queries.map((req) => placesLib.Place.searchByText(req))
        );
        if (cancelled) return;
        const byId = new Map<string, DiscoveredPlace>();
        settled.forEach((result) => {
          if (result.status !== 'fulfilled') {
            if (isQuotaError(result.reason)) {
              window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            }
            return;
          }
          const raw =
            ((result.value as { places?: RawPlaceResult[] })?.places ?? []);
          const mapped = mapRawPlacesToDiscovered(raw).filter(
            (pl) => pl.isOilcom
          );
          mapped.forEach((pl) => {
            if (!byId.has(pl.id)) byId.set(pl.id, pl);
          });
        });
        if (!cancelled && byId.size > 0) {
          setOilcomPlaces((prev) => {
            const merged = new Map<string, DiscoveredPlace>();
            prev.forEach((p) => merged.set(p.id, p));
            byId.forEach((p, id) => {
              const existing = merged.get(id);
              merged.set(id, existing ? { ...existing, ...p } : p);
            });
            return Array.from(merged.values());
          });
        }
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [placesLib, lang, mapRawPlacesToDiscovered]);

  // Live Google Places Text Search (New) — works in both 2D and 3D
  const runPlacesTextSearch = useCallback(
    async (rawQuery: string) => {
      const { query: q, isShortMapsLink } = extractQueryFromGoogleMapsInput(rawQuery);
      if (!q || !placesLib) return;
      if (isShortMapsLink) {
        setPlacesNotice(
          lang === 'sw'
            ? 'Kwa kiungo kifupi (maps.app.goo.gl), andika jina la kituo (mf. Oil com - Victoria) au Plus Code (mf. 67C2+QJ Dar es Salaam) kutafuta moja kwa moja.'
            : 'For shortened maps.app.goo.gl links, type the station name (e.g. Oil com - Victoria) or Plus Code (e.g. 67C2+QJ Dar es Salaam).'
        );
        return;
      }
      setPlacesLoading(true);
      setPlacesNotice(null);
      try {
        const bounds = !isNative3DActive ? mapInstance?.getBounds() : undefined;
        const center2d = !isNative3DActive ? mapInstance?.getCenter() : undefined;
        const bias =
          bounds ??
          (center2d
            ? { lat: center2d.lat(), lng: center2d.lng() }
            : { lat: map3dCamera.center.lat, lng: map3dCamera.center.lng });

        const request = {
          textQuery: q,
          fields: [
            'id',
            'displayName',
            'location',
            'formattedAddress',
            'primaryTypeDisplayName',
            'rating',
            'userRatingCount',
            'businessStatus',
            'googleMapsURI',
            'photos',
          ],
          locationBias: bias,
          maxResultCount: 12,
          language: lang,
          region: 'tz',
        };
        const res = (await placesLib.Place.searchByText(request)) as {
          places?: RawPlaceResult[];
        };
        const mapped = mapRawPlacesToDiscovered(res?.places ?? []);
        const oilcomFound = mapped.filter((p) => p.isOilcom);
        const externalFound = mapped.filter((p) => !p.isOilcom);

        if (oilcomFound.length > 0) {
          setOilcomPlaces((prev) => {
            const next = new Map(prev.map((p) => [p.id, p]));
            oilcomFound.forEach((p) => next.set(p.id, p));
            return Array.from(next.values());
          });
        }
        setDiscoveredPlaces(externalFound);
        if (mapped.length > 0) {
          if (externalFound.length > 0 && oilcomFound.length === 0) {
            setShowExternalPlaces(true);
          }
          fitPointsOnMap(mapped.map((p) => ({ lat: p.lat, lng: p.lng })));
          setSelectedStation(null);
          setSelectedPlace(mapped[0]);
          setInfoOpen(true);
          void fetchFullPlaceDetails(
            mapped[0].id,
            { lat: mapped[0].lat, lng: mapped[0].lng },
            false
          );
        } else {
          setPlacesNotice(
            lang === 'sw'
              ? 'Hakuna matokeo mapya ya Places katika eneo hili.'
              : 'No additional Google Places found for that search.'
          );
        }
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        } else {
          setPlacesNotice(
            lang === 'sw'
              ? 'Imeshindwa kutafuta maeneo kwa sasa.'
              : 'Could not search places right now.'
          );
        }
      } finally {
        setPlacesLoading(false);
      }
    },
    [
      placesLib,
      isNative3DActive,
      mapInstance,
      map3dCamera.center,
      lang,
      fitPointsOnMap,
      fetchFullPlaceDetails,
      mapRawPlacesToDiscovered,
    ]
  );

  // Live Google Places Nearby Gas Stations + OILCOM Area Search — works in both 2D and 3D
  const runNearbyGasStationsSearch = useCallback(async () => {
    if (!placesLib) return;
    setPlacesLoading(true);
    setPlacesNotice(null);
    try {
      const centerLatLng = !isNative3DActive ? mapInstance?.getCenter() : undefined;
      const center = centerLatLng
        ? { lat: centerLatLng.lat(), lng: centerLatLng.lng() }
        : isNative3DActive
          ? { lat: map3dCamera.center.lat, lng: map3dCamera.center.lng }
          : DEFAULT_CENTER;
      const bounds = !isNative3DActive ? mapInstance?.getBounds() : undefined;
      let radius = 8000;
      if (bounds) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const km = haversineKm(ne.lat(), ne.lng(), sw.lat(), sw.lng());
        radius = Math.min(Math.max(Math.round((km * 1000) / 2), 1500), 50000);
      } else if (isNative3DActive) {
        radius = Math.min(Math.max(Math.round(map3dCamera.range * 1.4), 2500), 25000);
      }

      const fields = [
        'id',
        'displayName',
        'location',
        'formattedAddress',
        'primaryTypeDisplayName',
        'rating',
        'userRatingCount',
        'businessStatus',
        'googleMapsURI',
        'photos',
      ];

      const [nearbyRes, oilcomAreaRes] = await Promise.allSettled([
        placesLib.Place.searchNearby({
          fields,
          locationRestriction: {
            center,
            radius,
          },
          includedPrimaryTypes: ['gas_station'],
          maxResultCount: 20,
          rankPreference: placesLib.SearchNearbyRankPreference.DISTANCE,
          language: lang,
          region: 'tz',
        }),
        placesLib.Place.searchByText({
          textQuery: 'Oilcom',
          fields,
          locationBias: bounds ?? { center, radius },
          maxResultCount: 20,
          language: lang,
          region: 'tz',
        }),
      ]);

      const rawNearby =
        nearbyRes.status === 'fulfilled'
          ? ((nearbyRes.value as { places?: RawPlaceResult[] })?.places ?? [])
          : [];
      const rawOilcomArea =
        oilcomAreaRes.status === 'fulfilled'
          ? ((oilcomAreaRes.value as { places?: RawPlaceResult[] })?.places ?? [])
          : [];

      const mappedNearby = mapRawPlacesToDiscovered(rawNearby);
      const mappedOilcom = mapRawPlacesToDiscovered(rawOilcomArea).filter(
        (p) => p.isOilcom
      );

      const newOilcom = [
        ...mappedOilcom,
        ...mappedNearby.filter((p) => p.isOilcom),
      ];
      if (newOilcom.length > 0) {
        setOilcomPlaces((prev) => {
          const next = new Map(prev.map((p) => [p.id, p]));
          newOilcom.forEach((p) => next.set(p.id, p));
          return Array.from(next.values());
        });
      }

      const externalOnly = mappedNearby.filter((p) => !p.isOilcom);
      setDiscoveredPlaces(externalOnly);

      const focusList = showExternalPlaces
        ? [...newOilcom, ...externalOnly]
        : newOilcom.length > 0
          ? newOilcom
          : externalOnly;

      if (focusList.length > 0) {
        if (externalOnly.length > 0 && newOilcom.length === 0) {
          setShowExternalPlaces(true);
        }
        setSelectedStation(null);
        setSelectedPlace(focusList[0]);
        setInfoOpen(true);
        void fetchFullPlaceDetails(
          focusList[0].id,
          { lat: focusList[0].lat, lng: focusList[0].lng },
          false
        );
      } else {
        setPlacesNotice(
          lang === 'sw'
            ? 'Hakuna vituo vya mafuta vilivyopatikana ndani ya ramani hii. Sogeza au zoom out.'
            : 'No gas stations found in this map view. Pan or zoom out and try again.'
        );
      }
    } catch (err) {
      if (isQuotaError(err)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      } else {
        setPlacesNotice(
          lang === 'sw'
            ? 'Imeshindwa kutafuta vituo vya karibu.'
            : 'Could not scan nearby stations right now.'
        );
      }
    } finally {
      setPlacesLoading(false);
    }
  }, [
    placesLib,
    isNative3DActive,
    mapInstance,
    map3dCamera.center,
    map3dCamera.range,
    lang,
    fetchFullPlaceDetails,
    mapRawPlacesToDiscovered,
    showExternalPlaces,
  ]);

  // Modern Routes API: Route.computeRoutes + 2D polylines & 3D Polyline3D coordinates
  const computeDirections = useCallback(
    async (target: { id: string; name: string; lat: number; lng: number }) => {
      if (!routesLib) return;
      setRouteLoading(true);
      setPlacesNotice(null);

      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      setRoutePath3D([]);

      const usingFallbackOrigin = !userCoords;
      const origin = userCoords ?? DEFAULT_CENTER;

      try {
        const request = {
          origin,
          destination: { lat: target.lat, lng: target.lng },
          travelMode: 'DRIVING',
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
        };

        const response = await (
          routesLib.Route as unknown as {
            computeRoutes: (req: unknown) => Promise<{ routes?: unknown[] }>;
          }
        ).computeRoutes(request);

        const routes = response?.routes ?? [];
        if (routes.length === 0) {
          setPlacesNotice(
            lang === 'sw'
              ? 'Njia haikupatikana kwa sasa.'
              : 'No driving route found.'
          );
          setRouteLoading(false);
          return;
        }

        const primaryRoute = routes[0] as {
          createPolylines: () => MapPolyline[];
          path?: Array<
            | { lat: () => number; lng: () => number }
            | { lat: number; lng: number }
          >;
          viewport?: Parameters<NonNullable<GoogleMapInstance>['fitBounds']>[0];
          distanceMeters?: number;
          durationMillis?: number;
        };

        const coords3d: { lat: number; lng: number; altitude: number }[] = (
          primaryRoute.path ?? []
        ).map((pt) => {
          const latVal =
            typeof pt.lat === 'function' ? pt.lat() : (pt.lat as number);
          const lngVal =
            typeof pt.lng === 'function' ? pt.lng() : (pt.lng as number);
          return { lat: latVal, lng: lngVal, altitude: 8 };
        });
        setRoutePath3D(coords3d);

        if (mapInstance && !isNative3DActive) {
          const newPolylines = primaryRoute.createPolylines();
          newPolylines.forEach((poly) => {
            poly.setOptions({
              strokeColor: '#0B2A6F',
              strokeOpacity: 0.95,
              strokeWeight: 6,
            });
            poly.setMap(mapInstance);
          });
          polylinesRef.current = newPolylines;

          if (primaryRoute.viewport) {
            mapInstance.fitBounds(primaryRoute.viewport, 64);
          }
        } else if (isNative3DActive) {
          const midLat = (origin.lat + target.lat) / 2;
          const midLng = (origin.lng + target.lng) / 2;
          const distKm = Math.max(
            haversineKm(origin.lat, origin.lng, target.lat, target.lng),
            1.2
          );
          fly3DCameraTo(
            midLat,
            midLng,
            Math.min(Math.max(distKm * 2100, 1800), 120000),
            55
          );
        }

        setActiveRoute({
          targetId: target.id,
          targetName: target.name,
          distanceMeters: primaryRoute.distanceMeters ?? 0,
          durationMillis: primaryRoute.durationMillis ?? 0,
          usingFallbackOrigin,
        });
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        } else {
          setPlacesNotice(
            lang === 'sw'
              ? 'Imeshindwa kukokotoa njia ya kuendesha.'
              : 'Unable to calculate driving route right now.'
          );
        }
      } finally {
        setRouteLoading(false);
      }
    },
    [routesLib, mapInstance, isNative3DActive, userCoords, lang, fly3DCameraTo]
  );

  // Intercept 3D POI & map clicks via native gmp-click (Add Station pin drop, BBox, or full Place Details)
  useEffect(() => {
    if (!map3dElement) return;
    const onNative3DClick = (ev: Event) => {
      const clickEv = ev as Event & {
        placeId?: string;
        position?: { lat: number; lng: number; altitude?: number } | null;
      };
      if (addStationMode && clickEv.position) {
        clickEv.preventDefault();
        void openAddStationModalAt(
          { lat: clickEv.position.lat, lng: clickEv.position.lng },
          clickEv.placeId ? { placeId: clickEv.placeId } : undefined
        );
        return;
      }
      if (bboxDrawMode && clickEv.position) {
        clickEv.preventDefault();
        handleMapPointClick(clickEv.position.lat, clickEv.position.lng);
        return;
      }
      if (clickEv.placeId) {
        clickEv.preventDefault();
        void fetchFullPlaceDetails(
          clickEv.placeId,
          clickEv.position
            ? { lat: clickEv.position.lat, lng: clickEv.position.lng }
            : undefined
        );
      }
    };
    map3dElement.addEventListener('gmp-click', onNative3DClick);
    return () => {
      map3dElement.removeEventListener('gmp-click', onNative3DClick);
    };
  }, [
    map3dElement,
    addStationMode,
    openAddStationModalAt,
    bboxDrawMode,
    handleMapPointClick,
    fetchFullPlaceDetails,
  ]);

  const activeTarget = selectedStation
    ? {
        kind: 'station' as const,
        stationObj: selectedStation,
        id: selectedStation.id,
        name: selectedStation.name,
        subtitle: `${selectedStation.address}, ${selectedStation.city}`,
        lat: selectedStation.lat,
        lng: selectedStation.lng,
        stationKind: selectedStation.stationKind || 'both',
        open24Hours: selectedStation.open24Hours,
        hasGas: selectedStation.hasGas !== false,
        hasFuel: selectedStation.hasFuel !== false,
        hasLubricants: Boolean(selectedStation.hasLubricants),
        code: selectedStation.code,
        petrolPriceTzs: selectedStation.petrolPriceTzs,
        dieselPriceTzs: selectedStation.dieselPriceTzs,
        lpg6kgStock: selectedStation.lpg6kgStock,
        lpg15kgStock: selectedStation.lpg15kgStock,
        lpg38kgStock: selectedStation.lpg38kgStock,
        googleMapsURI: buildGoogleMapsPinUrl(selectedStation.lat, selectedStation.lng),
      }
    : selectedPlace
      ? {
          kind: 'place' as const,
          placeObj: selectedPlace,
          isOilcom:
            Boolean(selectedPlace.isOilcom) ||
            isOilcomBrandName(selectedPlace.name),
          oilcomKind:
            selectedPlace.oilcomKind ||
            classifyOilcomPlaceKind(selectedPlace.name, selectedPlace.address),
          id: selectedPlace.id,
          name: selectedPlace.name,
          subtitle: selectedPlace.address,
          lat: selectedPlace.lat,
          lng: selectedPlace.lng,
          category: selectedPlace.category,
          rating: selectedPlace.rating,
          userRatingCount: selectedPlace.userRatingCount,
          openNow: selectedPlace.openNow,
          weekdayHours: selectedPlace.weekdayHours,
          phone: selectedPlace.phone,
          websiteURI: selectedPlace.websiteURI,
          editorialSummary: selectedPlace.editorialSummary,
          photoUrl: selectedPlace.photoUrl,
          googleMapsURI: selectedPlace.googleMapsURI,
          businessStatus: selectedPlace.businessStatus,
        }
      : null;

  const activeTargetPosition2D = useMemo(
    () =>
      activeTarget &&
      Number.isFinite(activeTarget.lat) &&
      Number.isFinite(activeTarget.lng)
        ? { lat: activeTarget.lat, lng: activeTarget.lng }
        : null,
    [activeTarget?.lat, activeTarget?.lng]
  );

  const activeTargetPosition3D = useMemo(
    () =>
      activeTarget &&
      Number.isFinite(activeTarget.lat) &&
      Number.isFinite(activeTarget.lng)
        ? { lat: activeTarget.lat, lng: activeTarget.lng, altitude: 75 }
        : null,
    [activeTarget?.lat, activeTarget?.lng]
  );

  const activeDistanceKm =
    activeTarget && userCoords
      ? haversineKm(
          userCoords.lat,
          userCoords.lng,
          activeTarget.lat,
          activeTarget.lng
        )
      : null;

  const renderMapPopupCard = () => {
    if (!activeTarget) return null;
    return (
      <div className="w-[272px] sm:w-[296px] rounded-xl overflow-hidden bg-white text-neutral-900 shadow-2xl border border-neutral-200/80">
        {activeTarget.kind === 'place' && activeTarget.photoUrl ? (
          <div className="relative h-28 w-full bg-[#0B2A6F]">
            <img
              src={activeTarget.photoUrl}
              alt={activeTarget.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/30" />
            <span className="absolute bottom-2 left-2.5 px-2 py-0.5 rounded-md bg-[#F5B800] text-[#0B2A6F] text-[10px] font-extrabold uppercase tracking-wide shadow">
              {activeTarget.isOilcom
                ? 'OILCOM · GOOGLE MAPS'
                : activeTarget.category || (lang === 'sw' ? 'Eneo la Google' : 'Google Place')}
            </span>
            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              aria-label="Close popup"
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="bg-[#0B2A6F] px-3 py-2.5 flex items-center justify-between gap-2">
            <span className="px-2 py-0.5 rounded-md bg-[#F5B800] text-[#0B2A6F] text-[10px] font-extrabold uppercase tracking-wide truncate">
              {activeTarget.kind === 'station'
                ? `OILCOM · ${activeTarget.code}`
                : activeTarget.isOilcom
                  ? 'OILCOM · GOOGLE MAPS'
                  : activeTarget.category || 'GOOGLE PLACES'}
            </span>
            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              aria-label="Close popup"
              className="w-6 h-6 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="p-3 space-y-2">
          <div>
            <h4 className="font-display font-bold text-sm text-neutral-900 leading-snug">
              {activeTarget.name}
            </h4>
            <p className="text-[11px] text-neutral-600 mt-0.5 flex items-start gap-1 leading-snug">
              <MapPin className="w-3 h-3 text-[#0B2A6F] shrink-0 mt-0.5" />
              <span>{activeTarget.subtitle}</span>
            </p>
          </div>

          {activeTarget.kind === 'place' && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {activeTarget.rating !== undefined && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 font-bold font-mono-num">
                  <Star className="w-3 h-3 fill-[#F5B800] text-[#F5B800]" />
                  {activeTarget.rating.toFixed(1)}
                  {activeTarget.userRatingCount !== undefined && (
                    <span className="text-neutral-500 font-normal">
                      ({activeTarget.userRatingCount.toLocaleString()})
                    </span>
                  )}
                </span>
              )}
              {activeTarget.openNow === true && (
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  {lang === 'sw' ? 'Wazi Sasa' : 'Open Now'}
                </span>
              )}
              {activeTarget.openNow === false && (
                <span className="px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-semibold">
                  {lang === 'sw' ? 'Imefungwa' : 'Closed'}
                </span>
              )}
              {activeDistanceKm !== null && (
                <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-[#0B2A6F] font-mono-num font-semibold">
                  {activeDistanceKm.toFixed(1)} km
                </span>
              )}
            </div>
          )}

          {activeTarget.kind === 'station' && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-[#0B2A6F] font-semibold inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {activeTarget.open24Hours ? '24/7' : '06:00 - 22:00'}
                </span>
                {activeDistanceKm !== null && (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-900 font-mono-num font-semibold">
                    {activeDistanceKm.toFixed(1)} km
                  </span>
                )}
              </div>
              {(activeTarget.petrolPriceTzs || activeTarget.dieselPriceTzs) && (
                <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono-num">
                  <div className="px-2 py-1 rounded-lg bg-neutral-100">
                    <span className="text-neutral-500 block">Petrol</span>
                    <span className="font-bold text-[#0B2A6F]">
                      {formatTzs(activeTarget.petrolPriceTzs || 0)}/L
                    </span>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-neutral-100">
                    <span className="text-neutral-500 block">Diesel</span>
                    <span className="font-bold text-[#0B2A6F]">
                      {formatTzs(activeTarget.dieselPriceTzs || 0)}/L
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTarget.kind === 'place' && activeTarget.editorialSummary && (
            <p className="text-[11px] text-neutral-600 leading-relaxed line-clamp-3 bg-neutral-50 p-2 rounded-lg border border-neutral-100">
              {activeTarget.editorialSummary}
            </p>
          )}

          {activeTarget.kind === 'place' &&
            (activeTarget.phone || activeTarget.websiteURI || activeTarget.weekdayHours) && (
              <div className="space-y-1 text-[11px] text-neutral-700 pt-0.5 border-t border-neutral-100">
                {activeTarget.weekdayHours && activeTarget.weekdayHours.length > 0 && (
                  <p className="text-[10px] text-neutral-600 flex items-start gap-1.5">
                    <Clock className="w-3 h-3 text-[#0B2A6F] shrink-0 mt-0.5" />
                    <span className="line-clamp-2">
                      {activeTarget.weekdayHours[(new Date().getDay() + 6) % 7] ||
                        activeTarget.weekdayHours[0]}
                    </span>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-0.5">
                  {activeTarget.phone && (
                    <a
                      href={`tel:${activeTarget.phone}`}
                      className="inline-flex items-center gap-1 font-semibold text-[#0B2A6F] hover:underline"
                    >
                      <Phone className="w-3 h-3 text-[#F5B800]" />
                      <span>{activeTarget.phone}</span>
                    </a>
                  )}
                  {activeTarget.websiteURI && (
                    <a
                      href={activeTarget.websiteURI}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                    >
                      <Globe className="w-3 h-3" />
                      <span>{lang === 'sw' ? 'Tovuti' : 'Website'}</span>
                    </a>
                  )}
                </div>
              </div>
            )}

          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => computeDirections(activeTarget)}
              disabled={routeLoading}
              className="flex-1 min-w-[96px] py-1.5 px-2.5 rounded-lg bg-[#0B2A6F] hover:bg-[#092055] text-white font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
            >
              {routeLoading ? (
                <Loader2 className="w-3 h-3 text-[#F5B800] animate-spin" />
              ) : (
                <RouteIcon className="w-3 h-3 text-[#F5B800]" />
              )}
              <span>{lang === 'sw' ? 'Maelekezo' : 'Directions'}</span>
            </button>

            {activeTarget.kind === 'station' ? (
              <>
                {activeTarget.hasGas && (
                  <button
                    type="button"
                    onClick={() => onOrderAtStation(activeTarget.stationObj, 'gas')}
                    className="py-1.5 px-2.5 rounded-lg bg-[#F5B800] text-[#0B2A6F] font-bold text-[11px] cursor-pointer"
                  >
                    {lang === 'sw' ? 'Gesi' : 'Gas'}
                  </button>
                )}
                {activeTarget.hasFuel && (
                  <button
                    type="button"
                    onClick={() => onOrderAtStation(activeTarget.stationObj, 'fuel')}
                    className="py-1.5 px-2.5 rounded-lg bg-[#D92027] text-white font-bold text-[11px] cursor-pointer"
                  >
                    {lang === 'sw' ? 'Mafuta' : 'Fuel'}
                  </button>
                )}
                <a
                  href={activeTarget.googleMapsURI}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-1.5 px-2.5 rounded-lg border border-neutral-200 text-[#0B2A6F] hover:bg-neutral-50 font-bold text-[11px] inline-flex items-center gap-1"
                >
                  <span>Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            ) : (
              <>
                {activeTarget.isOilcom && (
                  <>
                    {(activeTarget.oilcomKind === 'gas' ||
                      activeTarget.oilcomKind === 'both') && (
                      <button
                        type="button"
                        onClick={() =>
                          onOrderAtStation(
                            discoveredPlaceToStation(activeTarget.placeObj),
                            'gas'
                          )
                        }
                        className="py-1.5 px-2.5 rounded-lg bg-[#F5B800] text-[#0B2A6F] font-bold text-[11px] cursor-pointer"
                      >
                        {lang === 'sw' ? 'Gesi' : 'Gas'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onOrderAtStation(
                          discoveredPlaceToStation(activeTarget.placeObj),
                          'fuel'
                        )
                      }
                      className="py-1.5 px-2.5 rounded-lg bg-[#D92027] text-white font-bold text-[11px] cursor-pointer"
                    >
                      {lang === 'sw' ? 'Mafuta' : 'Fuel'}
                    </button>
                  </>
                )}
                {activeTarget.googleMapsURI && (
                  <a
                    href={activeTarget.googleMapsURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-1.5 px-2.5 rounded-lg bg-[#F5B800] hover:bg-[#e0a800] text-[#0B2A6F] font-bold text-[11px] inline-flex items-center gap-1"
                  >
                    <span>Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {canManageStations && (
                  <button
                    type="button"
                    onClick={() =>
                      void openAddStationModalAt(
                        { lat: activeTarget.lat, lng: activeTarget.lng },
                        {
                          name: activeTarget.name,
                          address: activeTarget.subtitle,
                          stationKind: activeTarget.isOilcom
                            ? activeTarget.oilcomKind
                            : undefined,
                          googleMapsURI: activeTarget.googleMapsURI,
                        }
                      )
                    }
                    className="w-full py-1.5 px-2.5 rounded-lg bg-[#D92027] hover:bg-[#b81b21] text-white font-bold text-[11px] inline-flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {activeTarget.isOilcom
                        ? lang === 'sw'
                          ? 'Hifadhi Bei & Stoo (Orodha Rasmi)'
                          : 'Save Prices & Stock to Catalog'
                        : lang === 'sw'
                          ? 'Sajili Kituo cha Mafuta / Gesi Hapa'
                          : 'Register Fuel / Gas Station Here'}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full">
      {/* Hidden GeoJSON / CSV / KML spatial file upload input */}
      <input
        ref={geojsonInputRef}
        type="file"
        accept=".geojson,.json,.csv,.tsv,.kml,application/geo+json,application/json,text/csv,application/vnd.google-earth.kml+xml"
        onChange={handleGeoJsonUpload}
        className="hidden"
      />

      {/* Full-Viewport Maps Workspace */}
      <div className="w-full">
        {/* Interactive Full-Viewport Map (2D or 3D Extruded Buildings) */}
        <div
          className={
            isFullscreen
              ? 'fixed inset-0 z-50 w-screen h-dvh bg-neutral-100 dark:bg-[#091022] overflow-hidden'
              : 'w-full min-w-0 bg-neutral-100 dark:bg-[#091022] h-[calc(100dvh-7rem)] min-h-[440px] lg:h-[calc(100dvh-4rem)] relative overflow-hidden'
          }
        >
          {isNative3DActive ? (
            <Map3D
              id="oilcom-map-3d"
              ref={handleMap3dRef}
              mode={mapType === 'hybrid' ? MapMode.HYBRID : MapMode.ROADMAP}
              colorScheme={ColorScheme.LIGHT}
              gestureHandling={GestureHandling.GREEDY}
              defaultCenter={map3dCamera.center}
              defaultRange={map3dCamera.range}
              defaultHeading={map3dCamera.heading}
              defaultTilt={map3dCamera.tilt}
              defaultRoll={map3dCamera.roll}
              onCameraChanged={(ev: Map3DCameraChangedEvent) => {
                setMap3dCamera(ev.detail);
              }}
              onError={() => {
                setViewMode('2d');
                setPlacesNotice(
                  lang === 'sw'
                    ? 'Ramani ya 3D imepata hitilafu ya kivinjari; tumerudi kwenye ramani ya 2D.'
                    : '3D view encountered a rendering error; switched back to 2D map.'
                );
              }}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              {/* First corner marker during 3D BBox selection */}
              {bboxCorner1 && (
                <Marker3D
                  position={{ lat: bboxCorner1.lat, lng: bboxCorner1.lng, altitude: 65 }}
                  altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                  extruded
                  title={lang === 'sw' ? 'Kona ya 1 (BBox)' : 'BBox Corner 1'}
                >
                  <Pin
                    background="#F5B800"
                    borderColor="#0B2A6F"
                    glyphColor="#0B2A6F"
                    scale={1.1}
                  />
                </Marker3D>
              )}

              {/* 3D GIS GeoJSON Polygons (Zones, Buffers, Voronoi Catchments, Hotspots, BBox) */}
              {hasAnyGisOverlay &&
                overlays3D.polygons.map((poly) => (
                  <Polygon3D
                    key={poly.key}
                    outerCoordinates={poly.outerCoordinates}
                    innerCoordinates={poly.innerCoordinates}
                    altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                    extruded
                    fillColor={poly.fillColor}
                    strokeColor={poly.strokeColor}
                    strokeWidth={poly.feature.properties?.kind === 'buffer' ? 2 : 3}
                    onClick={() => handleSelect3DGisFeature(poly.feature)}
                  />
                ))}

              {/* 3D GIS GeoJSON Corridors & LineStrings */}
              {hasAnyGisOverlay &&
                overlays3D.polylines.map((line) => (
                  <Polyline3D
                    key={line.key}
                    coordinates={line.coordinates}
                    altitudeMode={AltitudeMode.CLAMP_TO_GROUND}
                    strokeColor={line.strokeColor}
                    strokeWidth={6}
                    onClick={() => handleSelect3DGisFeature(line.feature)}
                  />
                ))}

              {/* 3D GIS GeoJSON Point Features */}
              {hasAnyGisOverlay &&
                overlays3D.points.map((pt) => (
                  <Marker3D
                    key={pt.key}
                    position={pt.position}
                    altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                    extruded
                    title={pt.label}
                    onClick={() => handleSelect3DGisFeature(pt.feature)}
                  >
                    <Pin
                      background="#38BDF8"
                      borderColor="#0B2A6F"
                      glyphColor="#0B2A6F"
                      scale={0.9}
                    />
                  </Marker3D>
                ))}

              {/* 3D Route Polyline */}
              {routePath3D.length >= 2 && (
                <Polyline3D
                  coordinates={routePath3D}
                  altitudeMode={AltitudeMode.CLAMP_TO_GROUND}
                  strokeColor="#F5B800"
                  outerColor="#0B2A6F"
                  strokeWidth={10}
                  outerWidth={0.35}
                />
              )}

              {/* User GPS 3D Marker */}
              {userCoords && (
                <Marker3D
                  position={{ lat: userCoords.lat, lng: userCoords.lng, altitude: 45 }}
                  altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                  extruded
                  title={lang === 'sw' ? 'Eneo Lako' : 'Your Location'}
                >
                  <Pin
                    background="#2563EB"
                    borderColor="#FFFFFF"
                    glyphColor="#FFFFFF"
                    scale={1}
                  />
                </Marker3D>
              )}

              {/* Draft Station Pin in 3D */}
              {draftStationCoords && (
                <Marker3D
                  position={{
                    lat: draftStationCoords.lat,
                    lng: draftStationCoords.lng,
                    altitude: 70,
                  }}
                  altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                  extruded
                  title={lang === 'sw' ? 'Kituo Kipya' : 'New Station Pin'}
                >
                  <Pin
                    background="#D92027"
                    borderColor="#FFFFFF"
                    glyphColor="#F5B800"
                    scale={1.25}
                  />
                </Marker3D>
              )}

              {/* OILCOM Catalog Stations in 3D */}
              {filteredStations.map((station) => {
                const isSelected = selectedStation?.id === station.id;
                const isGasOnly =
                  station.stationKind === 'gas' ||
                  (station.hasGas !== false && station.hasFuel === false);
                const isFuelOnly =
                  station.stationKind === 'fuel' ||
                  (station.hasFuel !== false && station.hasGas === false);
                const bgColor = isSelected
                  ? '#F5B800'
                  : isFuelOnly
                    ? '#D92027'
                    : isGasOnly
                      ? '#D97706'
                      : '#0B2A6F';
                return (
                  <Marker3D
                    key={`3d-${station.id}`}
                    position={{ lat: station.lat, lng: station.lng, altitude: 55 }}
                    altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                    extruded
                    title={station.name}
                    onClick={() => handleSelectStation(station)}
                  >
                    <Pin
                      background={bgColor}
                      borderColor={isSelected ? '#0B2A6F' : '#F5B800'}
                      glyphColor={isSelected ? '#0B2A6F' : '#FFFFFF'}
                      glyphText={
                        isGasOnly ? 'G' : isFuelOnly ? (lang === 'sw' ? 'M' : 'F') : 'O'
                      }
                      scale={isSelected ? 1.25 : 1}
                    />
                  </Marker3D>
                );
              })}

              {/* Live Google Maps OILCOM Stations & Gas Outlets in 3D */}
              {filteredOilcomPlaces.map((place) => {
                const isSelected = selectedPlace?.id === place.id;
                const kind =
                  place.oilcomKind ||
                  classifyOilcomPlaceKind(place.name, place.address);
                const bgColor = isSelected
                  ? '#F5B800'
                  : kind === 'gas'
                    ? '#D97706'
                    : kind === 'fuel'
                      ? '#D92027'
                      : '#0B2A6F';
                return (
                  <Marker3D
                    key={`3d-oilcom-${place.id}`}
                    position={{ lat: place.lat, lng: place.lng, altitude: 55 }}
                    altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                    extruded
                    title={place.name}
                    onClick={() => handleSelectPlace(place)}
                  >
                    <Pin
                      background={bgColor}
                      borderColor={isSelected ? '#0B2A6F' : '#F5B800'}
                      glyphColor={isSelected ? '#0B2A6F' : '#FFFFFF'}
                      glyphText={
                        kind === 'gas'
                          ? 'G'
                          : kind === 'fuel'
                            ? lang === 'sw'
                              ? 'M'
                              : 'F'
                            : 'O'
                      }
                      scale={isSelected ? 1.25 : 1}
                    />
                  </Marker3D>
                );
              })}

              {/* Discovered External Places in 3D */}
              {visibleDiscoveredPlaces.map((place) => {
                const isSelected = selectedPlace?.id === place.id;
                return (
                  <Marker3D
                    key={`3d-pl-${place.id}`}
                    position={{ lat: place.lat, lng: place.lng, altitude: 50 }}
                    altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                    extruded
                    title={place.name}
                    onClick={() => handleSelectPlace(place)}
                  >
                    <Pin
                      background={isSelected ? '#111827' : '#ffffff'}
                      borderColor="#475569"
                      glyphColor={isSelected ? '#F5B800' : '#334155'}
                      scale={isSelected ? 1.15 : 0.95}
                    />
                  </Marker3D>
                );
              })}

              {/* 3D Popover (desktop only; mobile uses unified compact bottom sheet) */}
              {isDesktop && infoOpen && activeTarget && activeTargetPosition3D && (
                <Popover
                  position={activeTargetPosition3D}
                  altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                  open={infoOpen}
                  onClose={() => setInfoOpen(false)}
                >
                  {renderMapPopupCard()}
                </Popover>
              )}
            </Map3D>
          ) : splitMode ? (
            <div className="relative w-full h-full">
              {/* Right Layer: Hybrid Satellite + Demand Hotspots & Supply Corridors */}
              <GoogleMapView
                id="oilcom-map-split-right"
                mapId="DEMO_MAP_ID"
                colorScheme={ColorScheme.LIGHT}
                defaultCenter={synced2DView.center}
                defaultZoom={synced2DView.zoom}
                gestureHandling="greedy"
                mapTypeId="hybrid"
                mapTypeControl={false}
                streetViewControl={false}
                fullscreenControl={false}
                onCameraChanged={handleRightCameraChanged}
                onClick={(ev: MapMouseEvent) => {
                  if (addStationMode && ev.detail.latLng) {
                    ev.stop();
                    void openAddStationModalAt(
                      { lat: ev.detail.latLng.lat, lng: ev.detail.latLng.lng },
                      ev.detail.placeId ? { placeId: ev.detail.placeId } : undefined
                    );
                    return;
                  }
                  if (bboxDrawMode && ev.detail.latLng) {
                    handleMapPointClick(ev.detail.latLng.lat, ev.detail.latLng.lng);
                    return;
                  }
                  if (ev.detail.placeId) {
                    ev.stop();
                    void fetchFullPlaceDetails(
                      ev.detail.placeId,
                      ev.detail.latLng ?? undefined
                    );
                  }
                }}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{ width: '100%', height: '100%' }}
              >
                <MapInstanceBridge onMapReady={setSplitRightMap} />
                {bboxCorner1 && (
                  <AdvancedMarker position={bboxCorner1} zIndex={35}>
                    <div className="w-4 h-4 rounded-full bg-[#F5B800] border-2 border-[#0B2A6F] shadow-md" />
                  </AdvancedMarker>
                )}
                {filteredStations.map((station) => (
                  <AdvancedMarker
                    key={`sr-${station.id}`}
                    position={{ lat: station.lat, lng: station.lng }}
                    onClick={() => handleSelectStation(station)}
                    title={station.name}
                    zIndex={15}
                  >
                    <Pin
                      background="#D92027"
                      borderColor="#FFFFFF"
                      glyphColor="#FFFFFF"
                      scale={0.9}
                    />
                  </AdvancedMarker>
                ))}
                {filteredOilcomPlaces.map((place) => {
                  const isSelected = selectedPlace?.id === place.id;
                  const kind =
                    place.oilcomKind ||
                    classifyOilcomPlaceKind(place.name, place.address);
                  return (
                    <AdvancedMarker
                      key={`sr-oil-${place.id}`}
                      position={{ lat: place.lat, lng: place.lng }}
                      onClick={() => handleSelectPlace(place)}
                      title={place.name}
                      zIndex={isSelected ? 24 : 14}
                    >
                      <Pin
                        background={isSelected ? '#F5B800' : kind === 'gas' ? '#D97706' : '#D92027'}
                        borderColor="#FFFFFF"
                        glyphColor="#FFFFFF"
                        glyphText={kind === 'gas' ? 'G' : lang === 'sw' ? 'M' : 'F'}
                        scale={isSelected ? 1.1 : 0.9}
                      />
                    </AdvancedMarker>
                  );
                })}
                {visibleDiscoveredPlaces.map((place) => (
                  <AdvancedMarker
                    key={`sr-ext-${place.id}`}
                    position={{ lat: place.lat, lng: place.lng }}
                    onClick={() => handleSelectPlace(place)}
                    title={place.name}
                    zIndex={10}
                  >
                    <Pin
                      background="#FFFFFF"
                      borderColor="#64748B"
                      glyphColor="#334155"
                      scale={0.85}
                    />
                  </AdvancedMarker>
                ))}
              </GoogleMapView>

              {/* Left Clipped Layer: Roadmap + Service Buffers & Voronoi Catchments */}
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 ${100 - splitPercent}% 0 0)` }}
              >
                <GoogleMapView
                  id="oilcom-map-split-left"
                  mapId="DEMO_MAP_ID"
                  colorScheme={ColorScheme.LIGHT}
                  defaultCenter={synced2DView.center}
                  defaultZoom={synced2DView.zoom}
                  gestureHandling="greedy"
                  mapTypeId="roadmap"
                  mapTypeControl={false}
                  streetViewControl={false}
                  fullscreenControl={false}
                  onCameraChanged={handleLeftCameraChanged}
                  onClick={(ev: MapMouseEvent) => {
                    if (addStationMode && ev.detail.latLng) {
                      ev.stop();
                      void openAddStationModalAt(
                        { lat: ev.detail.latLng.lat, lng: ev.detail.latLng.lng },
                        ev.detail.placeId ? { placeId: ev.detail.placeId } : undefined
                      );
                      return;
                    }
                    if (bboxDrawMode && ev.detail.latLng) {
                      handleMapPointClick(ev.detail.latLng.lat, ev.detail.latLng.lng);
                      return;
                    }
                    if (ev.detail.placeId) {
                      ev.stop();
                      void fetchFullPlaceDetails(
                        ev.detail.placeId,
                        ev.detail.latLng ?? undefined
                      );
                    }
                  }}
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  <MapInstanceBridge onMapReady={setMapInstance} />
                  {bboxCorner1 && (
                    <AdvancedMarker position={bboxCorner1} zIndex={35}>
                      <div className="w-4 h-4 rounded-full bg-[#F5B800] border-2 border-[#0B2A6F] shadow-md" />
                    </AdvancedMarker>
                  )}
                  {userCoords && (
                    <AdvancedMarker
                      position={userCoords}
                      title={lang === 'sw' ? 'Eneo Lako' : 'Your Location'}
                      zIndex={30}
                    >
                      <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-[0_0_0_6px_rgba(37,99,235,0.3)]" />
                    </AdvancedMarker>
                  )}
                  {filteredStations.map((station) => {
                    const isSelected = selectedStation?.id === station.id;
                    return (
                      <AdvancedMarker
                        key={`sl-${station.id}`}
                        position={{ lat: station.lat, lng: station.lng }}
                        onClick={() => handleSelectStation(station)}
                        title={station.name}
                        zIndex={isSelected ? 25 : 15}
                      >
                        <Pin
                          background={isSelected ? '#F5B800' : '#0B2A6F'}
                          borderColor={isSelected ? '#0B2A6F' : '#F5B800'}
                          glyphColor={isSelected ? '#0B2A6F' : '#F5B800'}
                          scale={isSelected ? 1.15 : 0.95}
                        />
                      </AdvancedMarker>
                    );
                  })}
                  {filteredOilcomPlaces.map((place) => {
                    const isSelected = selectedPlace?.id === place.id;
                    const kind =
                      place.oilcomKind ||
                      classifyOilcomPlaceKind(place.name, place.address);
                    const bgColor = isSelected
                      ? '#F5B800'
                      : kind === 'gas'
                        ? '#D97706'
                        : kind === 'fuel'
                          ? '#D92027'
                          : '#0B2A6F';
                    return (
                      <AdvancedMarker
                        key={`sl-oil-${place.id}`}
                        position={{ lat: place.lat, lng: place.lng }}
                        onClick={() => handleSelectPlace(place)}
                        title={place.name}
                        zIndex={isSelected ? 25 : 15}
                      >
                        <Pin
                          background={bgColor}
                          borderColor={isSelected ? '#0B2A6F' : '#F5B800'}
                          glyphColor={isSelected ? '#0B2A6F' : '#FFFFFF'}
                          glyphText={
                            kind === 'gas'
                              ? 'G'
                              : kind === 'fuel'
                                ? lang === 'sw'
                                  ? 'M'
                                  : 'F'
                                : 'O'
                          }
                          scale={isSelected ? 1.15 : 0.95}
                        />
                      </AdvancedMarker>
                    );
                  })}
                  {visibleDiscoveredPlaces.map((place) => {
                    const isSelected = selectedPlace?.id === place.id;
                    return (
                      <AdvancedMarker
                        key={`sl-ext-${place.id}`}
                        position={{ lat: place.lat, lng: place.lng }}
                        onClick={() => handleSelectPlace(place)}
                        title={place.name}
                        zIndex={isSelected ? 24 : 10}
                      >
                        <Pin
                          background={isSelected ? '#111827' : '#ffffff'}
                          borderColor={isSelected ? '#F5B800' : '#64748B'}
                          glyphColor={isSelected ? '#F5B800' : '#334155'}
                          scale={isSelected ? 1.1 : 0.85}
                        />
                      </AdvancedMarker>
                    );
                  })}
                </GoogleMapView>
              </div>

              {/* Vertical Split Curtain Line */}
              <div
                className="pointer-events-none absolute inset-y-0 z-[5] w-0.5 bg-[#F5B800] shadow-[0_0_10px_rgba(0,0,0,0.45)]"
                style={{ left: `${splitPercent}%` }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#0B2A6F] border-2 border-[#F5B800] flex items-center justify-center shadow-lg">
                  <Columns2 className="w-4 h-4 text-[#F5B800]" />
                </div>
              </div>

              {/* Split View Left / Right Layer Captions & Swipe Range Slider */}
              <div className="pointer-events-none absolute bottom-24 lg:bottom-4 inset-x-3 z-10 flex flex-col items-center gap-2">
                <div className="pointer-events-auto flex items-center gap-2 bg-[#091022]/90 text-white px-3 py-1.5 rounded-xl border border-blue-900 shadow-lg text-[11px]">
                  <span className="font-semibold text-sky-300 whitespace-nowrap">
                    {lang === 'sw' ? 'Kushoto: Miduara & Voronoi' : 'Left: Buffers & Voronoi'}
                  </span>
                  <input
                    type="range"
                    min={15}
                    max={85}
                    value={splitPercent}
                    onChange={(e) => setSplitPercent(Number(e.target.value))}
                    aria-label={lang === 'sw' ? 'Sogeza mstari wa kulinganisha' : 'Split map swipe slider'}
                    className="w-24 sm:w-36 accent-[#F5B800] cursor-pointer"
                  />
                  <span className="font-semibold text-[#F5B800] whitespace-nowrap">
                    {lang === 'sw' ? 'Kulia: Satellite & Mahitaji' : 'Right: Satellite & Hotspots'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <GoogleMapView
              mapId="DEMO_MAP_ID"
              colorScheme={ColorScheme.LIGHT}
              defaultCenter={synced2DView.center}
              defaultZoom={synced2DView.zoom}
              tilt={viewMode === '3d' ? 45 : 0}
              heading={viewMode === '3d' ? 15 : 0}
              gestureHandling="greedy"
              mapTypeId={mapType}
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl={false}
              onCameraChanged={(ev: MapCameraChangedEvent) => {
                setSynced2DView({ center: ev.detail.center, zoom: ev.detail.zoom });
              }}
              onClick={(ev: MapMouseEvent) => {
                if (addStationMode && ev.detail.latLng) {
                  ev.stop();
                  void openAddStationModalAt(
                    { lat: ev.detail.latLng.lat, lng: ev.detail.latLng.lng },
                    ev.detail.placeId ? { placeId: ev.detail.placeId } : undefined
                  );
                  return;
                }
                if (bboxDrawMode && ev.detail.latLng) {
                  handleMapPointClick(ev.detail.latLng.lat, ev.detail.latLng.lng);
                  return;
                }
                if (ev.detail.placeId) {
                  ev.stop();
                  void fetchFullPlaceDetails(
                    ev.detail.placeId,
                    ev.detail.latLng ?? undefined
                  );
                }
              }}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <MapInstanceBridge onMapReady={setMapInstance} />

              {/* Draft Station Pin in 2D */}
              {draftStationCoords && (
                <AdvancedMarker position={draftStationCoords} zIndex={40}>
                  <Pin
                    background="#D92027"
                    borderColor="#FFFFFF"
                    glyphColor="#F5B800"
                    scale={1.25}
                  />
                </AdvancedMarker>
              )}

              {/* First corner marker during 2D BBox selection */}
              {bboxCorner1 && (
                <AdvancedMarker position={bboxCorner1} zIndex={35}>
                  <div className="w-4 h-4 rounded-full bg-[#F5B800] border-2 border-[#0B2A6F] shadow-[0_0_0_4px_rgba(245,184,0,0.35)]" />
                </AdvancedMarker>
              )}

              {/* User GPS Marker */}
              {userCoords && (
                <AdvancedMarker
                  position={userCoords}
                  title={lang === 'sw' ? 'Eneo Lako' : 'Your Location'}
                  zIndex={30}
                >
                  <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-[0_0_0_6px_rgba(37,99,235,0.3)]" />
                </AdvancedMarker>
              )}

              {/* OILCOM Catalog Stations */}
              {filteredStations.map((station) => {
                const isSelected = selectedStation?.id === station.id;
                const isGasOnly =
                  station.stationKind === 'gas' ||
                  (station.hasGas !== false && station.hasFuel === false);
                const isFuelOnly =
                  station.stationKind === 'fuel' ||
                  (station.hasFuel !== false && station.hasGas === false);
                const bgColor = isSelected
                  ? '#F5B800'
                  : isFuelOnly
                    ? '#D92027'
                    : isGasOnly
                      ? '#D97706'
                      : '#0B2A6F';
                return (
                  <AdvancedMarker
                    key={station.id}
                    position={{ lat: station.lat, lng: station.lng }}
                    onClick={() => handleSelectStation(station)}
                    title={station.name}
                    zIndex={isSelected ? 25 : 15}
                  >
                    <Pin
                      background={bgColor}
                      borderColor={isSelected ? '#0B2A6F' : '#F5B800'}
                      glyphColor={isSelected ? '#0B2A6F' : '#FFFFFF'}
                      glyphText={
                        isGasOnly ? 'G' : isFuelOnly ? (lang === 'sw' ? 'M' : 'F') : 'O'
                      }
                      scale={isSelected ? 1.25 : 1}
                    />
                  </AdvancedMarker>
                );
              })}

              {/* Live Google Maps OILCOM Stations & Gas Outlets */}
              {filteredOilcomPlaces.map((place) => {
                const isSelected = selectedPlace?.id === place.id;
                const kind =
                  place.oilcomKind ||
                  classifyOilcomPlaceKind(place.name, place.address);
                const bgColor = isSelected
                  ? '#F5B800'
                  : kind === 'gas'
                    ? '#D97706'
                    : kind === 'fuel'
                      ? '#D92027'
                      : '#0B2A6F';
                return (
                  <AdvancedMarker
                    key={`oilcom-pl-${place.id}`}
                    position={{ lat: place.lat, lng: place.lng }}
                    onClick={() => handleSelectPlace(place)}
                    title={place.name}
                    zIndex={isSelected ? 25 : 16}
                  >
                    <Pin
                      background={bgColor}
                      borderColor={isSelected ? '#0B2A6F' : '#F5B800'}
                      glyphColor={isSelected ? '#0B2A6F' : '#FFFFFF'}
                      glyphText={
                        kind === 'gas'
                          ? 'G'
                          : kind === 'fuel'
                            ? lang === 'sw'
                              ? 'M'
                              : 'F'
                            : 'O'
                      }
                      scale={isSelected ? 1.25 : 1}
                    />
                  </AdvancedMarker>
                );
              })}

              {/* Live Google Places External Search Results */}
              {visibleDiscoveredPlaces.map((place) => {
                const isSelected = selectedPlace?.id === place.id;
                return (
                  <AdvancedMarker
                    key={`place-${place.id}`}
                    position={{ lat: place.lat, lng: place.lng }}
                    onClick={() => handleSelectPlace(place)}
                    title={place.name}
                    zIndex={isSelected ? 24 : 10}
                  >
                    <Pin
                      background={isSelected ? '#111827' : '#ffffff'}
                      borderColor="#475569"
                      glyphColor={isSelected ? '#F5B800' : '#334155'}
                      scale={isSelected ? 1.15 : 0.95}
                    />
                  </AdvancedMarker>
                );
              })}

              {/* Anchored Coordinates InfoWindow (desktop only; mobile uses unified compact bottom sheet) */}
              {isDesktop && infoOpen && activeTarget && activeTargetPosition2D && (
                <InfoWindow
                  headerDisabled
                  position={activeTargetPosition2D}
                  pixelOffset={INFO_WINDOW_PIXEL_OFFSET}
                  onCloseClick={() => setInfoOpen(false)}
                >
                  {renderMapPopupCard()}
                </InfoWindow>
              )}
            </GoogleMapView>
          )}

          {/* Floating Top Search & Filter Overlay */}
          <div className="absolute top-3 inset-x-3 z-10 pointer-events-none flex flex-col gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runPlacesTextSearch(searchQuery);
              }}
              className="pointer-events-auto flex items-center gap-1.5 bg-white/95 dark:bg-[#0E172E]/95 backdrop-blur-md border border-neutral-200 dark:border-blue-900 rounded-xl p-1.5 shadow-lg max-w-xl"
            >
              <Search className="w-4 h-4 text-[#0B2A6F] dark:text-[#F5B800] ml-2 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  lang === 'sw'
                    ? 'Tafuta kituo au eneo (mf. Kerege, Mbezi)...'
                    : 'Search station or area (e.g. Kerege, Bagamoyo Rd)...'
                }
                className="flex-1 min-w-0 bg-transparent text-xs text-neutral-900 dark:text-white px-1.5 py-1.5 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDiscoveredPlaces([]);
                  }}
                  aria-label="Clear search"
                  className="p-1 text-neutral-400 hover:text-neutral-600 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="submit"
                disabled={placesLoading || !searchQuery.trim()}
                className="px-3 py-1.5 rounded-lg bg-[#0B2A6F] disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
              >
                {placesLoading ? '...' : lang === 'sw' ? 'Tafuta' : 'Search'}
              </button>
            </form>

            {/* Quick Floating Chips */}
            <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {canManageStations && (
                <button
                  type="button"
                  onClick={() => {
                    setBboxDrawMode(false);
                    setBboxCorner1(null);
                    setAddStationMode((v) => !v);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                    addStationMode
                      ? 'bg-[#D92027] text-white border-[#D92027]'
                      : 'bg-[#0B2A6F] text-[#F5B800] border-[#0B2A6F]'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {addStationMode
                      ? lang === 'sw'
                        ? 'Ghairi Kuongeza'
                        : 'Cancel Pin'
                      : lang === 'sw'
                        ? 'Ongeza Kituo'
                        : 'Add Station'}
                  </span>
                </button>
              )}

              {/* Map Source Scope: OILCOM Only vs Including External/Nearby Google Stations */}
              <div className="inline-flex items-center p-0.5 rounded-xl bg-white/95 dark:bg-[#0E172E]/95 border border-neutral-200 dark:border-blue-900 shadow-sm shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowExternalPlaces(false);
                    if (selectedPlace) {
                      setSelectedPlace(null);
                      setInfoOpen(false);
                      if (filteredStations[0]) setSelectedStation(filteredStations[0]);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors ${
                    !showExternalPlaces
                      ? 'bg-[#0B2A6F] text-[#F5B800]'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-blue-950/60'
                  }`}
                >
                  {lang === 'sw' ? 'Vituo vya OILCOM Tuu' : 'OILCOM Only'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExternalPlaces(true);
                    if (discoveredPlaces.length === 0 && placesLib) {
                      void runNearbyGasStationsSearch();
                    }
                  }}
                  disabled={placesLoading}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                    showExternalPlaces
                      ? 'bg-[#0B2A6F] text-white'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-blue-950/60'
                  }`}
                >
                  {placesLoading && showExternalPlaces ? (
                    <Loader2 className="w-3 h-3 animate-spin text-[#F5B800]" />
                  ) : null}
                  <span>
                    {lang === 'sw'
                      ? `+ Vituo Vingine (${discoveredPlaces.length})`
                      : `+ Nearby Places (${discoveredPlaces.length})`}
                  </span>
                </button>
              </div>

              {/* OILCOM Service Category: All / Fuel Stations / OILCOM Gas */}
              <div className="inline-flex items-center p-0.5 rounded-xl bg-white/95 dark:bg-[#0E172E]/95 border border-neutral-200 dark:border-blue-900 shadow-sm shrink-0">
                <button
                  type="button"
                  onClick={() => setOilcomCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                    oilcomCategoryFilter === 'all'
                      ? 'bg-[#F5B800] text-[#0B2A6F] font-bold'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-blue-950/60'
                  }`}
                >
                  {lang === 'sw'
                    ? `Vyote (${stationCategoryCounts.all})`
                    : `All (${stationCategoryCounts.all})`}
                </button>
                <button
                  type="button"
                  onClick={() => setOilcomCategoryFilter('fuel')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                    oilcomCategoryFilter === 'fuel'
                      ? 'bg-[#D92027] text-white font-bold'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-blue-950/60'
                  }`}
                >
                  <Fuel className="w-3 h-3" />
                  <span>
                    {lang === 'sw'
                      ? `Mafuta (${stationCategoryCounts.fuel})`
                      : `Fuel (${stationCategoryCounts.fuel})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setOilcomCategoryFilter('gas')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors ${
                    oilcomCategoryFilter === 'gas'
                      ? 'bg-[#D97706] text-white font-bold'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-blue-950/60'
                  }`}
                >
                  <Flame className="w-3 h-3" />
                  <span>
                    {lang === 'sw'
                      ? `Gesi ya OILCOM (${stationCategoryCounts.gas})`
                      : `OILCOM Gas (${stationCategoryCounts.gas})`}
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setOnly24h((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  only24h
                    ? 'bg-[#F5B800] text-[#0B2A6F] border-[#F5B800]'
                    : 'bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900'
                }`}
              >
                <Clock
                  className={`w-3 h-3 ${
                    only24h ? 'text-[#0B2A6F]' : 'text-[#F5B800]'
                  }`}
                />
                <span>{lang === 'sw' ? 'Wazi 24/7' : '24/7 Open'}</span>
              </button>

              <button
                type="button"
                onClick={() => setOnlyLubricants((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  onlyLubricants
                    ? 'bg-[#F5B800] text-[#0B2A6F] border-[#F5B800]'
                    : 'bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900'
                }`}
              >
                <Droplets
                  className={`w-3 h-3 ${
                    onlyLubricants ? 'text-[#0B2A6F]' : 'text-[#F5B800]'
                  }`}
                />
                <span>{lang === 'sw' ? 'Vilainishi' : 'Lubricants'}</span>
              </button>

              {/* Open Geospatial (OGC GeoJSON GIS) Layer Toggle */}
              <button
                type="button"
                onClick={() => {
                  setShowGisLayer((v) => !v);
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  showGisLayer
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900'
                }`}
              >
                <Globe
                  className={`w-3 h-3 ${
                    showGisLayer ? 'text-[#F5B800]' : 'text-blue-600'
                  }`}
                />
                <span>{lang === 'sw' ? 'Kanda za GIS' : 'GIS Zones'}</span>
              </button>

              {/* Service Radius Buffer Cycle (Off / 3 km / 5 km / 10 km) */}
              <button
                type="button"
                onClick={() =>
                  setBufferRadiusKm((prev) =>
                    prev === 5 ? 10 : prev === 10 ? 0 : prev === 0 ? 3 : 5
                  )
                }
                title={
                  lang === 'sw'
                    ? 'Badili ukubwa wa mduara wa huduma (3 / 5 / 10 km)'
                    : 'Cycle station service buffer radius (3 / 5 / 10 km)'
                }
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  bufferRadiusKm > 0
                    ? 'bg-[#0B2A6F] text-white border-[#0B2A6F]'
                    : 'bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900'
                }`}
              >
                <CircleDot
                  className={`w-3 h-3 ${
                    bufferRadiusKm > 0 ? 'text-[#F5B800]' : 'text-[#0B2A6F]'
                  }`}
                />
                <span className="font-mono-num">
                  {bufferRadiusKm > 0
                    ? `${lang === 'sw' ? 'Mduara' : 'Buffer'}: ${bufferRadiusKm} km`
                    : lang === 'sw'
                      ? 'Mduara: Zima'
                      : 'Buffer: Off'}
                </span>
              </button>

              {/* Non-Deprecated Spatial Demand Hotspots Layer */}
              <button
                type="button"
                onClick={() => setShowHotspots((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  showHotspots
                    ? 'bg-[#D92027] text-white border-[#D92027]'
                    : 'bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900'
                }`}
              >
                <Radar
                  className={`w-3 h-3 ${
                    showHotspots ? 'text-[#F5B800]' : 'text-[#D92027]'
                  }`}
                />
                <span>{lang === 'sw' ? 'Mahitaji' : 'Hotspots'}</span>
              </button>

              {/* Voronoi / Thiessen Station Catchment Territories */}
              <button
                type="button"
                onClick={() => setShowVoronoi((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  showVoronoi
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900'
                }`}
              >
                <Hexagon
                  className={`w-3 h-3 ${
                    showVoronoi ? 'text-[#F5B800]' : 'text-emerald-600'
                  }`}
                />
                <span>{lang === 'sw' ? 'Voronoi' : 'Voronoi'}</span>
              </button>

              {/* Interactive BBox Spatial Filter Tool */}
              <button
                type="button"
                onClick={() => {
                  setBboxDrawMode((v) => {
                    const next = !v;
                    if (!next) setBboxCorner1(null);
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  bboxDrawMode || activeBBox
                    ? 'bg-[#F5B800] text-[#0B2A6F] border-[#F5B800]'
                    : 'bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900'
                }`}
              >
                <Crop className="w-3 h-3 text-[#0B2A6F] dark:text-[#F5B800]" />
                <span>
                  {bboxDrawMode
                    ? lang === 'sw'
                      ? 'Chora BBox...'
                      : 'Draw BBox...'
                    : lang === 'sw'
                      ? 'Pima Eneo (BBox)'
                      : 'Spatial Filter'}
                </span>
              </button>

              {/* Split-Map Swipe Comparison (leafmap.split_map inspired, 2D mode) */}
              <button
                type="button"
                onClick={() => {
                  if (viewMode === '3d') {
                    setViewMode('2d');
                  }
                  setSplitMode((v) => !v);
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  splitMode && !isNative3DActive
                    ? 'bg-indigo-700 text-white border-indigo-700'
                    : 'bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900'
                }`}
              >
                <Columns2
                  className={`w-3 h-3 ${
                    splitMode && !isNative3DActive ? 'text-[#F5B800]' : 'text-indigo-600'
                  }`}
                />
                <span>{lang === 'sw' ? 'Linganisha (Split)' : 'Split View'}</span>
              </button>

              {/* Export Active OGC GeoJSON Bundle for QGIS */}
              <button
                type="button"
                onClick={() => {
                  const bundle = buildOilcomGeoJsonExport(
                    stations,
                    orders,
                    bufferRadiusKm > 0 ? bufferRadiusKm : 5,
                    {
                      includeStations: true,
                      includeZones: true,
                      includeBuffers: true,
                      includeVoronoi: true,
                      includeHotspots: true,
                      timeSlice,
                      customFeatures: [
                        ...(bboxGeoJsonFeature ? [bboxGeoJsonFeature] : []),
                        ...(customGeoJson?.features ?? []),
                      ],
                    }
                  );
                  downloadGeoJsonFile('oilcom-tanzania-gis.geojson', bundle);
                  setPlacesNotice(
                    lang === 'sw'
                      ? `Faili la OGC GeoJSON limepakuliwa (${bundle.features.length} vipengele tayari kwa QGIS).`
                      : `Exported OGC GeoJSON bundle (${bundle.features.length} features ready for QGIS).`
                  );
                }}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3 h-3 text-[#F5B800]" />
                <span>{lang === 'sw' ? 'Pakua GeoJSON' : 'Export GeoJSON'}</span>
              </button>

              {/* Upload Custom GeoJSON / CSV / KML Layer */}
              <button
                type="button"
                onClick={() => geojsonInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Upload className="w-3 h-3 text-sky-500" />
                <span>
                  {lang === 'sw' ? 'Pakia GIS / CSV / KML' : 'Load GIS / CSV / KML'}
                </span>
              </button>

              {customGeoJson && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomGeoJson(null);
                    setCustomGeoJsonName(null);
                    setSelectedGisFeature(null);
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm bg-sky-700 text-white flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{lang === 'sw' ? 'Ondoa GIS' : 'Clear GIS'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={runNearbyGasStationsSearch}
                disabled={placesLoading}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border bg-white/95 dark:bg-[#0E172E]/95 text-[#0B2A6F] dark:text-[#F5B800] border-neutral-200 dark:border-blue-900 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                {placesLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Search className="w-3 h-3 text-[#F5B800]" />
                )}
                <span>
                  {lang === 'sw' ? 'Tafuta Eneo Hili' : 'Scan This Area'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isDesktop) {
                    setDesktopPanelOpen((v) => !v);
                  } else {
                    setMobileListOpen((v) => !v);
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  (isDesktop ? desktopPanelOpen : mobileListOpen)
                    ? 'bg-[#F5B800] text-[#0B2A6F] border-[#F5B800]'
                    : 'bg-[#0B2A6F] text-white border-[#0B2A6F]'
                }`}
              >
                <List
                  className={`w-3 h-3 ${
                    (isDesktop ? desktopPanelOpen : mobileListOpen)
                      ? 'text-[#0B2A6F]'
                      : 'text-[#F5B800]'
                  }`}
                />
                <span>
                  {lang === 'sw' ? 'Orodha' : 'List'} (
                  {filteredStations.length +
                    filteredOilcomPlaces.length +
                    visibleDiscoveredPlaces.length}
                  )
                </span>
              </button>

              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setOnly24h(false);
                    setOilcomCategoryFilter('all');
                    setOnlyLubricants(false);
                    setShowExternalPlaces(false);
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm bg-neutral-900 text-white flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <X className="w-3 h-3" />
                  <span>{lang === 'sw' ? 'Futa' : 'Reset'}</span>
                </button>
              )}

              {activeRoute && (
                <button
                  type="button"
                  onClick={clearRoutePolylines}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm bg-red-600 text-white flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <X className="w-3 h-3" />
                  <span>{lang === 'sw' ? 'Futa Njia' : 'Clear Route'}</span>
                </button>
              )}
            </div>

            {/* Interactive Add Station Pin-Drop Guidance */}
            {addStationMode && canManageStations && (
              <div className="pointer-events-auto px-3 py-2 rounded-xl bg-[#0B2A6F]/95 text-white border border-[#F5B800] text-xs flex flex-wrap items-center justify-between gap-2 shadow-lg max-w-xl">
                <span className="font-semibold flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#F5B800] shrink-0" />
                  <span>
                    {lang === 'sw'
                      ? 'Gusa popote kwenye ramani (2D au 3D) kuongeza kituo cha mafuta au gesi.'
                      : 'Tap anywhere on the 2D or 3D map to drop a new fuel or gas station pin.'}
                  </span>
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const fallback = userCoords || synced2DView.center;
                      void openAddStationModalAt(fallback);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#F5B800] text-[#0B2A6F] font-bold text-[11px] cursor-pointer whitespace-nowrap"
                  >
                    {userCoords
                      ? lang === 'sw'
                        ? 'Tumia GPS Yangu'
                        : 'Use My GPS'
                      : lang === 'sw'
                        ? 'Weka Katikati'
                        : 'Pin Map Center'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddStationMode(false)}
                    className="px-2 py-1 rounded-lg bg-white/15 text-white text-[11px] cursor-pointer"
                  >
                    {lang === 'sw' ? 'Ghairi' : 'Cancel'}
                  </button>
                </div>
              </div>
            )}

            {/* Newly Created Station Success + Direct Google Maps Link */}
            {createdGoogleMapsBanner && (
              <div className="pointer-events-auto px-3 py-2 rounded-xl bg-emerald-900/95 text-white border border-emerald-400/50 text-xs flex flex-wrap items-center justify-between gap-2 shadow-lg max-w-xl">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Check className="w-4 h-4 text-[#F5B800] shrink-0" />
                  <span className="truncate font-semibold">
                    {lang === 'sw'
                      ? `${createdGoogleMapsBanner.name} kimewekwa moja kwa moja kwenye ramani!`
                      : `${createdGoogleMapsBanner.name} is now live on the map!`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={createdGoogleMapsBanner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-[#F5B800] text-[#0B2A6F] font-bold text-[11px] inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <span>
                      {lang === 'sw'
                        ? 'Fungua Google Maps'
                        : 'Open on Google Maps'}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setCreatedGoogleMapsBanner(null)}
                    aria-label="Dismiss confirmation"
                    className="p-1 text-white/80 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Interactive BBox Draw Mode Guidance */}
            {bboxDrawMode && (
              <div className="pointer-events-auto px-3 py-2 rounded-xl bg-[#0B2A6F]/95 text-white border border-[#F5B800]/60 text-xs flex flex-wrap items-center justify-between gap-2 shadow-lg max-w-xl">
                <span className="font-medium">
                  {bboxCorner1
                    ? lang === 'sw'
                      ? 'Sasa bofya kona ya pili kwenye ramani kukamilisha eneo.'
                      : 'Now click the opposite corner on the map to complete box.'
                    : lang === 'sw'
                      ? 'Bofya kona ya 1 kisha kona ya 2 kwenye ramani kupima eneo, au pima eneo lote unaloona.'
                      : 'Click corner 1 then corner 2 on the map to inspect an area, or scan viewport.'}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={scanCurrentViewportBBox}
                    className="px-2.5 py-1 rounded-lg bg-[#F5B800] text-[#0B2A6F] font-bold text-[11px] cursor-pointer whitespace-nowrap"
                  >
                    {lang === 'sw' ? 'Pima Eneo Hili' : 'Scan Viewport'}
                  </button>
                  <button
                    type="button"
                    onClick={clearBBoxFilter}
                    className="px-2 py-1 rounded-lg bg-white/15 text-white text-[11px] cursor-pointer"
                  >
                    {lang === 'sw' ? 'Ghairi' : 'Cancel'}
                  </button>
                </div>
              </div>
            )}

            {/* Temporal Demand Time-Slider Bar */}
            {(showHotspots || splitMode) && (
              <div className="pointer-events-auto px-2.5 py-1.5 rounded-xl bg-white/95 dark:bg-[#0E172E]/95 backdrop-blur-md border border-neutral-200 dark:border-blue-900 shadow-lg flex flex-wrap items-center gap-1.5 max-w-xl">
                <button
                  type="button"
                  onClick={() => {
                    if (!showHotspots) setShowHotspots(true);
                    setTimePlaying((p) => !p);
                  }}
                  aria-label={timePlaying ? 'Pause temporal replay' : 'Play temporal replay'}
                  className="px-2 py-1 rounded-lg bg-[#D92027] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {timePlaying ? (
                    <Pause className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  <span>{timePlaying ? 'Pause' : 'Play'}</span>
                </button>
                <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-300 flex items-center gap-1 px-1">
                  <Clock3 className="w-3 h-3 text-[#F5B800]" />
                </span>
                {(
                  [
                    ['all', lang === 'sw' ? 'Saa 24' : 'All Day'],
                    ['morning', lang === 'sw' ? 'Asubuhi' : 'Morning'],
                    ['midday', lang === 'sw' ? 'Mchana' : 'Midday'],
                    ['evening', lang === 'sw' ? 'Jioni' : 'Evening'],
                    ['night', lang === 'sw' ? 'Usiku' : 'Night'],
                  ] as [TimeSliceKey, string][]
                ).map(([sliceKey, label]) => (
                  <button
                    key={sliceKey}
                    type="button"
                    onClick={() => {
                      setTimePlaying(false);
                      setTimeSlice(sliceKey);
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                      timeSlice === sliceKey
                        ? 'bg-[#0B2A6F] text-[#F5B800]'
                        : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-blue-950/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* BBox Spatial Analytics Summary Card */}
            {bboxStats && activeBBox && (
              <div className="pointer-events-auto px-3.5 py-2.5 rounded-xl bg-white/95 dark:bg-[#0E172E]/95 backdrop-blur-md border border-[#F5B800]/70 text-neutral-900 dark:text-white text-xs space-y-2 shadow-xl max-w-md">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-[#0B2A6F] dark:text-[#F5B800] flex items-center gap-1.5">
                    <Crop className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'sw'
                        ? `Takwimu za Eneo (${bboxStats.areaKm2} km²)`
                        : `Spatial Box Metrics (${bboxStats.areaKm2} km²)`}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (!bboxGeoJsonFeature) return;
                        downloadGeoJsonFile('oilcom-bbox-selection.geojson', {
                          type: 'FeatureCollection',
                          features: [bboxGeoJsonFeature],
                        });
                      }}
                      className="px-2 py-0.5 rounded bg-[#0B2A6F] text-white text-[10px] font-semibold cursor-pointer"
                    >
                      GeoJSON
                    </button>
                    <button
                      type="button"
                      onClick={clearBBoxFilter}
                      aria-label="Clear spatial box"
                      className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono-num tabular-nums text-[11px]">
                  <div className="p-1.5 rounded-lg bg-neutral-100 dark:bg-blue-950/60">
                    <span className="text-[10px] text-neutral-500 block">
                      {lang === 'sw' ? 'Vituo' : 'Stations'}
                    </span>
                    <span className="font-bold">{bboxStats.stationsCount}</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-neutral-100 dark:bg-blue-950/60">
                    <span className="text-[10px] text-neutral-500 block">
                      {lang === 'sw' ? 'Oda / Mapato' : 'Orders'}
                    </span>
                    <span className="font-bold">{bboxStats.ordersCount}</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-neutral-100 dark:bg-blue-950/60">
                    <span className="text-[10px] text-neutral-500 block">
                      Overture Score
                    </span>
                    <span className="font-bold">{bboxStats.avgOvertureScore}/100</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-neutral-100 dark:bg-blue-950/60">
                    <span className="text-[10px] text-neutral-500 block">
                      {lang === 'sw' ? 'Mitungi LPG' : 'LPG Stock'}
                    </span>
                    <span className="font-bold">{bboxStats.totalLpgCylinders}</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-neutral-100 dark:bg-blue-950/60">
                    <span className="text-[10px] text-neutral-500 block">Pumps</span>
                    <span className="font-bold">{bboxStats.totalPumps}</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-neutral-100 dark:bg-blue-950/60">
                    <span className="text-[10px] text-neutral-500 block">
                      {lang === 'sw' ? 'Vitovu' : 'Demand Hubs'}
                    </span>
                    <span className="font-bold">{bboxStats.demandHubsCount}</span>
                  </div>
                </div>
              </div>
            )}

            {(locError || placesNotice) && (
              <div className="pointer-events-auto px-3 py-2 rounded-xl bg-amber-50/95 dark:bg-amber-950/95 backdrop-blur-md border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-xs flex items-center justify-between gap-2 shadow-md max-w-xl">
                <span>{placesNotice || locError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setLocError(null);
                    setPlacesNotice(null);
                  }}
                  aria-label="Dismiss notice"
                  className="p-0.5 shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Selected GeoJSON GIS Feature Card */}
            {selectedGisFeature && hasAnyGisOverlay && (
              <div className="pointer-events-auto px-3.5 py-2.5 rounded-xl bg-white/95 dark:bg-[#0E172E]/95 backdrop-blur-md border border-blue-500/40 text-neutral-900 dark:text-white text-xs flex items-start justify-between gap-3 shadow-lg max-w-md">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-[#F5B800]">
                    {selectedGisFeature.kindLabel}
                  </p>
                  <p className="font-bold text-xs leading-snug">
                    {selectedGisFeature.title}
                  </p>
                  {selectedGisFeature.description && (
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300">
                      {selectedGisFeature.description}
                    </p>
                  )}
                  {(selectedGisFeature.eta ||
                    selectedGisFeature.feeTzs !== undefined) && (
                    <p className="text-[11px] font-mono-num font-semibold text-[#0B2A6F] dark:text-[#F5B800] pt-0.5">
                      {selectedGisFeature.eta ? `ETA ${selectedGisFeature.eta}` : ''}
                      {selectedGisFeature.eta &&
                      selectedGisFeature.feeTzs !== undefined
                        ? ' · '
                        : ''}
                      {selectedGisFeature.feeTzs !== undefined
                        ? `${lang === 'sw' ? 'Usafiri' : 'Delivery'}: ${formatTzs(
                            selectedGisFeature.feeTzs
                          )}`
                        : ''}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedGisFeature(null)}
                  aria-label="Close GIS feature details"
                  className="p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {poiDetailsLoading && (
              <div className="pointer-events-auto px-3.5 py-2 rounded-xl bg-[#0B2A6F]/95 text-white border border-[#F5B800]/60 text-xs flex items-center gap-2 shadow-lg max-w-xs">
                <Loader2 className="w-3.5 h-3.5 text-[#F5B800] animate-spin shrink-0" />
                <span>
                  {lang === 'sw'
                    ? 'Inapakia maelezo kamili ya eneo...'
                    : 'Loading full place details...'}
                </span>
              </div>
            )}
          </div>

          {/* Floating Right Map Tool Controls (including 3D/2D & Orbit 3D) */}
          <div className="absolute right-3 top-28 z-10 flex flex-col gap-2">
            <button
              type="button"
              onClick={toggle3DMode}
              title={viewMode === '3d' ? 'Switch to 2D Map' : 'Switch to 3D Maps'}
              className={`w-10 h-10 rounded-xl border shadow-md flex items-center justify-center text-[11px] font-extrabold cursor-pointer transition-colors ${
                viewMode === '3d'
                  ? 'bg-[#F5B800] text-[#0B2A6F] border-[#F5B800]'
                  : 'bg-white/95 dark:bg-[#0E172E]/95 border-neutral-200 dark:border-blue-900 text-[#0B2A6F] dark:text-[#F5B800]'
              }`}
            >
              {viewMode === '3d' ? '2D' : '3D'}
            </button>

            {isNative3DActive && (
              <button
                type="button"
                onClick={handleOrbit3D}
                title={lang === 'sw' ? 'Zungusha Kamera ya 3D' : 'Orbit 3D Camera'}
                className="w-10 h-10 rounded-xl bg-white/95 dark:bg-[#0E172E]/95 border border-neutral-200 dark:border-blue-900 shadow-md flex items-center justify-center text-neutral-800 dark:text-white cursor-pointer"
              >
                <RotateCw className="w-4 h-4 text-[#0B2A6F] dark:text-[#F5B800]" />
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setMapType((prev) => (prev === 'roadmap' ? 'hybrid' : 'roadmap'))
              }
              title={
                lang === 'sw'
                  ? 'Badili Ramani / Satelaiti'
                  : 'Switch Map / Satellite'
              }
              className="w-10 h-10 rounded-xl bg-white/95 dark:bg-[#0E172E]/95 border border-neutral-200 dark:border-blue-900 shadow-md flex items-center justify-center text-neutral-800 dark:text-white cursor-pointer"
            >
              <Layers className="w-4 h-4 text-[#0B2A6F] dark:text-[#F5B800]" />
            </button>
            <button
              type="button"
              onClick={fitAllMarkers}
              title={lang === 'sw' ? 'Onyesha Vituo Vyote' : 'Fit All Stations'}
              className="w-10 h-10 rounded-xl bg-white/95 dark:bg-[#0E172E]/95 border border-neutral-200 dark:border-blue-900 shadow-md flex items-center justify-center text-neutral-800 dark:text-white cursor-pointer"
            >
              <Compass className="w-4 h-4 text-[#0B2A6F] dark:text-[#F5B800]" />
            </button>
            <button
              type="button"
              onClick={requestUserLocation}
              title={lang === 'sw' ? 'Eneo Langu (GPS)' : 'My GPS Location'}
              className="w-10 h-10 rounded-xl bg-white/95 dark:bg-[#0E172E]/95 border border-neutral-200 dark:border-blue-900 shadow-md flex items-center justify-center text-neutral-800 dark:text-white cursor-pointer"
            >
              {locLoading ? (
                <Loader2 className="w-4 h-4 text-blue-600 dark:text-[#F5B800] animate-spin" />
              ) : (
                <Navigation className="w-4 h-4 text-blue-600 dark:text-[#F5B800]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              title={
                isFullscreen
                  ? lang === 'sw'
                    ? 'Ondoka Skrini Nzima'
                    : 'Exit Fullscreen'
                  : lang === 'sw'
                    ? 'Panua Skrini Nzima'
                    : 'Fullscreen Map'
              }
              className={`w-10 h-10 rounded-xl border shadow-md flex items-center justify-center cursor-pointer transition-colors ${
                isFullscreen
                  ? 'bg-[#F5B800] text-[#0B2A6F] border-[#F5B800]'
                  : 'bg-white/95 dark:bg-[#0E172E]/95 border-neutral-200 dark:border-blue-900 text-[#0B2A6F] dark:text-[#F5B800]'
              }`}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Desktop Compact Map Legend (Fuel vs OILCOM Gas vs Fuel+Gas vs External Places) */}
          <div className="hidden lg:flex items-center gap-2.5 absolute left-3 bottom-3 z-10 px-3 py-1.5 rounded-xl bg-white/95 dark:bg-[#0E172E]/95 backdrop-blur-md border border-neutral-200 dark:border-blue-900 shadow-lg text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 pointer-events-auto">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-md bg-[#0B2A6F] text-[#F5B800] text-[10px] font-extrabold inline-flex items-center justify-center">
                O
              </span>
              <span>{lang === 'sw' ? 'OILCOM (Mafuta + Gesi)' : 'OILCOM (Both)'}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-md bg-[#D92027] text-white text-[10px] font-extrabold inline-flex items-center justify-center">
                {lang === 'sw' ? 'M' : 'F'}
              </span>
              <span>{lang === 'sw' ? 'Mafuta Pekee' : 'Fuel Only'}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-md bg-[#D97706] text-white text-[10px] font-extrabold inline-flex items-center justify-center">
                G
              </span>
              <span>{lang === 'sw' ? 'Gesi ya OILCOM' : 'OILCOM Gas'}</span>
            </span>
            {showExternalPlaces && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-md bg-white border border-slate-500 inline-block" />
                <span>{lang === 'sw' ? 'Vituo Vingine (Google)' : 'Other Stations'}</span>
              </span>
            )}
          </div>

          {/* Mobile Compact Bottom Card (single unified card with photo, full scrollable details & close button) */}
          {activeTarget && !mobileListOpen && (
            <div className="lg:hidden absolute bottom-6 inset-x-2.5 z-10 rounded-2xl bg-white/95 dark:bg-[#0E172E]/95 backdrop-blur-md border border-neutral-200 dark:border-blue-900 shadow-2xl overflow-hidden flex flex-col max-h-[38dvh]">
              {/* Compact Header */}
              <div className="px-2.5 pt-2 pb-1.5 flex items-start gap-2.5 shrink-0">
                {activeTarget.kind === 'place' && activeTarget.photoUrl ? (
                  <img
                    src={activeTarget.photoUrl}
                    alt={activeTarget.name}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 border border-neutral-200 dark:border-blue-900"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[#0B2A6F]/10 dark:bg-[#F5B800]/15 flex items-center justify-center shrink-0">
                    {activeTarget.kind === 'station' ? (
                      <Fuel className="w-4.5 h-4.5 text-[#0B2A6F] dark:text-[#F5B800]" />
                    ) : (
                      <MapPin className="w-4.5 h-4.5 text-[#0B2A6F] dark:text-[#F5B800]" />
                    )}
                  </div>
                )}

                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => setDetailsExpanded((v) => !v)}
                >
                  <div className="flex flex-wrap items-center gap-1 text-[10px] mb-0.5">
                    <span className="px-1.5 py-0.5 rounded bg-[#F5B800] text-[#0B2A6F] font-extrabold uppercase tracking-wide leading-none">
                      {activeTarget.kind === 'station'
                        ? activeTarget.code
                        : activeTarget.isOilcom
                          ? 'OILCOM'
                          : activeTarget.category || 'GOOGLE'}
                    </span>
                    {activeTarget.kind === 'place' &&
                      activeTarget.rating !== undefined && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-bold font-mono-num leading-none">
                          <Star className="w-2.5 h-2.5 fill-[#F5B800] text-[#F5B800]" />
                          {activeTarget.rating.toFixed(1)}
                          {activeTarget.userRatingCount !== undefined && (
                            <span className="font-normal opacity-75">
                              ({activeTarget.userRatingCount.toLocaleString()})
                            </span>
                          )}
                        </span>
                      )}
                    {activeTarget.kind === 'place' &&
                      activeTarget.openNow === true && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold leading-none">
                          {lang === 'sw' ? 'Wazi' : 'Open'}
                        </span>
                      )}
                    {activeTarget.kind === 'place' &&
                      activeTarget.openNow === false && (
                        <span className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 font-semibold leading-none">
                          {lang === 'sw' ? 'Imefungwa' : 'Closed'}
                        </span>
                      )}
                    {activeTarget.kind === 'station' && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-[#0B2A6F] dark:text-blue-200 font-semibold leading-none">
                        {activeTarget.open24Hours ? '24/7' : '06:00–22:00'}
                      </span>
                    )}
                    {activeDistanceKm !== null && (
                      <span className="font-mono-num font-semibold text-[#0B2A6F] dark:text-[#F5B800] leading-none">
                        {activeDistanceKm.toFixed(1)} km
                      </span>
                    )}
                  </div>

                  <h3 className="font-display font-bold text-[13px] text-neutral-900 dark:text-white truncate leading-tight">
                    {activeTarget.name}
                  </h3>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-300 truncate mt-0.5 leading-tight">
                    {activeTarget.subtitle}
                  </p>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDetailsExpanded((v) => !v)}
                    aria-label="Toggle details"
                    className="p-1 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-blue-950 cursor-pointer"
                  >
                    {detailsExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronUp className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStation(null);
                      setSelectedPlace(null);
                      setInfoOpen(false);
                    }}
                    aria-label="Close details"
                    className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-blue-950 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Active Route ETA Bar (if computed) */}
              {activeRoute && activeRoute.targetId === activeTarget.id && (
                <div className="px-3 pb-1.5 text-[11px] font-semibold text-blue-700 dark:text-[#F5B800] font-mono-num shrink-0 flex items-center gap-1.5">
                  <RouteIcon className="w-3 h-3 shrink-0" />
                  <span>
                    {(activeRoute.distanceMeters / 1000).toFixed(1)} km ·{' '}
                    {Math.max(1, Math.round(activeRoute.durationMillis / 60000))}{' '}
                    {lang === 'sw' ? 'dakika' : 'min'}
                  </span>
                </div>
              )}

              {/* Scrollable Expanded Details (all details visible without hiding the map) */}
              {detailsExpanded && (
                <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-1.5 border-t border-neutral-100 dark:border-blue-950 space-y-1.5 text-[11px]">
                  {activeTarget.kind === 'station' && (
                    <>
                      <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
                        {activeTarget.hasGas && (
                          <span className="inline-flex items-center gap-1">
                            <Flame className="w-3 h-3 text-[#F5B800]" />
                            {lang === 'sw' ? 'Gesi LPG' : 'LPG Gas'}
                          </span>
                        )}
                        {activeTarget.hasFuel && (
                          <span className="inline-flex items-center gap-1">
                            <Fuel className="w-3 h-3 text-[#0B2A6F] dark:text-[#F5B800]" />
                            {lang === 'sw' ? 'Mafuta' : 'Fuel'}
                          </span>
                        )}
                        {activeTarget.hasLubricants && (
                          <span className="inline-flex items-center gap-1">
                            <Droplets className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            {lang === 'sw' ? 'Vilainishi' : 'Lubricants'}
                          </span>
                        )}
                      </div>
                      {(activeTarget.petrolPriceTzs || activeTarget.dieselPriceTzs) && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="px-2 py-1 rounded-lg bg-neutral-50 dark:bg-blue-950/40">
                            <span className="text-[10px] text-neutral-500 block leading-none">
                              Petrol
                            </span>
                            <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                              {formatTzs(activeTarget.petrolPriceTzs || 0)}/L
                            </span>
                          </div>
                          <div className="px-2 py-1 rounded-lg bg-neutral-50 dark:bg-blue-950/40">
                            <span className="text-[10px] text-neutral-500 block leading-none">
                              Diesel
                            </span>
                            <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                              {formatTzs(activeTarget.dieselPriceTzs || 0)}/L
                            </span>
                          </div>
                        </div>
                      )}
                      {(activeTarget.lpg6kgStock !== undefined ||
                        activeTarget.lpg15kgStock !== undefined ||
                        activeTarget.lpg38kgStock !== undefined) && (
                        <div className="grid grid-cols-3 gap-1.5 text-center">
                          <div className="px-1.5 py-1 rounded-lg bg-amber-50/70 dark:bg-blue-950/40">
                            <span className="text-[9px] text-neutral-500 block leading-none">
                              LPG 6kg
                            </span>
                            <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                              {activeTarget.lpg6kgStock ?? 0}
                            </span>
                          </div>
                          <div className="px-1.5 py-1 rounded-lg bg-amber-50/70 dark:bg-blue-950/40">
                            <span className="text-[9px] text-neutral-500 block leading-none">
                              LPG 15kg
                            </span>
                            <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                              {activeTarget.lpg15kgStock ?? 0}
                            </span>
                          </div>
                          <div className="px-1.5 py-1 rounded-lg bg-amber-50/70 dark:bg-blue-950/40">
                            <span className="text-[9px] text-neutral-500 block leading-none">
                              LPG 38kg
                            </span>
                            <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                              {activeTarget.lpg38kgStock ?? 0}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {activeTarget.kind === 'place' && (
                    <>
                      {activeTarget.editorialSummary && (
                        <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
                          {activeTarget.editorialSummary}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px]">
                        {activeTarget.phone && (
                          <a
                            href={`tel:${activeTarget.phone}`}
                            className="inline-flex items-center gap-1 font-semibold text-[#0B2A6F] dark:text-[#F5B800] underline"
                          >
                            <Phone className="w-3 h-3" />
                            <span>{activeTarget.phone}</span>
                          </a>
                        )}
                        {activeTarget.websiteURI && (
                          <a
                            href={activeTarget.websiteURI}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-sky-300 underline"
                          >
                            <Globe className="w-3 h-3" />
                            <span>{lang === 'sw' ? 'Tovuti' : 'Website'}</span>
                          </a>
                        )}
                        {activeTarget.googleMapsURI && (
                          <a
                            href={activeTarget.googleMapsURI}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#0B2A6F] dark:text-[#F5B800] underline"
                          >
                            <span>Google Maps</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {activeTarget.weekdayHours && activeTarget.weekdayHours.length > 0 && (
                        <div className="p-2 rounded-lg bg-neutral-50 dark:bg-blue-950/40 space-y-0.5 text-[10px] text-neutral-600 dark:text-neutral-300">
                          {activeTarget.weekdayHours.map((line) => (
                            <p key={line} className="leading-snug">
                              {line}
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Compact Action Buttons */}
              <div className="px-3 py-2 border-t border-neutral-100 dark:border-blue-950 flex flex-wrap gap-1.5 shrink-0 bg-neutral-50/70 dark:bg-[#091229]/60">
                <button
                  type="button"
                  onClick={() => computeDirections(activeTarget)}
                  disabled={routeLoading}
                  className="flex-1 min-w-[90px] py-1.5 px-2.5 rounded-lg bg-[#0B2A6F] text-white font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  {routeLoading ? (
                    <Loader2 className="w-3 h-3 text-[#F5B800] animate-spin" />
                  ) : (
                    <RouteIcon className="w-3 h-3 text-[#F5B800]" />
                  )}
                  <span>{lang === 'sw' ? 'Maelekezo' : 'Directions'}</span>
                </button>
                {activeTarget.kind === 'station' ? (
                  <>
                    {activeTarget.hasGas && (
                      <button
                        type="button"
                        onClick={() => onOrderAtStation(activeTarget.stationObj, 'gas')}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#F5B800] hover:bg-[#e0a800] text-[#0B2A6F] font-bold text-[11px] cursor-pointer whitespace-nowrap"
                      >
                        {lang === 'sw' ? 'Agiza Gesi' : 'Order Gas'}
                      </button>
                    )}
                    {activeTarget.hasFuel && (
                      <button
                        type="button"
                        onClick={() => onOrderAtStation(activeTarget.stationObj, 'fuel')}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#D92027] hover:bg-[#b81b21] text-white font-bold text-[11px] cursor-pointer whitespace-nowrap"
                      >
                        {lang === 'sw' ? 'Agiza Mafuta' : 'Order Fuel'}
                      </button>
                    )}
                    <a
                      href={activeTarget.googleMapsURI}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-2.5 rounded-lg border border-neutral-200 dark:border-blue-800 text-[#0B2A6F] dark:text-[#F5B800] font-bold text-[11px] inline-flex items-center justify-center gap-1 whitespace-nowrap"
                    >
                      <span>Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                ) : (
                  <>
                    {activeTarget.isOilcom && (
                      <>
                        {(activeTarget.oilcomKind === 'gas' ||
                          activeTarget.oilcomKind === 'both') && (
                          <button
                            type="button"
                            onClick={() =>
                              onOrderAtStation(
                                discoveredPlaceToStation(activeTarget.placeObj),
                                'gas'
                              )
                            }
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#F5B800] hover:bg-[#e0a800] text-[#0B2A6F] font-bold text-[11px] cursor-pointer whitespace-nowrap"
                          >
                            {lang === 'sw' ? 'Agiza Gesi' : 'Order Gas'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            onOrderAtStation(
                              discoveredPlaceToStation(activeTarget.placeObj),
                              'fuel'
                            )
                          }
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#D92027] hover:bg-[#b81b21] text-white font-bold text-[11px] cursor-pointer whitespace-nowrap"
                        >
                          {lang === 'sw' ? 'Agiza Mafuta' : 'Order Fuel'}
                        </button>
                      </>
                    )}
                    {activeTarget.googleMapsURI && (
                      <a
                        href={activeTarget.googleMapsURI}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#F5B800] hover:bg-[#e0a800] text-[#0B2A6F] font-bold text-[11px] inline-flex items-center justify-center gap-1 whitespace-nowrap"
                      >
                        <span>Google Maps</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {canManageStations && (
                      <button
                        type="button"
                        onClick={() =>
                          void openAddStationModalAt(
                            { lat: activeTarget.lat, lng: activeTarget.lng },
                            {
                              name: activeTarget.name,
                              address: activeTarget.subtitle,
                              stationKind: activeTarget.isOilcom
                                ? activeTarget.oilcomKind
                                : undefined,
                              googleMapsURI: activeTarget.googleMapsURI,
                            }
                          )
                        }
                        className="py-1.5 px-2.5 rounded-lg bg-[#D92027] hover:bg-[#b81b21] text-white font-bold text-[11px] inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3" />
                        <span>
                          {activeTarget.isOilcom
                            ? lang === 'sw'
                              ? 'Hifadhi Stoo'
                              : 'Save Stock'
                            : lang === 'sw'
                              ? 'Sajili OILCOM'
                              : 'Add Station'}
                        </span>
                      </button>
                    )}
                    {!detailsExpanded && (
                      <button
                        type="button"
                        onClick={() => setDetailsExpanded(true)}
                        className="py-1.5 px-2.5 rounded-lg border border-neutral-200 dark:border-blue-800 text-neutral-700 dark:text-neutral-200 font-semibold text-[11px] cursor-pointer whitespace-nowrap"
                      >
                        {lang === 'sw' ? 'Maelezo' : 'Details'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Mobile Station Directory Overlay */}
          {mobileListOpen && (
            <div className="lg:hidden absolute inset-x-3 bottom-3 top-28 z-20 rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-900 shadow-2xl flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100 dark:border-blue-950 flex items-center justify-between">
                <h3 className="font-display font-bold text-sm text-neutral-900 dark:text-white">
                  {lang === 'sw' ? 'Orodha ya Vituo' : 'Station Directory'}
                </h3>
                <button
                  type="button"
                  onClick={() => setMobileListOpen(false)}
                  aria-label="Close list"
                  className="p-1 text-neutral-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-blue-950">
                {filteredStations.length === 0 &&
                  filteredOilcomPlaces.length === 0 &&
                  visibleDiscoveredPlaces.length === 0 && (
                  <div className="p-8 text-center space-y-2.5 text-xs text-neutral-500">
                    <p>
                      {lang === 'sw'
                        ? 'Hakuna kituo kilichopatikana kwa vichujio ulivyochagua.'
                        : 'No stations match the selected filters.'}
                    </p>
                    {hasActiveFilter && (
                      <button
                        type="button"
                        onClick={() => {
                          setOnly24h(false);
                          setOilcomCategoryFilter('all');
                          setOnlyLubricants(false);
                          setShowExternalPlaces(false);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-[#0B2A6F] text-white font-semibold cursor-pointer"
                      >
                        {lang === 'sw' ? 'Onyesha Vituo Vyote' : 'Reset Filters'}
                      </button>
                    )}
                  </div>
                )}
                {filteredStations.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSelectStation(st)}
                    className="w-full text-left p-3.5 hover:bg-neutral-50 dark:hover:bg-blue-950/40 flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-neutral-900 dark:text-white truncate">
                        {st.name}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                        {st.address}, {st.city} ·{' '}
                        {st.open24Hours ? '24/7' : '06:00–22:00'}
                        {st.hasGas !== false ? ' · Gesi' : ''}
                        {st.hasFuel !== false ? ' · Mafuta' : ''}
                      </p>
                    </div>
                    {userCoords && (
                      <span className="font-mono-num text-[11px] font-bold text-[#0B2A6F] dark:text-[#F5B800] shrink-0">
                        {haversineKm(
                          userCoords.lat,
                          userCoords.lng,
                          st.lat,
                          st.lng
                        ).toFixed(1)}{' '}
                        km
                      </span>
                    )}
                  </button>
                ))}
                {filteredOilcomPlaces.map((pl) => {
                  const kind =
                    pl.oilcomKind || classifyOilcomPlaceKind(pl.name, pl.address);
                  return (
                    <button
                      key={`m-oil-${pl.id}`}
                      type="button"
                      onClick={() => handleSelectPlace(pl)}
                      className="w-full text-left p-3.5 hover:bg-neutral-50 dark:hover:bg-blue-950/40 flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-neutral-900 dark:text-white truncate">
                          {pl.name}
                        </p>
                        <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                          {pl.address} ·{' '}
                          {kind === 'gas'
                            ? 'Gesi ya OILCOM'
                            : kind === 'both'
                              ? 'Mafuta & Gesi'
                              : 'Sheli ya OILCOM'}
                        </p>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-[#0B2A6F] text-[#F5B800] text-[10px] font-bold shrink-0">
                        OILCOM
                      </span>
                    </button>
                  );
                })}
                {visibleDiscoveredPlaces.map((pl) => (
                  <button
                    key={`m-pl-${pl.id}`}
                    type="button"
                    onClick={() => handleSelectPlace(pl)}
                    className="w-full text-left p-3.5 hover:bg-neutral-50 dark:hover:bg-blue-950/40 flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-neutral-900 dark:text-white truncate">
                        {pl.name}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                        {pl.address}
                      </p>
                    </div>
                    <MapPin className="w-4 h-4 text-[#F5B800] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Desktop Floating Side Drawer: Active Details + Directory (only open on demand so map stays 100% full) */}
          {desktopPanelOpen && (
            <div className="hidden lg:flex flex-col gap-3 min-w-0 absolute top-28 right-16 bottom-3 w-[356px] z-20 pointer-events-auto overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {activeTarget && (
                <div className="rounded-2xl bg-[#0B2A6F]/95 backdrop-blur-md text-white overflow-hidden shadow-2xl border border-white/15 shrink-0">
              {activeTarget.kind === 'place' && activeTarget.photoUrl && (
                <div className="relative h-32 w-full">
                  <img
                    src={activeTarget.photoUrl}
                    alt={activeTarget.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B2A6F] via-transparent to-black/25" />
                </div>
              )}
              <div className="p-5 space-y-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono-num text-[11px] text-[#F5B800] uppercase">
                      {activeTarget.kind === 'station'
                        ? activeTarget.code
                        : activeTarget.isOilcom
                          ? 'OILCOM · GOOGLE MAPS'
                          : activeTarget.category || 'GOOGLE PLACES'}
                    </p>
                    <h3 className="font-display font-bold text-base mt-0.5">
                      {activeTarget.name}
                    </h3>
                    <p className="text-xs text-blue-100/80 mt-0.5">
                      {activeTarget.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 text-xs text-blue-100/90 pt-1">
                  {activeTarget.kind === 'station' ? (
                    <>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#F5B800]" />
                        {activeTarget.open24Hours ? 'Fungua 24/7' : '06:00–22:00'}
                      </span>
                      {activeTarget.hasGas && (
                        <span className="flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5 text-[#F5B800]" />
                          {lang === 'sw' ? 'Gesi LPG' : 'LPG Gas'}
                        </span>
                      )}
                      {activeTarget.hasFuel && (
                        <span className="flex items-center gap-1">
                          <Fuel className="w-3.5 h-3.5 text-[#F5B800]" />
                          {lang === 'sw' ? 'Mafuta' : 'Fuel'}
                        </span>
                      )}
                      {activeTarget.hasLubricants && (
                        <span className="flex items-center gap-1">
                          <Droplets className="w-3.5 h-3.5 text-[#F5B800]" />
                          {lang === 'sw' ? 'Vilainishi' : 'Lubricants'}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {activeTarget.rating !== undefined && (
                        <span className="flex items-center gap-1 font-mono-num font-bold text-[#F5B800]">
                          <Star className="w-3.5 h-3.5 fill-[#F5B800] text-[#F5B800]" />
                          {activeTarget.rating.toFixed(1)}
                          {activeTarget.userRatingCount !== undefined &&
                            ` (${activeTarget.userRatingCount.toLocaleString()})`}
                        </span>
                      )}
                      {activeTarget.openNow === true && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 font-semibold">
                          {lang === 'sw' ? 'Wazi Sasa' : 'Open Now'}
                        </span>
                      )}
                      {activeTarget.openNow === false && (
                        <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-200 font-semibold">
                          {lang === 'sw' ? 'Imefungwa' : 'Closed'}
                        </span>
                      )}
                    </>
                  )}
                  {activeDistanceKm !== null && (
                    <span className="font-mono-num font-semibold text-[#F5B800]">
                      {activeDistanceKm.toFixed(1)} km
                    </span>
                  )}
                </div>

                {activeTarget.kind === 'place' &&
                  (activeTarget.editorialSummary ||
                    activeTarget.phone ||
                    activeTarget.websiteURI ||
                    activeTarget.weekdayHours) && (
                    <div className="space-y-2 pt-2 border-t border-white/10 text-xs text-blue-100/90">
                      {activeTarget.editorialSummary && (
                        <p className="leading-relaxed text-blue-50/90">
                          {activeTarget.editorialSummary}
                        </p>
                      )}
                      {activeTarget.weekdayHours &&
                        activeTarget.weekdayHours.length > 0 && (
                          <div className="p-2.5 rounded-xl bg-white/10 space-y-1 text-[11px]">
                            {activeTarget.weekdayHours.map((line) => (
                              <p key={line} className="truncate">
                                {line}
                              </p>
                            ))}
                          </div>
                        )}
                      <div className="flex flex-wrap items-center gap-3">
                        {activeTarget.phone && (
                          <a
                            href={`tel:${activeTarget.phone}`}
                            className="inline-flex items-center gap-1.5 font-semibold text-[#F5B800] hover:underline"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{activeTarget.phone}</span>
                          </a>
                        )}
                        {activeTarget.websiteURI && (
                          <a
                            href={activeTarget.websiteURI}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 font-semibold text-sky-200 hover:underline"
                          >
                            <Globe className="w-3.5 h-3.5" />
                            <span>{lang === 'sw' ? 'Tovuti' : 'Website'}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}

              {activeRoute && activeRoute.targetId === activeTarget.id && (
                <div className="p-2.5 rounded-xl bg-white/10 text-xs space-y-0.5">
                  <div className="flex items-center justify-between font-mono-num">
                    <span className="text-blue-100/80">
                      {lang === 'sw' ? 'Umbali wa Njia:' : 'Route Distance:'}
                    </span>
                    <span className="font-bold text-[#F5B800]">
                      {(activeRoute.distanceMeters / 1000).toFixed(1)} km ·{' '}
                      {Math.max(1, Math.round(activeRoute.durationMillis / 60000))}{' '}
                      min
                    </span>
                  </div>
                  {activeRoute.usingFallbackOrigin && (
                    <p className="text-[10px] text-blue-200/75">
                      {lang === 'sw'
                        ? 'Kutoka katikati ya jiji (Washa GPS kupata njia kutoka ulipo).'
                        : 'From city center (Enable GPS for your exact starting point).'}
                    </p>
                  )}
                </div>
              )}

              {activeTarget.kind === 'station' &&
                (activeTarget.petrolPriceTzs || activeTarget.dieselPriceTzs) && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
                    <div>
                      <p className="opacity-70">Petrol (Demo)</p>
                      <p className="font-mono-num font-bold text-[#F5B800]">
                        {formatTzs(activeTarget.petrolPriceTzs || 0)}/L
                      </p>
                    </div>
                    <div>
                      <p className="opacity-70">Diesel (Demo)</p>
                      <p className="font-mono-num font-bold text-[#F5B800]">
                        {formatTzs(activeTarget.dieselPriceTzs || 0)}/L
                      </p>
                    </div>
                  </div>
                )}

              {activeTarget.kind === 'station' &&
                (activeTarget.lpg6kgStock !== undefined ||
                  activeTarget.lpg15kgStock !== undefined ||
                  activeTarget.lpg38kgStock !== undefined) && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-xs text-center">
                    <div className="p-2 rounded-lg bg-white/10">
                      <p className="opacity-70 text-[10px]">LPG 6kg</p>
                      <p className="font-mono-num font-bold text-[#F5B800]">
                        {activeTarget.lpg6kgStock ?? 0} cyl
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-white/10">
                      <p className="opacity-70 text-[10px]">LPG 15kg</p>
                      <p className="font-mono-num font-bold text-[#F5B800]">
                        {activeTarget.lpg15kgStock ?? 0} cyl
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-white/10">
                      <p className="opacity-70 text-[10px]">LPG 38kg</p>
                      <p className="font-mono-num font-bold text-[#F5B800]">
                        {activeTarget.lpg38kgStock ?? 0} cyl
                      </p>
                    </div>
                  </div>
                )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => computeDirections(activeTarget)}
                  disabled={routeLoading}
                  className="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl bg-white/15 hover:bg-white/20 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {routeLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-[#F5B800] animate-spin" />
                  ) : (
                    <RouteIcon className="w-3.5 h-3.5 text-[#F5B800]" />
                  )}
                  <span>{lang === 'sw' ? 'Maelekezo' : 'Directions'}</span>
                </button>
                {activeTarget.kind === 'station' ? (
                  <>
                    {activeTarget.hasGas && (
                      <button
                        type="button"
                        onClick={() => onOrderAtStation(activeTarget.stationObj, 'gas')}
                        className="flex-1 min-w-[100px] py-2.5 px-3 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#071A4A] font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {lang === 'sw' ? 'Agiza Gesi' : 'Order Gas'}
                      </button>
                    )}
                    {activeTarget.hasFuel && (
                      <button
                        type="button"
                        onClick={() => onOrderAtStation(activeTarget.stationObj, 'fuel')}
                        className="flex-1 min-w-[100px] py-2.5 px-3 rounded-xl bg-[#D92027] hover:bg-[#b81b21] text-white font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {lang === 'sw' ? 'Agiza Mafuta' : 'Order Fuel'}
                      </button>
                    )}
                    <a
                      href={activeTarget.googleMapsURI}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <span>
                        {lang === 'sw'
                          ? 'Fungua Kwenye Google Maps'
                          : 'Open on Google Maps'}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-[#F5B800]" />
                    </a>
                  </>
                ) : (
                  <>
                    {activeTarget.isOilcom && (
                      <>
                        {(activeTarget.oilcomKind === 'gas' ||
                          activeTarget.oilcomKind === 'both') && (
                          <button
                            type="button"
                            onClick={() =>
                              onOrderAtStation(
                                discoveredPlaceToStation(activeTarget.placeObj),
                                'gas'
                              )
                            }
                            className="flex-1 min-w-[100px] py-2.5 px-3 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#071A4A] font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {lang === 'sw' ? 'Agiza Gesi' : 'Order Gas'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            onOrderAtStation(
                              discoveredPlaceToStation(activeTarget.placeObj),
                              'fuel'
                            )
                          }
                          className="flex-1 min-w-[100px] py-2.5 px-3 rounded-xl bg-[#D92027] hover:bg-[#b81b21] text-white font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {lang === 'sw' ? 'Agiza Mafuta' : 'Order Fuel'}
                        </button>
                      </>
                    )}
                    {activeTarget.googleMapsURI && (
                      <a
                        href={activeTarget.googleMapsURI}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2.5 px-3 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#071A4A] font-bold text-xs flex items-center justify-center gap-1 whitespace-nowrap"
                      >
                        <span>Google Maps</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {canManageStations && (
                      <button
                        type="button"
                        onClick={() =>
                          void openAddStationModalAt(
                            { lat: activeTarget.lat, lng: activeTarget.lng },
                            {
                              name: activeTarget.name,
                              address: activeTarget.subtitle,
                              stationKind: activeTarget.isOilcom
                                ? activeTarget.oilcomKind
                                : undefined,
                              googleMapsURI: activeTarget.googleMapsURI,
                            }
                          )
                        }
                        className="w-full py-2.5 px-3 rounded-xl bg-[#D92027] hover:bg-[#b81b21] text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-4 h-4" />
                        <span>
                          {activeTarget.isOilcom
                            ? lang === 'sw'
                              ? 'Hifadhi Bei & Stoo (Orodha Rasmi)'
                              : 'Save Prices & Stock to Catalog'
                            : lang === 'sw'
                              ? 'Ongeza Kama Kituo cha OILCOM'
                              : 'Add as OILCOM Station'}
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            </div>
          )}

          {/* Directory List */}
          <div className="rounded-2xl bg-white/95 dark:bg-[#0E172E]/95 backdrop-blur-md border border-neutral-200 dark:border-blue-950 shadow-2xl flex-1 flex flex-col overflow-hidden min-h-[200px]">
            <div className="px-4 py-3 border-b border-neutral-100 dark:border-blue-950 flex items-center justify-between gap-2 text-xs font-bold text-neutral-900 dark:text-white">
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate">
                  {lang === 'sw' ? 'Vituo vya OILCOM' : 'OILCOM Stations'} (
                  {filteredStations.length + filteredOilcomPlaces.length})
                </span>
                {visibleDiscoveredPlaces.length > 0 && (
                  <span className="text-[11px] font-semibold text-blue-700 dark:text-[#F5B800] shrink-0">
                    +{visibleDiscoveredPlaces.length} Places
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDesktopPanelOpen(false)}
                aria-label="Close stations drawer"
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-blue-950 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-blue-950">
              {filteredStations.length === 0 &&
                filteredOilcomPlaces.length === 0 &&
                visibleDiscoveredPlaces.length === 0 && (
                <div className="p-8 text-center space-y-2.5 text-xs text-neutral-500">
                  <p>
                    {lang === 'sw'
                      ? 'Hakuna kituo kilichopatikana kwa vichujio ulivyochagua.'
                      : 'No stations match the selected filters.'}
                  </p>
                  {hasActiveFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        setOnly24h(false);
                        setOilcomCategoryFilter('all');
                        setOnlyLubricants(false);
                        setShowExternalPlaces(false);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#0B2A6F] text-white font-semibold cursor-pointer"
                    >
                      {lang === 'sw' ? 'Onyesha Vituo Vyote' : 'Reset Filters'}
                    </button>
                  )}
                </div>
              )}
              {filteredStations.map((st) => {
                const isSelected = selectedStation?.id === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSelectStation(st)}
                    className={`w-full text-left p-3.5 hover:bg-neutral-50 dark:hover:bg-blue-950/40 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#F5B800]/10 dark:bg-blue-950/50' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-neutral-900 dark:text-white truncate">
                        {st.name}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                        {st.city} · {st.open24Hours ? '24/7' : '06:00–22:00'}
                        {st.hasGas !== false ? ' · Gesi' : ''}
                        {st.hasFuel !== false ? ' · Mafuta' : ''}
                      </p>
                    </div>
                    {userCoords ? (
                      <span className="font-mono-num text-[11px] font-bold text-[#0B2A6F] dark:text-[#F5B800] shrink-0">
                        {haversineKm(
                          userCoords.lat,
                          userCoords.lng,
                          st.lat,
                          st.lng
                        ).toFixed(1)}{' '}
                        km
                      </span>
                    ) : (
                      <Fuel className="w-4 h-4 text-[#0B2A6F] dark:text-[#F5B800] shrink-0" />
                    )}
                  </button>
                );
              })}

              {filteredOilcomPlaces.map((pl) => {
                const isSelected = selectedPlace?.id === pl.id;
                const kind =
                  pl.oilcomKind || classifyOilcomPlaceKind(pl.name, pl.address);
                return (
                  <button
                    key={`d-oil-${pl.id}`}
                    type="button"
                    onClick={() => handleSelectPlace(pl)}
                    className={`w-full text-left p-3.5 hover:bg-neutral-50 dark:hover:bg-blue-950/40 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#F5B800]/10 dark:bg-blue-950/50' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-neutral-900 dark:text-white truncate">
                        {pl.name}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                        {pl.address} ·{' '}
                        {kind === 'gas'
                          ? 'Gesi ya OILCOM'
                          : kind === 'both'
                            ? 'Mafuta & Gesi'
                            : 'Sheli ya OILCOM'}
                      </p>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-[#0B2A6F] text-[#F5B800] text-[10px] font-bold shrink-0">
                      OILCOM
                    </span>
                  </button>
                );
              })}

              {visibleDiscoveredPlaces.map((pl) => {
                const isSelected = selectedPlace?.id === pl.id;
                return (
                  <button
                    key={`d-pl-${pl.id}`}
                    type="button"
                    onClick={() => handleSelectPlace(pl)}
                    className={`w-full text-left p-3.5 hover:bg-neutral-50 dark:hover:bg-blue-950/40 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#F5B800]/10 dark:bg-blue-950/50' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-neutral-900 dark:text-white truncate">
                        {pl.name}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                        {pl.address}
                      </p>
                    </div>
                    <MapPin className="w-4 h-4 text-[#F5B800] shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Fuel / Gas Station Directly on Map Modal */}
      {addStationModalOpen && canManageStations && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => {
            if (!savingStation) {
              setAddStationModalOpen(false);
              setDraftStationCoords(null);
            }
          }}
        >
          <form
            onSubmit={handleSaveMapStation}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-900 p-4 sm:p-5 shadow-2xl space-y-3.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#D92027]" />
                  <span>
                    {lang === 'sw'
                      ? 'Ongeza Kituo Kwenye Ramani'
                      : 'Add Station Directly on Map'}
                  </span>
                </h3>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {lang === 'sw'
                    ? 'Kitaonekana papo hapo kwenye ramani ya 2D & 3D na kuunganishwa na Google Maps.'
                    : 'Appears immediately on the live 2D & 3D map with direct Google Maps link.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAddStationModalOpen(false);
                  setDraftStationCoords(null);
                }}
                aria-label="Close add station modal"
                className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addStationError && (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-200">
                {addStationError}
              </div>
            )}

            {/* Station Kind Selector (Fuel / Gas / Both) */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-1.5">
                {lang === 'sw' ? 'Aina ya Kituo' : 'Station Type'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      id: 'fuel',
                      label: lang === 'sw' ? 'Mafuta Pekee' : 'Fuel Only',
                      icon: Fuel,
                    },
                    {
                      id: 'gas',
                      label: lang === 'sw' ? 'Gesi LPG Pekee' : 'Gas Depot',
                      icon: Flame,
                    },
                    {
                      id: 'both',
                      label: lang === 'sw' ? 'Mafuta & Gesi' : 'Fuel + Gas',
                      icon: Check,
                    },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = stationDraft.stationKind === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setStationDraft((prev) => ({
                          ...prev,
                          stationKind: item.id,
                        }))
                      }
                      className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#0B2A6F] text-[#F5B800] border-[#0B2A6F]'
                          : 'bg-neutral-50 dark:bg-[#091022] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-blue-950'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[11px] text-center leading-tight">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 block mb-1">
                  {lang === 'sw' ? 'Jina la Kituo *' : 'Station Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={stationDraft.name}
                  onChange={(e) =>
                    setStationDraft((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder={
                    stationDraft.stationKind === 'gas'
                      ? 'mf. OILCOM Gesi Kariakoo'
                      : 'mf. OILCOM Kerege Service Station'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs text-neutral-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 block mb-1">
                  {lang === 'sw' ? 'Msimbo (Code)' : 'Station Code'}
                </label>
                <input
                  type="text"
                  value={stationDraft.code}
                  onChange={(e) =>
                    setStationDraft((prev) => ({
                      ...prev,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="OIL-DSM-01"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                  {lang === 'sw' ? 'Mtaa / Anwani Kamili *' : 'Street Address *'}
                </label>
                {addStationLookupLoading && (
                  <span className="text-[10px] text-[#0B2A6F] dark:text-[#F5B800] flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Google Places...</span>
                  </span>
                )}
              </div>
              <input
                type="text"
                required
                value={stationDraft.address}
                onChange={(e) =>
                  setStationDraft((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder="mf. Barabara ya Bagamoyo, Mbezi Beach"
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs text-neutral-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 block mb-1">
                  {lang === 'sw' ? 'Mji / Wilaya' : 'City'}
                </label>
                <input
                  type="text"
                  required
                  value={stationDraft.city}
                  onChange={(e) =>
                    setStationDraft((prev) => ({ ...prev, city: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs text-neutral-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 block mb-1">
                  {lang === 'sw' ? 'Mkoa' : 'Region'}
                </label>
                <input
                  type="text"
                  required
                  value={stationDraft.region}
                  onChange={(e) =>
                    setStationDraft((prev) => ({ ...prev, region: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            {/* GPS Coordinates */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={stationDraft.lat}
                  onChange={(e) => {
                    const lat = Number(e.target.value);
                    setStationDraft((prev) => ({ ...prev, lat }));
                    if (Number.isFinite(lat)) {
                      setDraftStationCoords({ lat, lng: stationDraft.lng });
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num text-neutral-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 block mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={stationDraft.lng}
                  onChange={(e) => {
                    const lng = Number(e.target.value);
                    setStationDraft((prev) => ({ ...prev, lng }));
                    if (Number.isFinite(lng)) {
                      setDraftStationCoords({ lat: stationDraft.lat, lng });
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022] text-xs font-mono-num text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            {/* Fuel Pricing & Pumps (Fuel or Both) */}
            {(stationDraft.stationKind === 'fuel' ||
              stationDraft.stationKind === 'both') && (
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-neutral-50 dark:bg-[#091022] border border-neutral-200 dark:border-blue-950">
                <div>
                  <label className="text-[10px] font-semibold text-neutral-500 block mb-1">
                    Petrol (TZS/L)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={stationDraft.petrolPriceTzs}
                    onChange={(e) =>
                      setStationDraft((prev) => ({
                        ...prev,
                        petrolPriceTzs: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#0E172E] text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-neutral-500 block mb-1">
                    Diesel (TZS/L)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={stationDraft.dieselPriceTzs}
                    onChange={(e) =>
                      setStationDraft((prev) => ({
                        ...prev,
                        dieselPriceTzs: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#0E172E] text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-neutral-500 block mb-1">
                    {lang === 'sw' ? 'Pampu' : 'Pumps'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={stationDraft.pumpsCount}
                    onChange={(e) =>
                      setStationDraft((prev) => ({
                        ...prev,
                        pumpsCount: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#0E172E] text-xs font-mono-num"
                  />
                </div>
              </div>
            )}

            {/* LPG Gas Cylinders Stock (Gas or Both) */}
            {(stationDraft.stationKind === 'gas' ||
              stationDraft.stationKind === 'both') && (
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-amber-50/70 dark:bg-blue-950/30 border border-amber-200/70 dark:border-blue-900">
                <div>
                  <label className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-300 block mb-1">
                    LPG 6kg (cyl)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={stationDraft.lpg6kgStock}
                    onChange={(e) =>
                      setStationDraft((prev) => ({
                        ...prev,
                        lpg6kgStock: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#0E172E] text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-300 block mb-1">
                    LPG 15kg (cyl)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={stationDraft.lpg15kgStock}
                    onChange={(e) =>
                      setStationDraft((prev) => ({
                        ...prev,
                        lpg15kgStock: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#0E172E] text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-300 block mb-1">
                    LPG 38kg (cyl)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={stationDraft.lpg38kgStock}
                    onChange={(e) =>
                      setStationDraft((prev) => ({
                        ...prev,
                        lpg38kgStock: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-blue-900 bg-white dark:bg-[#0E172E] text-xs font-mono-num"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stationDraft.open24Hours}
                  onChange={(e) =>
                    setStationDraft((prev) => ({
                      ...prev,
                      open24Hours: e.target.checked,
                    }))
                  }
                  className="accent-[#0B2A6F]"
                />
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {lang === 'sw' ? 'Wazi Saa 24/7' : 'Open 24/7'}
                </span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stationDraft.hasLubricants}
                  onChange={(e) =>
                    setStationDraft((prev) => ({
                      ...prev,
                      hasLubricants: e.target.checked,
                    }))
                  }
                  className="accent-[#0B2A6F]"
                />
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {lang === 'sw' ? 'Kuna Vilainishi' : 'Has Lubricants'}
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100 dark:border-blue-950">
              <a
                href={buildGoogleMapsPinUrl(stationDraft.lat, stationDraft.lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-[#0B2A6F] dark:text-[#F5B800] hover:underline inline-flex items-center gap-1"
              >
                <span>
                  {lang === 'sw' ? 'Hakiki Google Maps' : 'Preview on Google Maps'}
                </span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddStationModalOpen(false);
                    setDraftStationCoords(null);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 text-xs font-semibold cursor-pointer"
                >
                  {lang === 'sw' ? 'Ghairi' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={savingStation}
                  className="px-4 py-2 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#0B2A6F] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {savingStation ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {savingStation
                      ? lang === 'sw'
                        ? 'Inahifadhi...'
                        : 'Saving...'
                      : lang === 'sw'
                        ? 'Hifadhi Kwenye Ramani'
                        : 'Save to Map'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function StationsMapModule({
  lang,
  stations,
  orders = [],
  googleMapsApiKey,
  canManageStations = false,
  onOrderAtStation,
}: StationsMapModuleProps) {
  const [selectedFallback, setSelectedFallback] = useState<Station | null>(
    stations[0] || null
  );

  if (!googleMapsApiKey) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-bold text-neutral-900 dark:text-white">
          {t(lang, 'navStations')}
        </h1>
        <div className="rounded-2xl bg-[#EAF0F8] dark:bg-[#091022] border border-neutral-200 dark:border-blue-950 p-5 space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stations.map((st) => {
              const active = selectedFallback?.id === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedFallback(st)}
                  className={`p-3.5 rounded-xl text-left border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#0B2A6F] text-white border-[#F5B800]'
                      : 'bg-white dark:bg-[#0E172E] border-neutral-200 dark:border-blue-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#F5B800] shrink-0" />
                    <span className="font-semibold text-xs truncate">
                      {st.name}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-75 mt-1 truncate">
                    {st.address}, {st.city}
                  </p>
                </button>
              );
            })}
          </div>
          {selectedFallback && (
            <div className="flex flex-wrap gap-2">
              {selectedFallback.hasGas !== false && (
                <button
                  type="button"
                  onClick={() => onOrderAtStation(selectedFallback, 'gas')}
                  className="px-4 py-2.5 rounded-xl bg-[#F5B800] text-[#0B2A6F] font-bold text-xs cursor-pointer"
                >
                  {lang === 'sw' ? 'Agiza Gesi Hapa' : 'Order Gas Here'}
                </button>
              )}
              {selectedFallback.hasFuel !== false && (
                <button
                  type="button"
                  onClick={() => onOrderAtStation(selectedFallback, 'fuel')}
                  className="px-4 py-2.5 rounded-xl bg-[#D92027] text-white font-bold text-xs cursor-pointer"
                >
                  {lang === 'sw' ? 'Agiza Mafuta Hapa' : 'Order Fuel Here'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={googleMapsApiKey}
      version="beta"
      language={lang}
      region="TZ"
      libraries={GOOGLE_MAP_LIBRARIES}
      onError={() => {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }}
    >
      <StationsMapWorkspace
        lang={lang}
        stations={stations}
        orders={orders}
        canManageStations={canManageStations}
        onOrderAtStation={onOrderAtStation}
      />
    </APIProvider>
  );
}
