import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map as GoogleMapView,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Droplets,
  ExternalLink,
  Flame,
  Fuel,
  Layers,
  List,
  Loader2,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Search,
  X,
} from 'lucide-react';
import { t } from '../i18n/translations';
import type { Language, Station } from '../types/oilcom';
import { formatTzs } from './OilcomBrand';

interface StationsMapModuleProps {
  lang: Language;
  stations: Station[];
  googleMapsApiKey: string;
  onOrderAtStation: () => void;
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

const DEFAULT_CENTER = { lat: -6.7924, lng: 39.2083 };

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
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const coreLib = useMapsLibrary('core');

  const [searchQuery, setSearchQuery] = useState('');
  const [only24h, setOnly24h] = useState(false);
  const [onlyGas, setOnlyGas] = useState(false);
  const [onlyFuel, setOnlyFuel] = useState(false);
  const [onlyLubricants, setOnlyLubricants] = useState(false);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

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
  const polylinesRef = useRef<MapPolyline[]>([]);

  const clearRoutePolylines = useCallback(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    setActiveRoute(null);
  }, []);

  useEffect(() => {
    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, []);

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

  const focusCoords = useCallback(
    (lat: number, lng: number, zoomLevel = 14) => {
      if (!mapInstance) return;
      mapInstance.panTo({ lat, lng });
      const currentZoom = mapInstance.getZoom() ?? 11;
      if (currentZoom < zoomLevel) {
        mapInstance.setZoom(zoomLevel);
      }
    },
    [mapInstance]
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
      setMobileListOpen(false);
      focusCoords(place.lat, place.lng, 15);
    },
    [focusCoords]
  );

  const fitAllMarkers = useCallback(() => {
    if (!mapInstance || !coreLib) return;
    const bounds = new coreLib.LatLngBounds();
    let count = 0;
    filteredStations.forEach((s) => {
      bounds.extend({ lat: s.lat, lng: s.lng });
      count++;
    });
    discoveredPlaces.forEach((p) => {
      bounds.extend({ lat: p.lat, lng: p.lng });
      count++;
    });
    if (userCoords) {
      bounds.extend(userCoords);
      count++;
    }
    if (count > 0) {
      mapInstance.fitBounds(bounds, 56);
    }
  }, [mapInstance, coreLib, filteredStations, discoveredPlaces, userCoords]);

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

  // Live Google Places Text Search (New)
  const runPlacesTextSearch = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (!q || !placesLib || !mapInstance) return;
      setPlacesLoading(true);
      setPlacesNotice(null);
      try {
        const bounds = mapInstance.getBounds();
        const center = mapInstance.getCenter();
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
          locationBias:
            bounds ?? (center ? { lat: center.lat(), lng: center.lng() } : DEFAULT_CENTER),
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
        if (mapped.length > 0 && coreLib) {
          const fit = new coreLib.LatLngBounds();
          mapped.forEach((p) => fit.extend({ lat: p.lat, lng: p.lng }));
          mapInstance.fitBounds(fit, 64);
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
    [placesLib, mapInstance, coreLib, lang]
  );

  // Live Google Places Nearby Gas Stations Search in current map viewport
  const runNearbyGasStationsSearch = useCallback(async () => {
    if (!placesLib || !mapInstance) return;
    setPlacesLoading(true);
    setPlacesNotice(null);
    try {
      const centerLatLng = mapInstance.getCenter();
      const center = centerLatLng
        ? { lat: centerLatLng.lat(), lng: centerLatLng.lng() }
        : DEFAULT_CENTER;
      const bounds = mapInstance.getBounds();
      let radius = 8000;
      if (bounds) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const km = haversineKm(ne.lat(), ne.lng(), sw.lat(), sw.lng());
        radius = Math.min(Math.max(Math.round((km * 1000) / 2), 1500), 50000);
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
  }, [placesLib, mapInstance, lang]);

  // Modern Routes API: Route.computeRoutes + createPolylines()
  const computeDirections = useCallback(
    async (target: { id: string; name: string; lat: number; lng: number }) => {
      if (!routesLib || !mapInstance) return;
      setRouteLoading(true);
      setPlacesNotice(null);

      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];

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
          viewport?: Parameters<NonNullable<GoogleMapInstance>['fitBounds']>[0];
          distanceMeters?: number;
          durationMillis?: number;
        };

        const newPolylines = primaryRoute.createPolylines();
        newPolylines.forEach((poly) => {
          poly.setOptions({
            strokeColor: '#08291A',
            strokeOpacity: 0.95,
            strokeWeight: 6,
          });
          poly.setMap(mapInstance);
        });
        polylinesRef.current = newPolylines;

        if (primaryRoute.viewport) {
          mapInstance.fitBounds(primaryRoute.viewport, 64);
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
    [routesLib, mapInstance, userCoords, lang]
  );

  const activeTarget = selectedStation
    ? {
        kind: 'station' as const,
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
      {/* Desktop Top Title Row (hidden on mobile/tablet so map fills edge-to-edge) */}
      <div className="hidden lg:flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-neutral-900 dark:text-white truncate">
            {t(lang, 'navStations')}
          </h1>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {lang === 'sw'
              ? 'Ramani ya vituo vya OILCOM, utafutaji wa Google Places na maelekezo ya njia.'
              : 'Interactive OILCOM stations map, live Google Places discovery, and driving directions.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fitAllMarkers}
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-white dark:bg-[#121b16] text-neutral-800 dark:text-neutral-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Compass className="w-3.5 h-3.5 text-[#F5B800]" />
            <span>{lang === 'sw' ? 'Onyesha Zote' : 'Fit All'}</span>
          </button>
          <button
            type="button"
            onClick={requestUserLocation}
            className="px-3 py-2 rounded-xl bg-[#08291A] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
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
        {/* Interactive Full-Viewport Map */}
        <div className="lg:col-span-8 min-w-0 rounded-none lg:rounded-2xl overflow-hidden border-0 lg:border border-neutral-200 dark:border-emerald-950 bg-neutral-100 dark:bg-[#0c1611] h-[calc(100dvh-7rem)] min-h-[440px] lg:h-[calc(100dvh-9.5rem)] relative">
          <GoogleMapView
            mapId="DEMO_MAP_ID"
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={11}
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
                    background={isSelected ? '#F5B800' : '#08291A'}
                    borderColor={isSelected ? '#08291A' : '#F5B800'}
                    glyphColor={isSelected ? '#08291A' : '#F5B800'}
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
                    borderColor="#08291A"
                    glyphColor={isSelected ? '#F5B800' : '#08291A'}
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
                    <p className="text-[11px] font-semibold text-emerald-800 mt-1">
                      {activeTarget.open24Hours ? '24/7' : '06:00 - 22:00'}
                    </p>
                  )}
                </div>
              </InfoWindow>
            )}
          </GoogleMapView>

          {/* Floating Top Search & Filter Overlay */}
          <div className="absolute top-3 inset-x-3 z-10 pointer-events-none flex flex-col gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runPlacesTextSearch(searchQuery);
              }}
              className="pointer-events-auto flex items-center gap-1.5 bg-white/95 dark:bg-[#121b16]/95 backdrop-blur-md border border-neutral-200 dark:border-emerald-900 rounded-xl p-1.5 shadow-lg max-w-xl"
            >
              <Search className="w-4 h-4 text-[#08291A] dark:text-[#F5B800] ml-2 shrink-0" />
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
                className="px-3 py-1.5 rounded-lg bg-[#08291A] disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
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
                    ? 'bg-[#F5B800] text-[#08291A] border-[#F5B800]'
                    : 'bg-white/95 dark:bg-[#121b16]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-emerald-900'
                }`}
              >
                <Flame className={`w-3 h-3 ${onlyGas ? 'text-[#08291A]' : 'text-[#F5B800]'}`} />
                <span>{lang === 'sw' ? 'Gesi (LPG)' : 'OILCOM Gas'}</span>
              </button>

              <button
                type="button"
                onClick={() => setOnlyFuel((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  onlyFuel
                    ? 'bg-[#F5B800] text-[#08291A] border-[#F5B800]'
                    : 'bg-white/95 dark:bg-[#121b16]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-emerald-900'
                }`}
              >
                <Fuel className={`w-3 h-3 ${onlyFuel ? 'text-[#08291A]' : 'text-[#F5B800]'}`} />
                <span>{lang === 'sw' ? 'Mafuta' : 'Fuel'}</span>
              </button>

              <button
                type="button"
                onClick={() => setOnly24h((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  only24h
                    ? 'bg-[#F5B800] text-[#08291A] border-[#F5B800]'
                    : 'bg-white/95 dark:bg-[#121b16]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-emerald-900'
                }`}
              >
                <Clock className={`w-3 h-3 ${only24h ? 'text-[#08291A]' : 'text-[#F5B800]'}`} />
                <span>{lang === 'sw' ? 'Wazi 24/7' : '24/7 Open'}</span>
              </button>

              <button
                type="button"
                onClick={() => setOnlyLubricants((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  onlyLubricants
                    ? 'bg-[#F5B800] text-[#08291A] border-[#F5B800]'
                    : 'bg-white/95 dark:bg-[#121b16]/95 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-emerald-900'
                }`}
              >
                <Droplets className={`w-3 h-3 ${onlyLubricants ? 'text-[#08291A]' : 'text-[#F5B800]'}`} />
                <span>{lang === 'sw' ? 'Vilainishi' : 'Lubricants'}</span>
              </button>

              <button
                type="button"
                onClick={runNearbyGasStationsSearch}
                disabled={placesLoading}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border bg-white/95 dark:bg-[#121b16]/95 text-[#08291A] dark:text-[#F5B800] border-neutral-200 dark:border-emerald-900 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
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
                className="lg:hidden px-3 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm border bg-[#08291A] text-white border-[#08291A] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
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
          </div>

          {/* Floating Right Map Tool Controls */}
          <div className="absolute right-3 top-28 z-10 flex flex-col gap-2">
            <button
              type="button"
              onClick={() =>
                setMapType((prev) => (prev === 'roadmap' ? 'hybrid' : 'roadmap'))
              }
              title={lang === 'sw' ? 'Badili Ramani / Satelaiti' : 'Switch Map / Satellite'}
              className="w-10 h-10 rounded-xl bg-white/95 dark:bg-[#121b16]/95 border border-neutral-200 dark:border-emerald-900 shadow-md flex items-center justify-center text-neutral-800 dark:text-white cursor-pointer"
            >
              <Layers className="w-4 h-4 text-[#08291A] dark:text-[#F5B800]" />
            </button>
            <button
              type="button"
              onClick={fitAllMarkers}
              title={lang === 'sw' ? 'Onyesha Vituo Vyote' : 'Fit All Stations'}
              className="w-10 h-10 rounded-xl bg-white/95 dark:bg-[#121b16]/95 border border-neutral-200 dark:border-emerald-900 shadow-md flex items-center justify-center text-neutral-800 dark:text-white cursor-pointer"
            >
              <Compass className="w-4 h-4 text-[#08291A] dark:text-[#F5B800]" />
            </button>
            <button
              type="button"
              onClick={requestUserLocation}
              title={lang === 'sw' ? 'Eneo Langu (GPS)' : 'My GPS Location'}
              className="w-10 h-10 rounded-xl bg-white/95 dark:bg-[#121b16]/95 border border-neutral-200 dark:border-emerald-900 shadow-md flex items-center justify-center text-neutral-800 dark:text-white cursor-pointer"
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
            <div className="lg:hidden absolute bottom-6 inset-x-3 z-10 rounded-2xl bg-white/95 dark:bg-[#121b16]/95 backdrop-blur-md border border-neutral-200 dark:border-emerald-900 p-3.5 shadow-xl space-y-2.5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#08291A]/10 dark:bg-[#F5B800]/15 flex items-center justify-center shrink-0">
                  <Fuel className="w-5 h-5 text-[#08291A] dark:text-[#F5B800]" />
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
                    <p className="text-[11px] font-semibold text-emerald-700 dark:text-[#F5B800] mt-0.5 font-mono-num">
                      {(activeRoute.distanceMeters / 1000).toFixed(1)} km ·{' '}
                      {Math.max(1, Math.round(activeRoute.durationMillis / 60000))}{' '}
                      {lang === 'sw' ? 'dakika' : 'min'}
                    </p>
                  )}
                </div>
              </div>

              {detailsExpanded && (
                <div className="pt-2 border-t border-neutral-100 dark:border-emerald-950 text-xs space-y-2">
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
                          <Fuel className="w-3.5 h-3.5 text-[#08291A] dark:text-[#F5B800]" />
                          {lang === 'sw' ? 'Mafuta' : 'Fuel'}
                        </span>
                      )}
                      {activeTarget.hasLubricants && (
                        <span className="inline-flex items-center gap-1">
                          <Droplets className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          {lang === 'sw' ? 'Vilainishi' : 'Lubricants'}
                        </span>
                      )}
                    </div>
                  )}
                  {activeTarget.kind === 'station' &&
                    (activeTarget.petrolPriceTzs || activeTarget.dieselPriceTzs) && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-lg bg-neutral-50 dark:bg-emerald-950/40">
                          <span className="text-[10px] text-neutral-500 block">
                            Petrol (Demo)
                          </span>
                          <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                            {formatTzs(activeTarget.petrolPriceTzs || 0)}/L
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-neutral-50 dark:bg-emerald-950/40">
                          <span className="text-[10px] text-neutral-500 block">
                            Diesel (Demo)
                          </span>
                          <span className="font-mono-num font-bold text-neutral-900 dark:text-[#F5B800]">
                            {formatTzs(activeTarget.dieselPriceTzs || 0)}/L
                          </span>
                        </div>
                      </div>
                    )}
                  {activeTarget.kind === 'place' && activeTarget.googleMapsURI && (
                    <a
                      href={activeTarget.googleMapsURI}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#08291A] dark:text-[#F5B800] underline"
                    >
                      <span>
                        {lang === 'sw' ? 'Fungua Google Maps' : 'Open in Google Maps'}
                      </span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => computeDirections(activeTarget)}
                  disabled={routeLoading}
                  className="py-2.5 px-3 rounded-xl bg-[#08291A] text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {routeLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-[#F5B800] animate-spin" />
                  ) : (
                    <RouteIcon className="w-3.5 h-3.5 text-[#F5B800]" />
                  )}
                  <span>{lang === 'sw' ? 'Maelekezo' : 'Directions'}</span>
                </button>
                <button
                  type="button"
                  onClick={
                    activeTarget.kind === 'station'
                      ? onOrderAtStation
                      : () => setDetailsExpanded((v) => !v)
                  }
                  className="py-2.5 px-3 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#08291A] font-bold text-xs cursor-pointer whitespace-nowrap"
                >
                  {activeTarget.kind === 'station'
                    ? lang === 'sw'
                      ? 'Agiza Hapa'
                      : 'Order Here'
                    : lang === 'sw'
                      ? 'Tazama Maelezo'
                      : 'View Details'}
                </button>
              </div>
            </div>
          )}

          {/* Mobile Station Directory Overlay */}
          {mobileListOpen && (
            <div className="lg:hidden absolute inset-x-3 bottom-3 top-28 z-20 rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-900 shadow-2xl flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100 dark:border-emerald-950 flex items-center justify-between">
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
              <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-emerald-950">
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
                        className="px-3.5 py-1.5 rounded-xl bg-[#08291A] text-white font-semibold cursor-pointer"
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
                    className="w-full text-left p-3.5 hover:bg-neutral-50 dark:hover:bg-emerald-950/40 flex items-center justify-between gap-3 cursor-pointer"
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
                      <span className="font-mono-num text-[11px] font-bold text-[#08291A] dark:text-[#F5B800] shrink-0">
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
                    className="w-full text-left p-3.5 hover:bg-neutral-50 dark:hover:bg-emerald-950/40 flex items-center justify-between gap-3 cursor-pointer"
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
            <div className="rounded-2xl bg-[#08291A] text-white p-5 space-y-3.5 shadow-sm">
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
                  <p className="text-xs text-emerald-100/80 mt-0.5">
                    {activeTarget.subtitle}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-emerald-100/90 pt-1">
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
                    <span className="text-emerald-100/80">
                      {lang === 'sw' ? 'Umbali wa Njia:' : 'Route Distance:'}
                    </span>
                    <span className="font-bold text-[#F5B800]">
                      {(activeRoute.distanceMeters / 1000).toFixed(1)} km ·{' '}
                      {Math.max(1, Math.round(activeRoute.durationMillis / 60000))}{' '}
                      min
                    </span>
                  </div>
                  {activeRoute.usingFallbackOrigin && (
                    <p className="text-[10px] text-emerald-200/75">
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

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => computeDirections(activeTarget)}
                  disabled={routeLoading}
                  className="py-2.5 px-3 rounded-xl bg-white/15 hover:bg-white/20 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {routeLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-[#F5B800] animate-spin" />
                  ) : (
                    <RouteIcon className="w-3.5 h-3.5 text-[#F5B800]" />
                  )}
                  <span>{lang === 'sw' ? 'Maelekezo' : 'Directions'}</span>
                </button>
                {activeTarget.kind === 'station' ? (
                  <button
                    type="button"
                    onClick={onOrderAtStation}
                    className="py-2.5 px-3 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#0b120e] font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {lang === 'sw' ? 'Agiza Hapa' : 'Order Here'}
                  </button>
                ) : activeTarget.googleMapsURI ? (
                  <a
                    href={activeTarget.googleMapsURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-3 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#0b120e] font-bold text-xs flex items-center justify-center gap-1 whitespace-nowrap"
                  >
                    <span>Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </div>
            </div>
          )}

          {/* Directory List */}
          <div className="rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 flex-1 flex flex-col overflow-hidden min-h-[240px]">
            <div className="px-4 py-3 border-b border-neutral-100 dark:border-emerald-950 flex items-center justify-between text-xs font-bold text-neutral-900 dark:text-white">
              <span>
                {lang === 'sw' ? 'Vituo vya OILCOM' : 'OILCOM Stations'} (
                {filteredStations.length})
              </span>
              {discoveredPlaces.length > 0 && (
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-[#F5B800]">
                  +{discoveredPlaces.length} Places
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-emerald-950">
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
                      className="px-3.5 py-1.5 rounded-xl bg-[#08291A] text-white font-semibold cursor-pointer"
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
                    className={`w-full text-left p-3.5 hover:bg-neutral-50 dark:hover:bg-emerald-950/40 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#F5B800]/10 dark:bg-emerald-950/50' : ''
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
                      <span className="font-mono-num text-[11px] font-bold text-[#08291A] dark:text-[#F5B800] shrink-0">
                        {haversineKm(
                          userCoords.lat,
                          userCoords.lng,
                          st.lat,
                          st.lng
                        ).toFixed(1)}{' '}
                        km
                      </span>
                    ) : (
                      <Fuel className="w-4 h-4 text-[#08291A] dark:text-[#F5B800] shrink-0" />
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
                    className={`w-full text-left p-3.5 hover:bg-neutral-50 dark:hover:bg-emerald-950/40 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#F5B800]/10 dark:bg-emerald-950/50' : ''
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
        <div className="rounded-2xl bg-[#eef3ef] dark:bg-[#0c1611] border border-neutral-200 dark:border-emerald-950 p-5 space-y-4">
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
                      ? 'bg-[#08291A] text-white border-[#F5B800]'
                      : 'bg-white dark:bg-[#121b16] border-neutral-200 dark:border-emerald-900'
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
            <button
              type="button"
              onClick={onOrderAtStation}
              className="px-4 py-2.5 rounded-xl bg-[#F5B800] text-[#08291A] font-bold text-xs cursor-pointer"
            >
              {lang === 'sw' ? 'Agiza Mafuta / Gesi Hapa' : 'Order Fuel / Gas Here'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={googleMapsApiKey} language={lang} region="TZ">
      <StationsMapWorkspace
        lang={lang}
        stations={stations}
        onOrderAtStation={onOrderAtStation}
      />
    </APIProvider>
  );
}
