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

export interface OilcomGisFeatureProperties {
  id?: string;
  kind?: 'zone' | 'corridor' | 'custom';
  nameSw?: string;
  nameEn?: string;
  name?: string;
  descriptionSw?: string;
  descriptionEn?: string;
  eta?: string;
  feeTzs?: number;
  strokeColor?: string;
  fillColor?: string;
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

// Built-in Open Geospatial (OGC GeoJSON) layer covering OILCOM Delivery Zones & Supply Corridors
export const OILCOM_GIS_FEATURE_COLLECTION: GeoJsonFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'zone-kinondoni',
      properties: {
        id: 'zone-kinondoni',
        kind: 'zone',
        nameSw: 'Kanda ya Kinondoni & Mikocheni (Gesi Haraka)',
        nameEn: 'Kinondoni & Mikocheni Fast LPG Zone',
        descriptionSw: 'Usafirishaji wa mitungi ya 6kg, 15kg na 38kg kutoka kituo cha Mkubashini.',
        descriptionEn: 'Fast cylinder dispatch (6kg, 15kg, 38kg) served from OILCOM Mkubashini.',
        eta: '20–30 min',
        feeTzs: 2500,
        strokeColor: '#2563EB',
        fillColor: '#2563EB',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [39.241, -6.792],
            [39.281, -6.792],
            [39.281, -6.756],
            [39.241, -6.756],
            [39.241, -6.792],
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
        nameSw: 'Kanda ya Kariakoo, Ilala & Posta (Express)',
        nameEn: 'Kariakoo, Ilala & CBD Express Zone',
        descriptionSw: 'Huduma ya haraka katikati ya jiji kwa biashara na makazi 24/7.',
        descriptionEn: '24/7 urban express zone for CBD households and commercial LPG accounts.',
        eta: '15–25 min',
        feeTzs: 2000,
        strokeColor: '#F5B800',
        fillColor: '#F5B800',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [39.256, -6.837],
            [39.298, -6.837],
            [39.298, -6.803],
            [39.256, -6.803],
            [39.256, -6.837],
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
        nameSw: 'Kanda ya Mbezi Beach & Bagamoyo Rd',
        nameEn: 'Mbezi Beach & Bagamoyo Rd Zone',
        descriptionSw: 'Usambazaji wa gesi na vilainishi ukanda wa kaskazini wa pwani.',
        descriptionEn: 'Northern coastal LPG & lubricants delivery zone along Bagamoyo Road.',
        eta: '25–40 min',
        feeTzs: 3000,
        strokeColor: '#D92027',
        fillColor: '#D92027',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [39.201, -6.734],
            [39.244, -6.734],
            [39.244, -6.692],
            [39.201, -6.692],
            [39.201, -6.734],
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
        nameSw: 'Kanda ya Arusha Mjini (Clock Tower)',
        nameEn: 'Arusha CBD Metro Zone',
        descriptionSw: 'Usafirishaji wa OILCOM Gas na mafuta ya meli za kibiashara Arusha.',
        descriptionEn: 'OILCOM LPG & fleet refueling coverage across central Arusha.',
        eta: '20–35 min',
        feeTzs: 2500,
        strokeColor: '#2563EB',
        fillColor: '#2563EB',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [36.672, -3.39],
            [36.718, -3.39],
            [36.718, -3.35],
            [36.672, -3.35],
            [36.672, -3.39],
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
        nameSw: 'Kanda ya Mwanza Nyamagana (Kanda ya Ziwa)',
        nameEn: 'Mwanza Nyamagana Lake Zone',
        descriptionSw: 'Huduma ya OILCOM kwa wakazi na biashara za Nyamagana na Ilemela.',
        descriptionEn: 'OILCOM LPG & station logistics zone serving Nyamagana and lakefront hubs.',
        eta: '20–35 min',
        feeTzs: 2500,
        strokeColor: '#F5B800',
        fillColor: '#F5B800',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [32.896, -2.536],
            [32.94, -2.536],
            [32.94, -2.496],
            [32.896, -2.496],
            [32.896, -2.536],
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
        nameSw: 'Ukanda wa Usambazaji Dar (Kigamboni → Mbezi)',
        nameEn: 'Dar Supply Corridor (Kigamboni → Mbezi)',
        descriptionSw: 'Njia kuu ya malori ya mafuta na LPG kuunganisha vituo vya Dar es Salaam.',
        descriptionEn: 'Primary tanker & LPG feeder corridor linking Kigamboni Terminal to Dar hubs.',
        eta: 'Active Corridor',
        strokeColor: '#F5B800',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [39.2955, -6.8435],
          [39.2766, -6.8205],
          [39.2612, -6.7749],
          [39.2228, -6.7124],
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
    const strokeColor =
      typeof feature.properties?.strokeColor === 'string'
        ? feature.properties.strokeColor
        : '#2563EB';
    const baseFill =
      typeof feature.properties?.fillColor === 'string'
        ? feature.properties.fillColor
        : strokeColor;
    const fillColor = hexToRgba(baseFill, 0.26);
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
          altitude: Number.isFinite(alt) ? alt! : 45,
        }));
      if (outerCoordinates.length < 3) return;
      const innerCoordinates = holes
        .map((ring) =>
          ring
            .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
            .map(([lng, lat, alt]) => ({
              lat,
              lng,
              altitude: Number.isFinite(alt) ? alt! : 45,
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
            altitude: Number.isFinite(alt) ? alt! : 45,
          }));
        if (outerCoordinates.length < 3) return;
        const innerCoordinates = holes
          .map((ring) =>
            ring
              .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
              .map(([lng, lat, alt]) => ({
                lat,
                lng,
                altitude: Number.isFinite(alt) ? alt! : 45,
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

