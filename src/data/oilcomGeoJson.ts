import type { GasOrder, Station } from '../types/oilcom';

export type GeoJsonCoordinate = [number, number] | [number, number, number];

export interface GeoJsonPointGeometry {
  type: 'Point';
  coordinates: GeoJsonCoordinate;
}

export interface GeoJsonMultiPointGeometry {
  type: 'MultiPoint';
  coordinates: GeoJsonCoordinate[];
}

export interface GeoJsonLineStringGeometry {
  type: 'LineString';
  coordinates: GeoJsonCoordinate[];
}

export interface GeoJsonMultiLineStringGeometry {
  type: 'MultiLineString';
  coordinates: GeoJsonCoordinate[][];
}

export interface GeoJsonPolygonGeometry {
  type: 'Polygon';
  coordinates: GeoJsonCoordinate[][];
}

export interface GeoJsonMultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: GeoJsonCoordinate[][][];
}

export interface GeoJsonGeometryCollection {
  type: 'GeometryCollection';
  geometries: GeoJsonGeometry[];
}

export type GeoJsonGeometry =
  | GeoJsonPointGeometry
  | GeoJsonMultiPointGeometry
  | GeoJsonLineStringGeometry
  | GeoJsonMultiLineStringGeometry
  | GeoJsonPolygonGeometry
  | GeoJsonMultiPolygonGeometry
  | GeoJsonGeometryCollection;

export type OilcomGisFeatureKind =
  | 'zone'
  | 'corridor'
  | 'buffer'
  | 'voronoi'
  | 'hotspot'
  | 'bbox'
  | 'station'
  | 'custom';

export type TimeSliceKey = 'all' | 'morning' | 'midday' | 'evening' | 'night';

export interface OilcomGisFeatureProperties {
  id?: string;
  kind?: OilcomGisFeatureKind;
  nameSw?: string;
  nameEn?: string;
  name?: string;
  descriptionSw?: string;
  descriptionEn?: string;
  eta?: string;
  feeTzs?: number;
  radiusKm?: number;
  demandScore?: number;
  intensity?: 'high' | 'medium' | 'low';
  ordersCount?: number;
  timeSlice?: TimeSliceKey;
  buildingDensityPerKm2?: number;
  roadNetworkKmPerKm2?: number;
  overtureSuitabilityScore?: number;
  strokeColor?: string;
  fillColor?: string;
  fillOpacity?: number;
  [key: string]: unknown;
}

export interface GeoJsonFeature {
  type: 'Feature';
  id?: string | number;
  geometry: GeoJsonGeometry | null;
  properties: OilcomGisFeatureProperties | null;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface Parsed3DPolygonOverlay {
  key: string;
  outerCoordinates: { lat: number; lng: number; altitude: number }[];
  innerCoordinates?: { lat: number; lng: number; altitude: number }[][];
  fillColor: string;
  strokeColor: string;
  feature: GeoJsonFeature;
}

export interface Parsed3DPolylineOverlay {
  key: string;
  coordinates: { lat: number; lng: number; altitude: number }[];
  strokeColor: string;
  feature: GeoJsonFeature;
}

export interface Parsed3DPointOverlay {
  key: string;
  position: { lat: number; lng: number; altitude: number };
  label: string;
  feature: GeoJsonFeature;
}

export interface Parsed3DOverlays {
  polygons: Parsed3DPolygonOverlay[];
  polylines: Parsed3DPolylineOverlay[];
  points: Parsed3DPointOverlay[];
}

export interface GeoBoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

// Realistic urban road-corridor & isochrone GeoJSON polygons (Dar es Salaam, Arusha, Mwanza)
export const OILCOM_GIS_FEATURE_COLLECTION: GeoJsonFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'zone-kinondoni',
      properties: {
        id: 'zone-kinondoni',
        kind: 'zone',
        nameSw: 'Ukanda wa Kinondoni, Mikocheni & Masaki (Gesi Haraka)',
        nameEn: 'Kinondoni, Mikocheni & Masaki Fast LPG Corridor',
        descriptionSw:
          'Usafirishaji wa mitungi ya 6kg, 15kg na 38kg kufuata Barabara ya Ali Hassan Mwinyi, Old Bagamoyo na Peninsula.',
        descriptionEn:
          'Fast cylinder dispatch (6kg, 15kg, 38kg) following Ali Hassan Mwinyi Rd, Old Bagamoyo Rd, and Msasani Peninsula.',
        eta: '18–28 min',
        feeTzs: 2500,
        strokeColor: '#2563EB',
        fillColor: '#2563EB',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [39.236, -6.783],
            [39.248, -6.794],
            [39.266, -6.798],
            [39.279, -6.786],
            [39.287, -6.768],
            [39.286, -6.748],
            [39.273, -6.741],
            [39.257, -6.746],
            [39.242, -6.759],
            [39.235, -6.771],
            [39.236, -6.783],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'zone-kariakoo',
      properties: {
        id: 'zone-kariakoo',
        kind: 'zone',
        nameSw: 'Ukanda wa Kariakoo, Ilala, Posta & Upanga (Express)',
        nameEn: 'Kariakoo, Ilala, CBD & Upanga Express Corridor',
        descriptionSw:
          'Huduma ya haraka 24/7 kufuata Barabara za Morogoro, Uhuru, Nyerere na Msimbazi kwa biashara na makazi.',
        descriptionEn:
          '24/7 urban express zone shaped along Morogoro, Uhuru, Nyerere, and Msimbazi corridors.',
        eta: '15–25 min',
        feeTzs: 2000,
        strokeColor: '#F5B800',
        fillColor: '#F5B800',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [39.248, -6.826],
            [39.261, -6.839],
            [39.281, -6.842],
            [39.297, -6.828],
            [39.301, -6.811],
            [39.293, -6.799],
            [39.276, -6.799],
            [39.259, -6.805],
            [39.249, -6.814],
            [39.248, -6.826],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'zone-mbezi',
      properties: {
        id: 'zone-mbezi',
        kind: 'zone',
        nameSw: 'Ukanda wa Mbezi Beach, Kawe & Kunduchi (Bagamoyo Rd)',
        nameEn: 'Mbezi Beach, Kawe & Kunduchi Coastal Corridor',
        descriptionSw:
          'Usambazaji wa mafuta, vilainishi na gesi ukifuata ukanda wa pwani wa Bagamoyo Road hadi Kunduchi.',
        descriptionEn:
          'Northern coastal fuel, lubricants & LPG corridor stretching from Kawe through Mbezi Beach to Kunduchi.',
        eta: '22–38 min',
        feeTzs: 3000,
        strokeColor: '#D92027',
        fillColor: '#D92027',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [39.195, -6.736],
            [39.211, -6.742],
            [39.233, -6.733],
            [39.247, -6.716],
            [39.238, -6.693],
            [39.222, -6.678],
            [39.205, -6.684],
            [39.196, -6.706],
            [39.192, -6.723],
            [39.195, -6.736],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'zone-arusha',
      properties: {
        id: 'zone-arusha',
        kind: 'zone',
        nameSw: 'Ukanda wa Arusha Mjini (Clock Tower — Sakina — Njiro)',
        nameEn: 'Arusha Metro Corridor (Clock Tower — Sakina — Njiro)',
        descriptionSw:
          'Usafirishaji wa OILCOM Gas na mafuta ya meli za kibiashara kufuata Barabara ya Sokoine na Dodoma–Moshi Hwy.',
        descriptionEn:
          'OILCOM LPG & fleet refueling corridor along Sokoine Rd connecting Sakina, Clock Tower, and Njiro.',
        eta: '20–35 min',
        feeTzs: 2500,
        strokeColor: '#2563EB',
        fillColor: '#2563EB',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [36.666, -3.376],
            [36.676, -3.394],
            [36.697, -3.398],
            [36.719, -3.389],
            [36.724, -3.371],
            [36.714, -3.354],
            [36.692, -3.349],
            [36.674, -3.357],
            [36.666, -3.376],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'zone-mwanza',
      properties: {
        id: 'zone-mwanza',
        kind: 'zone',
        nameSw: 'Ukanda wa Mwanza Nyamagana & Ilemela (Kanda ya Ziwa)',
        nameEn: 'Mwanza Nyamagana & Ilemela Lake Corridor',
        descriptionSw:
          'Huduma ya OILCOM kufuata ufukwe wa Ziwa Victoria, Barabara ya Kenyatta na Makongoro.',
        descriptionEn:
          'Lake Victoria urban logistics corridor following Kenyatta Rd, Makongoro Rd, and Nyamagana.',
        eta: '20–35 min',
        feeTzs: 2500,
        strokeColor: '#F5B800',
        fillColor: '#F5B800',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [32.891, -2.528],
            [32.904, -2.543],
            [32.927, -2.544],
            [32.942, -2.527],
            [32.944, -2.507],
            [32.929, -2.492],
            [32.908, -2.494],
            [32.894, -2.509],
            [32.891, -2.528],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'corridor-dar-supply',
      properties: {
        id: 'corridor-dar-supply',
        kind: 'corridor',
        nameSw: 'Njia Kuu ya Usambazaji Dar (Kigamboni → Posta → Mbezi)',
        nameEn: 'Dar Coastal Supply Corridor (Kigamboni → CBD → Mbezi)',
        descriptionSw:
          'Njia kuu ya malori ya mafuta na LPG kuunganisha bohari ya Kigamboni na vituo vya pwani.',
        descriptionEn:
          'Primary tanker & LPG feeder corridor linking Kigamboni Terminal to Dar es Salaam hubs.',
        eta: 'Active Corridor',
        strokeColor: '#F5B800',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [39.2955, -6.8435],
          [39.2868, -6.8305],
          [39.2766, -6.8205],
          [39.2745, -6.7995],
          [39.2612, -6.7749],
          [39.2425, -6.7462],
          [39.2228, -6.7124],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'corridor-morogoro-feeder',
      properties: {
        id: 'corridor-morogoro-feeder',
        kind: 'corridor',
        nameSw: 'Ukanda wa Usafirishaji Bara (CBD → Ubungo → Kibaha)',
        nameEn: 'Inland Logistics Corridor (CBD → Ubungo → Kibaha)',
        descriptionSw:
          'Ukanda wa malori ya mizigo na B2B kufuata Barabara ya Morogoro kuelekea mikoani.',
        descriptionEn:
          'Morogoro Road heavy-fleet & B2B supply corridor connecting CBD to Ubungo and Kibaha.',
        eta: 'B2B Freight Route',
        strokeColor: '#D92027',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [39.2766, -6.8205],
          [39.2545, -6.8095],
          [39.2292, -6.7982],
          [39.1985, -6.7875],
          [39.1465, -6.7825],
        ],
      },
    },
  ],
};

const GEOMETRY_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
]);

// Wrap standalone Feature or Geometry objects into a valid FeatureCollection
export function normalizeGeoJsonInput(raw: unknown): GeoJsonFeatureCollection | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    const validFeatures = obj.features.filter(
      (f): f is GeoJsonFeature =>
        Boolean(f) &&
        typeof f === 'object' &&
        (f as Record<string, unknown>).type === 'Feature' &&
        'geometry' in (f as Record<string, unknown>)
    );
    if (validFeatures.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: validFeatures.map((f, idx) => ({
        ...f,
        properties: {
          kind: 'custom',
          strokeColor: '#38BDF8',
          fillColor: '#38BDF8',
          ...(f.properties || {}),
          id: String(f.properties?.id ?? f.id ?? `custom-feature-${idx + 1}`),
        },
      })),
    };
  }

  if (obj.type === 'Feature' && 'geometry' in obj) {
    const feat = obj as unknown as GeoJsonFeature;
    return {
      type: 'FeatureCollection',
      features: [
        {
          ...feat,
          properties: {
            kind: 'custom',
            strokeColor: '#38BDF8',
            fillColor: '#38BDF8',
            ...(feat.properties || {}),
            id: String(feat.properties?.id ?? feat.id ?? 'custom-feature-1'),
          },
        },
      ],
    };
  }

  if (typeof obj.type === 'string' && GEOMETRY_TYPES.has(obj.type)) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'custom-geometry-1',
          geometry: obj as unknown as GeoJsonGeometry,
          properties: {
            id: 'custom-geometry-1',
            kind: 'custom',
            name: 'GeoJSON Geometry',
            strokeColor: '#38BDF8',
            fillColor: '#38BDF8',
          },
        },
      ],
    };
  }

  return null;
}

// Split a single CSV line handling quotes & delimiter
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

// Convert CSV (with lat/lng columns) directly into OGC GeoJSON (inspired by leafmap.csv_to_geojson)
export function parseCsvToGeoJson(
  csvText: string,
  sourceName = 'csv-import'
): GeoJsonFeatureCollection | null {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t')
    ? '\t'
    : headerLine.split(';').length > headerLine.split(',').length
      ? ';'
      : ',';
  const headers = splitCsvLine(headerLine, delimiter).map((h) =>
    h.replace(/^["']|["']$/g, '').trim()
  );
  const lowerHeaders = headers.map((h) => h.toLowerCase());

  const latNames = new Set(['lat', 'latitude', 'lat_dd', 'y', 'y_coord']);
  const lngNames = new Set([
    'lng',
    'lon',
    'long',
    'longitude',
    'lon_dd',
    'lng_dd',
    'x',
    'x_coord',
  ]);
  const latIdx = lowerHeaders.findIndex((h) => latNames.has(h));
  const lngIdx = lowerHeaders.findIndex((h) => lngNames.has(h));
  if (latIdx === -1 || lngIdx === -1) return null;

  const features: GeoJsonFeature[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r], delimiter);
    const lat = Number(cells[latIdx]);
    const lng = Number(cells[lngIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

    const props: OilcomGisFeatureProperties = {
      id: `csv-${r}`,
      kind: 'custom',
      source: sourceName,
      strokeColor: '#0EA5E9',
      fillColor: '#0EA5E9',
    };
    headers.forEach((h, idx) => {
      if (!h) return;
      props[h] = cells[idx] ?? '';
    });
    const displayName =
      props.name ||
      props.title ||
      props.station ||
      props.company ||
      props.label ||
      `${sourceName} #${r}`;
    props.name = String(displayName);

    features.push({
      type: 'Feature',
      id: `csv-${r}`,
      geometry: {
        type: 'Point',
        coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))],
      },
      properties: props,
    });
  }

  if (features.length === 0) return null;
  return {
    type: 'FeatureCollection',
    features,
  };
}

function parseKmlCoordTupleList(rawText: string): GeoJsonCoordinate[] {
  return rawText
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const parts = pair.split(',').map((n) => Number(n.trim()));
      if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        return Number.isFinite(parts[2])
          ? ([parts[0], parts[1], parts[2]] as GeoJsonCoordinate)
          : ([parts[0], parts[1]] as GeoJsonCoordinate);
      }
      return null;
    })
    .filter((c): c is GeoJsonCoordinate => c !== null);
}

// Convert standard KML Placemarks into OGC GeoJSON using browser XML parser
export function parseKmlToGeoJson(
  kmlText: string,
  sourceName = 'kml-import'
): GeoJsonFeatureCollection | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(kmlText, 'text/xml');
  if (doc.querySelector('parsererror')) return null;

  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
  const features: GeoJsonFeature[] = [];

  placemarks.forEach((pm, idx) => {
    const name =
      pm.getElementsByTagName('name')[0]?.textContent?.trim() ||
      `${sourceName} #${idx + 1}`;
    const desc =
      pm.getElementsByTagName('description')[0]?.textContent?.trim() || undefined;

    const polyEl = pm.getElementsByTagName('Polygon')[0];
    const lineEl = pm.getElementsByTagName('LineString')[0];
    const ptEl = pm.getElementsByTagName('Point')[0];

    let geometry: GeoJsonGeometry | null = null;

    if (polyEl) {
      const outerText =
        polyEl
          .getElementsByTagName('outerBoundaryIs')[0]
          ?.getElementsByTagName('coordinates')[0]?.textContent ||
        polyEl.getElementsByTagName('coordinates')[0]?.textContent ||
        '';
      const ring = parseKmlCoordTupleList(outerText);
      if (ring.length >= 3) {
        geometry = { type: 'Polygon', coordinates: [ring] };
      }
    } else if (lineEl) {
      const coordsText =
        lineEl.getElementsByTagName('coordinates')[0]?.textContent || '';
      const line = parseKmlCoordTupleList(coordsText);
      if (line.length >= 2) {
        geometry = { type: 'LineString', coordinates: line };
      }
    } else if (ptEl) {
      const coordsText =
        ptEl.getElementsByTagName('coordinates')[0]?.textContent || '';
      const pts = parseKmlCoordTupleList(coordsText);
      if (pts[0]) {
        geometry = { type: 'Point', coordinates: pts[0] };
      }
    }

    if (geometry) {
      features.push({
        type: 'Feature',
        id: `kml-${idx + 1}`,
        geometry,
        properties: {
          id: `kml-${idx + 1}`,
          kind: 'custom',
          name,
          description: desc,
          source: sourceName,
          strokeColor: '#0EA5E9',
          fillColor: '#0EA5E9',
        },
      });
    }
  });

  if (features.length === 0) return null;
  return {
    type: 'FeatureCollection',
    features,
  };
}

export function parseAnySpatialFileToGeoJson(
  fileText: string,
  fileName: string
): { format: 'geojson' | 'csv' | 'kml'; data: GeoJsonFeatureCollection } | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    const data = parseCsvToGeoJson(fileText, fileName);
    return data ? { format: 'csv', data } : null;
  }
  if (lower.endsWith('.kml')) {
    const data = parseKmlToGeoJson(fileText, fileName);
    return data ? { format: 'kml', data } : null;
  }
  try {
    const parsed = JSON.parse(fileText) as unknown;
    const data = normalizeGeoJsonInput(parsed);
    return data ? { format: 'geojson', data } : null;
  } catch {
    return null;
  }
}

export const SAMPLE_OILCOM_SITES_CSV = [
  'name,city,category,lat,lng,estimated_monthly_liters',
  'Kigamboni Logistics Fleet Yard,Dar es Salaam,B2B Fleet,-6.8432,39.3075,45000',
  'Ubungo Bus & Freight Terminal,Dar es Salaam,Transit Hub,-6.7885,39.2055,62000',
  'Mbagala Rangi Tatu LPG Hub,Dar es Salaam,Agent Candidate,-6.9122,39.2715,18500',
  'Dodoma Mtumba Govt Quarter,Dodoma,New Station Site,-6.1885,35.8442,54000',
  'Tegeta Kibo Commercial Center,Dar es Salaam,LPG Retail,-6.6542,39.1884,24000',
].join('\n');

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(37, 99, 235, ${alpha})`;
}

// Generate an accurate geodesic circular ring ([lng, lat][]) for service radius buffers
export function createBufferCircleRing(
  lat: number,
  lng: number,
  radiusKm: number,
  steps = 36
): GeoJsonCoordinate[] {
  const earthRadiusKm = 6371;
  const latRad = (lat * Math.PI) / 180;
  const dLat = (radiusKm / earthRadiusKm) * (180 / Math.PI);
  const cosLat = Math.max(0.15, Math.cos(latRad));
  const dLng = dLat / cosLat;

  const ring: GeoJsonCoordinate[] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const pLng = Number((lng + dLng * Math.cos(theta)).toFixed(6));
    const pLat = Number((lat + dLat * Math.sin(theta)).toFixed(6));
    ring.push([pLng, pLat]);
  }
  return ring;
}

// Service Radius Buffers (3km / 5km / 10km) around active OILCOM stations
export function buildStationBuffersGeoJson(
  stations: Station[],
  radiusKm: number
): GeoJsonFeatureCollection {
  if (radiusKm <= 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features: GeoJsonFeature[] = stations
    .filter(
      (s) =>
        s.status === 'active' &&
        Number.isFinite(s.lat) &&
        Number.isFinite(s.lng)
    )
    .map((st) => {
      const hasBoth = st.hasGas !== false && st.hasFuel !== false;
      const strokeColor = hasBoth
        ? '#0B2A6F'
        : st.hasGas !== false
          ? '#F5B800'
          : '#D92027';
      const fillColor = hasBoth
        ? '#2563EB'
        : st.hasGas !== false
          ? '#F5B800'
          : '#D92027';

      return {
        type: 'Feature',
        id: `buffer-${st.id}-${radiusKm}km`,
        properties: {
          id: `buffer-${st.id}-${radiusKm}km`,
          kind: 'buffer',
          stationId: st.id,
          stationCode: st.code,
          radiusKm,
          nameSw: `Mduara wa Huduma (${radiusKm} km) — ${st.name}`,
          nameEn: `${radiusKm} km Service Buffer — ${st.name}`,
          descriptionSw: `Eneo la ufikishaji haraka ndani ya kilomita ${radiusKm} kutoka ${st.address}, ${st.city}.`,
          descriptionEn: `Primary delivery & refueling catch basin within ${radiusKm} km of ${st.address}, ${st.city}.`,
          eta: radiusKm <= 3 ? '10–20 min' : radiusKm <= 5 ? '20–35 min' : '35–55 min',
          strokeColor,
          fillColor,
          fillOpacity: 0.1,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [createBufferCircleRing(st.lat, st.lng, radiusKm, 36)],
        },
      };
    });

  return {
    type: 'FeatureCollection',
    features,
  };
}

// Sutherland–Hodgman half-plane polygon clipping for exact Voronoi / Thiessen territories
interface PlanarPt {
  x: number;
  y: number;
}

function clipPolygonAgainstHalfPlane(
  poly: PlanarPt[],
  ax: number,
  ay: number,
  bx: number,
  by: number
): PlanarPt[] {
  if (poly.length === 0) return [];
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const vx = bx - ax;
  const vy = by - ay;
  // Keep points p closer to A than B: (p - m) . (B - A) <= 0
  const isInside = (p: PlanarPt) => (p.x - mx) * vx + (p.y - my) * vy <= 1e-10;
  const intersect = (p1: PlanarPt, p2: PlanarPt): PlanarPt => {
    const d1 = (p1.x - mx) * vx + (p1.y - my) * vy;
    const d2 = (p2.x - mx) * vx + (p2.y - my) * vy;
    const t = d1 / (d1 - d2 + 1e-15);
    return {
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y),
    };
  };

  const out: PlanarPt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const currIn = isInside(curr);
    const prevIn = isInside(prev);
    if (currIn) {
      if (!prevIn) out.push(intersect(prev, curr));
      out.push(curr);
    } else if (prevIn) {
      out.push(intersect(prev, curr));
    }
  }
  return out;
}

const VORONOI_PALETTE = ['#2563EB', '#0B2A6F', '#F5B800', '#D92027', '#0EA5E9', '#059669'];

// Non-overlapping Voronoi / Thiessen catchment polygons clipped per station
export function buildStationVoronoiGeoJson(
  stations: Station[],
  domainRadiusKm = 18
): GeoJsonFeatureCollection {
  const active = stations.filter(
    (s) => s.status === 'active' && Number.isFinite(s.lat) && Number.isFinite(s.lng)
  );
  if (active.length === 0) return { type: 'FeatureCollection', features: [] };

  const features: GeoJsonFeature[] = [];
  const earthKmPerDeg = 111.32;

  active.forEach((st, idx) => {
    const cosLat = Math.max(0.2, Math.cos((st.lat * Math.PI) / 180));
    const toLocal = (lat: number, lng: number): PlanarPt => ({
      x: (lng - st.lng) * cosLat * earthKmPerDeg,
      y: (lat - st.lat) * earthKmPerDeg,
    });
    const toLngLat = (p: PlanarPt): GeoJsonCoordinate => [
      Number((st.lng + p.x / (cosLat * earthKmPerDeg)).toFixed(6)),
      Number((st.lat + p.y / earthKmPerDeg).toFixed(6)),
    ];

    // Start with a smooth 24-gon domain around station (km coordinates)
    let cell: PlanarPt[] = [];
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      cell.push({
        x: domainRadiusKm * Math.cos(a),
        y: domainRadiusKm * Math.sin(a),
      });
    }

    // Clip against perpendicular bisectors of nearby stations
    for (const other of active) {
      if (other.id === st.id) continue;
      const oLocal = toLocal(other.lat, other.lng);
      const dist = Math.hypot(oLocal.x, oLocal.y);
      if (dist > domainRadiusKm * 2.5 || dist < 0.01) continue;
      cell = clipPolygonAgainstHalfPlane(cell, 0, 0, oLocal.x, oLocal.y);
      if (cell.length < 3) break;
    }

    if (cell.length < 3) return;
    const ring = cell.map(toLngLat);
    ring.push(ring[0]);

    // Shoelace area in km^2
    let area2 = 0;
    for (let i = 0; i < cell.length; i++) {
      const p1 = cell[i];
      const p2 = cell[(i + 1) % cell.length];
      area2 += p1.x * p2.y - p2.x * p1.y;
    }
    const areaKm2 = Number((Math.abs(area2) / 2).toFixed(1));
    const color = VORONOI_PALETTE[idx % VORONOI_PALETTE.length];

    features.push({
      type: 'Feature',
      id: `voronoi-${st.id}`,
      properties: {
        id: `voronoi-${st.id}`,
        kind: 'voronoi',
        stationId: st.id,
        stationCode: st.code,
        areaKm2,
        nameSw: `Eneo la Kituo (Voronoi): ${st.name}`,
        nameEn: `Voronoi Catchment: ${st.name}`,
        descriptionSw: `Eneo la kijiografia (${areaKm2} km²) lililo karibu zaidi na ${st.name} bila kuingiliana na vituo vingine vya OILCOM.`,
        descriptionEn: `Exclusive non-overlapping catchment territory (${areaKm2} km²) closest to ${st.name}.`,
        eta: `${areaKm2} km²`,
        strokeColor: color,
        fillColor: color,
        fillOpacity: 0.14,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    });
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

export interface DemandCorridorAnchor {
  id: string;
  nameSw: string;
  nameEn: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  baseWeight: number;
  recommendedKind: 'both' | 'gas' | 'fuel';
  keywords: string[];
  // Urban morphology benchmarks modeled on Overture Maps themes (Buildings + Transportation)
  buildingDensityPerKm2: number;
  roadNetworkKmPerKm2: number;
  poiClusterScore: number;
  diurnalMultipliers: {
    morning: number;
    midday: number;
    evening: number;
    night: number;
  };
}

export const TANZANIA_DEMAND_ANCHORS: DemandCorridorAnchor[] = [
  {
    id: 'hub-kariakoo',
    nameSw: 'Kitovu cha Kariakoo & Ilala CBD',
    nameEn: 'Kariakoo & Ilala Commercial Core',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
    lat: -6.8195,
    lng: 39.2745,
    baseWeight: 92,
    recommendedKind: 'gas',
    keywords: ['kariakoo', 'ilala', 'posta', 'uhuru', 'msimbazi'],
    buildingDensityPerKm2: 4850,
    roadNetworkKmPerKm2: 18.4,
    poiClusterScore: 96,
    diurnalMultipliers: { morning: 1.05, midday: 1.12, evening: 0.96, night: 0.72 },
  },
  {
    id: 'hub-kinondoni',
    nameSw: 'Kinondoni, Mikocheni & Masaki',
    nameEn: 'Kinondoni, Mikocheni & Masaki Corridor',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
    lat: -6.7745,
    lng: 39.2615,
    baseWeight: 86,
    recommendedKind: 'both',
    keywords: ['kinondoni', 'mikocheni', 'masaki', 'mkubashini', 'mwinyi'],
    buildingDensityPerKm2: 3420,
    roadNetworkKmPerKm2: 14.9,
    poiClusterScore: 90,
    diurnalMultipliers: { morning: 0.98, midday: 1.02, evening: 1.14, night: 0.82 },
  },
  {
    id: 'hub-ubungo',
    nameSw: 'Ubungo, Kimara & Mbezi Luis (Morogoro Rd)',
    nameEn: 'Ubungo, Kimara & Mbezi Luis Transit Hub',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
    lat: -6.7878,
    lng: 39.1975,
    baseWeight: 88,
    recommendedKind: 'both',
    keywords: ['ubungo', 'kimara', 'morogoro', 'manzese', 'sinza'],
    buildingDensityPerKm2: 4180,
    roadNetworkKmPerKm2: 13.6,
    poiClusterScore: 91,
    diurnalMultipliers: { morning: 1.16, midday: 0.98, evening: 1.08, night: 0.92 },
  },
  {
    id: 'hub-kigamboni',
    nameSw: 'Kigamboni Ferry & Terminal Industrial',
    nameEn: 'Kigamboni Ferry & Depot Gateway',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
    lat: -6.8428,
    lng: 39.3085,
    baseWeight: 80,
    recommendedKind: 'both',
    keywords: ['kigamboni', 'ferry', 'kibada', 'vijibweni'],
    buildingDensityPerKm2: 1940,
    roadNetworkKmPerKm2: 9.8,
    poiClusterScore: 84,
    diurnalMultipliers: { morning: 1.1, midday: 1.05, evening: 0.94, night: 0.98 },
  },
  {
    id: 'hub-mbagala',
    nameSw: 'Mbagala Rangi Tatu & Kilwa Rd',
    nameEn: 'Mbagala Rangi Tatu & Kilwa Rd Corridor',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
    lat: -6.9125,
    lng: 39.2712,
    baseWeight: 84,
    recommendedKind: 'both',
    keywords: ['mbagala', 'kilwa', 'temeke', 'chamazi'],
    buildingDensityPerKm2: 4520,
    roadNetworkKmPerKm2: 12.1,
    poiClusterScore: 87,
    diurnalMultipliers: { morning: 1.08, midday: 0.94, evening: 1.15, night: 0.78 },
  },
  {
    id: 'hub-mbezi-beach',
    nameSw: 'Mbezi Beach, Tegeta & Bagamoyo Rd',
    nameEn: 'Mbezi Beach, Tegeta & Bagamoyo Rd',
    city: 'Dar es Salaam',
    region: 'Dar es Salaam',
    lat: -6.7065,
    lng: 39.2205,
    baseWeight: 74,
    recommendedKind: 'gas',
    keywords: ['mbezi', 'bagamoyo', 'kawe', 'tegeta', 'kunduchi'],
    buildingDensityPerKm2: 2680,
    roadNetworkKmPerKm2: 11.4,
    poiClusterScore: 82,
    diurnalMultipliers: { morning: 0.94, midday: 0.96, evening: 1.18, night: 0.7 },
  },
  {
    id: 'hub-arusha-cbd',
    nameSw: 'Arusha CBD, Sokoine & Njiro',
    nameEn: 'Arusha Central & Njiro Metro Hub',
    city: 'Arusha',
    region: 'Arusha',
    lat: -3.3715,
    lng: 36.6952,
    baseWeight: 78,
    recommendedKind: 'both',
    keywords: ['arusha', 'sokoine', 'clock tower', 'sakina', 'njiro'],
    buildingDensityPerKm2: 2890,
    roadNetworkKmPerKm2: 12.8,
    poiClusterScore: 86,
    diurnalMultipliers: { morning: 1.06, midday: 1.08, evening: 1.02, night: 0.74 },
  },
  {
    id: 'hub-mwanza-lake',
    nameSw: 'Mwanza Nyamagana & Ilemela',
    nameEn: 'Mwanza Nyamagana & Ilemela Lakefront',
    city: 'Mwanza',
    region: 'Mwanza',
    lat: -2.5155,
    lng: 32.9185,
    baseWeight: 76,
    recommendedKind: 'both',
    keywords: ['mwanza', 'nyamagana', 'kenyatta', 'ilemela'],
    buildingDensityPerKm2: 3120,
    roadNetworkKmPerKm2: 11.9,
    poiClusterScore: 85,
    diurnalMultipliers: { morning: 1.04, midday: 1.06, evening: 1.05, night: 0.76 },
  },
  {
    id: 'hub-dodoma-cbd',
    nameSw: 'Dodoma Mjini & Ukanda wa Serikali',
    nameEn: 'Dodoma Capital & Government Corridor',
    city: 'Dodoma',
    region: 'Dodoma',
    lat: -6.163,
    lng: 35.7516,
    baseWeight: 82,
    recommendedKind: 'both',
    keywords: ['dodoma', 'mtumba', 'uhindini', 'kisasa'],
    buildingDensityPerKm2: 2410,
    roadNetworkKmPerKm2: 13.2,
    poiClusterScore: 88,
    diurnalMultipliers: { morning: 1.08, midday: 1.12, evening: 0.98, night: 0.75 },
  },
  {
    id: 'hub-mbeya-uyole',
    nameSw: 'Mbeya Uyole & TAZARA Freight Hub',
    nameEn: 'Mbeya Uyole & Southern Highlands Corridor',
    city: 'Mbeya',
    region: 'Mbeya',
    lat: -8.9094,
    lng: 33.4608,
    baseWeight: 71,
    recommendedKind: 'fuel',
    keywords: ['mbeya', 'uyole', 'mwanjelwa'],
    buildingDensityPerKm2: 2150,
    roadNetworkKmPerKm2: 10.4,
    poiClusterScore: 79,
    diurnalMultipliers: { morning: 1.02, midday: 1.05, evening: 0.95, night: 1.1 },
  },
];

function computeOvertureMorphologyScore(anchor: DemandCorridorAnchor): number {
  const bldgNorm = Math.min(100, (anchor.buildingDensityPerKm2 / 5000) * 100);
  const roadNorm = Math.min(100, (anchor.roadNetworkKmPerKm2 / 20) * 100);
  return Math.round(
    bldgNorm * 0.4 + roadNorm * 0.3 + anchor.poiClusterScore * 0.3
  );
}

function getOrderTimeSlice(createdAt: unknown): Exclude<TimeSliceKey, 'all'> | null {
  if (!createdAt) return null;
  let d: Date | null = null;
  if (createdAt instanceof Date) {
    d = createdAt;
  } else if (typeof createdAt === 'object' && 'toDate' in createdAt) {
    try {
      d = (createdAt as { toDate: () => Date }).toDate();
    } catch {
      d = null;
    }
  } else if (typeof createdAt === 'string' || typeof createdAt === 'number') {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d) return null;
  const h = d.getHours();
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'midday';
  if (h >= 16 && h < 21) return 'evening';
  return 'night';
}

function matchOrderToAnchor(
  order: GasOrder,
  stations: Station[]
): DemandCorridorAnchor | null {
  if (order.stationId) {
    const st = stations.find((s) => s.id === order.stationId);
    if (st) {
      let best: DemandCorridorAnchor | null = null;
      let bestDist = Infinity;
      for (const anchor of TANZANIA_DEMAND_ANCHORS) {
        const d = haversineDistanceKm(st.lat, st.lng, anchor.lat, anchor.lng);
        if (d < bestDist) {
          bestDist = d;
          best = anchor;
        }
      }
      if (best && bestDist <= 18) return best;
    }
  }
  const haystack = (order.deliveryAddress || '').toLowerCase();
  if (!haystack) return null;
  for (const anchor of TANZANIA_DEMAND_ANCHORS) {
    if (anchor.keywords.some((kw) => haystack.includes(kw))) {
      return anchor;
    }
  }
  return null;
}

// Non-deprecated spatial demand density polygons with Temporal Time-Slider filtering
export function buildDemandHotspotsGeoJson(
  stations: Station[],
  orders: GasOrder[] = [],
  timeSlice: TimeSliceKey = 'all'
): GeoJsonFeatureCollection {
  const orderCounts = new Map<string, number>();
  orders.forEach((o) => {
    if (o.status === 'cancelled') return;
    if (timeSlice !== 'all') {
      const slice = getOrderTimeSlice(o.createdAt);
      if (slice && slice !== timeSlice) return;
    }
    const matched = matchOrderToAnchor(o, stations);
    if (matched) {
      orderCounts.set(matched.id, (orderCounts.get(matched.id) || 0) + 1);
    }
  });

  const features: GeoJsonFeature[] = TANZANIA_DEMAND_ANCHORS.map((anchor) => {
    const ordersCount = orderCounts.get(anchor.id) || 0;
    const nearbyStations = stations.filter(
      (s) =>
        s.status === 'active' &&
        haversineDistanceKm(s.lat, s.lng, anchor.lat, anchor.lng) <= 5
    ).length;

    const diurnalFactor =
      timeSlice === 'all' ? 1 : anchor.diurnalMultipliers[timeSlice];
    const score = Math.min(
      100,
      Math.round(
        anchor.baseWeight * diurnalFactor +
          ordersCount * 5 +
          (nearbyStations === 0 ? 5 : 0)
      )
    );
    const intensity: 'high' | 'medium' | 'low' =
      score >= 85 ? 'high' : score >= 74 ? 'medium' : 'low';
    const color =
      intensity === 'high'
        ? '#D92027'
        : intensity === 'medium'
          ? '#F5B800'
          : '#2563EB';
    const radiusKm = intensity === 'high' ? 2.4 : intensity === 'medium' ? 2.0 : 1.7;

    const timeLabelSw =
      timeSlice === 'morning'
        ? 'Asubuhi (06–11)'
        : timeSlice === 'midday'
          ? 'Mchana (11–16)'
          : timeSlice === 'evening'
            ? 'Jioni (16–21)'
            : timeSlice === 'night'
              ? 'Usiku (21–06)'
              : 'Saa 24';
    const timeLabelEn =
      timeSlice === 'morning'
        ? 'Morning (06–11)'
        : timeSlice === 'midday'
          ? 'Midday (11–16)'
          : timeSlice === 'evening'
            ? 'Evening (16–21)'
            : timeSlice === 'night'
              ? 'Night (21–06)'
              : 'All Day';

    return {
      type: 'Feature',
      id: `hotspot-${anchor.id}-${timeSlice}`,
      properties: {
        id: `hotspot-${anchor.id}-${timeSlice}`,
        kind: 'hotspot',
        intensity,
        demandScore: score,
        ordersCount,
        nearbyStations,
        timeSlice,
        buildingDensityPerKm2: anchor.buildingDensityPerKm2,
        roadNetworkKmPerKm2: anchor.roadNetworkKmPerKm2,
        overtureSuitabilityScore: computeOvertureMorphologyScore(anchor),
        nameSw: `Mahitaji (${timeLabelSw}): ${anchor.nameSw}`,
        nameEn: `Demand (${timeLabelEn}): ${anchor.nameEn}`,
        descriptionSw: `Kiwango cha mahitaji ${score}/100 · Oda: ${ordersCount} · Majengo (Overture): ${anchor.buildingDensityPerKm2}/km².`,
        descriptionEn: `Demand index ${score}/100 · Orders: ${ordersCount} · Building density: ${anchor.buildingDensityPerKm2}/km².`,
        strokeColor: color,
        fillColor: color,
        fillOpacity: intensity === 'high' ? 0.34 : intensity === 'medium' ? 0.28 : 0.22,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [createBufferCircleRing(anchor.lat, anchor.lng, radiusKm, 12)],
      },
    };
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

export function buildBBoxGeoJsonFeature(box: GeoBoundingBox): GeoJsonFeature {
  return {
    type: 'Feature',
    id: 'spatial-filter-bbox',
    properties: {
      id: 'spatial-filter-bbox',
      kind: 'bbox',
      nameSw: 'Eneo la Uchambuzi (Spatial BBox)',
      nameEn: 'Active Spatial Filter Bounding Box',
      descriptionSw: `Kaskazini ${box.north.toFixed(4)}, Kusini ${box.south.toFixed(4)}, Magharibi ${box.west.toFixed(4)}, Mashariki ${box.east.toFixed(4)}`,
      descriptionEn: `North ${box.north.toFixed(4)}, South ${box.south.toFixed(4)}, West ${box.west.toFixed(4)}, East ${box.east.toFixed(4)}`,
      strokeColor: '#F5B800',
      fillColor: '#F5B800',
      fillOpacity: 0.14,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [box.west, box.south],
          [box.east, box.south],
          [box.east, box.north],
          [box.west, box.north],
          [box.west, box.south],
        ],
      ],
    },
  };
}

export interface SpatialBBoxStats {
  stationsCount: number;
  totalPumps: number;
  totalLpgCylinders: number;
  ordersCount: number;
  revenueTzs: number;
  demandHubsCount: number;
  avgOvertureScore: number;
  areaKm2: number;
  matchedStations: Station[];
}

export function analyzeSpatialBBox(
  box: GeoBoundingBox,
  stations: Station[],
  orders: GasOrder[] = []
): SpatialBBoxStats {
  const inBox = (lat: number, lng: number) =>
    lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east;

  const matchedStations = stations.filter((s) => inBox(s.lat, s.lng));
  const stationIdSet = new Set(matchedStations.map((s) => s.id));

  const totalPumps = matchedStations.reduce(
    (sum, s) => sum + (s.pumpsCount || 0),
    0
  );
  const totalLpgCylinders = matchedStations.reduce(
    (sum, s) =>
      sum + (s.lpg6kgStock || 0) + (s.lpg15kgStock || 0) + (s.lpg38kgStock || 0),
    0
  );

  const anchorsInBox = TANZANIA_DEMAND_ANCHORS.filter((a) => inBox(a.lat, a.lng));
  const anchorIdSet = new Set(anchorsInBox.map((a) => a.id));

  const matchedOrders = orders.filter((o) => {
    if (o.status === 'cancelled') return false;
    if (o.stationId && stationIdSet.has(o.stationId)) return true;
    const matchedAnchor = matchOrderToAnchor(o, stations);
    return matchedAnchor ? anchorIdSet.has(matchedAnchor.id) : false;
  });

  const revenueTzs = matchedOrders.reduce((sum, o) => sum + o.totalTzs, 0);
  const avgOvertureScore =
    anchorsInBox.length > 0
      ? Math.round(
          anchorsInBox.reduce(
            (sum, a) => sum + computeOvertureMorphologyScore(a),
            0
          ) / anchorsInBox.length
        )
      : 0;

  const widthKm = haversineDistanceKm(
    (box.south + box.north) / 2,
    box.west,
    (box.south + box.north) / 2,
    box.east
  );
  const heightKm = haversineDistanceKm(box.south, box.west, box.north, box.west);
  const areaKm2 = Number((widthKm * heightKm).toFixed(1));

  return {
    stationsCount: matchedStations.length,
    totalPumps,
    totalLpgCylinders,
    ordersCount: matchedOrders.length,
    revenueTzs,
    demandHubsCount: anchorsInBox.length,
    avgOvertureScore,
    areaKm2,
    matchedStations,
  };
}

export interface StationCoverageMetric {
  stationId: string;
  code: string;
  name: string;
  city: string;
  stationKind: 'fuel' | 'gas' | 'both';
  nearestSiblingKm: number | null;
  matchedZoneNameSw: string | null;
  matchedZoneNameEn: string | null;
  ordersCount: number;
  lpgCapacityUnits: number;
  pumpsCount: number;
}

export interface ExpansionSiteCandidate {
  id: string;
  nameSw: string;
  nameEn: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  nearestStationName: string;
  nearestStationKm: number;
  demandScore: number;
  buildingDensityPerKm2: number;
  roadNetworkKmPerKm2: number;
  overtureSuitabilityScore: number;
  linkedOrdersCount: number;
  coverageStatus: 'unserved' | 'partial' | 'covered';
  recommendedKind: 'both' | 'gas' | 'fuel';
}

export interface GeospatialNetworkSummary {
  activeStationsCount: number;
  deliveryZonesCount: number;
  supplyCorridorsCount: number;
  avgNearestStationKm: number;
  ordersInZonesCount: number;
  ordersOutsideZonesCount: number;
  unservedCandidatesCount: number;
  zoneCoveragePct: number;
  avgOvertureNetworkScore: number;
  stationMetrics: StationCoverageMetric[];
  expansionCandidates: ExpansionSiteCandidate[];
}

export function analyzeGeospatialNetwork(
  stations: Station[],
  orders: GasOrder[],
  radiusKm = 5
): GeospatialNetworkSummary {
  const activeStations = stations.filter(
    (s) => s.status === 'active' && Number.isFinite(s.lat) && Number.isFinite(s.lng)
  );

  const stationMetrics: StationCoverageMetric[] = stations.map((st) => {
    let nearestDist: number | null = null;
    for (const other of activeStations) {
      if (other.id === st.id) continue;
      const d = haversineDistanceKm(st.lat, st.lng, other.lat, other.lng);
      if (nearestDist === null || d < nearestDist) {
        nearestDist = d;
      }
    }
    const zone = findGisZoneForCoords(st.lat, st.lng);
    const stOrders = orders.filter(
      (o) => o.stationId === st.id && o.status !== 'cancelled'
    ).length;
    const lpgCapacityUnits =
      (st.lpg6kgStock || 0) + (st.lpg15kgStock || 0) + (st.lpg38kgStock || 0);
    const kind: 'fuel' | 'gas' | 'both' =
      st.stationKind ||
      (st.hasFuel !== false && st.hasGas !== false
        ? 'both'
        : st.hasGas !== false
          ? 'gas'
          : 'fuel');

    return {
      stationId: st.id,
      code: st.code,
      name: st.name,
      city: st.city,
      stationKind: kind,
      nearestSiblingKm:
        nearestDist !== null ? Number(nearestDist.toFixed(1)) : null,
      matchedZoneNameSw: zone?.nameSw || null,
      matchedZoneNameEn: zone?.nameEn || null,
      ordersCount: stOrders,
      lpgCapacityUnits,
      pumpsCount: st.pumpsCount || 0,
    };
  });

  const validSpacings = stationMetrics
    .map((m) => m.nearestSiblingKm)
    .filter((v): v is number => v !== null);
  const avgNearestStationKm =
    validSpacings.length > 0
      ? Number(
          (
            validSpacings.reduce((sum, v) => sum + v, 0) / validSpacings.length
          ).toFixed(1)
        )
      : 0;

  let ordersInZonesCount = 0;
  let ordersOutsideZonesCount = 0;
  orders.forEach((o) => {
    if (o.status === 'cancelled') return;
    const matchedAnchor = matchOrderToAnchor(o, stations);
    const linkedStation = o.stationId
      ? stations.find((s) => s.id === o.stationId)
      : undefined;
    const refLat = linkedStation?.lat ?? matchedAnchor?.lat;
    const refLng = linkedStation?.lng ?? matchedAnchor?.lng;

    if (refLat !== undefined && refLng !== undefined) {
      const nearestStDist = activeStations.reduce((best, s) => {
        const d = haversineDistanceKm(refLat, refLng, s.lat, s.lng);
        return Math.min(best, d);
      }, Infinity);
      if (nearestStDist <= radiusKm || findGisZoneForCoords(refLat, refLng) !== null) {
        ordersInZonesCount += 1;
      } else {
        ordersOutsideZonesCount += 1;
      }
    } else {
      ordersOutsideZonesCount += 1;
    }
  });

  const totalEvalOrders = ordersInZonesCount + ordersOutsideZonesCount;
  const zoneCoveragePct =
    totalEvalOrders > 0
      ? Math.round((ordersInZonesCount / totalEvalOrders) * 100)
      : activeStations.length > 0
        ? Math.min(
            100,
            Math.round(
              (TANZANIA_DEMAND_ANCHORS.filter((a) =>
                activeStations.some(
                  (s) => haversineDistanceKm(s.lat, s.lng, a.lat, a.lng) <= radiusKm
                )
              ).length /
                TANZANIA_DEMAND_ANCHORS.length) *
                100
            )
          )
        : 0;

  const expansionCandidates: ExpansionSiteCandidate[] = TANZANIA_DEMAND_ANCHORS.map(
    (anchor) => {
      let nearestStationName = '—';
      let nearestStationKm = 999;
      let nearestHasGas = false;
      let nearestHasFuel = false;

      activeStations.forEach((s) => {
        const d = haversineDistanceKm(anchor.lat, anchor.lng, s.lat, s.lng);
        if (d < nearestStationKm) {
          nearestStationKm = d;
          nearestStationName = s.name;
          nearestHasGas = s.hasGas !== false;
          nearestHasFuel = s.hasFuel !== false;
        }
      });

      const linkedOrdersCount = orders.filter((o) => {
        if (o.status === 'cancelled') return false;
        return matchOrderToAnchor(o, stations)?.id === anchor.id;
      }).length;

      let coverageStatus: 'unserved' | 'partial' | 'covered' = 'covered';
      if (nearestStationKm > radiusKm) {
        coverageStatus = 'unserved';
      } else if (
        (anchor.recommendedKind === 'both' && (!nearestHasGas || !nearestHasFuel)) ||
        (anchor.recommendedKind === 'gas' && !nearestHasGas) ||
        (anchor.recommendedKind === 'fuel' && !nearestHasFuel)
      ) {
        coverageStatus = 'partial';
      }

      const morphology = computeOvertureMorphologyScore(anchor);
      const demandScore = Math.min(100, anchor.baseWeight + linkedOrdersCount * 4);
      const overtureSuitabilityScore = Math.min(
        100,
        Math.round(morphology * 0.5 + demandScore * 0.5)
      );

      return {
        id: anchor.id,
        nameSw: anchor.nameSw,
        nameEn: anchor.nameEn,
        city: anchor.city,
        region: anchor.region,
        lat: anchor.lat,
        lng: anchor.lng,
        nearestStationName,
        nearestStationKm:
          activeStations.length > 0 ? Number(nearestStationKm.toFixed(1)) : 0,
        demandScore,
        buildingDensityPerKm2: anchor.buildingDensityPerKm2,
        roadNetworkKmPerKm2: anchor.roadNetworkKmPerKm2,
        overtureSuitabilityScore,
        linkedOrdersCount,
        coverageStatus,
        recommendedKind: anchor.recommendedKind,
      };
    }
  ).sort((a, b) => {
    const rank = { unserved: 0, partial: 1, covered: 2 };
    if (rank[a.coverageStatus] !== rank[b.coverageStatus]) {
      return rank[a.coverageStatus] - rank[b.coverageStatus];
    }
    return b.overtureSuitabilityScore - a.overtureSuitabilityScore;
  });

  const avgOvertureNetworkScore =
    expansionCandidates.length > 0
      ? Math.round(
          expansionCandidates.reduce(
            (sum, c) => sum + c.overtureSuitabilityScore,
            0
          ) / expansionCandidates.length
        )
      : 0;

  const zonesCount = OILCOM_GIS_FEATURE_COLLECTION.features.filter(
    (f) => f.properties?.kind === 'zone'
  ).length;
  const corridorsCount = OILCOM_GIS_FEATURE_COLLECTION.features.filter(
    (f) => f.properties?.kind === 'corridor'
  ).length;

  return {
    activeStationsCount: activeStations.length,
    deliveryZonesCount: zonesCount,
    supplyCorridorsCount: corridorsCount,
    avgNearestStationKm,
    ordersInZonesCount,
    ordersOutsideZonesCount,
    unservedCandidatesCount: expansionCandidates.filter(
      (c) => c.coverageStatus !== 'covered'
    ).length,
    zoneCoveragePct,
    avgOvertureNetworkScore,
    stationMetrics,
    expansionCandidates,
  };
}

// Build an RFC 7946 OGC GeoJSON bundle (zero PII) ready for QGIS or leafmap
export function buildOilcomGeoJsonExport(
  stations: Station[],
  orders: GasOrder[] = [],
  radiusKm = 5,
  options?: {
    includeStations?: boolean;
    includeZones?: boolean;
    includeBuffers?: boolean;
    includeVoronoi?: boolean;
    includeHotspots?: boolean;
    timeSlice?: TimeSliceKey;
    customFeatures?: GeoJsonFeature[];
  }
): GeoJsonFeatureCollection {
  const {
    includeStations = true,
    includeZones = true,
    includeBuffers = true,
    includeVoronoi = true,
    includeHotspots = true,
    timeSlice = 'all',
    customFeatures = [],
  } = options || {};

  const features: GeoJsonFeature[] = [];

  if (includeZones) {
    features.push(...OILCOM_GIS_FEATURE_COLLECTION.features);
  }

  if (includeStations) {
    stations.forEach((st) => {
      if (!Number.isFinite(st.lat) || !Number.isFinite(st.lng)) return;
      features.push({
        type: 'Feature',
        id: `station-${st.id}`,
        properties: {
          id: `station-${st.id}`,
          kind: 'station',
          code: st.code,
          name: st.name,
          stationKind: st.stationKind || 'both',
          city: st.city,
          region: st.region,
          address: st.address,
          open24Hours: Boolean(st.open24Hours),
          hasGas: st.hasGas !== false,
          hasFuel: st.hasFuel !== false,
          hasLubricants: Boolean(st.hasLubricants),
          pumpsCount: st.pumpsCount ?? 0,
          lpgTotalCylinders:
            (st.lpg6kgStock || 0) + (st.lpg15kgStock || 0) + (st.lpg38kgStock || 0),
          status: st.status,
          strokeColor: '#0B2A6F',
          fillColor: '#F5B800',
        },
        geometry: {
          type: 'Point',
          coordinates: [st.lng, st.lat],
        },
      });
    });
  }

  if (includeBuffers && radiusKm > 0) {
    features.push(...buildStationBuffersGeoJson(stations, radiusKm).features);
  }

  if (includeVoronoi) {
    features.push(...buildStationVoronoiGeoJson(stations).features);
  }

  if (includeHotspots) {
    features.push(...buildDemandHotspotsGeoJson(stations, orders, timeSlice).features);
  }

  if (customFeatures.length > 0) {
    features.push(...customFeatures);
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export function downloadGeoJsonFile(
  filename: string,
  fc: GeoJsonFeatureCollection
): void {
  const json = JSON.stringify(fc, null, 2);
  const blob = new Blob([json], {
    type: 'application/geo+json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.geojson') ? filename : `${filename}.geojson`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/csv;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Convert GeoJSON [lng, lat] geometries into Google Maps 3D overlay coordinates
export function extract3DOverlaysFromGeoJson(
  fc: GeoJsonFeatureCollection
): Parsed3DOverlays {
  const polygons: Parsed3DPolygonOverlay[] = [];
  const polylines: Parsed3DPolylineOverlay[] = [];
  const points: Parsed3DPointOverlay[] = [];

  const handleGeometry = (
    geom: GeoJsonGeometry | null,
    feature: GeoJsonFeature,
    baseKey: string
  ) => {
    if (!geom) return;
    const kind = String(feature.properties?.kind ?? 'zone');
    const strokeColor =
      typeof feature.properties?.strokeColor === 'string'
        ? feature.properties.strokeColor
        : '#2563EB';
    const baseFill =
      typeof feature.properties?.fillColor === 'string'
        ? feature.properties.fillColor
        : strokeColor;
    const alpha =
      typeof feature.properties?.fillOpacity === 'number'
        ? feature.properties.fillOpacity
        : kind === 'buffer'
          ? 0.12
          : kind === 'voronoi'
            ? 0.15
            : kind === 'hotspot'
              ? 0.34
              : 0.24;
    const fillColor = hexToRgba(baseFill, alpha);
    const polyAltitude =
      kind === 'hotspot'
        ? 65
        : kind === 'bbox'
          ? 52
          : kind === 'voronoi'
            ? 28
            : kind === 'buffer'
              ? 20
              : 42;
    const label = String(
      feature.properties?.nameSw ||
        feature.properties?.nameEn ||
        feature.properties?.name ||
        feature.properties?.id ||
        baseKey
    );

    if (geom.type === 'Point') {
      const [lng, lat, alt] = geom.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push({
          key: baseKey,
          position: { lat, lng, altitude: Number.isFinite(alt) ? alt! : 35 },
          label,
          feature,
        });
      }
      return;
    }

    if (geom.type === 'MultiPoint') {
      geom.coordinates.forEach(([lng, lat, alt], idx) => {
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          points.push({
            key: `${baseKey}-pt-${idx}`,
            position: { lat, lng, altitude: Number.isFinite(alt) ? alt! : 35 },
            label,
            feature,
          });
        }
      });
      return;
    }

    if (geom.type === 'LineString') {
      const coords = geom.coordinates
        .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
        .map(([lng, lat, alt]) => ({
          lat,
          lng,
          altitude: Number.isFinite(alt) ? alt! : 6,
        }));
      if (coords.length >= 2) {
        polylines.push({
          key: baseKey,
          coordinates: coords,
          strokeColor,
          feature,
        });
      }
      return;
    }

    if (geom.type === 'MultiLineString') {
      geom.coordinates.forEach((line, idx) => {
        const coords = line
          .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
          .map(([lng, lat, alt]) => ({
            lat,
            lng,
            altitude: Number.isFinite(alt) ? alt! : 6,
          }));
        if (coords.length >= 2) {
          polylines.push({
            key: `${baseKey}-line-${idx}`,
            coordinates: coords,
            strokeColor,
            feature,
          });
        }
      });
      return;
    }

    if (geom.type === 'Polygon') {
      const [outer, ...holes] = geom.coordinates;
      if (!outer || outer.length < 3) return;
      const outerCoordinates = outer
        .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
        .map(([lng, lat, alt]) => ({
          lat,
          lng,
          altitude: Number.isFinite(alt) ? alt! : polyAltitude,
        }));
      if (outerCoordinates.length < 3) return;
      const innerCoordinates = holes
        .map((ring) =>
          ring
            .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
            .map(([lng, lat, alt]) => ({
              lat,
              lng,
              altitude: Number.isFinite(alt) ? alt! : polyAltitude,
            }))
        )
        .filter((ring) => ring.length >= 3);
      polygons.push({
        key: baseKey,
        outerCoordinates,
        innerCoordinates: innerCoordinates.length > 0 ? innerCoordinates : undefined,
        fillColor,
        strokeColor,
        feature,
      });
      return;
    }

    if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((polyCoords, idx) => {
        const [outer, ...holes] = polyCoords;
        if (!outer || outer.length < 3) return;
        const outerCoordinates = outer
          .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
          .map(([lng, lat, alt]) => ({
            lat,
            lng,
            altitude: Number.isFinite(alt) ? alt! : polyAltitude,
          }));
        if (outerCoordinates.length < 3) return;
        const innerCoordinates = holes
          .map((ring) =>
            ring
              .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
              .map(([lng, lat, alt]) => ({
                lat,
                lng,
                altitude: Number.isFinite(alt) ? alt! : polyAltitude,
              }))
          )
          .filter((ring) => ring.length >= 3);
        polygons.push({
          key: `${baseKey}-poly-${idx}`,
          outerCoordinates,
          innerCoordinates: innerCoordinates.length > 0 ? innerCoordinates : undefined,
          fillColor,
          strokeColor,
          feature,
        });
      });
      return;
    }

    if (geom.type === 'GeometryCollection') {
      geom.geometries.forEach((sub, idx) => {
        handleGeometry(sub, feature, `${baseKey}-gc-${idx}`);
      });
    }
  };

  fc.features.forEach((feature, idx) => {
    const baseKey = String(feature.properties?.id ?? feature.id ?? `gis-${idx}`);
    handleGeometry(feature.geometry, feature, baseKey);
  });

  return { polygons, polylines, points };
}

export function extractGeoJsonPoints(
  fc: GeoJsonFeatureCollection
): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];

  const collect = (geom: GeoJsonGeometry | null) => {
    if (!geom) return;
    if (geom.type === 'Point') {
      const [lng, lat] = geom.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng });
    } else if (geom.type === 'MultiPoint' || geom.type === 'LineString') {
      geom.coordinates.forEach(([lng, lat]) => {
        if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng });
      });
    } else if (geom.type === 'MultiLineString' || geom.type === 'Polygon') {
      geom.coordinates.forEach((ring) =>
        ring.forEach(([lng, lat]) => {
          if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng });
        })
      );
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((poly) =>
        poly.forEach((ring) =>
          ring.forEach(([lng, lat]) => {
            if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng });
          })
        )
      );
    } else if (geom.type === 'GeometryCollection') {
      geom.geometries.forEach(collect);
    }
  };

  fc.features.forEach((f) => collect(f.geometry));
  return pts;
}

export interface MatchedGisZone {
  id: string;
  nameSw: string;
  nameEn: string;
  eta: string;
  feeTzs: number;
  strokeColor: string;
}

function pointInRing(lat: number, lng: number, ring: GeoJsonCoordinate[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonRings(
  lat: number,
  lng: number,
  rings: GeoJsonCoordinate[][]
): boolean {
  if (rings.length === 0 || !pointInRing(lat, lng, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(lat, lng, rings[h])) return false;
  }
  return true;
}

export function findGisZoneForCoords(
  lat: number,
  lng: number,
  fc: GeoJsonFeatureCollection = OILCOM_GIS_FEATURE_COLLECTION
): MatchedGisZone | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const feat of fc.features) {
    const geom = feat.geometry;
    if (!geom) continue;
    let matched = false;
    if (geom.type === 'Polygon') {
      matched = pointInPolygonRings(lat, lng, geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      matched = geom.coordinates.some((poly) =>
        pointInPolygonRings(lat, lng, poly)
      );
    }
    if (matched) {
      const p = feat.properties || {};
      return {
        id: String(p.id || feat.id || 'zone'),
        nameSw: String(p.nameSw || p.name || 'Kanda ya OILCOM'),
        nameEn: String(p.nameEn || p.name || 'OILCOM Delivery Zone'),
        eta: String(p.eta || '25–40 min'),
        feeTzs: typeof p.feeTzs === 'number' ? p.feeTzs : 2500,
        strokeColor:
          typeof p.strokeColor === 'string' ? p.strokeColor : '#2563EB',
      };
    }
  }
  return null;
}

export function haversineDistanceKm(
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
