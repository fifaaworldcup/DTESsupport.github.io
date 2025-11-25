// js/markers.js
// Usage:
//   initMarkers({ map: window.map, url: 'dtes-resources.json' });
// Exposes window.initMarkers, window.getResources, window.removeMarkers

(function(global){
  let markersLayer = null;
  let resources = [];
  let lastMap = null;

  function fileIsNumber(v){ return typeof v === 'number' && isFinite(v); }

  function makeClusterIcon(cluster){
    const count = cluster.getChildCount();
    const size = Math.min(88, Math.max(36, 28 + Math.round(Math.log(count + 1) * 12)));
    const fontSize = Math.max(12, Math.round(size / 3.6));
    const color = '#2ee0b6';
    const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:4px solid #fff;">
      <span style="color:#012;font-weight:800;font-size:${fontSize}px;line-height:1">${count}</span></div>`;
    return L.divIcon({ html, className: 'custom-cluster', iconSize: L.point(size, size) });
  }

  const colorMap = {
    'Food':'#9333EA','Shelter':'#b45309','Injection Site':'#10B981','Harm Reduction':'#06b6d4',
    'Naloxone':'#3B82F6','Washrooms':'#14B8A6','Clothing':'#0ea5a4','Urgent':'#ef4444',
    'Mental Health':'#EC4899','Hotline':'#6B7280','Outreach':'#F59E0B','Support':'#F97316',
    'Drop-in':'#8B5CF6','Medical':'#0ea5a4','Other':'#6B7280'
  };

  function createMarker(r, language){
    if(!r || !fileIsNumber(r.lat) || !fileIsNumber(r.lng)) return null;
    const color = colorMap[r.type] || '#6B7280';
    const html = `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;"></div>`;
    const icon = L.divIcon({ html, className:'single-pin', iconSize:[22,22], iconAnchor:[11,11] });
    const m = L.marker([r.lat, r.lng], { icon });
    m.resource = r;
    m.on('popupopen', function(){ /* noop - allow external handling */ });
    m.bindPopup(popupHtml(r, language), { maxWidth:320 });
    return m;
  }

  function safeHtml(text){
    if(!text) return '';
    return String(text).replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function popupHtml(res, lang){
    let title = safeHtml(res.name || '');
    let desc = safeHtml(res.description || '');
    let hours = safeHtml(res.hours || '');
    if(res.translations && res.translations[lang]){
      const t = res.translations[lang];
      if(t.name) title = safeHtml(t.name);
      if(t.description) desc = safeHtml(t.description);
      if(t.hours) hours = safeHtml(t.hours);
    }
    const phoneHtml = res.phone ? `<a href="tel:${encodeURIComponent(res.phone)}" style="color:#2ee0b6">${safeHtml(res.phone)}</a>` : 'N/A';
    const addressHtml = safeHtml(res.address || '');
    // onclick uses global routeTo and showQR (index.html includes those)
    return `<div style="max-width:320px">
      <strong style="font-size:15px">${title}</strong>
      <div style="font-size:13px;margin-top:6px"><strong>Type:</strong> ${safeHtml(res.type||'')}</div>
      <div style="font-size:13px"><strong>Hours:</strong> ${hours||'N/A'}</div>
      <div style="font-size:13px"><strong>Phone:</strong> ${phoneHtml}</div>
      <div style="font-size:12px;color:#9be7d0;margin-top:6px">${addressHtml}</div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="popup-btn" onclick="routeTo(${res.lat},${res.lng},'${(title||'').replace(/'/g,\"\\'\")}')">Get directions</button>
        <button class="popup-btn" onclick="showQR(${res.lat},${res.lng},'${(title||'').replace(/'/g,\"\\'\")}')">QR</button>
      </div></div>`;
  }

  async function fetchResources(url, timeoutMs = 8000){
    try{
      const controller = new AbortController();
      const id = setTimeout(()=>controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(id);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const j = await res.json();
      return j;
    }catch(err){
      console.warn('fetchResources error', err);
      // try caches if available
      try{
        if('caches' in window){
          const match = await caches.match(url);
          if(match) return await match.json();
        }
      }catch(e){ console.warn('cache fallback failed', e); }
      // fallback to embedded global variable if present
      if(window._embeddedResources) return window._embeddedResources;
      return [];
    }
  }

  async function initMarkers({ map, url = 'dtes-resources.json', language = (document.getElementById && document.getElementById('languageSelect')) ? document.getElementById('languageSelect').value : 'en' } = {}){
    if(!map) throw new Error('initMarkers requires a Leaflet map instance as { map }');
    lastMap = map;
    resources = await fetchResources(url);
    // remove existing
    if(markersLayer && map.hasLayer(markersLayer)){
      try{ map.removeLayer(markersLayer); } catch(e){ console.warn(e); }
    }
    markersLayer = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      iconCreateFunction: makeClusterIcon,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: true
    });

    resources.forEach(r => {
      const m = createMarker(r, language);
      if(m) markersLayer.addLayer(m);
    });

    map.addLayer(markersLayer);

    markersLayer.on('clusterclick', function(e){
      // zoom into cluster bounds
      try{ map.fitBounds(e.layer.getBounds(), { padding:[40,40] }); } catch(e){ console.warn(e); }
    });

    // expose objects
    global._dtes = global._dtes || {};
    global._dtes.resources = resources;
    global._dtes.markersLayer = markersLayer;

    return { resources, markersLayer };
  }

  function getResources(){
    return resources;
  }
  function removeMarkers(){
    if(markersLayer && lastMap){
      try{ lastMap.removeLayer(markersLayer); }catch(e){ console.warn(e); }
      markersLayer = null;
    }
  }

  // auto-init if map exists on window (useful when script included after map creation)
  global.initMarkers = initMarkers;
  global.getResources = getResources;
  global.removeMarkers = removeMarkers;
  // auto-run if map found (non-blocking)
  setTimeout(()=>{
    if(global.map && !global._dtes){ initMarkers({ map: global.map }).catch(e => console.warn('auto initMarkers failed', e)); }
  }, 600);

})(window);
