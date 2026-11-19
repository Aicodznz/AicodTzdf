import React, { useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMapView,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Clock, Loader2, MapPin, Store, Truck } from 'lucide-react';
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
  const [driverCoords, setDriverCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [routeMeta, setRouteMeta] = useState<{
    distanceKm: string;
    etaMin: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [approxDest, setApproxDest] = useState(false);

  const polylinesRef = useRef<MapPolyline[]>([]);

  useEffect(() => {
    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, []);

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
        mapInstance.panTo(origin);
        mapInstance.setZoom(15);
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
              strokeColor: '#08291A',
              strokeOpacity: 0.92,
              strokeWeight: 5,
            });
            p.setMap(mapInstance);
          });
          polylinesRef.current = polys;

          if (primaryRoute.viewport) {
            mapInstance.fitBounds(primaryRoute.viewport, 44);
          } else if (coreLib) {
            const bounds = new coreLib.LatLngBounds();
            bounds.extend(origin);
            bounds.extend(target);
            mapInstance.fitBounds(bounds, 44);
          }

          const distKm = ((primaryRoute.distanceMeters || 0) / 1000).toFixed(1);
          const etaMin = Math.max(
            3,
            Math.round((primaryRoute.durationMillis || 0) / 60000)
          );
          setRouteMeta({ distanceKm: distKm, etaMin });

          if (
            order.status === 'dispatched' ||
            delivery?.status === 'en_route' ||
            delivery?.status === 'arrived'
          ) {
            const path = primaryRoute.path;
            if (path && path.length > 2) {
              const midIdx = Math.floor(path.length * 0.58);
              const pt = path[midIdx];
              setDriverCoords({ lat: pt.lat(), lng: pt.lng() });
            } else {
              setDriverCoords({
                lat: origin.lat + (target.lat - origin.lat) * 0.58,
                lng: origin.lng + (target.lng - origin.lng) * 0.58,
              });
            }
          } else {
            setDriverCoords(null);
          }
        }
      } catch (err) {
        const msg = String(err || '');
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
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
    order.status,
    delivery?.status,
    lang,
    origin.lat,
    origin.lng,
  ]);

  return (
    <div className="rounded-xl overflow-hidden border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f]">
      <div className="h-[240px] sm:h-[280px] w-full relative">
        <GoogleMapView
          mapId="DEMO_MAP_ID"
          defaultCenter={origin}
          defaultZoom={13}
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
              background="#08291A"
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
                borderColor="#08291A"
                glyphColor="#08291A"
                scale={1.05}
              />
            </AdvancedMarker>
          )}

          {/* Active Rider / Driver Marker */}
          {driverCoords && (
            <AdvancedMarker
              position={driverCoords}
              title={delivery?.driverName || 'OILCOM Delivery Rider'}
            >
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#08291A] text-[#F5B800] border-2 border-[#F5B800] shadow-md text-[11px] font-bold">
                <Truck className="w-3.5 h-3.5" />
                <span>{delivery?.vehiclePlate || 'OILCOM'}</span>
              </div>
            </AdvancedMarker>
          )}
        </GoogleMapView>

        {loading && (
          <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-white/95 dark:bg-[#0e1712]/95 text-[11px] font-semibold flex items-center gap-1.5 shadow-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F5B800]" />
            <span>{lang === 'sw' ? 'Inachora njia...' : 'Loading route...'}</span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs border-t border-neutral-200 dark:border-emerald-950">
        <div className="flex items-center gap-2 min-w-0">
          <Store className="w-4 h-4 text-[#08291A] dark:text-[#F5B800] shrink-0" />
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
          <div className="flex items-center gap-1.5 font-mono-num font-bold text-[#08291A] dark:text-[#F5B800] shrink-0">
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
      <div className="p-4 rounded-xl bg-neutral-50 dark:bg-emerald-950/30 border border-neutral-200 dark:border-emerald-950 text-xs text-neutral-600 dark:text-neutral-300">
        {lang === 'sw'
          ? `Uwasilishaji kwenda: ${order.deliveryAddress}`
          : `Delivery destination: ${order.deliveryAddress}`}
      </div>
    );
  }

  return (
    <APIProvider apiKey={googleMapsApiKey} language={lang} region="TZ">
      <TrackingWorkspace
        lang={lang}
        order={order}
        delivery={delivery}
        stations={stations}
      />
    </APIProvider>
  );
}
