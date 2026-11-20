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
} from '@vis.gl/react-google-maps';
import {
  Polygon3D,
  Polyline3D,
  type Map3DCameraChangedEvent,
  type Map3DRef,
} from '@vis.gl/react-google-maps/3d';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Droplets,
  ExternalLink,
  Flame,
  Fuel,
  Globe,
  Layers,
  List,
  Loader2,
  MapPin,
  Navigation,
  RotateCw,
  Route as RouteIcon,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  extract3DOverlaysFromGeoJson,
  extractGeoJsonPoints,
  normalizeGeoJsonInput,
  OILCOM_GIS_FEATURE_COLLECTION,
  type GeoJsonFeature,
  type GeoJsonFeatureCollection,
} from '../data/oilcomGeoJson';
import { t } from '../i18n/translations';
import type { Language, Station } from '../types/oilcom';
import { formatTzs } from './OilcomBrand';

interface StationsMapModuleProps {
  lang: Language;
  stations: Station[];
  googleMapsApiKey: string;
  onOrderAtStation: (station: Station, orderKind?: 'gas' | 'fuel') => void;
}

interface DiscoveredPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
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
  businessStatus?: string | null;
  googleMapsURI?: string | null;
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
  }, [map, onMapReady]);
  return null;
}

function StationsMapWorkspace({
  lang,
  stations,
  onOrderAtStation,
}: Omit<StationsMapModuleProps, 'googleMapsApiKey'>) {
  const [mapInstance, setMapInstance] = useState<GoogleMapInstance>(null);
  const map3dRef = useRef<Map3DRef | null>(null);
  const geojsonInputRef = useRef<HTMLInputElement | null>(null);

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
      lat: stations[0]?.lat ?? DEFAULT_CENTER.lat,
      lng: stations[0]?.lng ?? DEFAULT_CENTER.lng,
      altitude: 80,
    },
    range: 2800,
    heading: 18,
    tilt: 64,
    roll: 0,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [only24h, setOnly24h] = useState(false);
  const [onlyGas, setOnlyGas] = useState(false);
  const [onlyFuel, setOnlyFuel] = useState(false);
  const [onlyLubricants, setOnlyLubricants] = useState(false);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // Open Geospatial (OGC GeoJSON GIS) layer state
  const [showGisLayer, setShowGisLayer] = useState(true);
  const [customGeoJson, setCustomGeoJson] =
    useState<GeoJsonFeatureCollection | null>(null);
  const [customGeoJsonName, setCustomGeoJsonName] = useState<string | null>(null);
  const [selectedGisFeature, setSelectedGisFeature] =
    useState<SelectedGisSummary | null>(null);

  const [selectedStation, setSelectedStation] = useState<Station | null>(
    stations[0] || null
  );
  const [selectedPlace, setSelectedPlace] = useState<DiscoveredPlace | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const [discoveredPlaces, setDiscoveredPlaces] = useState<DiscoveredPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesNotice, setPlacesNotice] = useState<string | null>(null);

  const [routeLoading, setRouteLoading] = useState(false);
  const [activeRoute, setActiveRoute] = useState<ActiveRouteInfo | null>(null);
  const [routePath3D, setRoutePath3D] = useState<
    { lat: number; lng: number; altitude: number }[]
  >([]);
  const polylinesRef = useRef<MapPolyline[]>([]);

  const isNative3DActive = viewMode === '3d' && supportsWebGL2;

  const combinedGeoJson = useMemo<GeoJsonFeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...OILCOM_GIS_FEATURE_COLLECTION.features,
        ...(customGeoJson?.features ?? []),
      ],
    }),
    [customGeoJson]
  );

  const overlays3D = useMemo(
    () => extract3DOverlaysFromGeoJson(combinedGeoJson),
    [combinedGeoJson]
  );

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
            : customGeoJsonName
              ? `GeoJSON · ${customGeoJsonName}`
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
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    setRoutePath3D([]);
    setActiveRoute(null);
  }, []);

  useEffect(() => {
    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, []);

  // Sync OGC GeoJSON layer onto the 2D Google Map Data Layer (map.data)
  useEffect(() => {
    if (!mapInstance || isNative3DActive) return;

    const dataLayer = mapInstance.data as unknown as DataLayerHandle;
    dataLayer.forEach((feature: DataLayerFeature) => {
      dataLayer.remove(feature);
    });

    if (!showGisLayer) {
      return;
    }

    dataLayer.addGeoJson(combinedGeoJson as unknown as object);

    dataLayer.setStyle((feature: DataLayerFeature) => {
      const strokeColor =
        (feature.getProperty('strokeColor') as string) || '#2563EB';
      const fillColor =
        (feature.getProperty('fillColor') as string) || strokeColor;
      const kind = (feature.getProperty('kind') as string) || 'zone';
      return {
        fillColor,
        fillOpacity: kind === 'custom' ? 0.24 : 0.18,
        strokeColor,
        strokeWeight: kind === 'corridor' ? 4 : 2,
        strokeOpacity: 0.9,
      };
    });

    const overListener = dataLayer.addListener(
      'mouseover',
      (ev: DataLayerMouseEvent) => {
        dataLayer.revertStyle();
        dataLayer.overrideStyle(ev.feature, {
          strokeWeight: 4,
          fillOpacity: 0.34,
        });
      }
    );

    const outListener = dataLayer.addListener('mouseout', () => {
      dataLayer.revertStyle();
    });

    const clickListener = dataLayer.addListener(
      'click',
      (ev: DataLayerMouseEvent) => {
        const props: Record<string, unknown> = {};
        ev.feature.forEachProperty((value: unknown, key: string) => {
          props[key] = value;
        });
        setSelectedGisFeature(summarizeGisFeature(props));
      }
    );

    return () => {
      overListener.remove();
      outListener.remove();
      clickListener.remove();
      dataLayer.forEach((feature: DataLayerFeature) => {
        dataLayer.remove(feature);
      });
    };
  }, [mapInstance, isNative3DActive, showGisLayer, combinedGeoJson, summarizeGisFeature]);

  const hasActiveFilter = only24h || onlyGas || onlyFuel || onlyLubricants;

  const filteredStations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = stations.filter((s) => {
      if (only24h && !s.open24Hours) return false;
      if (onlyGas && s.hasGas === false) return false;
      if (onlyFuel && s.hasFuel === false) return false;
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
  }, [stations, searchQuery, only24h, onlyGas, onlyFuel, onlyLubricants, userCoords]);

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
      const targetCamera = {
        center: { lat, lng, altitude: 80 },
        range,
        heading: map3dCamera.heading,
        tilt,
        roll: 0,
      };
      setMap3dCamera(targetCamera);
      map3dRef.current?.flyCameraTo({
        endCamera: targetCamera,
        durationMillis: 1100,
      });
    },
    [map3dCamera.heading]
  );

  const focusCoords = useCallback(
    (lat: number, lng: number, zoomLevel = 14) => {
      if (isNative3DActive) {
        const range = zoomLevel >= 15 ? 950 : zoomLevel >= 13 ? 1700 : 3200;
        fly3DCameraTo(lat, lng, range, 64);
        return;
      }
      if (!mapInstance) return;
      mapInstance.panTo({ lat, lng });
      const currentZoom = mapInstance.getZoom() ?? 11;
      if (currentZoom < zoomLevel) {
        mapInstance.setZoom(zoomLevel);
      }
    },
    [isNative3DActive, fly3DCameraTo, mapInstance]
  );

  const toggle3DMode = useCallback(() => {
    setViewMode((prev) => {
      const next = prev === '2d' ? '3d' : '2d';
      if (next === '3d') {
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
    map3dRef.current.flyCameraAround({
      camera: map3dCamera,
      durationMillis: 6000,
      rounds: 0.35,
    });
  }, [map3dCamera]);

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
      setMobileListOpen(false);
      focusCoords(place.lat, place.lng, 15);
    },
    [focusCoords]
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
      const bounds = new coreLib.LatLngBounds();
      pts.forEach((p) => bounds.extend(p));
      mapInstance.fitBounds(bounds, 56);
    },
    [isNative3DActive, fly3DCameraTo, mapInstance, coreLib]
  );

  const fitAllMarkers = useCallback(() => {
    const pts: { lat: number; lng: number }[] = [
      ...filteredStations.map((s) => ({ lat: s.lat, lng: s.lng })),
      ...discoveredPlaces.map((p) => ({ lat: p.lat, lng: p.lng })),
    ];
    if (userCoords) pts.push(userCoords);
    fitPointsOnMap(pts);
  }, [filteredStations, discoveredPlaces, userCoords, fitPointsOnMap]);

  const handleGeoJsonUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const normalized = normalizeGeoJsonInput(parsed);
        if (!normalized) {
          setPlacesNotice(
            lang === 'sw'
              ? 'Faili si GeoJSON sahihi (inapaswa kuwa FeatureCollection, Feature, au Geometry).'
              : 'Invalid GeoJSON file (expected FeatureCollection, Feature, or Geometry).'
          );
          return;
        }
        setCustomGeoJson(normalized);
        setCustomGeoJsonName(file.name);
        setShowGisLayer(true);
        const pts = extractGeoJsonPoints(normalized);
        if (pts.length > 0) {
          fitPointsOnMap(pts);
        }
        setPlacesNotice(
          lang === 'sw'
            ? `Safu ya GIS imepakiwa (${normalized.features.length} vipengele kutoka ${file.name}).`
            : `Loaded GeoJSON layer (${normalized.features.length} features from ${file.name}).`
        );
      } catch {
        setPlacesNotice(
          lang === 'sw'
            ? 'Imeshindwa kusoma faili la GeoJSON. Hakikisha ni JSON sahihi.'
            : 'Could not parse GeoJSON file. Please verify valid JSON syntax.'
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

  // Live Google Places Text Search (New) — works in both 2D and 3D
  const runPlacesTextSearch = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (!q || !placesLib) return;
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
            'businessStatus',
            'googleMapsURI',
          ],
          locationBias: bias,
          maxResultCount: 8,
          language: lang,
          region: 'tz',
        };
        const res = (await placesLib.Place.searchByText(request)) as {
          places?: RawPlaceResult[];
        };
        const places = res?.places ?? [];
        const mapped: DiscoveredPlace[] = places
          .filter((p) => p.location != null)
          .map((p) => ({
            id: p.id,
            name: p.displayName || 'Station',
            address: p.formattedAddress || '',
            lat: p.location!.lat(),
            lng: p.location!.lng(),
            businessStatus: p.businessStatus || undefined,
            googleMapsURI: p.googleMapsURI || undefined,
          }));

        setDiscoveredPlaces(mapped);
        if (mapped.length > 0) {
          fitPointsOnMap(mapped.map((p) => ({ lat: p.lat, lng: p.lng })));
          setSelectedStation(null);
          setSelectedPlace(mapped[0]);
          setInfoOpen(true);
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
    [placesLib, isNative3DActive, mapInstance, map3dCamera.center, lang, fitPointsOnMap]
  );

  // Live Google Places Nearby Gas Stations Search — works in both 2D and 3D
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

      const res = (await placesLib.Place.searchNearby({
        fields: [
          'id',
          'displayName',
          'location',
          'formattedAddress',
          'businessStatus',
          'googleMapsURI',
        ],
        locationRestriction: {
          center,
          radius,
        },
        includedPrimaryTypes: ['gas_station'],
        maxResultCount: 10,
        rankPreference: placesLib.SearchNearbyRankPreference.DISTANCE,
        language: lang,
        region: 'tz',
      })) as { places?: RawPlaceResult[] };

      const places = res?.places ?? [];
      const mapped: DiscoveredPlace[] = places
        .filter((p) => p.location != null)
        .map((p) => ({
          id: p.id,
          name: p.displayName || 'Gas Station',
          address: p.formattedAddress || '',
          lat: p.location!.lat(),
          lng: p.location!.lng(),
          businessStatus: p.businessStatus || undefined,
          googleMapsURI: p.googleMapsURI || undefined,
        }));

      setDiscoveredPlaces(mapped);
      if (mapped.length > 0) {
        setSelectedStation(null);
        setSelectedPlace(mapped[0]);
        setInfoOpen(true);
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

  const activeTarget = selectedStation
    ? {
        kind: 'station' as const,
        stationObj: selectedStation,
        id: selectedStation.id,
        name: selectedStation.name,
        subtitle: `${selectedStation.address}, ${selectedStation.city}`,
        lat: selectedStation.lat,
        lng: selectedStation.lng,
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
      }
    : selectedPlace
      ? {
          kind: 'place' as const,
          id: selectedPlace.id,
          name: selectedPlace.name,
          subtitle: selectedPlace.address,
          lat: selectedPlace.lat,
          lng: selectedPlace.lng,
          googleMapsURI: selectedPlace.googleMapsURI,
          businessStatus: selectedPlace.businessStatus,
        }
      : null;

  const activeDistanceKm =
    activeTarget && userCoords
      ? haversineKm(
          userCoords.lat,
          userCoords.lng,
          activeTarget.lat,
          activeTarget.lng
        )
      : null;

  return (
    <div className="space-y-0 lg:space-y-3">
      {/* Hidden GeoJSON file upload input */}
      <input
        ref={geojsonInputRef}
        type="file"
        accept=".geojson,.json,application/geo+json,application/json"
        onChange={handleGeoJsonUpload}
        className="hidden"
      />

      {/* Desktop Top Title Row (hidden on mobile/tablet so map fills edge-to-edge) */}
      <div className="hidden lg:flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-neutral-900 dark:text-white truncate">
            {t(lang, 'navStations')}
          </h1>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {lang === 'sw'
              ? 'Ramani ya 2D & 3D, safu za OGC GeoJSON GIS, utafutaji wa Places na maelekezo.'
              : 'Interactive 2D & 3D Maps, OGC GeoJSON GIS layers, Google Places discovery, and routing.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggle3DMode}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              viewMode === '3d'
                ? 'bg-[#F5B800] text-[#0B2A6F] border-[#F5B800]'
                : 'border-neutral-200 dark:border-blue-950 bg-white dark:bg-[#0E172E] text-neutral-800 dark:text-neutral-200'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>{viewMode === '3d' ? '2D Map' : '3D Maps'}</span>
          </button>
          <button
            type="button"
            onClick={fitAllMarkers}
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-blue-950 bg-white dark:bg-[#0E172E] text-neutral-800 dark:text-neutral-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Compass className="w-3.5 h-3.5 text-[#F5B800]" />
            <span>{lang === 'sw' ? 'Onyesha Zote' : 'Fit All'}</span>
          </button>
          <button
            type="button"
            onClick={requestUserLocation}
            className="px-3 py-2 rounded-xl bg-[#0B2A6F] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {locLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-[#F5B800] animate-spin" />
            ) : (
              <Navigation className="w-3.5 h-3.5 text-[#F5B800]" />
            )}
            <span>
              {locLoading
                ? t(lang, 'loading')
                : lang === 'sw'
                  ? 'Eneo Langu'
                  : 'My GPS'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Responsive Maps Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-4">
        {/* Interactive Full-Viewport Map (2D or Photorealistic 3D) */}
        <div className="lg:col-span-8 min-w-0 rounded-none lg:rounded-2xl overflow-hidden border-0 lg:border border-neutral-200 dark:border-blue-950 bg-neutral-100 dark:bg-[#091022] h-[calc(100dvh-7rem)] min-h-[440px] lg:h-[calc(100dvh-9.5rem)] relative">
          {isNative3DActive ? (
            <Map3D
              id="oilcom-map-3d"
              ref={map3dRef}
              mode={mapType === 'hybrid' ? MapMode.SATELLITE : MapMode.HYBRID}
              defaultLabelsDisabled={false}
              gestureHandling={GestureHandling.GREEDY}
              defaultCenter={map3dCamera.center}
              defaultRange={map3dCamera.range}
              defaultHeading={map3dCamera.heading}
              defaultTilt={map3dCamera.tilt}
              defaultRoll={map3dCamera.roll}
              onCameraChanged={(ev: Map3DCameraChangedEvent) => {
                setMap3dCamera(ev.detail);
              }}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              {/* 3D GIS GeoJSON Polygons (Delivery Coverage Zones) */}
              {showGisLayer &&
                overlays3D.polygons.map((poly) => (
                  <Polygon3D
                    key={poly.key}
                    outerCoordinates={poly.outerCoordinates}
                    innerCoordinates={poly.innerCoordinates}
                    altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                    extruded
                    fillColor={poly.fillColor}
                    strokeColor={poly.strokeColor}
                    strokeWidth={3}
                    onClick={() => handleSelect3DGisFeature(poly.feature)}
                  />
                ))}

              {/* 3D GIS GeoJSON Corridors & LineStrings */}
              {showGisLayer &&
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
              {showGisLayer &&
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
                  strokeWidth={8}
                  outerWidth={2}
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

              {/* OILCOM Catalog Stations in 3D */}
              {filteredStations.map((station) => {
                const isSelected = selectedStation?.id === station.id;
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
                      background={isSelected ? '#F5B800' : '#0B2A6F'}
                      borderColor={isSelected ? '#0B2A6F' : '#F5B800'}
                      glyphColor={isSelected ? '#0B2A6F' : '#F5B800'}
                      scale={isSelected ? 1.2 : 1}
                    />
                  </Marker3D>
                );
              })}

              {/* Discovered Places in 3D */}
              {discoveredPlaces.map((place) => {
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
                      borderColor="#0B2A6F"
                      glyphColor={isSelected ? '#F5B800' : '#0B2A6F'}
                      scale={isSelected ? 1.15 : 0.95}
                    />
                  </Marker3D>
                );
              })}

              {/* 3D Popover */}
              {infoOpen && activeTarget && (
                <Popover
                  position={{
                    lat: activeTarget.lat,
                    lng: activeTarget.lng,
                    altitude: 75,
                  }}
                  altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                  open={infoOpen}
                  onClose={() => setInfoOpen(false)}
                >
                  <div className="p-2 text-neutral-900 max-w-[220px] bg-white rounded-lg">
                    <p className="font-bold text-xs leading-snug">
                      {activeTarget.name}
                    </p>
                    <p className="text-[11px] text-neutral-600 mt-0.5 line-clamp-2">
                      {activeTarget.subtitle}
                    </p>
                    {activeTarget.kind === 'station' && (
                      <p className="text-[11px] font-semibold text-blue-800 mt-1">
                        {activeTarget.open24Hours ? '24/7' : '06:00 - 22:00'}
                      </p>
                    )}
                  </div>
                </Popover>
              )}
            </Map3D>
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
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <MapInstanceBridge onMapReady={setMapInstance} />

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
                return (
                  <AdvancedMarker
                    key={station.id}
                    position={{ lat: station.lat, lng: station.lng }}
                    onClick={() => handleSelectStation(station)}
                    title={station.name}
                    zIndex={isSelected ? 25 : 15}
                  >
                    <Pin
                      background={isSelected ? '#F5B800' : '#0B2A6F'}
                      borderColor={isSelected ? '#0B2A6F' : '#F5B800'}
                      glyphColor={isSelected ? '#0B2A6F' : '#F5B800'}
                      scale={isSelected ? 1.2 : 1}
                    />
                  </AdvancedMarker>
                );
              })}

              {/* Live Google Places Search Results */}
              {discoveredPlaces.map((place) => {
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
                      borderColor="#0B2A6F"
                      glyphColor={isSelected ? '#F5B800' : '#0B2A6F'}
                      scale={isSelected ? 1.15 : 0.95}
                    />
                  </AdvancedMarker>
                );
              })}

              {/* Anchored Coordinates InfoWindow */}
              {infoOpen && activeTarget && (
                <InfoWindow
                  position={{ lat: activeTarget.lat, lng: activeTarget.lng }}
                  pixelOffset={[0, -34]}
                  onCloseClick={() => setInfoOpen(false)}
                >
                  <div className="p-1 text-neutral-900 max-w-[220px]">
                    <p className="font-bold text-xs leading-snug">
                      {activeTarget.name}
                    </p>
                    <p className="text-[11px] text-neutral-600 mt-0.5 line-clamp-2">
                      {activeTarget.subtitle}
                    </p>
                    {activeTarget.kind === 'station' && (
                      <p className="text-[11px] font-semibold text-blue-800 mt-1">
                        {activeTarget.open24Hours ? '24/7' : '06:00 - 22:00'}
                      </p>
                    )}
                  </div>
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
              <button
                type="button"
                onClick={() => setOnlyGas((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  onlyGas
                    ? 'bg-[#F5B800] text-[#0B2A6F] border-[#F5B800]'
                    : 'bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900'
                }`}
              >
                <Flame
                  className={`w-3 h-3 ${
                    onlyGas ? 'text-[#0B2A6F]' : 'text-[#F5B800]'
                  }`}
                />
                <span>{lang === 'sw' ? 'Gesi (LPG)' : 'OILCOM Gas'}</span>
              </button>

              <button
                type="button"
                onClick={() => setOnlyFuel((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  onlyFuel
                    ? 'bg-[#F5B800] text-[#0B2A6F] border-[#F5B800]'
                    : 'bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900'
                }`}
              >
                <Fuel
                  className={`w-3 h-3 ${
                    onlyFuel ? 'text-[#0B2A6F]' : 'text-[#F5B800]'
                  }`}
                />
                <span>{lang === 'sw' ? 'Mafuta' : 'Fuel'}</span>
              </button>

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
                  setShowGisLayer((v) => {
                    if (v) setSelectedGisFeature(null);
                    return !v;
                  });
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

              {/* Upload Custom GeoJSON Layer */}
              <button
                type="button"
                onClick={() => geojsonInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border bg-white/95 dark:bg-[#0E172E]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-blue-900 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Upload className="w-3 h-3 text-sky-500" />
                <span>{lang === 'sw' ? 'Pakia GeoJSON' : 'Load GeoJSON'}</span>
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
                  <span>{lang === 'sw' ? 'Ondoa GeoJSON' : 'Clear GeoJSON'}</span>
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
                onClick={() => setMobileListOpen((v) => !v)}
                className="lg:hidden px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border bg-[#0B2A6F] text-white border-[#0B2A6F] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <List className="w-3 h-3 text-[#F5B800]" />
                <span>
                  {lang === 'sw' ? 'Orodha' : 'List'} (
                  {filteredStations.length + discoveredPlaces.length})
                </span>
              </button>

              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setOnly24h(false);
                    setOnlyGas(false);
                    setOnlyFuel(false);
                    setOnlyLubricants(false);
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
            {selectedGisFeature && showGisLayer && (
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
          </div>

          {/* Mobile Floating Bottom Station Sheet (sits cleanly above Google attribution) */}
          {activeTarget && !mobileListOpen && (
            <div className="lg:hidden absolute bottom-6 inset-x-3 z-10 rounded-2xl bg-white/95 dark:bg-[#0E172E]/95 backdrop-blur-md border border-neutral-200 dark:border-blue-900 p-3.5 shadow-xl space-y-2.5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0B2A6F]/10 dark:bg-[#F5B800]/15 flex items-center justify-center shrink-0">
                  <Fuel className="w-5 h-5 text-[#0B2A6F] dark:text-[#F5B800]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display font-bold text-sm text-neutral-900 dark:text-white truncate">
                      {activeTarget.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setDetailsExpanded((v) => !v)}
                      aria-label="Toggle details"
                      className="p-0.5 text-neutral-500 cursor-pointer shrink-0"
                    >
                      {detailsExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-300 truncate mt-0.5">
                    {activeDistanceKm !== null
                      ? `${activeDistanceKm.toFixed(1)} km · `
                      : ''}
                    {activeTarget.kind === 'station'
                      ? activeTarget.open24Hours
                        ? lang === 'sw'
                          ? 'Fungua 24/7'
                          : 'Open 24/7'
                        : '06:00 - 22:00'
                      : activeTarget.subtitle}
                  </p>
                  {activeRoute && activeRoute.targetId === activeTarget.id && (
                    <p className="text-[11px] font-semibold text-blue-700 dark:text-[#F5B800] mt-0.5 font-mono-num">
                      {(activeRoute.distanceMeters / 1000).toFixed(1)} km ·{' '}
                      {Math.max(1, Math.round(activeRoute.durationMillis / 60000))}{' '}
                      {lang === 'sw' ? 'dakika' : 'min'}
                    </p>
                  )}
                </div>
              </div>

              {detailsExpanded && (
                <div className="pt-2 border-t border-neutral-100 dark:border-blue-950 text-xs space-y-2">
                  <p className="text-neutral-600 dark:text-neutral-300">
                    {activeTarget.subtitle}
                  </p>
                  {activeTarget.kind === 'station' && (
                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
                      {activeTarget.hasGas && (
                        <span className="inline-flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5 text-[#F5B800]" />
                          {lang === 'sw' ? 'Gesi LPG' : 'LPG Gas'}
                        </span>
                      )}
                      {activeTarget.hasFuel && (
                        <span className="inline-flex items-center gap-1">
                          <Fuel className="w-3.5 h-3.5 text-[#0B2A6F] dark:text-[#F5B800]" />
                          {lang === 'sw' ? 'Mafuta' : 'Fuel'}
                        </span>
                      )}
                      {activeTarget.hasLubricants && (
                        <span className="inline-flex items-center gap-1">
                          <Droplets className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          {lang === 'sw' ? 'Vilainishi' : 'Lubricants'}
                        </span>
                      )}
                    </div>
                  )}
                  {activeTarget.kind === 'station' &&
                    (activeTarget.petrolPriceTzs || activeTarget.dieselPriceTzs) && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-lg bg-neutral-50 dark:bg-blue-950/40">
                          <span className="text-[10px] text-neutral-500 block">
                            Petrol (Demo)
                          </span>
                          <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                            {formatTzs(activeTarget.petrolPriceTzs || 0)}/L
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-neutral-50 dark:bg-blue-950/40">
                          <span className="text-[10px] text-neutral-500 block">
                            Diesel (Demo)
                          </span>
                          <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                            {formatTzs(activeTarget.dieselPriceTzs || 0)}/L
                          </span>
                        </div>
                      </div>
                    )}
                  {activeTarget.kind === 'station' &&
                    (activeTarget.lpg6kgStock !== undefined ||
                      activeTarget.lpg15kgStock !== undefined ||
                      activeTarget.lpg38kgStock !== undefined) && (
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        <div className="p-1.5 rounded-lg bg-amber-50/70 dark:bg-blue-950/40">
                          <span className="text-[10px] text-neutral-500 block">LPG 6kg</span>
                          <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                            {activeTarget.lpg6kgStock ?? 0}
                          </span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-amber-50/70 dark:bg-blue-950/40">
                          <span className="text-[10px] text-neutral-500 block">LPG 15kg</span>
                          <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                            {activeTarget.lpg15kgStock ?? 0}
                          </span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-amber-50/70 dark:bg-blue-950/40">
                          <span className="text-[10px] text-neutral-500 block">LPG 38kg</span>
                          <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                            {activeTarget.lpg38kgStock ?? 0}
                          </span>
                        </div>
                      </div>
                    )}
                  {activeTarget.kind === 'place' && activeTarget.googleMapsURI && (
                    <a
                      href={activeTarget.googleMapsURI}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B2A6F] dark:text-[#F5B800] underline"
                    >
                      <span>
                        {lang === 'sw' ? 'Fungua Google Maps' : 'Open in Google Maps'}
                      </span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => computeDirections(activeTarget)}
                  disabled={routeLoading}
                  className="flex-1 min-w-[110px] py-2.5 px-3 rounded-xl bg-[#0B2A6F] text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
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
                        className="flex-1 min-w-[100px] py-2.5 px-3 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#0B2A6F] font-bold text-xs cursor-pointer whitespace-nowrap"
                      >
                        {lang === 'sw' ? 'Agiza Gesi' : 'Order Gas'}
                      </button>
                    )}
                    {activeTarget.hasFuel && (
                      <button
                        type="button"
                        onClick={() => onOrderAtStation(activeTarget.stationObj, 'fuel')}
                        className="flex-1 min-w-[100px] py-2.5 px-3 rounded-xl bg-[#D92027] hover:bg-[#b81b21] text-white font-bold text-xs cursor-pointer whitespace-nowrap"
                      >
                        {lang === 'sw' ? 'Agiza Mafuta' : 'Order Fuel'}
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDetailsExpanded((v) => !v)}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#0B2A6F] font-bold text-xs cursor-pointer whitespace-nowrap"
                  >
                    {lang === 'sw' ? 'Tazama Maelezo' : 'View Details'}
                  </button>
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
                {filteredStations.length === 0 && discoveredPlaces.length === 0 && (
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
                          setOnlyGas(false);
                          setOnlyFuel(false);
                          setOnlyLubricants(false);
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
                {discoveredPlaces.map((pl) => (
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
        </div>

        {/* Desktop Side Panel: Active Details + Directory */}
        <div className="hidden lg:flex lg:col-span-4 flex-col gap-4 min-w-0 lg:h-[calc(100dvh-9.5rem)]">
          {activeTarget && (
            <div className="rounded-2xl bg-[#0B2A6F] text-white p-5 space-y-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono-num text-[11px] text-[#F5B800]">
                    {activeTarget.kind === 'station'
                      ? activeTarget.code
                      : 'GOOGLE PLACES'}
                  </p>
                  <h3 className="font-display font-bold text-base mt-0.5">
                    {activeTarget.name}
                  </h3>
                  <p className="text-xs text-blue-100/80 mt-0.5">
                    {activeTarget.subtitle}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-blue-100/90 pt-1">
                {activeTarget.kind === 'station' && (
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
                )}
                {activeDistanceKm !== null && (
                  <span className="font-mono-num font-semibold text-[#F5B800]">
                    {activeDistanceKm.toFixed(1)} km
                  </span>
                )}
              </div>

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
                  </>
                ) : activeTarget.googleMapsURI ? (
                  <a
                    href={activeTarget.googleMapsURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#071A4A] font-bold text-xs flex items-center justify-center gap-1 whitespace-nowrap"
                  >
                    <span>Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </div>
            </div>
          )}

          {/* Directory List */}
          <div className="rounded-2xl bg-white dark:bg-[#0E172E] border border-neutral-200 dark:border-blue-950 flex-1 flex flex-col overflow-hidden min-h-[240px]">
            <div className="px-4 py-3 border-b border-neutral-100 dark:border-blue-950 flex items-center justify-between text-xs font-bold text-neutral-900 dark:text-white">
              <span>
                {lang === 'sw' ? 'Vituo vya OILCOM' : 'OILCOM Stations'} (
                {filteredStations.length})
              </span>
              {discoveredPlaces.length > 0 && (
                <span className="text-[11px] font-semibold text-blue-700 dark:text-[#F5B800]">
                  +{discoveredPlaces.length} Places
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-blue-950">
              {filteredStations.length === 0 && discoveredPlaces.length === 0 && (
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
                        setOnlyGas(false);
                        setOnlyFuel(false);
                        setOnlyLubricants(false);
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

              {discoveredPlaces.map((pl) => {
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
      </div>
    </div>
  );
}

export function StationsMapModule({
  lang,
  stations,
  googleMapsApiKey,
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
      libraries={['maps3d', 'marker']}
    >
      <StationsMapWorkspace
        lang={lang}
        stations={stations}
        onOrderAtStation={onOrderAtStation}
      />
    </APIProvider>
  );
}
