'use strict';

// App config
const CONFIG = {
  layers: {
    urban:     { typename: 'lt_c_uq121', color: '#3b82f6', label: '용도지역/지구 (도시계획)' },
    greenbelt: { typename: 'lt_c_ud801', color: '#ef4444', label: '개발제한구역(그린벨트)' },
    landscape: { typename: 'lt_c_uq121', color: '#f97316', label: '경관지구' },
    admin:     { typename: 'lt_c_adsigg', color: '#eab308', label: '행정경계' },
    roads:     { typename: 'lt_l_moctlink', color: '#93c5fd', label: '도로망/교통링크' },
    slope:     { typename: 'lt_c_up401', color: '#22c55e', label: '급경사지역' }
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

const Draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, trash: true } });
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

  const base = 'https://api.vworld.kr/req/wfs';
  const params = new URLSearchParams({
    SERVICE: 'WFS', REQUEST: 'GetFeature', VERSION: '1.1.0',
    key,
    domain: state.domain || location.hostname,
    // Match user's proven working style but still request JSON for easier parsing
    OUTPUT: 'application/json',
    SRSNAME: srs,
    TYPENAME: typename,
    // Append CRS to BBOX as requested, e.g. "...,EPSG:900913"
    BBOX: bboxStr + ',EPSG:900913',
    EXCEPTIONS: 'application/json',
    MAXFEATURES: '500'
  });
  return base + '?' + params.toString();
}

async function fetchLayerData(layerKey, aoi) {
  const { typename } = CONFIG.layers[layerKey];
  const bbox = turf.bbox(aoi);
  const url = wfsUrl(state.key, typename, bbox);

  // Ensure typename exists by checking WFS GetCapabilities once
  await ensureCapabilities();
  if (state.availableTypenames && !state.availableTypenames.has(typename)) {
    throw new Error(`지원되지 않는 레이어명입니다: ${typename}\n(GetCapabilities에 존재하지 않습니다)`);
  }

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

  const res = await fetchWithRetry(url, { headers: { 'Accept': 'application/json' } }, 2, 600);
  const ctype = res.headers.get('content-type') || '';
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`WFS 요청 실패 (${res.status}) ${txt.slice(0, 200)}`);
  }
  // Guard: some servers return XML error with 200 OK
  if (!ctype.includes('application/json')) {
    const txt = await res.text().catch(() => '');
    // Try to extract message from XML
    const m = txt.match(/<\w*Exception[^>]*>([\s\S]*?)<\//i);
    const msg = m ? m[1].trim().replace(/\s+/g, ' ') : txt.slice(0, 200);
    console.warn('WFS non-JSON response.', { url, preview: txt.slice(0, 1000) });
    throw new Error(`WFS 응답이 JSON이 아닙니다. (아마도 Key/도메인/파라미터 문제)\n${msg}`);
  }
  const fc = await res.json();

  const clipped = { type: 'FeatureCollection', features: [] };
  (fc.features || []).forEach((f) => {
    try {
      const gtype = f.geometry && f.geometry.type;
      if (!gtype) return;
      if (gtype.includes('Polygon')) {
        if (turf.booleanIntersects(f, aoi)) {
          const inter = turf.intersect(f, aoi);
          if (inter) clipped.features.push(inter);
        }
      } else if (gtype.includes('LineString')) {
        if (turf.booleanIntersects(f, aoi)) clipped.features.push(f);
      } else {
        // Other types are ignored for now
      }
    } catch (e) {
      // skip errors
    }
  });
  return clipped;
}

function ensureResultLayers(layerKey, fc, color) {
  const srcId = 'src-' + layerKey;
  const lineId = 'lyr-' + layerKey;
  const fillId = lineId + '-fill';
  const hasPolygon = (fc.features || []).some((f) => (f.geometry?.type || '').includes('Polygon'));

  if (!map.getSource(srcId)) {
    map.addSource(srcId, { type: 'geojson', data: fc });

    // Fill first (below), then line on top
    if (hasPolygon) {
      map.addLayer({ id: fillId, type: 'fill', source: srcId, paint: { 'fill-color': color, 'fill-opacity': 0.25 } });
    }
    map.addLayer({ id: lineId, type: 'line', source: srcId, paint: { 'line-color': color, 'line-width': 2 } });
  } else {
    map.getSource(srcId).setData(fc);
  }
}

function setLayerVisibility(layerKey, visible) {
  const lineId = 'lyr-' + layerKey;
  const fillId = lineId + '-fill';
  const vis = visible ? 'visible' : 'none';
  if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', vis);
  if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', vis);
}

function removeLayerAndSource(layerKey) {
  const srcId = 'src-' + layerKey;
  const lineId = 'lyr-' + layerKey;
  const fillId = lineId + '-fill';
  if (map.getLayer(lineId)) map.removeLayer(lineId);
  if (map.getLayer(fillId)) map.removeLayer(fillId);
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
map.on('draw.render', () => syncAoiLayers(true));
map.on('draw.modechange', () => syncAoiLayers(true));
map.on('draw.selectionchange', () => syncAoiLayers(true));
map.on('draw.delete', () => {
  if (map.getLayer('aoi-fill')) map.removeLayer('aoi-fill');
  if (map.getLayer('aoi-line')) map.removeLayer('aoi-line');
  if (map.getLayer('aoi-points')) map.removeLayer('aoi-points');
  if (map.getSource('aoi-pts')) map.removeSource('aoi-pts');
  if (map.getSource('aoi')) map.removeSource('aoi');
  updateAoiBboxMerc();
});

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
