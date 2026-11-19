import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  AltitudeMode,
  APIProvider,
  GestureHandling,
  Map as GoogleMapView,
  Map3D,
  MapMode,
  Marker3D,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Polyline3D,
  type Map3DCameraChangedEvent,
} from '@vis.gl/react-google-maps/3d';
import {
  Clock,
  Loader2,
  MapPin,
  Pause,
  Play,
  Store,
  Truck,
} from 'lucide-react';
import type {
  DeliveryRecord,
  GasOrder,
  Language,
  Station,
} from '../types/oilcom';

interface OrderTrackingMapProps {
  lang: Language;
  order: GasOrder;
  delivery?: DeliveryRecord;
  stations: Station[];
  googleMapsApiKey: string;
}

type GoogleMapInstance = ReturnType<typeof useMap>;

interface MapPolyline {
  setMap: (map: GoogleMapInstance) => void;
  setOptions: (options: Record<string, unknown>) => void;
}

function detectWebGL2Support(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function interpolateCoords(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  steps = 24
): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    pts.push({
      lat: a.lat + (b.lat - a.lat) * f,
      lng: a.lng + (b.lng - a.lng) * f,
    });
  }
  return pts;
}

function TrackingBridge({
  onMap,
}: {
  onMap: (map: GoogleMapInstance) => void;
}) {
  const map = useMap();
  useEffect(() => {
    onMap(map);
  }, [map, onMap]);
  return null;
}

function TrackingWorkspace({
  lang,
  order,
  delivery,
  stations,
}: Omit<OrderTrackingMapProps, 'googleMapsApiKey'>) {
  const [mapInstance, setMapInstance] = useState<GoogleMapInstance>(null);
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const coreLib = useMapsLibrary('core');

  const station =
    stations.find((s) => s.id === order.stationId) ||
    stations[0] || {
      id: 'default',
      name: 'OILCOM Hub Dar es Salaam',
      lat: -6.7924,
      lng: 39.2083,
    };

  const origin = { lat: station.lat, lng: station.lng };
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number }>(
    order.fulfillmentType === 'pickup'
      ? origin
      : { lat: origin.lat + 0.019, lng: origin.lng + 0.014 }
  );
  const [routePathCoords, setRoutePathCoords] = useState<
    { lat: number; lng: number }[]
  >([]);
  const [routeMeta, setRouteMeta] = useState<{
    distanceKm: string;
    etaMin: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [approxDest, setApproxDest] = useState(false);

  const [supportsWebGL2] = useState<boolean>(() => detectWebGL2Support());
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [map3dCamera, setMap3dCamera] = useState({
    center: { lat: origin.lat, lng: origin.lng, altitude: 60 },
    range: 2400,
    heading: 18,
    tilt: 62,
    roll: 0,
  });

  const isEnRoute =
    order.status === 'dispatched' || delivery?.status === 'en_route';
  const isArrived =
    order.status === 'delivered' || delivery?.status === 'arrived';
  const showDriver =
    order.fulfillmentType !== 'pickup' && (isEnRoute || isArrived);

  const [animProgress, setAnimProgress] = useState(0.35);
  const [animPaused, setAnimPaused] = useState(false);

  const polylinesRef = useRef<MapPolyline[]>([]);

  useEffect(() => {
    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, []);

  // Animate driver smoothly along computed route while en_route/dispatched
  useEffect(() => {
    if (!isEnRoute || animPaused || order.fulfillmentType === 'pickup') return;
    const timer = window.setInterval(() => {
      setAnimProgress((prev) => {
        const next = prev + 0.035;
        return next > 0.92 ? 0.25 : next;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [isEnRoute, animPaused, order.fulfillmentType]);

  const driverCoords = useMemo(() => {
    if (!showDriver) return null;
    if (isArrived) return destCoords;
    const pts =
      routePathCoords.length >= 2
        ? routePathCoords
        : interpolateCoords(origin, destCoords, 20);
    const idx = Math.min(
      pts.length - 1,
      Math.max(0, Math.floor(pts.length * animProgress))
    );
    return pts[idx];
  }, [showDriver, isArrived, destCoords, routePathCoords, origin, animProgress]);

  const routePath3D = useMemo(
    () =>
      routePathCoords.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        altitude: 4,
      })),
    [routePathCoords]
  );

  useEffect(() => {
    let active = true;
    async function resolveDestAndRoute() {
      if (!placesLib || !routesLib || !mapInstance) return;
      setLoading(true);
      setApproxDest(false);

      let target = origin;
      if (order.fulfillmentType !== 'pickup') {
        try {
          const cleanAddress = order.deliveryAddress
            .replace(/^[^:]+:\s*/, '')
            .trim();
          const res = (await placesLib.Place.searchByText({
            textQuery: `${cleanAddress}, Tanzania`,
            fields: ['location'],
            locationBias: origin,
            maxResultCount: 1,
            language: lang,
            region: 'tz',
          })) as {
            places?: {
              location?: { lat: () => number; lng: () => number } | null;
            }[];
          };
          const loc = res?.places?.[0]?.location;
          if (loc) {
            target = { lat: loc.lat(), lng: loc.lng() };
          } else {
            target = { lat: origin.lat + 0.019, lng: origin.lng + 0.014 };
            setApproxDest(true);
          }
        } catch (err) {
          const msg = String(err || '');
          if (
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('OVER_QUERY_LIMIT')
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
          target = { lat: origin.lat + 0.019, lng: origin.lng + 0.014 };
          setApproxDest(true);
        }
      }

      if (!active) return;
      setDestCoords(target);

      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];

      if (order.fulfillmentType === 'pickup') {
        setRoutePathCoords([]);
        mapInstance.panTo(origin);
        mapInstance.setZoom(15);
        setMap3dCamera((prev) => ({
          ...prev,
          center: { lat: origin.lat, lng: origin.lng, altitude: 60 },
          range: 1400,
        }));
        setLoading(false);
        return;
      }

      try {
        const response = await (
          routesLib.Route as unknown as {
            computeRoutes: (req: unknown) => Promise<{ routes?: unknown[] }>;
          }
        ).computeRoutes({
          origin,
          destination: target,
          travelMode: 'DRIVING',
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
        });

        if (!active) return;

        const primaryRoute = response?.routes?.[0] as
          | {
              createPolylines: () => MapPolyline[];
              viewport?: Parameters<NonNullable<GoogleMapInstance>['fitBounds']>[0];
              distanceMeters?: number;
              durationMillis?: number;
              path?: { lat: () => number; lng: () => number }[];
            }
          | undefined;

        if (primaryRoute) {
          const polys = primaryRoute.createPolylines();
          polys.forEach((p) => {
            p.setOptions({
              strokeColor: '#0B2A6F',
              strokeOpacity: 0.92,
              strokeWeight: 5,
            });
            p.setMap(mapInstance);
          });
          polylinesRef.current = polys;

          const pathPts =
            primaryRoute.path && primaryRoute.path.length >= 2
              ? primaryRoute.path.map((pt) => ({
                  lat: pt.lat(),
                  lng: pt.lng(),
                }))
              : interpolateCoords(origin, target, 24);
          setRoutePathCoords(pathPts);

          if (primaryRoute.viewport) {
            mapInstance.fitBounds(primaryRoute.viewport, 44);
          } else if (coreLib) {
            const bounds = new coreLib.LatLngBounds();
            bounds.extend(origin);
            bounds.extend(target);
            mapInstance.fitBounds(bounds, 44);
          }

          const mid = pathPts[Math.floor(pathPts.length / 2)] || origin;
          setMap3dCamera((prev) => ({
            ...prev,
            center: { lat: mid.lat, lng: mid.lng, altitude: 60 },
            range: Math.max(1600, Math.min(6500, (primaryRoute.distanceMeters || 2000) * 1.4)),
          }));

          const distKm = ((primaryRoute.distanceMeters || 0) / 1000).toFixed(1);
          const etaMin = Math.max(
            3,
            Math.round((primaryRoute.durationMillis || 0) / 60000)
          );
          setRouteMeta({ distanceKm: distKm, etaMin });
        } else {
          setRoutePathCoords(interpolateCoords(origin, target, 20));
        }
      } catch (err) {
        const msg = String(err || '');
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setRoutePathCoords(interpolateCoords(origin, target, 20));
        if (coreLib) {
          const bounds = new coreLib.LatLngBounds();
          bounds.extend(origin);
          bounds.extend(target);
          mapInstance.fitBounds(bounds, 44);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void resolveDestAndRoute();
    return () => {
      active = false;
    };
  }, [
    placesLib,
    routesLib,
    coreLib,
    mapInstance,
    order.deliveryAddress,
    order.fulfillmentType,
    lang,
    origin.lat,
    origin.lng,
  ]);

  const toggleViewMode = () => {
    if (viewMode === '2d') {
      const c = mapInstance?.getCenter?.();
      const targetCenter = c
        ? { lat: c.lat(), lng: c.lng() }
        : driverCoords || {
            lat: (origin.lat + destCoords.lat) / 2,
            lng: (origin.lng + destCoords.lng) / 2,
          };
      setMap3dCamera((prev) => ({
        ...prev,
        center: { lat: targetCenter.lat, lng: targetCenter.lng, altitude: 60 },
      }));
      setViewMode('3d');
    } else {
      setViewMode('2d');
    }
  };

  const isNative3D = viewMode === '3d' && supportsWebGL2;

  return (
    <div className="rounded-xl overflow-hidden border border-neutral-200 dark:border-blue-950 bg-neutral-50 dark:bg-[#091022]">
      <div className="h-[260px] sm:h-[300px] w-full relative">
        {isNative3D ? (
          <Map3D
            id={`order-track-3d-${order.id}`}
            mode={MapMode.ROADMAP}
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
            {routePath3D.length >= 2 && (
              <Polyline3D
                coordinates={routePath3D}
                altitudeMode={AltitudeMode.CLAMP_TO_GROUND}
                strokeColor="#F5B800"
                outerColor="#0B2A6F"
                strokeWidth={7}
                outerWidth={2}
              />
            )}

            <Marker3D
              position={{ lat: origin.lat, lng: origin.lng, altitude: 45 }}
              altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
              extruded
              title={station.name}
            >
              <Pin
                background="#0B2A6F"
                borderColor="#F5B800"
                glyphColor="#F5B800"
                scale={1.05}
              />
            </Marker3D>

            {order.fulfillmentType !== 'pickup' && (
              <Marker3D
                position={{
                  lat: destCoords.lat,
                  lng: destCoords.lng,
                  altitude: 45,
                }}
                altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                extruded
                title={order.deliveryAddress}
              >
                <Pin
                  background="#F5B800"
                  borderColor="#0B2A6F"
                  glyphColor="#0B2A6F"
                  scale={1.05}
                />
              </Marker3D>
            )}

            {driverCoords && (
              <Marker3D
                position={{
                  lat: driverCoords.lat,
                  lng: driverCoords.lng,
                  altitude: 55,
                }}
                altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
                extruded
                title={delivery?.driverName || 'OILCOM Delivery Rider'}
              >
                <Pin
                  background="#D92027"
                  borderColor="#F5B800"
                  glyphColor="#FFFFFF"
                  scale={1.15}
                />
              </Marker3D>
            )}
          </Map3D>
        ) : (
          <GoogleMapView
            mapId="DEMO_MAP_ID"
            defaultCenter={origin}
            defaultZoom={13}
            tilt={viewMode === '3d' ? 45 : 0}
            heading={viewMode === '3d' ? 15 : 0}
            gestureHandling="greedy"
            streetViewControl={false}
            fullscreenControl={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            <TrackingBridge onMap={setMapInstance} />

            {/* Origin Station Marker */}
            <AdvancedMarker position={origin} title={station.name}>
              <Pin
                background="#0B2A6F"
                borderColor="#F5B800"
                glyphColor="#F5B800"
                scale={1.05}
              />
            </AdvancedMarker>

            {/* Customer Destination Marker */}
            {order.fulfillmentType !== 'pickup' && (
              <AdvancedMarker position={destCoords} title={order.deliveryAddress}>
                <Pin
                  background="#F5B800"
                  borderColor="#0B2A6F"
                  glyphColor="#0B2A6F"
                  scale={1.05}
                />
              </AdvancedMarker>
            )}

            {/* Active Animated Rider / Driver Marker */}
            {driverCoords && (
              <AdvancedMarker
                position={driverCoords}
                title={delivery?.driverName || 'OILCOM Delivery Rider'}
              >
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#0B2A6F] text-[#F5B800] border-2 border-[#F5B800] shadow-md text-[11px] font-bold">
                  <Truck className="w-3.5 h-3.5" />
                  <span>{delivery?.vehiclePlate || 'OILCOM'}</span>
                </div>
              </AdvancedMarker>
            )}
          </GoogleMapView>
        )}

        {/* Map Top-Left Live Driver + 2D/3D Controls */}
        <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleViewMode}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold shadow-sm border cursor-pointer transition-colors ${
              viewMode === '3d'
                ? 'bg-[#F5B800] text-[#0B2A6F] border-[#F5B800]'
                : 'bg-white/95 dark:bg-[#0E172E]/95 text-[#0B2A6F] dark:text-[#F5B800] border-neutral-200 dark:border-blue-900'
            }`}
          >
            {viewMode === '3d' ? '2D' : '3D'}
          </button>

          {isEnRoute && order.fulfillmentType !== 'pickup' && (
            <button
              type="button"
              onClick={() => setAnimPaused((p) => !p)}
              className="px-2.5 py-1.5 rounded-lg bg-[#0B2A6F]/95 text-[#F5B800] text-[11px] font-bold shadow-sm flex items-center gap-1 cursor-pointer"
            >
              {animPaused ? (
                <Play className="w-3 h-3" />
              ) : (
                <Pause className="w-3 h-3" />
              )}
              <span>
                {lang === 'sw' ? 'Dereva Live' : 'Live Driver'}{' '}
                {Math.round(animProgress * 100)}%
              </span>
            </button>
          )}
        </div>

        {loading && (
          <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-white/95 dark:bg-[#0B1326]/95 text-[11px] font-semibold flex items-center gap-1.5 shadow-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F5B800]" />
            <span>{lang === 'sw' ? 'Inachora njia...' : 'Loading route...'}</span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs border-t border-neutral-200 dark:border-blue-950">
        <div className="flex items-center gap-2 min-w-0">
          <Store className="w-4 h-4 text-[#0B2A6F] dark:text-[#F5B800] shrink-0" />
          <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate">
            {station.name}
          </span>
          {order.fulfillmentType !== 'pickup' && (
            <>
              <span className="text-neutral-400">→</span>
              <MapPin className="w-4 h-4 text-[#F5B800] shrink-0" />
              <span className="text-neutral-600 dark:text-neutral-300 truncate">
                {order.deliveryAddress}
                {approxDest
                  ? lang === 'sw'
                    ? ' (makadirio)'
                    : ' (approx.)'
                  : ''}
              </span>
            </>
          )}
        </div>

        {routeMeta && (
          <div className="flex items-center gap-1.5 font-mono-num font-bold text-[#0B2A6F] dark:text-[#F5B800] shrink-0">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {routeMeta.distanceKm} km · ~{delivery?.etaMinutes || routeMeta.etaMin}{' '}
              {lang === 'sw' ? 'dakika' : 'min'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function OrderTrackingMap({
  lang,
  order,
  delivery,
  stations,
  googleMapsApiKey,
}: OrderTrackingMapProps) {
  if (!googleMapsApiKey) {
    return (
      <div className="p-4 rounded-xl bg-neutral-50 dark:bg-blue-950/30 border border-neutral-200 dark:border-blue-950 text-xs text-neutral-600 dark:text-neutral-300">
        {lang === 'sw'
          ? `Uwasilishaji kwenda: ${order.deliveryAddress}`
          : `Delivery destination: ${order.deliveryAddress}`}
      </div>
    );
  }

  return (
    <APIProvider apiKey={googleMapsApiKey} version="beta" language={lang} region="TZ">
      <TrackingWorkspace
        lang={lang}
        order={order}
        delivery={delivery}
        stations={stations}
      />
    </APIProvider>
  );
}

