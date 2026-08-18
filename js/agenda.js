/* ============================================================
   js/agenda.js
   Disponibilidad y configuración de agenda para el SITIO PÚBLICO.
   El backend es la ÚNICA fuente de verdad — este archivo reemplaza
   la lógica vieja de "taken_slots" en localStorage (que solo veía
   lo reservado desde el mismo navegador).

   Requiere: script.js cargado ANTES (usa API_URL, DB, getAgenda).
   ============================================================ */

// ── Interruptor de transición Calendly → sistema propio ─────
// Mientras Calendly siga siendo el sistema real de reservas, esto
// se mantiene en false: el motor de disponibilidad/Turnos.gs sigue
// activo y se puede probar igual, pero el sitio NO recibe reservas
// reales — muestra el link de Calendly en su lugar.
//   false → sitio propio NO recibe reservas reales (estado actual)
//   true  → sitio propio habilitado para recibir reservas
const RESERVAS_HABILITADAS = false;
const CALENDLY_FALLBACK_URL = 'https://calendly.com/estetica-avanzada-abc/60min';

// ── HTTP helpers ───────────────────────────────────────────
// GET: funciona cross-origin sin problema (no dispara preflight).
async function apiGet(action, params) {
  params = params || {};
  let qs = 'action=' + encodeURIComponent(action);
  Object.keys(params).forEach(function (k) {
    if (params[k] !== undefined && params[k] !== null) {
      qs += '&' + k + '=' + encodeURIComponent(params[k]);
    }
  });
  try {
    const res = await fetch(API_URL + '?' + qs);
    return await res.json();
  } catch (e) {
    console.warn('API error (GET ' + action + '):', e);
    return { error: e.message };
  }
}

// POST: Content-Type text/plain evita el preflight que Apps Script
// no puede responder — mismo patrón que ya usa admin/script.js.
// Sin "mode: no-cors": acá SÍ leemos la respuesta real del backend.
async function apiPostAgenda(data) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch (e) {
    console.warn('API error (POST ' + data.action + '):', e);
    return { error: e.message };
  }
}

// ── Configuración de agenda (backend-fed, cache en localStorage) ──
// getAgenda() (en script.js) sigue leyendo la cache de forma síncrona
// para no romper el resto del render — esto solo la mantiene al día.
async function fetchConfiguracion() {
  const r = await apiGet('getConfiguracion');
  if (r && r.data) {
    DB.set('agenda_config', r.data);
  }
  return getAgenda();
}

// ── Disponibilidad (reemplaza taken_slots) ─────────────────────
let _disponibilidadCache = {}; // { 'YYYY-MM-DD': ['10:00', ...] }

async function fetchDisponibilidad(fechaDesde, fechaHasta) {
  const r = await apiGet('getDisponibilidad', { fechaDesde: fechaDesde, fechaHasta: fechaHasta });
  const porFecha = {};
  (r && r.data ? r.data : []).forEach(function (t) {
    if (!porFecha[t.fecha]) porFecha[t.fecha] = [];
    porFecha[t.fecha].push(t.horario);
  });
  _disponibilidadCache = porFecha;
  return porFecha;
}

function getHorariosOcupados(fecha) {
  return _disponibilidadCache[fecha] || [];
}

// ── Confirmar turno — el backend revalida y decide, no el frontend ──
// Devuelve { ok:true } | { ok:false, code:'SLOT_TAKEN', error } | { error }
async function confirmarTurnoBackend(turno) {
  return await apiPostAgenda({ action: 'saveTurno', row: turno });
}
