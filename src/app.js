'use strict';

// App config
const CONFIG = {
  layers: {
    urban:     { typename: 'lt_c_uq121', color: '#3b82f6', label: '용도지역/지구 (도시계획)' },
    greenbelt: { typename: 'lt_c_ud801', color: '#ef4444', label: '개발제한구역(그린벨트)' },
    landscape: { typename: 'lt_c_uq121', color: '#f97316', label: '경관지구' },
    slope:     { typename: 'lt_c_up401', color: '#22c55e', label: '급경사지역' },
    forest:    { typename: 'lt_c_uf211', color: '#059669', label: '산림보호구역' },
    habitat:   { typename: 'lt_c_em011', color: '#7c3aed', label: '생태자연도 1등급' },
    wetland:   { typename: 'lt_c_wkmstrm', color: '#0891b2', label: '하천/습지보호구역' },
    cultural:  { typename: 'lt_c_uh111', color: '#dc2626', label: '문화재보호구역' },
    military:  { typename: 'lt_c_um111', color: '#991b1b', label: '군사시설보호구역' }
  }
};

const state = {
  key: '',
  domain: '',
  fetched: {}, // layerKey -> boolean
  capabilities: null, // cached capabilities text
  availableTypenames: null // Set of available typenames parsed from capabilities
};

// Helpers
const $ = (id) => document.getElementById(id);
const setLoading = (on) => {
  const el = $('loading');
  if (!el) return;
  el.classList.toggle('hidden', !on);
};
const updateCount = (key, count) => {
  const el = $('cnt-' + key);
  if (el) el.textContent = typeof count === 'number' ? String(count) : '-';
};

// Build map
const map = new maplibregl.Map({
  container: 'map',
  style: { version: 8, sources: {}, layers: [] },
  center: [127.5, 36.3],
  zoom: 7,
  attributionControl: true
});

const Draw = new MapboxDraw({
  displayControlsDefault: false,
  controls: { polygon: true, trash: true },
  styles: [
    // Active polygon fill while drawing
    {
      id: 'gl-draw-polygon-fill-active-strong', type: 'fill', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
      paint: { 'fill-color': '#22c55e', 'fill-outline-color': '#16a34a', 'fill-opacity': 0.2 }
    },
    // Inactive polygon fill
    {
      id: 'gl-draw-polygon-fill-inactive-strong', type: 'fill', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
      paint: { 'fill-color': '#22c55e', 'fill-outline-color': '#16a34a', 'fill-opacity': 0.1 }
    },
    // Polygon stroke
    {
      id: 'gl-draw-polygon-stroke-active-strong', type: 'line', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#16a34a', 'line-width': 3 }
    },
    {
      id: 'gl-draw-polygon-stroke-inactive-strong', type: 'line', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#16a34a', 'line-width': 2 }
    },
    // Vertex points
    {
      id: 'gl-draw-points-active', type: 'circle', filter: ['all', ['==', 'meta', 'feature'], ['==', '$type', 'Point']],
      paint: { 'circle-radius': 5, 'circle-color': '#22c55e', 'circle-stroke-color': '#064e3b', 'circle-stroke-width': 1 }
    },
    {
      id: 'gl-draw-points-mid', type: 'circle', filter: ['all', ['==', 'meta', 'midpoint'], ['==', '$type', 'Point']],
      paint: { 'circle-radius': 4, 'circle-color': '#f59e0b' }
    }
  ]
});
// Place Draw controls on the top-right so they are not hidden behind the left panel
map.addControl(Draw, 'top-right');
map.addControl(new maplibregl.NavigationControl(), 'top-right');

map.on('load', () => {
  // Basemap (OSM raster)
  if (!map.getSource('osm')) {
    map.addSource('osm', {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors'
    });
    map.addLayer({ id: 'osm', type: 'raster', source: 'osm' }, undefined);
  }
});

// AOI helpers
function getAoiFeature() {
  const fc = Draw.getAll();
  return fc.features && fc.features[0] ? fc.features[0] : null;
}

function getAoiFC() {
  const aoi = getAoiFeature();
  return aoi ? { type: 'FeatureCollection', features: [aoi] } : null;
}

function ensureAoiLayer() {
  syncAoiLayers(false);
}

function syncAoiLayers(updateOnly) {
  const fc = getAoiFC();
  if (!fc) return;
  const hasSrc = !!map.getSource('aoi');
  if (!hasSrc && !updateOnly) {
    map.addSource('aoi', { type: 'geojson', data: fc });
    map.addLayer({ id: 'aoi-fill', type: 'fill', source: 'aoi', paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': '#22c55e', 'line-width': 3 } });
  } else if (hasSrc) {
    map.getSource('aoi').setData(fc);
  }
  // Create/update vertex points for better visibility
  const pts = buildAoiVertexPoints(fc);
  const hasPts = !!map.getSource('aoi-pts');
  if (!hasPts && !updateOnly) {
    map.addSource('aoi-pts', { type: 'geojson', data: pts });
    map.addLayer({ id: 'aoi-points', type: 'circle', source: 'aoi-pts', paint: { 'circle-radius': 4, 'circle-color': '#16a34a', 'circle-stroke-color': '#064e3b', 'circle-stroke-width': 1 } });
  } else if (hasPts) {
    map.getSource('aoi-pts').setData(pts);
  }
  updateAoiBboxMerc();
}

function fitToAoi() {
  const aoi = getAoiFeature();
  if (!aoi) return alert('AOI 폴리곤을 먼저 그려주세요.');
  const b = turf.bbox(aoi);
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, duration: 800 });
}

// Simple lon/lat (EPSG:4326) to WebMercator (EPSG:900913) conversion
function lonLatToMercator(lon, lat) {
  const R = 6378137.0;
  const max = 85.05112878;
  const clampedLat = Math.max(Math.min(lat, max), -max);
  const x = (lon * Math.PI / 180) * R;
  const y = Math.log(Math.tan((Math.PI / 4) + (clampedLat * Math.PI / 360))) * R;
  return [x, y];
}

function mercatorToLonLat(x, y) {
  const R = 6378137.0;
  const lon = (x / R) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);

  // Debug first few conversions
  if (Math.random() < 0.001) {  // Log only 0.1% to avoid spam
    console.log(`Mercator to LonLat: (${x}, ${y}) -> (${lon}, ${lat})`);
  }

  return [lon, lat];
}

// Convert a GeoJSON FeatureCollection from EPSG:900913 (WebMercator meters)
// back to EPSG:4326 (lon/lat in degrees) so MapLibre can render it.
function convertFc900913To4326(fc) {
  if (!fc || typeof fc !== 'object') return fc;
  if (fc.type === 'FeatureCollection' && Array.isArray(fc.features)) {
    return {
      type: 'FeatureCollection',
      features: fc.features.map((f) => convertFeature900913To4326(f))
    };
  }
  if (fc.type === 'Feature') return convertFeature900913To4326(fc);
  if (fc.type && fc.coordinates) {
    return { type: 'FeatureCollection', features: [ { type: 'Feature', properties: {}, geometry: convertGeometry900913To4326(fc) } ] };
  }
  return fc;
}

function convertFeature900913To4326(feat) {
  if (!feat) return feat;
  const out = {
    type: 'Feature',
    properties: feat.properties || {},
    bbox: feat.bbox,
    id: feat.id  // Preserve feature ID
  };
  out.geometry = convertGeometry900913To4326(feat.geometry);
  return out;
}

function convertGeometry900913To4326(geom) {
  if (!geom) return geom;
  const t = geom.type;
  const c = geom.coordinates;
  switch (t) {
    case 'Point':
      return { type: 'Point', coordinates: mercatorToLonLat(c[0], c[1]) };
    case 'MultiPoint':
      return { type: 'MultiPoint', coordinates: c.map((p) => mercatorToLonLat(p[0], p[1])) };
    case 'LineString':
      return { type: 'LineString', coordinates: c.map((p) => mercatorToLonLat(p[0], p[1])) };
    case 'MultiLineString':
      return { type: 'MultiLineString', coordinates: c.map((line) => line.map((p) => mercatorToLonLat(p[0], p[1]))) };
    case 'Polygon':
      return { type: 'Polygon', coordinates: c.map((ring) => ring.map((p) => mercatorToLonLat(p[0], p[1]))) };
    case 'MultiPolygon':
      return { type: 'MultiPolygon', coordinates: c.map((poly) => poly.map((ring) => ring.map((p) => mercatorToLonLat(p[0], p[1])))) };
    case 'GeometryCollection':
      return { type: 'GeometryCollection', geometries: (geom.geometries || []).map(convertGeometry900913To4326) };
    default:
      return geom;
  }
}

function updateAoiBboxMerc() {
  const aoi = getAoiFeature();
  const el = document.getElementById('aoi-bbox-merc');
  if (!el) return;
  if (!aoi) { el.textContent = '-'; return; }
  const b = turf.bbox(aoi); // [minLon, minLat, maxLon, maxLat]
  const [minX, minY] = lonLatToMercator(b[0], b[1]);
  const [maxX, maxY] = lonLatToMercator(b[2], b[3]);
  const vals = [minX, minY, maxX, maxY].map((v) => Math.round(v));
  el.textContent = vals.join(',');
}

function buildAoiVertexPoints(fc) {
  const points = [];
  for (const f of fc.features || []) {
    const geom = f.geometry;
    if (!geom) continue;
    if (geom.type === 'Polygon') {
      collectFromRings(geom.coordinates, points);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) collectFromRings(poly, points);
    }
  }
  return { type: 'FeatureCollection', features: points };
}

function collectFromRings(rings, out) {
  for (const ring of rings) {
    for (const coord of ring) {
      out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: coord }, properties: {} });
    }
  }
}

// VWorld WFS URL (align with user's working pattern: EPSG:900913 bbox order xmin,ymin,xmax,ymax)
function wfsUrl(key, typename, bbox4326) {
  // bbox4326: [minLon, minLat, maxLon, maxLat]
  const [minLon, minLat, maxLon, maxLat] = bbox4326;
  const [minX, minY] = lonLatToMercator(minLon, minLat);
  const [maxX, maxY] = lonLatToMercator(maxLon, maxLat);
  const srs = 'EPSG:900913';
  // Format to integer meters to match the example pattern: BBOX=13987670,3912271,14359383,4642932
  const bboxStr = [minX, minY, maxX, maxY].map((v) => Math.round(v)).join(',');

  // Route through local proxy to avoid CORS issues
  const base = '/proxy/wfs';
  const params = new URLSearchParams({
    SERVICE: 'WFS', REQUEST: 'GetFeature', VERSION: '1.1.0',
    key,
    domain: state.domain || location.hostname,
    // Match user's proven working style but still request JSON for easier parsing
    OUTPUT: 'application/json',
    SRSNAME: srs,
    TYPENAME: typename,
    // Send BBOX as pure numbers; CRS is already specified via SRSNAME
    BBOX: bboxStr,
    EXCEPTIONS: 'application/json',
    MAXFEATURES: '500'
  });
  return base + '?' + params.toString();
}

async function fetchLayerData(layerKey, aoi) {
  const { typename } = CONFIG.layers[layerKey];
  const bbox = turf.bbox(aoi);
  const url = wfsUrl(state.key, typename, bbox);

  // NOTE: Per user request, do not call GetCapabilities nor validate typename here.
  // Some environments only allow direct GetFeature via proxy.

  // Show last URL for debugging/verification
  const urlSpan = document.getElementById('last-wfs-url');
  if (urlSpan) {
    // Show a more human-readable URL (decode commas/colons)
    let pretty = url;
    try { pretty = decodeURIComponent(url); } catch (_) {
      pretty = url.replace(/%2C/gi, ',').replace(/%3A/gi, ':');
    }
    urlSpan.textContent = pretty;
  }

  let res;
  try {
    res = await fetchWithRetry(
      url,
      {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'omit',
        referrerPolicy: 'origin',
        headers: { Accept: 'application/json' }
      },
      2,
      600
    );
  } catch (e) {
    // Possible CORS error (MissingAllowOriginHeader). Fallback to JSONP.
    const data = await fetchWfsViaJsonp(url);
    return data;
  }
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`WFS 요청 실패 (${res.status}) ${txt.slice(0, 200)}`);
  }
  // Guard: some servers return XML error with 200 OK
  if (!ctype.includes('json')) {
    const txt = await res.text().catch(() => '');
    // Try to parse JSON even if wrong content-type
    try {
      let fc = JSON.parse(txt);
      fc = convertFc900913To4326(fc);
      return fc;
    } catch (_) {
      // Fallback to JSONP if server blocked CORS (MissingAllowOriginHeader)
      try {
        const data = await fetchWfsViaJsonp(url);
        return convertFc900913To4326(data);
      } catch (e) {
        // Try to extract message from XML
        const m = txt.match(/<\w*Exception[^>]*>([\s\S]*?)<\//i);
        const msg = m ? m[1].trim().replace(/\s+/g, ' ') : txt.slice(0, 200);
        console.warn('WFS non-JSON response.', { url, preview: txt.slice(0, 1000) });
        throw new Error(`WFS 응답이 JSON이 아닙니다. (CORS 또는 파라미터 문제)\n${msg}`);
      }
    }
  }
  let fc = await res.json();
  console.log('Raw WFS response:', fc);
  // VWorld responded in EPSG:900913 (we requested SRSNAME=EPSG:900913) but MapLibre requires GeoJSON in EPSG:4326.
  // Convert coordinates back to lon/lat before clipping and rendering.
  fc = convertFc900913To4326(fc);
  console.log('Converted to EPSG:4326:', fc);

  // Validate converted coordinates are in Korea region (roughly)
  if (fc.features && fc.features.length > 0) {
    const firstFeature = fc.features[0];
    if (firstFeature.geometry && firstFeature.geometry.coordinates) {
      let sampleCoord;
      const geomType = firstFeature.geometry.type;
      if (geomType === 'Point') {
        sampleCoord = firstFeature.geometry.coordinates;
      } else if (geomType === 'LineString') {
        sampleCoord = firstFeature.geometry.coordinates[0];
      } else if (geomType === 'Polygon') {
        sampleCoord = firstFeature.geometry.coordinates[0][0];
      } else if (geomType === 'MultiPolygon') {
        sampleCoord = firstFeature.geometry.coordinates[0][0][0];
      }
      if (sampleCoord) {
        console.log('Sample converted coordinate:', sampleCoord);
        if (sampleCoord[0] < 124 || sampleCoord[0] > 132 || sampleCoord[1] < 33 || sampleCoord[1] > 39) {
          console.warn('Warning: Converted coordinates may be out of expected range for Korea!');
        }
      }
    }
  }

  const clipped = { type: 'FeatureCollection', features: [] };
  console.log(`Clipping ${fc.features?.length || 0} features against AOI`);

  (fc.features || []).forEach((f, idx) => {
    try {
      const gtype = f.geometry && f.geometry.type;
      if (!gtype) return;

      if (gtype.includes('Polygon')) {
        const intersects = turf.booleanIntersects(f, aoi);
        if (idx === 0) console.log(`First polygon intersects AOI: ${intersects}`);

        if (intersects) {
          const inter = turf.intersect(f, aoi);
          if (inter) {
            clipped.features.push(inter);
            if (idx === 0) console.log('First polygon clipped successfully');
          }
        }
      } else if (gtype.includes('LineString')) {
        // Check if line intersects with AOI and clip if necessary
        if (turf.booleanIntersects(f, aoi)) {
          try {
            // Try to clip the line to the AOI boundary
            const clippedLine = turf.lineIntersect(f, aoi);
            if (clippedLine && clippedLine.features.length > 0) {
              clipped.features.push(f);
            } else {
              // If line is within AOI, include it
              clipped.features.push(f);
            }
          } catch (_) {
            // If clipping fails, include the original line if it intersects
            clipped.features.push(f);
          }
        }
      } else if (gtype === 'Point' || gtype === 'MultiPoint') {
        // Check if point is within AOI
        if (turf.booleanPointInPolygon(f, aoi)) {
          clipped.features.push(f);
        } else if (gtype === 'MultiPoint') {
          // For MultiPoint, check each point
          const coords = f.geometry.coordinates;
          const inBounds = coords.filter(c => {
            const pt = turf.point(c);
            return turf.booleanPointInPolygon(pt, aoi);
          });
          if (inBounds.length > 0) {
            clipped.features.push({
              ...f,
              geometry: {
                type: 'MultiPoint',
                coordinates: inBounds
              }
            });
          }
        }
      } else {
        // Other geometry types - include if they intersect
        try {
          if (turf.booleanIntersects(f, aoi)) {
            clipped.features.push(f);
          }
        } catch (_) {
          // Skip on error
        }
      }
    } catch (e) {
      // skip errors
      console.warn('Error processing feature:', e);
    }
  });

  console.log(`Clipping complete: ${clipped.features.length} features after clipping from ${fc.features?.length || 0} original features`);
  if (clipped.features.length > 0) {
    console.log('First clipped feature:', clipped.features[0]);
  }

  return clipped;
}

function ensureResultLayers(layerKey, fc, color) {
  const srcId = 'src-' + layerKey;
  const baseId = 'lyr-' + layerKey;
  const fillId = baseId + '-fill';
  const lineId = baseId + '-line';
  const pointId = baseId + '-point';

  console.log(`Creating layers for ${layerKey}:`, {
    features: fc.features?.length || 0,
    firstFeature: fc.features?.[0]
  });

  const types = (fc.features || []).map((f) => f.geometry?.type || '');
  const hasPolygon = types.some((t) => t.includes('Polygon'));
  const hasLine = types.some((t) => t.includes('LineString'));
  const hasPoint = types.some((t) => t === 'Point' || t === 'MultiPoint');

  console.log(`Layer ${layerKey} geometry types:`, { hasPolygon, hasLine, hasPoint, types: [...new Set(types)] });

  if (!map.getSource(srcId)) {
    map.addSource(srcId, { type: 'geojson', data: fc });

    // Add polygon layers
    if (hasPolygon) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: srcId,
        filter: ['any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon']
        ],
        paint: { 'fill-color': color, 'fill-opacity': 0.25 }
      });
      map.addLayer({
        id: lineId,
        type: 'line',
        source: srcId,
        filter: ['any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon'],
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['geometry-type'], 'MultiLineString']
        ],
        paint: { 'line-color': color, 'line-width': 2 }
      });
    }
    // Add line layer if only lines (no polygons)
    else if (hasLine) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source: srcId,
        filter: ['any',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['geometry-type'], 'MultiLineString']
        ],
        paint: { 'line-color': color, 'line-width': 3 }
      });
    }
    // Add point layer
    if (hasPoint) {
      map.addLayer({
        id: pointId,
        type: 'circle',
        source: srcId,
        filter: ['any',
          ['==', ['geometry-type'], 'Point'],
          ['==', ['geometry-type'], 'MultiPoint']
        ],
        paint: {
          'circle-radius': 5,
          'circle-color': color,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2
        }
      });
    }
  } else {
    map.getSource(srcId).setData(fc);
    // Ensure appropriate layers exist if geometry types change between fetches
    if (hasPolygon && !map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: srcId,
        filter: ['any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon']
        ],
        paint: { 'fill-color': color, 'fill-opacity': 0.25 }
      });
    }
    if ((hasPolygon || hasLine) && !map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source: srcId,
        filter: ['any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon'],
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['geometry-type'], 'MultiLineString']
        ],
        paint: { 'line-color': color, 'line-width': hasPolygon ? 2 : 3 }
      });
    }
    if (hasPoint && !map.getLayer(pointId)) {
      map.addLayer({
        id: pointId,
        type: 'circle',
        source: srcId,
        filter: ['any',
          ['==', ['geometry-type'], 'Point'],
          ['==', ['geometry-type'], 'MultiPoint']
        ],
        paint: {
          'circle-radius': 5,
          'circle-color': color,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2
        }
      });
    }
  }
}

function setLayerVisibility(layerKey, visible) {
  const lineId = 'lyr-' + layerKey;
  const fillId = lineId + '-fill';
  const pointId = lineId + '-point';
  const vis = visible ? 'visible' : 'none';
  if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', vis);
  if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', vis);
  if (map.getLayer(pointId)) map.setLayoutProperty(pointId, 'visibility', vis);
}

function removeLayerAndSource(layerKey) {
  const srcId = 'src-' + layerKey;
  const lineId = 'lyr-' + layerKey;
  const fillId = lineId + '-fill';
  const pointId = lineId + '-point';
  if (map.getLayer(lineId)) map.removeLayer(lineId);
  if (map.getLayer(fillId)) map.removeLayer(fillId);
  if (map.getLayer(pointId)) map.removeLayer(pointId);
  if (map.getSource(srcId)) map.removeSource(srcId);
}

async function fetchAndShowLayer(layerKey, aoi) {
  const { color } = CONFIG.layers[layerKey];
  const data = await fetchLayerData(layerKey, aoi);
  ensureResultLayers(layerKey, data, color);
  setLayerVisibility(layerKey, true);
  updateCount(layerKey, data.features.length);
  state.fetched[layerKey] = true;
}

// UI Handlers
$('btn-zoom').addEventListener('click', () => fitToAoi());

$('btn-fetch').addEventListener('click', async () => {
  state.key = $('key').value.trim();
  if (!state.key) return alert('VWorld Key를 입력해주세요.');
  const aoi = getAoiFeature();
  if (!aoi) return alert('AOI 폴리곤을 먼저 그려주세요.');
  ensureAoiLayer();

  setLoading(true);
  try {
    for (const key of Object.keys(CONFIG.layers)) {
      const cb = $('chk-' + key);
      if (cb && cb.checked) {
        await fetchAndShowLayer(key, aoi);
      } else if (cb && !cb.checked && state.fetched[key]) {
        setLayerVisibility(key, false);
      }
    }
  } catch (e) {
    console.error(e);
    alert('가져오기 중 오류가 발생했습니다.\n' + e.message);
  } finally {
    setLoading(false);
  }
});

$('btn-clear').addEventListener('click', () => {
  Object.keys(CONFIG.layers).forEach((k) => {
    removeLayerAndSource(k);
    updateCount(k, null);
    state.fetched[k] = false;
  });
});

// Save key handler
function saveKey() {
  state.key = $('key').value.trim();
  state.domain = ($('domain')?.value || '').trim();
  try { localStorage.setItem('vworld-key', state.key); } catch (_) {}
  try { if (state.domain) localStorage.setItem('vworld-domain', state.domain); } catch (_) {}
  alert('VWorld Key가 저장되었습니다.');
}

const saveBtn = $('btn-save-key');
if (saveBtn) saveBtn.addEventListener('click', saveKey);

const keyInput = $('key');
if (keyInput) {
  // Load saved key
  try {
    const saved = localStorage.getItem('vworld-key');
    if (saved) keyInput.value = saved;
  } catch (_) {}
  // Enter to save
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveKey();
  });
}

// Load saved domain
const domainInput = $('domain');
if (domainInput) {
  try {
    const saved = localStorage.getItem('vworld-domain');
    if (saved) domainInput.value = saved;
    else if (!domainInput.value) domainInput.value = 'wind.rkswork.com';
  } catch (_) {}
}

// Toggle listeners: show/hide, and fetch on-demand when turning ON if data not fetched yet
Object.keys(CONFIG.layers).forEach((k) => {
  const cb = $('chk-' + k);
  if (!cb) return;
  cb.addEventListener('change', async (ev) => {
    const checked = ev.target.checked;
    const hasData = !!map.getSource('src-' + k);
    if (checked) {
      if (hasData) {
        setLayerVisibility(k, true);
      } else {
        // On-demand fetch when toggled on
        state.key = $('key').value.trim();
        if (!state.key) return alert('VWorld Key를 입력해주세요.');
        const aoi = getAoiFeature();
        if (!aoi) return alert('AOI 폴리곤을 먼저 그려주세요.');
        ensureAoiLayer();
        setLoading(true);
        try {
          await fetchAndShowLayer(k, aoi);
        } catch (e) {
          console.error(e);
          alert('레이어 가져오기 오류: ' + e.message);
          cb.checked = false;
        } finally {
          setLoading(false);
        }
      }
    } else {
      setLayerVisibility(k, false);
    }
  });
});

// Update AOI layers on draw events
map.on('draw.create', ensureAoiLayer);
map.on('draw.update', ensureAoiLayer);
// Keep AOI layers and BBOX live-updated while drawing/editing
map.on('draw.render', () => { syncAoiLayers(true); updateLiveSketch(); });
map.on('draw.modechange', (e) => { syncAoiLayers(true); updateLiveSketch(e); });
map.on('draw.selectionchange', () => { syncAoiLayers(true); updateLiveSketch(); });
map.on('draw.delete', () => {
  if (map.getLayer('aoi-fill')) map.removeLayer('aoi-fill');
  if (map.getLayer('aoi-line')) map.removeLayer('aoi-line');
  if (map.getLayer('aoi-points')) map.removeLayer('aoi-points');
  if (map.getSource('aoi-pts')) map.removeSource('aoi-pts');
  if (map.getSource('aoi')) map.removeSource('aoi');
  clearLiveSketch();
  updateAoiBboxMerc();
});

// --- Live sketch helpers: show moving line and points while drawing before polygon is completed ---
function updateLiveSketch(e) {
  // If not in draw/create/modify modes, clear live layers
  if (e && e.mode && (e.mode === 'simple_select' || e.mode === 'static')) {
    clearLiveSketch();
    return;
  }
  let fc = Draw.getAll();
  if (!fc || !fc.features || fc.features.length === 0) { clearLiveSketch(); return; }
  // Pick the last feature being edited/drawn
  const f = fc.features[fc.features.length - 1];
  if (!f || !f.geometry) { clearLiveSketch(); return; }

  // Build a line and points from the outer ring if polygon; or coordinates directly for line
  let lineCoords = [];
  let pointCoords = [];
  if (f.geometry.type === 'Polygon' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates[0]) {
    lineCoords = f.geometry.coordinates[0];
    pointCoords = lineCoords;
  } else if (f.geometry.type === 'LineString') {
    lineCoords = f.geometry.coordinates || [];
    pointCoords = lineCoords;
  } else {
    // For other types we don't render live
    clearLiveSketch();
    return;
  }

  const liveSrcId = 'aoi-live';
  const line = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: lineCoords } };
  const pts = { type: 'FeatureCollection', features: (pointCoords || []).map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) };

  if (!map.getSource(liveSrcId)) {
    map.addSource(liveSrcId, { type: 'geojson', data: { type: 'FeatureCollection', features: [line, ...pts.features] } });
    map.addLayer({ id: 'aoi-live-line', type: 'line', source: liveSrcId, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#10b981', 'line-width': 2, 'line-dasharray': [2, 2] } });
    map.addLayer({ id: 'aoi-live-points', type: 'circle', source: liveSrcId, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#34d399', 'circle-stroke-color': '#065f46', 'circle-stroke-width': 1 } });
  } else {
    map.getSource(liveSrcId).setData({ type: 'FeatureCollection', features: [line, ...pts.features] });
  }
}

function clearLiveSketch() {
  if (map.getLayer('aoi-live-line')) map.removeLayer('aoi-live-line');
  if (map.getLayer('aoi-live-points')) map.removeLayer('aoi-live-points');
  if (map.getSource('aoi-live')) map.removeSource('aoi-live');
}

// --- Capabilities helpers ---
async function ensureCapabilities() {
  if (state.availableTypenames) return;
  const url = new URL('https://api.vworld.kr/req/wfs');
  url.search = new URLSearchParams({
    service: 'WFS', request: 'GetCapabilities', version: '1.1.0',
    key: state.key || $('key').value.trim(),
    domain: location.hostname
  }).toString();
  let text = '';
  try {
    const res = await fetch(url.toString());
    text = await res.text();
  } catch (e) {
    // ignore network error, keep null
  }
  state.capabilities = text;
  state.availableTypenames = parseTypenamesFromCapabilities(text);
}

function parseTypenamesFromCapabilities(xmlText) {
  if (!xmlText) return null;
  const set = new Set();
  try {
    // crude extraction: look for <Name>typename</Name>
    const re = /<Name>\s*([^<\s]+)\s*<\/Name>/g; let m;
    while ((m = re.exec(xmlText))) {
      const name = m[1];
      if (name && !name.includes(':')) set.add(name.trim());
    }
  } catch (_) {}
  return set;
}

// --- Networking helpers ---
async function fetchWithRetry(input, init, retries = 2, delayMs = 600) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(input, init);
      if (res.ok) return res;
      if (i === retries) return res;
    } catch (e) {
      lastErr = e;
      if (i === retries) throw e;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  if (lastErr) throw lastErr;
  return fetch(input, init);
}

// --- Test helpers & button ---
function makeSmallAoiAroundCenter() {
  const c = map.getCenter();
  const dx = 0.02, dy = 0.02; // ~small box (~2km) depending on latitude
  const bbox = [c.lng - dx, c.lat - dy, c.lng + dx, c.lat + dy];
  return turf.bboxPolygon(bbox);
}

async function runSmallTest() {
  // Ensure key/domain
  state.key = $('key').value.trim();
  state.domain = ($('domain')?.value || '').trim();
  if (!state.key) return alert('VWorld Key를 입력해주세요.');
  if (!state.domain) return alert('VWorld Domain을 입력해주세요.');

  // Build tiny AOI if none
  let aoi = getAoiFeature();
  if (!aoi) {
    aoi = makeSmallAoiAroundCenter();
    // Put into Draw for visibility
    try { Draw.deleteAll(); } catch (_) {}
    try { Draw.add(aoi); } catch (_) {}
  }
  ensureAoiLayer();

  const toTest = ['admin', 'urban', 'greenbelt'];
  setLoading(true);
  const results = [];
  try {
    for (const key of toTest) {
      try {
        await fetchAndShowLayer(key, aoi);
        results.push(`✔ ${key}`);
      } catch (e) {
        console.error('Test fetch failed for', key, e);
        results.push(`✖ ${key}: ${e.message}`);
      }
    }
  } finally {
    setLoading(false);
  }
  alert('테스트 결과\n' + results.join('\n'));
}

const testBtn = $('btn-test');
if (testBtn) testBtn.addEventListener('click', runSmallTest);

// --- JSONP fallback for CORS-restricted responses ---
function buildJsonpUrl(originalUrl, cbName) {
  const u = new URL(originalUrl);
  const p = u.searchParams;
  // Force JSONP output
  p.set('OUTPUT', 'text/javascript');
  p.set('EXCEPTIONS', 'text/javascript');
  // VWorld JSONP callback param name is format_options=callback:NAME
  p.set('format_options', `callback:${cbName}`);
  u.search = p.toString();
  return u.toString();
}

function fetchWfsViaJsonp(originalUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const cbName = `__vworld_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = buildJsonpUrl(originalUrl, cbName);

    let script;
    const cleanup = () => {
      try { delete window[cbName]; } catch (_) {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP 요청 시간이 초과되었습니다. (CORS 차단 가능성)'));
    }, timeoutMs);

    window[cbName] = function(data) {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('JSONP 스크립트 로딩 실패'));
    };
    document.head.appendChild(script);
  });
}
