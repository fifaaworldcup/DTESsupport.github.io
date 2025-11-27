/* js/markers.js
   Map + markers loader for DTES lifeline map.
   Expects: /dtes-resources.json in repo root.
   Uses: Leaflet, Leaflet.markercluster, Leaflet.Routing (optional), QRCode lib (optional).
*/

(function(){
  const RESOURCE_URL = '/dtes-resources.json';
  window.currentLanguage = localStorage.getItem('dtes_lang') || 'en';
  const map = L.map('map', {zoomControl:true}).setView([49.2819, -123.1003], 14);
  // Tile layer: configured to use online OSM by default; change URL to /tiles/{z}/{x}/{y}.png if you add offline tiles.
  const tileUrl = '/tiles/{z}/{x}/{y}.png'; // local tiles preferred (if present)
  const tileFallback = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileLayer = L.tileLayer(tileUrl, { maxZoom: 19, attribution: '© OpenStreetMap' });
  tileLayer.addTo(map).on('tileerror', () => {
    // if local tiles missing, switch to online fallback
    if (tileLayer.getAttribution().includes('© OpenStreetMap')) return;
  });
  // if tile doesn't load (local), replace with fallback
  tileLayer.on('tileerror', function() {
    // Remove failing local and add remote
    map.removeLayer(tileLayer);
    L.tileLayer(tileFallback, {maxZoom:19, attribution:'© OpenStreetMap'}).addTo(map);
  });

  // Marker cluster
  const cluster = L.markerClusterGroup({
    chunkedLoading: true,
    iconCreateFunction: function(cluster) {
      const n = cluster.getChildCount();
      return L.divIcon({
        html: '<div style="background:rgba(255,255,255,0.06);border:2px solid #1D4ED8;color:#1D4ED8;border-radius:999px;padding:6px 10px;font-weight:800;">' + n + '</div>',
        className: 'mycluster',
        iconSize: L.point(40,40)
      });
    }
  });
  map.addLayer(cluster);

  // global containers
  window._markers = [];
  let resources = [];

  // ui elements
  const loader = document.getElementById('loadingOverlay');
  const resourceCountEl = document.getElementById('resourceCount');
  const resourceListEl = document.getElementById('resourceList');

  // translation helper (popups UI)
  const uiStrings = {
    en:{type:'Type', hours:'Hours', call:'Call', directions:'Directions'},
    ar:{type:'النوع', hours:'الساعات', call:'اتصل', directions:'اتجاهات'},
    fa:{type:'نوع', hours:'ساعت', call:'تماس', directions:'مسیر'},
    bn:{type:'ধরন', hours:'সময়', call:'কল', directions:'দিকনির্দেশনা'},
    hi:{type:'प्रकार', hours:'घंटे', call:'कॉल', directions:'दिशाएँ'},
    ur:{type:'قسم', hours:'اوقات', call:'کال', directions:'راستہ'},
    pa:{type:'ਕਿਸਮ', hours:'ਘੰਟੇ', call:'ਕਾਲ', directions:'ਦਿਸ਼ਾਵਾਂ'},
    tl:{type:'Uri', hours:'Oras', call:'Tumawag', directions:'Direksyon'},
    zh:{type:'类型', hours:'时间', call:'呼叫', directions:'路线'},
    es:{type:'Tipo', hours:'Horario', call:'Llamar', directions:'Direcciones'},
    fr:{type:'Type', hours:'Heures', call:'Appeler', directions:'Itinéraire'},
    nl:{type:'Type', hours:'Uren', call:'Bellen', directions:'Route'},
    it:{type:'Tipo', hours:'Orari', call:'Chiama', directions:'Indicazioni'},
    sv:{type:'Typ', hours:'Tider', call:'Ring', directions:'Vägbeskrivning'}
  };

  function tUI(key) {
    const lang = window.currentLanguage || 'en';
    return (uiStrings[lang] && uiStrings[lang][key]) || uiStrings.en[key];
  }

  // fetch + dedupe loader
  async function loadResources(){
    try {
      const r = await fetch(RESOURCE_URL, {cache:'no-cache'});
      const data = await r.json();
      // dedupe by normalized name + address
      const seen = new Set();
      resources = data.filter(item => {
        const key = (item.name||'').trim().toLowerCase() + '|' + (item.address||'').trim().toLowerCase();
        if (!item.name || !item.lat || !item.lng) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      resources.sort((a,b) => (a.type||'').localeCompare(b.type||'') || (a.name||''));
      buildMarkers();
      populateList(resources);
      updateResourceCount();
      hideLoader();
    } catch(err){
      console.error('Failed to load resources', err);
      if (loader) loader.querySelector('.text-2xl').textContent = 'Failed to load resources.';
    }
  }

  function hideLoader() {
    if (!loader) return;
    loader.style.opacity = '0';
    setTimeout(()=> loader.style.display = 'none', 350);
    if (window.appReady) window.appReady();
  }

  function buildMarkers(){
    cluster.clearLayers();
    window._markers.length = 0;
    resources.forEach(r => {
      const colorMap = {'Naloxone':'#0ea5a4','Injection Site':'#10b981','Detox':'#f97316','Food':'#8b5cf6','Shelter':'#f59e0b','Urgent':'#ef4444','Washrooms':'#06b6d4','Mental Health':'#ec4899','Support':'#60a5fa','Clothing':'#7c3aed','Drop-in':'#14b8a6','Outreach':'#06b6d4','Youth':'#f43f5e','Medical':'#ef4444'};
      const color = colorMap[r.type] || '#6b7280';
      const icon = L.divIcon({
        html:`<div style="background:${color};width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25)"></div>`,
        className:'resource-marker',
        iconSize:[30,30],
        iconAnchor:[15,15]
      });
      const m = L.marker([r.lat, r.lng], {icon});
      m.resource = r;
      m.bindPopup(createPopupHTML(r), {maxWidth:320});
      m.on('popupopen', (e)=> bindPopupControls(e.popup, r));
      cluster.addLayer(m);
      window._markers.push(m);
    });
  }

  function createPopupHTML(r){
    const t = uiStrings[window.currentLanguage] || uiStrings.en;
    const name = (r.translations && r.translations[window.currentLanguage] && r.translations[window.currentLanguage].name) || r.name;
    const desc = (r.translations && r.translations[window.currentLanguage] && r.translations[window.currentLanguage].description) || r.description || '';
    const addr = (r.translations && r.translations[window.currentLanguage] && r.translations[window.currentLanguage].address) || r.address || '';
    const hours = (r.translations && r.translations[window.currentLanguage] && r.translations[window.currentLanguage].hours) || r.hours || '';
    const phone = (r.translations && r.translations[window.currentLanguage] && r.translations[window.currentLanguage].phone) || r.phone || '';
    return `
      <div style="font-family:inherit">
        <h3 style="margin:0 0 6px 0;font-weight:700">${escapeHtml(name)}</h3>
        <div style="font-size:0.9rem;margin-bottom:6px;color:#374151"><strong>${t.type}:</strong> ${escapeHtml(r.type)}</div>
        <div style="font-size:0.9rem;margin-bottom:6px">${escapeHtml(desc)}</div>
        ${addr?`<div style="font-size:0.85rem;margin-bottom:4px"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(addr)}</div>`:''}
        ${hours?`<div style="font-size:0.85rem"><strong>${t.hours}:</strong> ${escapeHtml(hours)}</div>`:''}
        ${phone?`<div style="margin-top:6px"><a href="tel:${encodeURIComponent(phone)}" class="control-btn" style="display:inline-block;padding:6px 8px;border-radius:6px;background:#111;color:#fff;text-decoration:none;">${t.call}: ${escapeHtml(phone)}</a></div>`:''}
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="popup-direction-btn" data-id="${r.id}" style="flex:1;padding:8px;border-radius:8px;background:#1D4ED8;color:#fff;border:none;cursor:pointer">${t.directions}</button>
          <button class="popup-qr-btn" data-id="${r.id}" style="padding:8px;border-radius:8px;background:#111;color:#fff;border:none;cursor:pointer">QR</button>
        </div>
      </div>
    `;
  }

  function bindPopupControls(popup, resource){
    const container = popup.getElement();
    if (!container) return;
    const dirBtn = container.querySelector('.popup-direction-btn');
    if (dirBtn) dirBtn.addEventListener('click', ()=> startDirectionsTo(resource));
    const qrBtn = container.querySelector('.popup-qr-btn');
    if (qrBtn) qrBtn.addEventListener('click', ()=> showQRCode(resource));
    // update for accessibility read if there is a global read button
  }

  // escape helper
  function escapeHtml(s){ if(!s) return ''; return (''+s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }

  // list & search UI
  function populateList(list){
    if (!resourceListEl) return;
    resourceListEl.innerHTML = '';
    list.forEach(r => {
      const li = document.createElement('li');
      li.className = 'p-2 bg-white/5 rounded';
      li.style.cursor = 'pointer';
      li.innerHTML = `<div style="font-weight:700">${escapeHtml(r.name)}</div><div style="font-size:0.85rem;color:#cbd5e1">${escapeHtml(r.type)} — ${escapeHtml(r.address||'')}</div>`;
      li.addEventListener('click', ()=> {
        const m = window._markers.find(mm => mm.resource && mm.resource.id === r.id);
        if (m) { map.setView(m.getLatLng(), 17); m.openPopup(); }
      });
      resourceListEl.appendChild(li);
    });
  }

  function updateResourceCount(){
    if (!resourceCountEl) return;
    resourceCountEl.textContent = `${resources.length} verified locations`;
  }

  // search filter (wired in index)
  window.filterResources = function(q){
    const s = (q||'').toLowerCase().trim();
    const visible = [];
    window._markers.forEach(m => {
      const r = m.resource;
      const text = (r.name + ' ' + (r.description||'') + ' ' + (r.type||'') + ' ' + (r.address||'')).toLowerCase();
      if (!s || text.includes(s)) {
        cluster.addLayer(m);
        visible.push(r);
      } else {
        cluster.removeLayer(m);
      }
    });
    populateList(visible);
    resourceCountEl.textContent = `${visible.length} verified locations`;
  };

  // filter by type (wired to UI buttons)
  window.filterByType = function(type){
    const visible = [];
    window._markers.forEach(m => {
      const r = m.resource;
      if (type === 'all' || r.type === type) {
        cluster.addLayer(m);
        visible.push(r);
      } else cluster.removeLayer(m);
    });
    populateList(visible);
    resourceCountEl.textContent = `${visible.length} verified locations`;
  };

  // locate me
  window.locateMe = function(){
    if (!navigator.geolocation) return alert('Geolocation not supported.');
    const status = document.getElementById('userLocationStatus');
    if (status) status.textContent = 'Locating...';
    navigator.geolocation.getCurrentPosition(pos => {
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      if (window._userMarker) map.removeLayer(window._userMarker);
      window._userMarker = L.circleMarker(latlng, {radius:8, fillColor:'#06b6d4', color:'#fff', weight:3}).addTo(map).bindPopup('You are here');
      map.setView(latlng, 15);
      if (status) status.textContent = 'Location found!';
      window.lastLocation = latlng;
    }, err => {
      alert('Unable to access location. Check permissions.');
      if (status) status.textContent = 'Location error';
    }, {enableHighAccuracy:true});
  };

  // directions: use L.Routing if available, else fallback to straight line polyline
  let routingControl = null, approxLine = null;
  async function startDirectionsTo(resource){
    const to = L.latLng(resource.lat, resource.lng);
    let from = window.lastLocation || null;
    if (!from) {
      // ask for location once
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(pos => {
            window.lastLocation = L.latLng(pos.coords.latitude,pos.coords.longitude);
            resolve();
          }, err => reject(err), {enableHighAccuracy:true, timeout:7000});
        });
        from = window.lastLocation;
      } catch(e) {
        alert('Enable location or use "Find My Location" first.');
        return;
      }
    }

    // remove previous
    if (routingControl) { try{ map.removeControl(routingControl); } catch(e){} routingControl = null; }
    if (approxLine) { map.removeLayer(approxLine); approxLine = null; }

    // if routing lib present, try it
    if (L.Routing && L.Routing.control) {
      routingControl = L.Routing.control({
        waypoints:[from,to],
        router: L.Routing.osrmv1({serviceUrl:'https://router.project-osrm.org/route/v1'}),
        lineOptions: {styles:[{color:'#1D4ED8',weight:6}]},
        show:false,
        addWaypoints:false,
        createMarker: ()=>null
      }).addTo(map);
      routingControl.on('routingerror', ()=> fallback());
      routingControl.on('routesfound', ()=> map.fitBounds(L.latLngBounds(from,to).pad(0.7)));
      return;
    }
    // otherwise fallback
    fallback();

    function fallback(){
      approxLine = L.polyline([from,to], {color:'#ef4444', dashArray:'6,6', weight:4}).addTo(map);
      map.fitBounds(L.latLngBounds(from,to).pad(0.6));
      L.popup({maxWidth:300}).setLatLng(to).setContent(`<strong>Approx. route</strong><div>Routing not available — shown as straight-line. Distance: ${(from.distanceTo(to)/1000).toFixed(2)} km</div>`).openOn(map);
    }
  }

  // QR: small popup showing resource details (uses browser QR lib if present)
  function showQRCode(resource){
    const payload = {id:resource.id,name:resource.name,address:resource.address,phone:resource.phone,lat:resource.lat,lng:resource.lng};
    const popupNode = document.createElement('div');
    popupNode.style.width = '180px'; popupNode.style.height = '180px';
    try {
      // if qrcode lib present (qrcode.min.js), draw canvas
      if (window.QRCode && typeof QRCode.toCanvas === 'function') {
        const canvas = document.createElement('canvas');
        canvas.width = 160; canvas.height = 160;
        QRCode.toCanvas(canvas, JSON.stringify(payload));
        popupNode.appendChild(canvas);
      } else {
        popupNode.textContent = JSON.stringify(payload);
      }
    } catch(e){
      popupNode.textContent = JSON.stringify(payload);
    }
    L.popup({maxWidth:200}).setLatLng([resource.lat,resource.lng]).setContent(popupNode).openOn(map);
  }

  // translation rebind
  window.rebindTranslations = function(lang){
    window.currentLanguage = lang;
    localStorage.setItem('dtes_lang', lang);
    // rebuild popups
    window._markers.forEach(m => m.setPopupContent(createPopupHTML(m.resource)));
    // update UI labels via global uiTranslate function (index.html wires it)
    if (window.uiTranslate) window.uiTranslate(lang);
  };

  // read current open popup
  window.readCurrentPopup = function(){
    const content = document.querySelector('.leaflet-popup-content');
    if (!content) return alert('Open a resource popup to read it aloud.');
    const text = content.innerText || content.textContent;
    if ('speechSynthesis' in window) {
      const s = new SpeechSynthesisUtterance(text);
      s.lang = window.currentLanguage || 'en';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(s);
    } else alert('Speech synthesis not supported.');
  };

  // init
  loadResources();

  // expose map for debug
  window._dtes_map = map;

})();
