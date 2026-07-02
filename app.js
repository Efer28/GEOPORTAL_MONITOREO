const SUPABASE_URL = 'https://qolflqkhrwvvrittqoqh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvbGZscWtocnd2dnJpdHRxb3FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODc5MjAsImV4cCI6MjA5NzA2MzkyMH0.jO-1lQuNvzooPq9K8IcsaGdU1ixPMwVTs30W5zqMMjA';

const map = L.map('map', {zoomControl: true}).setView([-1.5, -78.5], 7);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '&copy; OpenStreetMap', maxZoom: 19});
const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {attribution: '&copy; ESRI', maxZoom: 19});
const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {attribution: '&copy; ESRI', maxZoom: 19});

const baseMaps = { "OpenStreetMap": osm, "Sat\u00e9lite (ESRI)": sat };
const overlays = { "Etiquetas": labels, "Puntos monitoreo": L.featureGroup().addTo(map), "Reportes de campo": L.featureGroup().addTo(map) };

sat.addTo(map);
labels.addTo(map);

let controlCapas = L.control.layers(baseMaps, overlays, {collapsed: false, position: 'topright'}).addTo(map);
const capasCargadas = {};
const colores = ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#a65628','#f781bf','#999999'];

let puntosMonitoreo = [];
let puntoSeleccionado = null;
let marcadorSeleccion = null;

function normalizarURL(url){
  url = url.trim().replace(/\/+$/,'');
  if(url.endsWith('/rest/v1')) url = url.replace('/rest/v1','');
  return url;
}

function toggleConfig(){
  const p = document.getElementById('configPanel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function mostrarToast(msg, tipo){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + tipo + ' visible';
  setTimeout(() => t.className = 'toast', 3500);
}

async function cargarPuntosMonitoreo(){
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/p_monitoreo?select=*&limit=100', {
      headers: {apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY}
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const datos = await res.json();
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
          radius: 7, fillColor: '#0a6e5e', color: '#064a3f',
          weight: 2, fillOpacity: 0.8
        });
      },
      onEachFeature: function(f, layer){
        const p = f.properties;
        layer.bindPopup(
          '<b>' + p.name + '</b><br>' +
          'Elev: ' + (p.elevation ? p.elevation.toFixed(1) + ' m' : 'N/D') + '<br>' +
          p.date_obs + ' ' + p.time_obs
        );
        layer.on('click', function(){
          abrirModalReporteConPunto(p);
        });
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
  document.getElementById('campo_oxigeno').value = '';
  document.getElementById('campo_temperatura').value = '';
  document.getElementById('campo_ph').value = '';
  document.getElementById('campo_conductividad').value = '';
  document.getElementById('campo_observaciones').value = '';
  document.getElementById('campo_fecha').value = '';
  document.getElementById('campo_hora').value = '';
  document.getElementById('buscadorPuntos').value = '';
  if(marcadorSeleccion){ map.removeLayer(marcadorSeleccion); marcadorSeleccion = null }
}

function mostrarListaPuntos(){
  const lista = document.getElementById('listaPuntos');
  const filtro = document.getElementById('buscadorPuntos').value.toLowerCase();
  const filtrados = puntosMonitoreo.filter(p =>
    (p.name || '').toLowerCase().includes(filtro) ||
    (p.gid && String(p.gid).includes(filtro))
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
      '<div class="punto-info">' +
        '<div class="punto-nombre">' + (p.name || 'Sin nombre') + '</div>' +
        '<div class="punto-coords">' +
          (coords ? coords[1].toFixed(5) + ', ' + coords[0].toFixed(5) : '') +
        '</div>' +
        '<div class="punto-fecha">' + (p.date_obs || '') + ' ' + (p.time_obs || '') + '</div>' +
      '</div>' +
      '<div class="punto-check">' + (sel ? '\u2713' : '') + '</div>' +
    '</div>';
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
  if(!puntoSeleccionado){
    mostrarToast('Selecciona un punto de monitoreo', 'error');
    return;
  }

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

  const body = {
    punto_monitoreo_gid: puntoSeleccionado.gid,
    punto_monitoreo_nombre: puntoSeleccionado.name,
    fecha_medicion: document.getElementById('campo_fecha').value || null,
    hora_medicion: document.getElementById('campo_hora').value || null,
    oxigeno_disuelto: oxigeno,
    temperatura: temperatura,
    ph: ph,
    conductividad: conductividad,
    latitud: lat,
    longitud: lon,
    ubicacion: (lat && lon) ? (lat.toFixed(5) + ', ' + lon.toFixed(5)) : null,
    observaciones: observaciones || null
  };

  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/reportes_campo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    mostrarToast('Reporte guardado en ' + puntoSeleccionado.name, 'success');
    cerrarModalReporte();
    cargarReportes();
  } catch(e){
    mostrarToast('Error al guardar: ' + e.message, 'error');
  }
}

async function cargarReportes(){
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/reportes_campo?select=*&order=fecha.desc&limit=50', {
      headers: {apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY}
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const datos = await res.json();

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
          return L.circleMarker(ll, {
            radius: 6, fillColor: '#f59e0b', color: '#d97706',
            weight: 2, fillOpacity: 0.7
          });
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

async function consultarTabla(tabla, color, supabaseUrl, apiKey){
  const response = await fetch(supabaseUrl + '/rest/v1/' + tabla + '?select=*', {
    headers: {apikey: apiKey, Authorization: 'Bearer ' + apiKey}
  });
  if(!response.ok) throw new Error('Error en tabla "' + tabla + '": ' + response.status);
  const datos = await response.json();
  if(datos.length === 0) return null;

  const features = [];
  datos.forEach(reg => {
    let geom = reg.geom || reg.geometry || reg.geojson || reg.the_geom;
    if(typeof geom === 'string') try { geom = JSON.parse(geom) } catch(e) {}
    if(geom && geom.type){
      features.push({type:"Feature", properties:reg, geometry:geom});
    } else {
      const lat = reg.lat ?? reg.latitude ?? reg.latitud ?? reg.y;
      const lon = reg.lon ?? reg.lng ?? reg.longitude ?? reg.longitud ?? reg.x;
      if(lat !== undefined && lon !== undefined){
        features.push({
          type:"Feature", properties:reg,
          geometry:{type:"Point", coordinates:[parseFloat(lon), parseFloat(lat)]}
        });
      }
    }
  });
  if(features.length === 0) return null;

  return L.geoJSON({type:"FeatureCollection", features}, {
    style: {color, weight:2, fillOpacity:0.4},
    pointToLayer: function(feature, latlng){
      return L.circleMarker(latlng, {
        radius:6, fillColor:color, color:color, weight:2, fillOpacity:0.6
      });
    },
    onEachFeature: function(feature, layer){
      let html = '<b>' + tabla + '</b><hr>';
      for(let campo in feature.properties){
        if(!['geom','geometry','the_geom','geojson'].includes(campo)){
          html += '<b>' + campo + '</b>: ' + feature.properties[campo] + '<br>';
        }
      }
      layer.bindPopup(html);
    }
  });
}

async function cargarCapas(){
  const estado = document.getElementById('estado');
  estado.style.color = 'black';
  estado.innerHTML = 'Cargando capas...';
  document.getElementById('infoLeyenda').classList.remove('visible');

  Object.values(capasCargadas).forEach(c => map.removeLayer(c));
  for(let k in capasCargadas) delete capasCargadas[k];
  map.removeControl(controlCapas);
  controlCapas = L.control.layers(baseMaps, overlays, {collapsed: false, position: 'topright'}).addTo(map);

  const supabaseUrl = normalizarURL(document.getElementById('supabase_url').value);
  const apiKey = document.getElementById('supabase_key').value.trim();
  const tablas = document.getElementById('tablas').value.split(',').map(t=>t.trim()).filter(t=>t);

  if(!supabaseUrl || !apiKey || tablas.length === 0){
    estado.style.color = 'red';
    estado.innerHTML = 'Complete URL, API Key y al menos una tabla.';
    return;
  }

  try {
    let grupo = L.featureGroup();
    let cargadas = 0;
    const total = tablas.length;
    const errores = [];

    for(let i = 0; i < total; i++){
      const tabla = tablas[i];
      estado.innerHTML = 'Cargando (' + (i+1) + '/' + total + '): ' + tabla + '...';
      try {
        const capa = await consultarTabla(tabla, colores[i % colores.length], supabaseUrl, apiKey);
        if(capa){
          capa.addTo(map);
          controlCapas.addOverlay(capa, tabla);
          capasCargadas[tabla] = capa;
          capa.eachLayer(l => grupo.addLayer(l));
          cargadas++;
        }
      } catch(err){
        errores.push(err.message);
      }
    }

    if(grupo.getLayers().length > 0) map.fitBounds(grupo.getBounds());

    const infoCapa = document.getElementById('infoLeyenda');
    if(cargadas > 0){
      infoCapa.classList.add('visible');
      infoCapa.innerHTML = cargadas + '/' + total + ' capas cargadas';
      estado.style.color = 'green';
      estado.innerHTML = cargadas + ' capas cargadas correctamente.';
    } else {
      estado.style.color = 'red';
      estado.innerHTML = 'No se carg\u00f3 ninguna capa.';
    }
    if(errores.length > 0){
      estado.innerHTML += '<br><span style="color:red;font-size:12px">Errores: ' + errores.join('; ') + '</span>';
    }
  } catch(error){
    estado.style.color = 'red';
    estado.innerHTML = error.message;
    console.error(error);
  }
}

cargarPuntosMonitoreo();
cargarReportes();
