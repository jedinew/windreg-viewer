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
  fetched: {} // layerKey -> boolean
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
  const fc = getAoiFC();
  if (!fc) return;
  if (!map.getSource('aoi')) {
    map.addSource('aoi', { type: 'geojson', data: fc });
    map.addLayer({ id: 'aoi-fill', type: 'fill', source: 'aoi', paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': '#22c55e', 'line-width': 2 } });
  } else {
    map.getSource('aoi').setData(fc);
  }
}

function fitToAoi() {
  const aoi = getAoiFeature();
  if (!aoi) return alert('AOI 폴리곤을 먼저 그려주세요.');
  const b = turf.bbox(aoi);
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, duration: 800 });
}

// VWorld WFS URL
function wfsUrl(key, typename, bbox) {
  // bbox: [minX, minY, maxX, maxY]
  const [minX, minY, maxX, maxY] = bbox;
  const srs = 'EPSG:4326';
  // Per VWorld WFS 1.1.0: when srsName=EPSG:4326, bbox order must be (ymin,xmin,ymax,xmax)
  const bboxStr = srs === 'EPSG:4326'
    ? [minY, minX, maxY, maxX].join(',')
    : [minX, minY, maxX, maxY].join(',');

  const base = 'https://api.vworld.kr/req/wfs';
  const params = new URLSearchParams({
    service: 'WFS', request: 'GetFeature', version: '1.1.0',
    key,
    domain: location.hostname,
    output: 'application/json',
    srsName: srs,
    typename: typename,
    // Do NOT append CRS in bbox string; VWorld uses srsName separately.
    bbox: bboxStr,
    exceptions: 'application/json'
  });
  return base + '?' + params.toString();
}

async function fetchLayerData(layerKey, aoi) {
  const { typename } = CONFIG.layers[layerKey];
  const bbox = turf.bbox(aoi);
  const url = wfsUrl(state.key, typename, bbox);

  const res = await fetch(url);
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
  try { localStorage.setItem('vworld-key', state.key); } catch (_) {}
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
map.on('draw.delete', () => {
  if (map.getLayer('aoi-fill')) map.removeLayer('aoi-fill');
  if (map.getLayer('aoi-line')) map.removeLayer('aoi-line');
  if (map.getSource('aoi')) map.removeSource('aoi');
});
