/* ============================================================
   FARDA · base compartida para desperdicios.html y conteo.html
   Sin dependencias externas. Habla directo con Supabase REST.
   ============================================================ */
const SUPA_URL = 'https://snwuddryxaehunxbyflp.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNud3VkZHJ5eGFlaHVueGJ5ZmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDU0ODMsImV4cCI6MjA5ODQ4MTQ4M30.8OO53huAHhFBcLe07aMiA7RWTZ2igQ8r2NfTTH7yFcM';

async function sb(path, opt = {}) {
  const res = await fetch(SUPA_URL + '/rest/v1/' + path, {
    ...opt,
    headers: {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      Prefer: opt.prefer || 'return=representation',
      ...(opt.headers || {})
    }
  });
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!res.ok) throw new Error((body && body.message) || ('Error ' + res.status));
  return body;
}

const money = n => '$' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const money2 = n => '$' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = n => (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 3 });
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const hoy = () => new Date().toLocaleDateString('sv-SE');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- sesión ---------- */
const SESSION_KEY = 'farda_stock_user';
function getUser() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}
function setUser(u) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); } catch (e) {}
}
function logout() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  location.reload();
}
async function loginConPin(pin) {
  const r = await sb('stock_usuarios?select=id,nombre,rol&pin=eq.' + encodeURIComponent(pin));
  if (!r.length) throw new Error('PIN incorrecto');
  setUser(r[0]);
  return r[0];
}

/* ---------- costos ---------- */
/* costo de una variante = costo del insumo base x unidad_conversion */
function costoVariante(v, insumos) {
  const base = insumos[v.insumo_nombre];
  if (!base || !base.costo) return null;
  const f = Number(v.unidad_conversion) || 1;
  return Number(base.costo) * f;
}
function unidadVariante(v, insumos) {
  if (v.presentacion) return v.presentacion;
  const base = insumos[v.insumo_nombre];
  return (base && base.unidad) ? base.unidad.toLowerCase() : 'unid.';
}

/* ---------- stock teórico ---------- */
/* entradas suman, todo lo demás resta. Ignora los anulados. */
function calcularStock(movimientos) {
  const mapa = {};
  movimientos.forEach(m => {
    if (m.anulado) return;
    const k = m.variante_id + '|' + m.deposito_id;
    const signo = m.tipo === 'entrada' ? 1 : -1;
    mapa[k] = (mapa[k] || 0) + signo * Number(m.cantidad || 0);
  });
  return mapa;
}
const stockDe = (mapa, varianteId, depositoId) => mapa[varianteId + '|' + depositoId] || 0;

/* ---------- producciones propias ---------- */
/* Salen de la categoría PRODUCCIÓN PROPIA de Fudo. Viven acá y no en la base
   para no depender de una columna nueva: si agregás una producción en Fudo,
   sumala a esta lista. */
const PRODUCCIONES = new Set([
  "MANTECA AHUMADA x KILO",
  "ALIOLI",
  "ADEREZO CAESAR 1/2 KILO",
  "POLLO ASADO CAESAR",
  "TRUCHA CURADA AHUMADA",
  "PRALINE DE AVELLANAS",
  "MASA DE ESPINACA DE PASTA RELLENA",
  "CHIMICHURRI DE HIERBAS",
  "COSTILLAR AHUMADO 8 HORAS",
  "HUEVADA PARA MILANESA",
  "PURE DE BONIATO",
  "MASA DE GNOCCHI DE SÉMOLA",
  "POMODORO",
  "SALSA CRIOLLA",
  "CEBOLLA MORADA ENCURTIDA KILO",
  "AJIES ENCURTIDOS",
  "PEPINOS ENCURTIDOS",
  "VINAGRETA DE MOSTAZA",
  "PROVENZAL",
  "MARINADA MATAMBRITO",
  "DEMIGLACE DE CEBOLLA",
  "CROUTONS X 1/2KILO",
  "LIQUIDO DE GOBIERNO",
  "MORRONES ASADOS",
  "SALSA CRIOLLA 1/2 KILO",
  "BISQUET",
  "CHIPS DE AJO",
  "ENSALADA DE REMOLACHA x6",
  "HUMITA GRATINADA x8",
  "ESPINACA A LA CREMA RECETA GRANDE",
  "PAPAS FRITAS TRIPLE COCCIÓN x5",
  "PAPA ROSTI x4",
  "PURE DE PAPA x5",
  "SETAS DE CARDO ASADA x9",
  "MASA DE PANQUEQUE x38",
  "REDUCCION DE NARANJA",
  "REDUCCION DE ARANDANOS",
  "CREMA BATIDA",
  "MOUSE DE CHOCOLATE RECETA",
  "QUINOTOS EN ALMIBAR",
  "AVELLANAS ACARAMELADAS",
  "TORTA VASCA DE PISTACHO",
  "DULCE DE BONIATO",
  "TIRAMISU",
  "CAFE LITRO",
  "CREMA DE TIRAMISU",
  "VAINILLAS PREPARACION",
  "TAPA ALFAJOR DE CHOCOLATE",
  "RELLENO ALFAJOR LIMON",
  "PASTA RELLENA MASA ESPINACA PRODUCCION",
  "PAN DE QUESO",
  "LIBRITO DE GRASA",
  "PESTO DE ALBAHACA 1/2 KILO",
  "BUÑUELOS DE ACELGA RECETA x5 porciones",
  "RELLENO EMPANADA DE CARNE",
  "RELLENO EMPANADA DE HUMITA"
].map(norm));
const esProduccion = v => PRODUCCIONES.has(norm(v.insumo_nombre));
