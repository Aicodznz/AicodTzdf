import React, { useCallback, useEffect, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMapView,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Check, Loader2, MapPin, Navigation, Search, X } from 'lucide-react';
import type { Language } from '../types/oilcom';

interface MapLocationPickerModalProps {
  lang: Language;
  open: boolean;
  googleMapsApiKey: string;
  initialAddress?: string;
  onClose: () => void;
  onConfirm: (result: {
    street: string;
    city: string;
    lat: number;
    lng: number;
  }) => void;
}

type GoogleMapInstance = ReturnType<typeof useMap>;

const DAR_CENTER = { lat: -6.7924, lng: 39.2083 };

function PickerBridge({
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

function PickerWorkspace({
  lang,
  initialAddress,
  onClose,
  onConfirm,
}: Omit<MapLocationPickerModalProps, 'open' | 'googleMapsApiKey'>) {
  const [mapInstance, setMapInstance] = useState<GoogleMapInstance>(null);
  const placesLib = useMapsLibrary('places');

  const [pinCoords, setPinCoords] = useState<{ lat: number; lng: number }>(
    DAR_CENTER
  );
  const [searchQuery, setSearchQuery] = useState(initialAddress || '');
  const [resolvedAddress, setResolvedAddress] = useState(
    initialAddress || 'Dar es Salaam, Tanzania'
  );
  const [cityName, setCityName] = useState('Dar es Salaam');
  const [busy, setBusy] = useState(false);

  const reverseLookupWithPlaces = useCallback(
    async (lat: number, lng: number) => {
      if (!placesLib) {
        setResolvedAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        return;
      }
      setBusy(true);
      try {
        const res = (await placesLib.Place.searchNearby({
          fields: ['displayName', 'formattedAddress'],
          locationRestriction: {
            center: { lat, lng },
            radius: 350,
          },
          maxResultCount: 1,
          language: lang,
          region: 'tz',
        })) as {
          places?: { displayName?: string; formattedAddress?: string }[];
        };
        const first = res?.places?.[0];
        if (first?.formattedAddress || first?.displayName) {
          const label = first.displayName
            ? `${first.displayName}, ${first.formattedAddress || ''}`
            : first.formattedAddress || '';
          setResolvedAddress(label.replace(/,\s*$/, ''));
          const parts = (first.formattedAddress || '').split(',');
          if (parts.length >= 2) {
            setCityName(parts[parts.length - 2].trim() || 'Dar es Salaam');
          }
        } else {
          setResolvedAddress(`Pin (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
        }
      } catch (err) {
        const msg = String(err || '');
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setResolvedAddress(`Pin (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
      } finally {
        setBusy(false);
      }
    },
    [placesLib, lang]
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !placesLib) return;
    setBusy(true);
    try {
      const res = (await placesLib.Place.searchByText({
        textQuery: searchQuery.trim(),
        fields: ['displayName', 'formattedAddress', 'location'],
        locationBias: pinCoords,
        maxResultCount: 1,
        language: lang,
        region: 'tz',
      })) as {
        places?: {
          displayName?: string;
          formattedAddress?: string;
          location?: { lat: () => number; lng: () => number };
        }[];
      };
      const first = res?.places?.[0];
      if (first?.location) {
        const next = { lat: first.location.lat(), lng: first.location.lng() };
        setPinCoords(next);
        mapInstance?.panTo(next);
        mapInstance?.setZoom(15);
        const label = first.displayName
          ? `${first.displayName} — ${first.formattedAddress || ''}`
          : first.formattedAddress || searchQuery;
        setResolvedAddress(label.replace(/—\s*$/, ''));
      }
    } catch (err) {
      const msg = String(err || '');
      if (
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('OVER_QUERY_LIMIT')
      ) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    } finally {
      setBusy(false);
    }
  };

  const useGps = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPinCoords(coords);
        mapInstance?.panTo(coords);
        mapInstance?.setZoom(16);
        void reverseLookupWithPlaces(coords.lat, coords.lng);
      },
      () => setBusy(false),
      { timeout: 6000, enableHighAccuracy: true }
    );
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              lang === 'sw'
                ? 'Tafuta mtaa au jengo (mf. Mikocheni, Sinza)...'
                : 'Search street or landmark...'
            }
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-neutral-50 dark:bg-[#0c130f] text-xs text-neutral-900 dark:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-2 rounded-xl bg-[#08291A] text-white text-xs font-semibold cursor-pointer shrink-0"
        >
          {lang === 'sw' ? 'Tafuta' : 'Find'}
        </button>
        <button
          type="button"
          onClick={useGps}
          title="GPS"
          className="p-2 rounded-xl border border-neutral-200 dark:border-emerald-950 bg-white dark:bg-[#121b16] cursor-pointer shrink-0"
        >
          <Navigation className="w-4 h-4 text-blue-600 dark:text-[#F5B800]" />
        </button>
      </form>

      <div className="h-[300px] sm:h-[340px] w-full rounded-xl overflow-hidden border border-neutral-200 dark:border-emerald-950 relative">
        <GoogleMapView
          mapId="DEMO_MAP_ID"
          defaultCenter={DAR_CENTER}
          defaultZoom={13}
          gestureHandling="greedy"
          streetViewControl={false}
          fullscreenControl={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          onClick={(ev) => {
            const ll = ev.detail?.latLng;
            if (!ll) return;
            const next = { lat: ll.lat, lng: ll.lng };
            setPinCoords(next);
            void reverseLookupWithPlaces(next.lat, next.lng);
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <PickerBridge onMap={setMapInstance} />
          <AdvancedMarker position={pinCoords}>
            <Pin
              background="#08291A"
              borderColor="#F5B800"
              glyphColor="#F5B800"
              scale={1.2}
            />
          </AdvancedMarker>
        </GoogleMapView>
      </div>

      <div className="p-3 rounded-xl bg-neutral-50 dark:bg-emerald-950/30 border border-neutral-200 dark:border-emerald-900 space-y-1">
        <p className="text-[11px] font-semibold text-neutral-500 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-[#F5B800]" />
          {lang === 'sw'
            ? 'Gusa popote kwenye ramani kuweka alama ya nyumba/ofisi:'
            : 'Tap anywhere on the map to pin delivery location:'}
        </p>
        <div className="flex items-center gap-2">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F5B800] shrink-0" />}
          <input
            type="text"
            value={resolvedAddress}
            onChange={(e) => setResolvedAddress(e.target.value)}
            className="w-full bg-transparent text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-emerald-950 text-xs font-semibold cursor-pointer"
        >
          {lang === 'sw' ? 'Ghairi' : 'Cancel'}
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm({
              street: resolvedAddress.trim(),
              city: cityName,
              lat: pinCoords.lat,
              lng: pinCoords.lng,
            });
            onClose();
          }}
          className="px-4 py-2 rounded-xl bg-[#F5B800] text-[#08291A] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <Check className="w-4 h-4" />
          {lang === 'sw' ? 'Tumia Eneo Hili' : 'Confirm Location'}
        </button>
      </div>
    </div>
  );
}

export function MapLocationPickerModal({
  lang,
  open,
  googleMapsApiKey,
  initialAddress,
  onClose,
  onConfirm,
}: MapLocationPickerModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#121b16] border border-neutral-200 dark:border-emerald-950 p-5 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-base text-neutral-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#F5B800]" />
            {lang === 'sw'
              ? 'Chagua Anwani Kwenye Ramani'
              : 'Pick Location on Map'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close picker"
            className="p-1 text-neutral-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {googleMapsApiKey ? (
          <APIProvider apiKey={googleMapsApiKey} language={lang} region="TZ">
            <PickerWorkspace
              lang={lang}
              initialAddress={initialAddress}
              onClose={onClose}
              onConfirm={onConfirm}
            />
          </APIProvider>
        ) : (
          <div className="py-8 text-center text-xs text-neutral-500 space-y-3">
            <p>
              {lang === 'sw'
                ? 'Google Maps haijawashwa bado. Andika anwani moja kwa moja.'
                : 'Google Maps key unavailable. Please enter your address manually.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#08291A] text-white text-xs font-semibold cursor-pointer"
            >
              {lang === 'sw' ? 'Sawa' : 'OK'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
