// js/markers.js
// Loads dtes-resources.json, creates Leaflet map, clusters, popups, translations, directions.
// Exposes window.markers (array of markers) and window.rebindTranslations(lang).

(function(){
  // Basic config
  const RESOURCE_URL = '/dtes-resources.json';
  window.currentLanguage = window.currentLanguage || 'en';

  // Map init
  const map = L.map('map', {zoomControl:true}).setView([49.2819, -123.1003], 15);

  // Tile layer: use OpenStreetMap as default (if online) OR use local tile fallback if provided later
  const tile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // cluster
  const markerCluster = L.markerClusterGroup({
    chunkedLoading: true,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        html: '<div style="background:rgba(71,243,197,0.1);border:2px solid #47F3C5;color:#47F3C5;border-radius:999px;padding:6px 10px;font-weight:700;">' + count + '</div>',
        className: 'custom-cluster',
        iconSize: L.point(40,40)
      });
    }
  });

  window.markers = []; // exposed

  // UI elements
  const loader = document.getElementById('loader');
  const resourceList = document.getElementById('resourceList');

  let resources = [];

  // Utility: get translated field if available
  function tField(resource, field) {
    if (!resource) return '';
    const lang = window.currentLanguage || 'en';
    if (resource.translations && resource.translations[lang] && resource.translations[lang][field]) return resource.translations[lang][field];
    return resource[field] || '';
  }

  // Create popup HTML from resource data (uses translation where available)
  function createPopup(resource) {
    const name = tField(resource,'name') || resource.name;
    const desc = tField(resource,'description') || resource.description || '';
    const hours = tField(resource,'hours') || resource.hours || '';
    const addr = tField(resource,'address') || resource.address || '';
    const phone = tField(resource,'phone') || resource.phone || '';
    const type = resource.type || '';

    const html = `
      <div class="popup">
        <h3 style="margin:0 0 6px 0;">${escapeHtml(name)}</h3>
        <div style="font-size:0.95rem; margin-bottom:6px;">${escapeHtml(type)}</div>
        <div style="font-size:0.95rem;">${escapeHtml(desc)}</div>
        ${addr ? `<div style="margin-top:6px;"><strong>Address:</strong> ${escapeHtml(addr)}</div>` : ''}
        ${hours ? `<div><strong>Hours:</strong> ${escapeHtml(hours)}</div>` : ''}
        ${phone ? `<div><strong>Phone:</strong> <a href="tel:${encodeURIComponent(phone)}">${escapeHtml(phone)}</a></div>` : ''}
        <div style="margin-top:8px;display:flex;gap:8px;">
          <button class="dir-btn control-btn" data-id="${resource.id}">Directions</button>
          <button class="qr-btn control-btn" data-json='${escapeAttr(JSON.stringify({
            id: resource.id, name: name, address: addr, phone: phone, lat: resource.lat, lng: resource.lng
          }))}'>QR</button>
        </div>
      </div>
    `;
    return html;
  }

  window.createPopup = createPopup;

  // escape helpers
  function escapeHtml(s){ if(!s) return ''; return (''+s).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]; });}
  function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

  // Load resources (fetch JSON)
  async function loadResources(){
    try {
      const res = await fetch(RESOURCE_URL, {cache: 'no-cache'});
      if (!res.ok) throw new Error('Failed to fetch resources: ' + res.status);
      resources = await res.json();
      // build markers
      resources.forEach(r => {
        if (!r.lat || !r.lng) return;
        const m = L.marker([r.lat, r.lng], {title: r.name});
        m.resourceData = r;
        const popupContent = createPopup(r);
        m.bindPopup(popupContent, {maxWidth:320});
        m.on('popupopen', () => {
          // wire popup buttons
          setTimeout(() => {
            const el = document.querySelector('.dir-btn[data-id="'+r.id+'"]');
            if (el) el.addEventListener('click', () => startDirectionsTo(r));
            const q = document.querySelector('.qr-btn[data-json]');
            if (q) q.addEventListener('click', (ev) => {
              const payload = JSON.parse(ev.currentTarget.getAttribute('data-json'));
              showQR(payload);
            });
          }, 50);
        });
        markerCluster.addLayer(m);
        window.markers.push(m);
      });

      map.addLayer(markerCluster);
      populateList(resources);

      // hide loader
      if (loader) loader.style.display = 'none';
    } catch (err) {
      console.error('Error loading resources', err);
      if (loader) {
        loader.querySelector('h2').textContent = 'Failed to load resources.';
      }
    }
  }

  // populate list view
  function populateList(list){
    resourceList.innerHTML = '';
    list.forEach(r => {
      const li = document.createElement('li');
      li.className = 'p-2 bg-black/50 rounded';
      li.innerHTML = `<div class="font-semibold">${escapeHtml(tField(r,'name') || r.name)}</div>
                      <div class="text-xs">${escapeHtml(r.type)} — ${escapeHtml(r.address || '')}</div>
                      <button class="control-btn mt-2" data-id="${r.id}">Show on map</button>`;
      resourceList.appendChild(li);
      li.querySelector('button').addEventListener('click', () => {
        // find marker
        const m = window.markers.find(mm => mm.resourceData && mm.resourceData.id === r.id);
        if (m) {
          map.setView(m.getLatLng(), 18);
          m.openPopup();
        }
      });
    });
  }

  // Search/filtering
  window.filterResources = function(q){
    const s = (q||'').toLowerCase().trim();
    if (!s) {
      // show all
      markerCluster.clearLayers();
      window.markers.forEach(m => markerCluster.addLayer(m));
      populateList(resources);
      return;
    }
    const filtered = resources.filter(r => {
      return (r.name && r.name.toLowerCase().includes(s)) ||
             (r.type && r.type.toLowerCase().includes(s)) ||
             (r.description && r.description.toLowerCase().includes(s)) ||
             (r.address && r.address.toLowerCase().includes(s));
    });
    // clear + add matching markers
    markerCluster.clearLayers();
    window.markers.forEach(m => {
      if (filtered.some(fr => fr.id === m.resourceData.id)) markerCluster.addLayer(m);
    });
    populateList(filtered);
  };

  // Direction logic:
  // - Try to use Leaflet Routing Machine (will use online router if available)
  // - If routing fails (or offline), draw straight-line polyline as approximate directions
  let routingControl = null;
  let approxLine = null;
  async function startDirectionsTo(resource){
    // If user location known, use it. Otherwise request locate.
    if (!window.lastLocation) {
      // ask for location
      map.locate({setView:false, maxZoom:16});
      // wait briefly
      const got = await new Promise(resolve => {
        let done = false;
        const onloc = (e) => { if (!done) { done=true; map.off('locationfound', onloc); resolve(e.latlng); } };
        map.on('locationfound', onloc);
        setTimeout(() => { if(!done){ done=true; map.off('locationfound', onloc); resolve(null);} }, 5000);
      });
      if (!got) {
        alert('Please enable location (browser) or use "Find me" first.');
        return;
      }
      window.lastLocation = got;
    }

    const from = window.lastLocation;
    const to = L.latLng(resource.lat, resource.lng);

    // remove prior approx
    if (approxLine) { map.removeLayer(approxLine); approxLine=null; }
    if (routingControl) { try{ map.removeControl(routingControl);}catch(e){} routingControl=null; }

    // Try routing machine (network). Leaflet Routing will fail if OSRM unreachable.
    try {
      routingControl = L.Routing.control({
        waypoints: [from, to],
        lineOptions: { styles: [{color: '#47F3C5', weight: 5}] },
        router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
        showAlternatives: false,
        addWaypoints: false,
        createMarker: function() { return null; }
      }).addTo(map);

      // after route is ready, open it
      routingControl.on('routesfound', function() {
        map.fitBounds(L.latLngBounds(from,to).pad(0.7));
      });

      routingControl.on('routingerror', function(err){
        console.warn('Routing error', err);
        // fallback to approx line
        fallbackApprox();
      });

    } catch (err) {
      console.warn('Routing failed, fallback to approximate.', err);
      fallbackApprox();
    }

    function fallbackApprox(){
      approxLine = L.polyline([from,to], {color:'#FF6B6B', dashArray:'6,8', weight:4}).addTo(map);
      map.fitBounds(L.latLngBounds(from,to).pad(0.6));
      // show popup describing approximate route
      L.popup({maxWidth:300})
        .setLatLng(to)
        .setContent(`<strong>Approximate directions</strong><div>Routing is not available offline. This red line is a straight-line approximation. Distance: ${(from.distanceTo(to)/1000).toFixed(2)} km</div>`)
        .openOn(map);
    }
  }

  // show QR code popup
  function showQR(payload){
    const qrDiv = document.createElement('div');
    qrDiv.style.width='160px';
    qrDiv.style.height='160px';
    qrDiv.style.display='flex';
    qrDiv.style.alignItems='center';
    qrDiv.style.justifyContent='center';
    QRCode.toCanvas(qrDiv, JSON.stringify(payload));
    L.popup({maxWidth:200})
      .setLatLng([payload.lat||window.mapCenterLat||49.2819, payload.lng||window.mapCenterLng||-123.1003])
      .setContent(qrDiv)
      .openOn(map);
  }

  // locate me helper
  window.locateMe = function(){
    if (!navigator.geolocation) return alert('Geolocation not supported by this browser.');
    if (loader) { loader.style.display = 'flex'; loader.querySelector('h2').textContent = 'Locating…'; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      window.lastLocation = latlng;
      L.circleMarker(latlng,{radius:6, color:'#47F3C5'}).addTo(map);
      map.setView(latlng, 16);
      if (loader) loader.style.display = 'none';
    }, (err) => {
      console.warn('Locate error', err);
      if (loader) loader.style.display = 'none';
      alert('Unable to access location. Check browser settings.');
    }, {enableHighAccuracy:true, maximumAge:20000});
  };

  // rebind translations when language changes
  window.rebindTranslations = function(lang){
    window.currentLanguage = lang;
    // recreate popup content for each marker
    window.markers.forEach(m => {
      const html = createPopup(m.resourceData);
      m.setPopupContent(html);
    });
    // refresh list view content
    populateList(resources);
  };

  // read current open popup (accessibility)
  window.readCurrentPopup = function(){
    const open = document.querySelector('.leaflet-popup-content');
    if (!open) return alert('Open a popup first to read it out loud.');
    const text = open.innerText || open.textContent;
    if ('speechSynthesis' in window) {
      const s = new SpeechSynthesisUtterance(text);
      s.lang = window.currentLanguage || 'en';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(s);
    } else {
      alert('Speech synthesis not supported on this device.');
    }
  };

  // attach locate event to capture lastLocation
  map.on('locationfound', (e) => { window.lastLocation = e.latlng; });

  // allow clicking a cluster to zoom into area (default behaviour)
  markerCluster.on('clusterclick', function(a){
    map.fitBounds(a.layer.getBounds(), {padding:[40,40]});
  });

  // initial load
  loadResources();

  // expose map in case other scripts use it
  window._dtes_map = map;

})();
