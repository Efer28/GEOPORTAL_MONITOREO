const SUPABASE_URL = 'https://qolflqkhrwvvrittqoqh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvbGZscWtocnd2dnJpdHRxb3FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODc5MjAsImV4cCI6MjA5NzA2MzkyMH0.jO-1lQuNvzooPq9K8IcsaGdU1ixPMwVTs30W5zqMMjA';

const map = L.map('map', {zoomControl: true}).setView([-1.5, -78.5], 7);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '&copy; OpenStreetMap', maxZoom: 19});
const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {attribution: '&copy; ESRI', maxZoom: 19});
const ghyb = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {attribution: 'Google', maxZoom: 20, subdomains: ['0','1','2','3']});
const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {attribution: '&copy; ESRI', maxZoom: 19});

const baseMaps = { "OpenStreetMap": osm, "Sat\u00e9lite (ESRI)": sat, "Google Hybrid": ghyb };
const overlays = { "Puntos monitoreo": L.featureGroup().addTo(map), "Reportes de campo": L.featureGroup().addTo(map), "Garc\u00eda Moreno": L.featureGroup().addTo(map) };

sat.addTo(map);
labels.addTo(map);

let controlCapas = L.control.layers(baseMaps, null, {collapsed: false, position: 'topright'}).addTo(map);
map.on('baselayerchange', function(e){ if(e.layer) e.layer.bringToBack(); });
actualizarLeyenda();

function toggleCapa(nombre, el) {
  const grupo = overlays[nombre];
  if (!grupo) return;
  if (map.hasLayer(grupo)) {
    map.removeLayer(grupo);
    el.classList.remove('activo');
  } else {
    map.addLayer(grupo);
    grupo.bringToFront();
    el.classList.add('activo');
    setTimeout(() => {
      try { const b = grupo.getBounds(); if (b.isValid()) map.fitBounds(b.pad(0.1)); } catch(e) {}
    }, 350);
  }
  actualizarLeyenda();
}

function actualizarLeyenda() {
  const div = document.getElementById('leyendaMapa');
  const items = [];
  if (map.hasLayer(overlays["Puntos monitoreo"]))
    items.push('<div class="ley-item"><div class="ley-marca azul"></div>Puntos monitoreo</div>');
  if (map.hasLayer(overlays["Reportes de campo"]))
    items.push('<div class="ley-item"><div class="ley-marca ambar"></div>Reportes de campo</div>');
  if (map.hasLayer(overlays["Garc\u00eda Moreno"]))
    items.push('<div class="ley-item"><div class="ley-marca poligono"></div>Garc\u00eda Moreno</div>');

  if (items.length === 0) {
    div.classList.remove('visible');
    return;
  }
  div.innerHTML = '<h4>Capas activas</h4>' + items.join('');
  div.classList.add('visible');
}

let puntosMonitoreo = [];
let puntoSeleccionado = null;
let marcadorSeleccion = null;

function mostrarToast(msg, tipo){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + tipo + ' visible';
  setTimeout(() => t.className = 'toast', 3500);
}

async function api(path, options = {}) {
  const url = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + path.replace(/^\//, '');
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  const opts = { headers, credentials: 'omit' };
  if (options.method && options.method !== 'GET') {
    opts.method = options.method;
    opts.body = JSON.stringify(options.body);
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error('Error: ' + res.status);
    try { return await res.json() } catch { return null }
  } else {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error('Error: ' + res.status);
    return await res.json();
  }
}

async function cargarPuntosMonitoreo(){
  try {
    const datos = await api('p_monitoreo?select=*&limit=100');
    puntosMonitoreo = datos;
    const grupo = overlays["Puntos monitoreo"];
    grupo.clearLayers();
    if(datos.length === 0) return;

    const features = datos.map(p => {
      let coords = null;
      if(p.geom && p.geom.coordinates) coords = p.geom.coordinates;
      return {
        type: 'Feature',
        properties: p,
        geometry: coords ? {type:'Point', coordinates:[coords[0], coords[1]]} : null
      };
    }).filter(f => f.geometry);

    L.geoJSON({type:'FeatureCollection', features}, {
      pointToLayer: function(f, ll){
        return L.circleMarker(ll, {
          radius: 9, fillColor: '#b3e0ff', color: '#5b9bd5',
          weight: 3, fillOpacity: 0.85, className: 'marcador-monitoreo'
        });
      },
      onEachFeature: function(f, layer){
        const p = f.properties;
        layer.bindPopup('<b>' + p.name + '</b><br>Elev: ' + (p.elevation ? p.elevation.toFixed(1) + ' m' : 'N/D') + '<br>' + p.date_obs + ' ' + p.time_obs);
        layer.on('click', function(){ abrirModalReporteConPunto(p); });
      }
    }).addTo(grupo);

    map.fitBounds(grupo.getBounds().pad(0.1));
  } catch(e){
    console.error('Error al cargar p_monitoreo:', e);
  }
}

function abrirModalReporte(){
  puntoSeleccionado = null;
  document.getElementById('paso1').className = 'paso activo';
  document.getElementById('paso2').className = 'paso';
  document.getElementById('pasoSeleccion').style.display = 'block';
  document.getElementById('pasoFormulario').style.display = 'none';
  document.getElementById('modalReporte').classList.add('active');
  mostrarListaPuntos();
}

function abrirModalReporteConPunto(punto){
  puntoSeleccionado = punto;
  document.getElementById('modalReporte').classList.add('active');
  avanzarAFormulario();
}

function cerrarModalReporte(){
  document.getElementById('modalReporte').classList.remove('active');
  puntoSeleccionado = null;
  ['campo_oxigeno','campo_temperatura','campo_ph','campo_conductividad','campo_observaciones','campo_fecha','campo_hora','buscadorPuntos'].forEach(id => document.getElementById(id).value = '');
  if(marcadorSeleccion){ map.removeLayer(marcadorSeleccion); marcadorSeleccion = null }
}

function mostrarListaPuntos(){
  const lista = document.getElementById('listaPuntos');
  const filtro = document.getElementById('buscadorPuntos').value.toLowerCase();
  const filtrados = puntosMonitoreo.filter(p =>
    (p.name || '').toLowerCase().includes(filtro) || (p.gid && String(p.gid).includes(filtro))
  );
  if(filtrados.length === 0){
    lista.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-light)">No se encontraron puntos</div>';
    return;
  }
  lista.innerHTML = filtrados.map(p => {
    const coords = p.geom && p.geom.coordinates;
    const sel = puntoSeleccionado && p.gid === puntoSeleccionado.gid;
    return '<div class="punto-item' + (sel ? ' seleccionado' : '') + '" onclick="seleccionarPunto(' + p.gid + ')">' +
      '<div class="punto-icono">' + (p.name ? p.name.slice(0,2) : '?') + '</div>' +
      '<div class="punto-info"><div class="punto-nombre">' + (p.name || 'Sin nombre') + '</div>' +
      '<div class="punto-coords">' + (coords ? coords[1].toFixed(5) + ', ' + coords[0].toFixed(5) : '') + '</div>' +
      '<div class="punto-fecha">' + (p.date_obs || '') + ' ' + (p.time_obs || '') + '</div></div>' +
      '<div class="punto-check">' + (sel ? '\u2713' : '') + '</div></div>';
  }).join('');
}

function filtrarPuntos(){ mostrarListaPuntos() }

function seleccionarPunto(gid){
  puntoSeleccionado = puntosMonitoreo.find(p => p.gid === gid);
  if(!puntoSeleccionado) return;
  mostrarListaPuntos();
  avanzarAFormulario();
}

function avanzarAFormulario(){
  if(!puntoSeleccionado) return;
  document.getElementById('paso1').className = 'paso completado';
  document.getElementById('paso2').className = 'paso activo';
  document.getElementById('pasoSeleccion').style.display = 'none';
  document.getElementById('pasoFormulario').style.display = 'block';

  const coords = puntoSeleccionado.geom && puntoSeleccionado.geom.coordinates;
  const lat = coords ? coords[1] : null;
  const lon = coords ? coords[0] : null;

  document.getElementById('puntoSeleccionadoInfo').innerHTML =
    '<b>' + puntoSeleccionado.name + '</b> &mdash; ' +
    (lat ? lat.toFixed(5) + ', ' + lon.toFixed(5) : '') +
    ' &nbsp;|&nbsp; Elev: ' + (puntoSeleccionado.elevation ? puntoSeleccionado.elevation.toFixed(1) + ' m' : 'N/D');

  const ahora = new Date();
  document.getElementById('campo_fecha').value = ahora.toISOString().slice(0,10);
  document.getElementById('campo_hora').value = ahora.toTimeString().slice(0,5);

  if(lat && lon){
    if(marcadorSeleccion) map.removeLayer(marcadorSeleccion);
    marcadorSeleccion = L.circleMarker([lat, lon], {
      radius: 10, fillColor: '#f59e0b', color: '#d97706',
      weight: 3, fillOpacity: 0.8
    }).addTo(map);
    map.setView([lat, lon], 16);
  }
}

function volverSeleccionPunto(){
  document.getElementById('paso1').className = 'paso activo';
  document.getElementById('paso2').className = 'paso';
  document.getElementById('pasoSeleccion').style.display = 'block';
  document.getElementById('pasoFormulario').style.display = 'none';
  if(marcadorSeleccion){ map.removeLayer(marcadorSeleccion); marcadorSeleccion = null }
}

async function guardarReporte(){
  if(!puntoSeleccionado){ mostrarToast('Selecciona un punto de monitoreo', 'error'); return; }

  const oxigeno = parseFloat(document.getElementById('campo_oxigeno').value);
  const temperatura = parseFloat(document.getElementById('campo_temperatura').value);
  const ph = parseFloat(document.getElementById('campo_ph').value);
  const conductividad = parseFloat(document.getElementById('campo_conductividad').value);
  const observaciones = document.getElementById('campo_observaciones').value.trim();

  if(isNaN(oxigeno) || isNaN(temperatura) || isNaN(ph) || isNaN(conductividad)){
    mostrarToast('Completa todos los campos num\u00e9ricos', 'error');
    return;
  }

  const coords = puntoSeleccionado.geom && puntoSeleccionado.geom.coordinates;
  const lat = coords ? coords[1] : null;
  const lon = coords ? coords[0] : null;

  try {
    await api('reportes_campo', {
      method: 'POST',
      body: {
        punto_monitoreo_gid: puntoSeleccionado.gid,
        punto_monitoreo_nombre: puntoSeleccionado.name,
        fecha_medicion: document.getElementById('campo_fecha').value || null,
        hora_medicion: document.getElementById('campo_hora').value || null,
        oxigeno_disuelto: oxigeno,
        temperatura, ph, conductividad,
        latitud: lat, longitud: lon,
        ubicacion: (lat && lon) ? (lat.toFixed(5) + ', ' + lon.toFixed(5)) : null,
        observaciones: observaciones || null
      }
    });
    mostrarToast('Reporte guardado en ' + puntoSeleccionado.name, 'success');
    cerrarModalReporte();
    cargarReportes();
  } catch(e){ mostrarToast('Error al guardar: ' + e.message, 'error'); }
}

async function cargarReportes(){
  try {
    const datos = await api('reportes_campo?select=*&order=fecha.desc&limit=50');
    const ul = document.getElementById('ultimosReportes');
    if(datos.length === 0){
      ul.innerHTML = 'No hay reportes a\u00fan. Crea el primero.';
    } else {
      ul.innerHTML = datos.slice(0,8).map(r =>
        '<div style="padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:12px">' +
        '<b>' + (r.punto_monitoreo_nombre || 'Punto #' + r.punto_monitoreo_gid) + '</b> ' +
        '<span style="color:var(--text-light)">' + (r.fecha ? r.fecha.slice(0,10) : '') + '</span><br>' +
        'OD:' + r.oxigeno_disuelto + ' | T:' + r.temperatura + '\u00b0C | pH:' + r.ph +
        '</div>'
      ).join('');
    }

    const grupo = overlays["Reportes de campo"];
    grupo.clearLayers();

    const features = datos.filter(r => r.latitud && r.longitud).map(r => ({
      type: 'Feature',
      properties: r,
      geometry: {type: 'Point', coordinates: [parseFloat(r.longitud), parseFloat(r.latitud)]}
    }));

    if(features.length > 0){
      L.geoJSON({type:'FeatureCollection', features}, {
        pointToLayer: function(f, ll){
          return L.circleMarker(ll, { radius: 6, fillColor: '#f59e0b', color: '#d97706', weight: 2, fillOpacity: 0.7 });
        },
        onEachFeature: function(f, layer){
          const p = f.properties;
          let html = '<b>' + (p.punto_monitoreo_nombre || 'Reporte') + '</b><hr style="margin:4px 0">';
          html += '<b>OD:</b> ' + p.oxigeno_disuelto + ' mg/L<br>';
          html += '<b>Temperatura:</b> ' + p.temperatura + ' \u00b0C<br>';
          html += '<b>pH:</b> ' + p.ph + '<br>';
          html += '<b>Conductividad:</b> ' + p.conductividad + ' \u00b5S/cm<br>';
          if(p.observaciones) html += '<b>Obs:</b> ' + p.observaciones + '<br>';
          html += '<i style="font-size:11px">' + (p.fecha ? p.fecha.slice(0,16).replace('T',' ') : '') + '</i>';
          layer.bindPopup(html);
        }
      }).addTo(grupo);
    }
  } catch(e){
    document.getElementById('ultimosReportes').innerHTML = 'Error al cargar reportes';
    console.error(e);
  }
}

async function generarPDF() {
  try {
    const datos = await api('reportes_campo?select=*&order=fecha.desc&limit=500');
    if (!datos || datos.length === 0) {
      mostrarToast('No hay reportes para generar PDF', 'error');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(18);
    doc.setTextColor(91, 155, 213);
    doc.text('Geoportal AIC - Reportes de Monitoreo H\u00eddrico', 14, 20);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const ahora = new Date();
    doc.text('Generado: ' + ahora.toLocaleDateString('es-EC') + ' ' + ahora.toLocaleTimeString('es-EC'), 14, 27);
    doc.text('Total de reportes: ' + datos.length, 14, 32);

    const headers = [['N\u00b0', 'Punto', 'Fecha', 'Hora', 'OD (mg/L)', 'T (\u00b0C)', 'pH', 'Cond (\u00b5S/cm)', 'Observaciones']];
    const rows = datos.map((r, i) => [
      i + 1,
      r.punto_monitoreo_nombre || 'Punto #' + r.punto_monitoreo_gid,
      r.fecha ? r.fecha.slice(0, 10) : '',
      r.hora ? r.hora.slice(0, 5) : '',
      r.oxigeno_disuelto ?? '',
      r.temperatura ?? '',
      r.ph ?? '',
      r.conductividad ?? '',
      r.observaciones || ''
    ]);

    doc.autoTable({
      head: headers,
      body: rows,
      startY: 38,
      styles: { fontSize: 7, font: 'helvetica' },
      headStyles: { fillColor: [91, 155, 213], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 30 },
        2: { cellWidth: 18 },
        3: { cellWidth: 12 },
        4: { cellWidth: 16 },
        5: { cellWidth: 14 },
        6: { cellWidth: 12 },
        7: { cellWidth: 18 },
        8: { cellWidth: 40 }
      }
    });

    doc.save('reportes_monitoreo_AIC.pdf');
    mostrarToast('PDF generado con ' + datos.length + ' reportes', 'success');
  } catch (e) {
    mostrarToast('Error al generar PDF: ' + e.message, 'error');
    console.error(e);
  }
}

async function cargarGarciaMoreno(){
  try {
    const datos = await api('Garcia_Moreno?select=id,geom,DPA_DESPAR,DPA_DESCAN,DPA_DESPRO&limit=500');
    const grupo = overlays["Garc\u00eda Moreno"];
    grupo.clearLayers();
    if(datos.length === 0) return;

    const features = datos.map(p => {
      if(!p.geom) return null;
      return { type: 'Feature', properties: p, geometry: p.geom };
    }).filter(f => f);

    L.geoJSON({type:'FeatureCollection', features}, {
      style: { fillColor: '#ff6347', color: '#dc2626', weight: 2.5, fillOpacity: 0.4 },
      onEachFeature: function(f, layer){
        const p = f.properties;
        layer.bindPopup(
          '<b>Garc\u00eda Moreno</b><br>' +
          'Parroquia: ' + (p.DPA_DESPAR || 'N/D') + '<br>' +
          'Cant\u00f3n: ' + (p.DPA_DESCAN || 'N/D') + '<br>' +
          'Provincia: ' + (p.DPA_DESPRO || 'N/D')
        );
      }
    }).addTo(grupo);

    if(!document.querySelector('.switch[onclick*="Garc\\u00eda"]')?.classList.contains('activo'))
      map.removeLayer(grupo);
  } catch(e){ console.error('Error al cargar Garcia_Moreno:', e) }
}

cargarPuntosMonitoreo();
cargarGarciaMoreno();
cargarReportes();
