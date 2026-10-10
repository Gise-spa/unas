/* ============================================================
   js/agenda.js
   Disponibilidad, reserva y estado de la reserva para el SITIO PÚBLICO.
   El backend es la ÚNICA fuente de verdad: este archivo no decide nada
   (ni horarios libres, ni monto de la seña, ni si un pago está acreditado).

   Requiere: script.js cargado ANTES (usa API_URL, DB, getAgenda, fmtDate).
   ============================================================ */

// ── Interruptores de la transición Calendly → sistema propio ─────
// Para que el sitio reciba reservas REALES hacen falta las TRES cosas:
//   1) RESERVAS_HABILITADAS = true   (este archivo)
//   2) POLITICA_SENA_APROBADA = true (este archivo; ver más abajo)
//   3) "habilitadas" encendida en el panel de administración (servidor)
// Mientras tanto el sitio muestra el link de Calendly.
const RESERVAS_HABILITADAS = false;
const CALENDLY_FALLBACK_URL = 'https://calendly.com/estetica-avanzada-abc/60min';

// ── Política de la seña ─────────────────────────────────────────
// Todavía NO está definida con Gise (qué pasa con la seña al cancelar o
// reprogramar). Mientras POLITICA_SENA_APROBADA sea false:
//   · la pantalla muestra un aviso "pendiente de aprobación", no una política;
//   · RESERVAS_HABILITADAS = true por sí solo NO abre las reservas al público.
// Cuando Gise la apruebe: se escribe el texto definitivo en TEXTO_POLITICA_SENA
// y se pasa POLITICA_SENA_APROBADA a true.
const POLITICA_SENA_APROBADA = false;
const TEXTO_POLITICA_SENA    = '';

// ── Modo de prueba (solo para quien tiene la clave) ──────────────
// La clave NO está escrita en ningún archivo del sitio. Quien prueba abre
//   https://…/?prueba=LA-CLAVE
// una vez: este bloque la guarda SOLO en esta pestaña (sessionStorage), la saca de
// la barra de direcciones y la manda al servidor en cada pedido. Este archivo no
// valida nada: el servidor decide si la clave es correcta y solo la acepta mientras
// Mercado Pago esté en modo de prueba (ver ReservasAcceso.gs). Una clave incorrecta
// o inventada no abre nada: solo hace que la pantalla muestre "no habilitadas".
const CLAVE_PRUEBA = (function () {
  try {
    const url = new URL(window.location.href);
    const k = url.searchParams.get('prueba');
    if (k) {
      sessionStorage.setItem('sosiego_prueba', k);
      url.searchParams.delete('prueba');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    return sessionStorage.getItem('sosiego_prueba') || '';
  } catch (e) {
    return '';
  }
})();
const MODO_PRUEBA_SOLICITADO = CLAVE_PRUEBA !== '';

// ¿Se muestra la pantalla de reserva? (Esto es solo visual: el permiso real lo da el servidor.)
const RESERVAS_ACTIVAS = (RESERVAS_HABILITADAS && POLITICA_SENA_APROBADA) || MODO_PRUEBA_SOLICITADO;

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

// Un fallo de conexión (o una respuesta que no es JSON) no trae "ok": el backend
// siempre responde con ok:true o ok:false.
function esErrorDeRed(r) {
  return !r || (r.ok === undefined && !!r.error);
}

// ── Configuración de agenda (backend-fed, cache en localStorage) ──
// Solo se usa para la lista de servicios. Los horarios NO salen de acá.
async function fetchConfiguracion() {
  const r = await apiGet('getConfiguracion');
  if (r && r.data) {
    DB.set('agenda_config', r.data);
  }
  return getAgenda();
}

// ── Horarios libres (los decide el backend) ────────────────────────
// getHorariosLibres ya descuenta agenda, período, anticipación, turnos,
// reservas retenidas y eventos del calendario, en vivo.
let _libres = {};          // { 'YYYY-MM-DD': ['10:00', ...] }
let _reservaInfo = { senaMonto: 0, retencionMin: 0, duracion: 60, modoPrueba: false };

async function fetchHorariosLibres(desde, hasta) {
  const r = await apiPostAgenda({
    action: 'getHorariosLibres', fechaDesde: desde, fechaHasta: hasta, clavePrueba: CLAVE_PRUEBA,
  });
  if (r && r.ok === true) {
    // Reemplaza lo pedido: un día que ya no figura es un día sin horarios.
    for (let d = new Date(desde + 'T00:00:00'); fmtDate(d) <= hasta; d.setDate(d.getDate() + 1)) {
      delete _libres[fmtDate(d)];
    }
    Object.assign(_libres, r.data || {});
    _reservaInfo = {
      senaMonto:    Number(r.senaMonto) || 0,
      retencionMin: Number(r.retencionMin) || 0,
      duracion:     Number(r.duracion) || 60,
      modoPrueba:   r.modoPrueba === true,
    };
  }
  return r;
}

function getHorariosLibresDia(fecha) {
  return _libres[fecha] || [];
}

// ── Crear la reserva y consultar su estado — el backend decide ──────
// Crear: devuelve { ok:true, checkoutUrl, token, venceEn, montoSena }
//        | { ok:false, code, error } | { error } (sin conexión)
async function crearReservaBackend(reserva) {
  return await apiPostAgenda({ action: 'crearReserva', reserva: reserva, clavePrueba: CLAVE_PRUEBA });
}

// Estado: { ok:true, estado:'pendiente'|'procesando'|'confirmada'|'en_revision'|'vencida'|'cancelada',
//           fecha, horario, servicio, duracion, venceEn? } | { ok:false, code, error } | { error }
async function getEstadoReservaBackend(token) {
  return await apiPostAgenda({ action: 'getEstadoReserva', token: token, clavePrueba: CLAVE_PRUEBA });
}
