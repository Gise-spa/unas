/**
 * admin/js/caja.js
 * ------------------------------------------------------------
 * Módulo de Caja del panel admin. Autocontenido: no modifica
 * ninguna función de script.js/../script.js, solo las usa
 * (apiPost, getAuthToken, DB, abrirModal/cerrarModal, showToast,
 * mostrarConfirm, getTurnos, todayStr). Se carga después de
 * script.js en admin/index.html.
 *
 * Mobile-first: los modales que usa (modalMovimientoCaja,
 * modalCobrar, modalCierreCaja) reutilizan el componente
 * .modal-overlay/.modal-box ya existente, que en pantallas chicas
 * ya se comporta como una hoja que sube desde abajo.
 *
 * Cache local (mismo patrón que turnos/inventario, vía DB):
 *   caja_sesion       -> objeto sesión abierta, o null
 *   caja_movimientos  -> movimientos de la sesión abierta
 *   caja_totales      -> resultado de calcularTotalesSesion()
 *   caja_cuentas      -> métodos/cuentas configurados
 *
 * Ronda "Caja clara + editar/eliminar":
 *   - todo bloque "por método/cuenta" (resumen diario, caja abierta,
 *     cierre, resultado del cierre) pasó a usar el mismo par de
 *     helpers (_filasPorMetodo + _cdtBoxHTML) en vez de 3
 *     implementaciones sueltas — mismo criterio en toda la pantalla.
 *   - el resumen diario ahora suma un cuarto bucket, "Apertura caja",
 *     calculado desde getTodasSesiones() (nuevo, ver ../script.js),
 *     ya que la apertura no es un movimiento y antes no se podía ver
 *     para un día que no fuera el de la sesión abierta actual.
 *   - cada movimiento (en el resumen diario y en "Caja abierta") tiene
 *     ahora botones Editar/Eliminar — reutilizan el mismo modal de
 *     "Nuevo movimiento" y el backend nuevo editarMovimientoCaja/
 *     eliminarMovimientoCaja (Caja.gs).
 *   - los botones "Confirmar cobro"/"Confirmar"/"Cerrar caja" ahora se
 *     bloquean mientras la petición está en curso, para que un doble
 *     toque no registre el mismo cobro dos veces.
 *
 * Ronda "Cuenta destino + buscador de cliente + detalle por cliente":
 *   - "Cuenta destino" ahora depende del método: Efectivo/Mercado Pago
 *     nunca preguntan nada (evita que un texto suelto tipo "Galicia"
 *     genere su propio bucket en vez de sumar a "Mercado Pago");
 *     Transferencia/Tarjeta muestran un select fijo (CUENTAS_BANCARIAS)
 *     con "Banco Galicia"/"Otra" — "Otra" habilita un texto libre.
 *   - el campo Cliente de "Nuevo movimiento" pasó de un <input
 *     list=...> (datalist nativo, poco confiable en mobile) a un
 *     buscador propio (mvBuscarCliente/mvElegirCliente) sobre
 *     getClientes() — la hoja "clientes" real, no derivada de turnos.
 *   - cada fila de movimiento muestra el nombre del cliente como
 *     título (antes mostraba el servicio) y al tocarla abre una ficha
 *     de detalle (abrirDetalleMovimiento) con nombre/mail/teléfono/
 *     servicio/importe/método — los botones editar/eliminar siguen
 *     andando directo desde la fila (stopPropagation).
 *   - syncCaja() ahora también refresca getTodosMovimientos() y
 *     getTodasSesiones() en cada acción de Caja (antes solo se
 *     refrescaban en el forzarSync() periódico) — si no, el Resumen
 *     diario y la ficha de detalle quedaban con la foto vieja justo
 *     después de cobrar/cargar/editar/eliminar un movimiento.
 *
 * Ronda "Editar saldo inicial":
 *   - se agregó abrirEditarSaldoInicial()/confirmarEditarSaldoInicial(),
 *     para corregir un error al abrir la caja (ej. $331.000 en vez de
 *     $0) sin pasar por Sheets ni por el editor de Apps Script — reusa
 *     mostrarInput() (el mismo modal de "Renombrar categoría"), no crea
 *     ningún modal nuevo. Accesible desde "Caja abierta" (lápiz junto a
 *     "Saldo inicial") y desde la fila "Apertura caja" del Resumen
 *     diario, si ese día tuvo una sola sesión. Backend:
 *     editarSaldoInicialSesion() en Caja.gs.
 * ------------------------------------------------------------
 */

// ════════════════════════════════════════════════════════
//  FETCH — helper propio para no tocar apiGet() compartido
//  (apiGet devuelve solo json.data; acá necesitamos el objeto
//  completo: {ok, sesion}, {ok, data}, {ok, ...totales}, etc.)
// ════════════════════════════════════════════════════════
async function apiGetRaw(action, params = {}) {
  try {
    const qs = new URLSearchParams({ action, token: getAuthToken(), ...params }).toString();
    const res = await fetch(API_URL + '?' + qs);
    return await res.json();
  } catch (e) {
    console.warn('apiGetRaw error:', e);
    return { ok: false, error: e.message };
  }
}

function _cajaUuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'mov-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function fmtMoneda(n) {
  const num = Number(n) || 0;
  return '$' + Math.round(num).toLocaleString('es-AR');
}

// Color estable por método/cuenta de pago, calculado del texto (nunca
// hardcodeado — los métodos son 100% dinámicos desde Configuración).
// Mismo label siempre da el mismo color, sin necesidad de una lista fija.
const _METODO_COLORES = ['#E89090', '#7DAA92', '#6B9BD1', '#C99A4A', '#A184C9', '#4AAFB5'];
function _colorMetodo(label) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return _METODO_COLORES[hash % _METODO_COLORES.length];
}
function _badgeMetodo(label) {
  if (!label) return '';
  const color = _colorMetodo(label);
  return `<span class="caja-metodo-badge" style="background:${color}22;color:${color}"><span class="caja-metodo-dot" style="background:${color}"></span>${label}</span>`;
}

// "Apertura caja" no es un método de pago (es el saldo con el que se
// abrió la caja), así que no le corresponde el color por hash de
// _colorMetodo — usa un tono ámbar fijo, distinto de la paleta de
// métodos, para que se lea como algo estructuralmente distinto.
function _colorDetalle(label) {
  return label === 'Apertura caja' ? '#C99A4A' : _colorMetodo(label);
}

// ════════════════════════════════════════════════════════
//  DETALLE TOTAL POR MÉTODO/CUENTA — bloque mediano reutilizado en
//  Resumen diario, Caja abierta, Cierre de caja y Resultado del cierre.
//  Orden: primero como están cargadas en Configuración (nunca
//  alfabético ni hardcodeado), después cualquier etiqueta suelta que
//  no esté en esa lista (ej. una cuentaDestino escrita a mano).
// ════════════════════════════════════════════════════════
function _filasPorMetodo(porMetodo) {
  porMetodo = porMetodo || {};
  const cuentas = getCuentasCajaLocal().map(c => c.metodo).filter(Boolean);
  const usados = new Set();
  const filas = [];
  cuentas.forEach(m => {
    if (porMetodo[m]) {
      filas.push({ label: m, monto: porMetodo[m].ingresos - porMetodo[m].egresos });
      usados.add(m);
    }
  });
  Object.keys(porMetodo).sort().forEach(label => {
    if (!usados.has(label)) filas.push({ label, monto: porMetodo[label].ingresos - porMetodo[label].egresos });
  });
  return filas;
}

function _cdtBoxHTML(label, monto) {
  return `<div class="cdt-box" style="border-left-color:${_colorDetalle(label)}">
    <span>${label}</span>
    <strong class="monto-caja">${fmtMoneda(monto)}</strong>
  </div>`;
}

function _detalleTotalHTML(filas) {
  if (!filas.length) return '<p class="today-empty">Sin movimientos</p>';
  return `<div class="caja-detalle-total-grid">${filas.map(f => _cdtBoxHTML(f.label, f.monto)).join('')}</div>`;
}

// Suma el saldoInicial de toda sesión de caja abierta en la fecha dada
// (normalmente una sola por día) — usa getTodasSesiones(), cacheado
// desde ../script.js en cada forzarSync().
function _aperturaDelDia(fecha) {
  const sesiones = typeof getTodasSesiones === 'function' ? getTodasSesiones() : [];
  return sesiones
    .filter(s => s.fechaApertura && fmtDate(new Date(s.fechaApertura)) === fecha)
    .reduce((sum, s) => sum + (Number(s.saldoInicial) || 0), 0);
}

// Caja "Apertura caja" del Resumen diario: si ese día tuvo una única
// sesión, queda clickeable para poder corregir el saldoInicial ahí
// mismo (mismo caso resuelto a mano el 1/9). Con más de una sesión
// ese día (poco común) no se ofrece el editor, para no adivinar cuál
// de las dos corregir.
function _aperturaBoxHTML(fecha) {
  const sesiones = (typeof getTodasSesiones === 'function' ? getTodasSesiones() : [])
    .filter(s => s.fechaApertura && fmtDate(new Date(s.fechaApertura)) === fecha);
  const monto = sesiones.reduce((sum, s) => sum + (Number(s.saldoInicial) || 0), 0);
  const label = 'Apertura caja';
  const clickable = sesiones.length === 1;
  const idEscapado = clickable ? String(sesiones[0].sesionId).replace(/'/g, "\\'") : '';
  const onclick = clickable
    ? ` onclick="abrirEditarSaldoInicial('${idEscapado}', ${Number(sesiones[0].saldoInicial) || 0})" style="cursor:pointer"`
    : '';
  return `<div class="cdt-box" style="border-left-color:${_colorDetalle(label)}"${onclick}>
    <span>${label}${clickable ? ' ✎' : ''}</span>
    <strong class="monto-caja">${fmtMoneda(monto)}</strong>
  </div>`;
}

// ════════════════════════════════════════════════════════
//  BLOQUEO DE BOTÓN — evita doble toque en acciones que registran
//  algo (cobrar, movimiento manual, cerrar caja). Deshabilita el botón
//  y cambia su texto mientras la petición está en curso; se restaura
//  siempre en el finally del caller, haya salido bien o mal.
// ════════════════════════════════════════════════════════
function _bloquearBoton(btn, textoEnProceso = 'Procesando…') {
  if (!btn) return;
  btn.disabled = true;
  if (btn.dataset.txtOriginal === undefined) btn.dataset.txtOriginal = btn.textContent;
  btn.textContent = textoEnProceso;
}
function _desbloquearBoton(btn) {
  if (!btn) return;
  btn.disabled = false;
  if (btn.dataset.txtOriginal !== undefined) btn.textContent = btn.dataset.txtOriginal;
}

// ════════════════════════════════════════════════════════
//  CACHE LOCAL
// ════════════════════════════════════════════════════════
function getCajaSesion()          { return DB.get('caja_sesion') || null; }
function saveCajaSesion(s)        { DB.set('caja_sesion', s); }
function getCajaMovimientos()     { return DB.get('caja_movimientos') || []; }
function saveCajaMovimientos(arr) { DB.set('caja_movimientos', arr); }
function getCajaTotales()         { return DB.get('caja_totales') || null; }
function saveCajaTotales(t)       { DB.set('caja_totales', t); }
function getCuentasCajaLocal()    { return DB.get('caja_cuentas') || []; }
function saveCuentasCajaLocal(a)  { DB.set('caja_cuentas', a); }

async function syncCaja() {
  const [sesionRes, cuentasRes, todosMovRes, sesionesRes] = await Promise.all([
    apiGetRaw('getSesionCaja'),
    apiGetRaw('getCuentasCaja'),
    // Se traen acá también (no solo en el forzarSync periódico) para que,
    // apenas se cobra/carga/edita/elimina un movimiento, el Resumen diario
    // y la ficha de detalle (cruzan TODAS las sesiones) queden al día al
    // toque — antes se quedaban con la foto del último forzarSync().
    apiGetRaw('getTodosLosMovimientosCaja'),
    apiGetRaw('getTodasSesionesCaja'),
  ]);
  if (cuentasRes.ok) saveCuentasCajaLocal(cuentasRes.data || []);
  if (todosMovRes.ok) saveTodosMovimientos(todosMovRes.data || []);
  if (sesionesRes.ok) saveTodasSesiones(sesionesRes.data || []);

  const sesion = sesionRes.ok ? sesionRes.sesion : null;
  saveCajaSesion(sesion);

  if (sesion) {
    const [movRes, totRes] = await Promise.all([
      apiGetRaw('getMovimientosCaja', { sesionId: sesion.sesionId }),
      apiGetRaw('getTotalesCaja', { sesionId: sesion.sesionId }),
    ]);
    saveCajaMovimientos(movRes.ok ? movRes.data : []);
    saveCajaTotales(totRes.ok ? totRes : null);
  } else {
    saveCajaMovimientos([]);
    saveCajaTotales(null);
  }
}

// ════════════════════════════════════════════════════════
//  BOTÓN "COBRAR" / BADGE "COBRADO" — usado desde script.js
//  en listHoy (Inicio) y en la tabla de Turnos (solo hoy)
// ════════════════════════════════════════════════════════
function botonCobrarHTML(t) {
  const sesion = getCajaSesion();
  if (!sesion) return '';
  if (t.estado === 'cancelado') return '';
  const movs = getCajaMovimientos();
  const cobrado = t.id && movs.some(m => String(m.turnoId) === String(t.id));
  if (cobrado) return `<span class="caja-cobrado-badge">Cobrado</span>`;
  return `<button onclick="abrirCobrar('${t.id}')" class="btn btn-sm" style="background:var(--accent);color:#fff;border:none;padding:.28rem .8rem;flex-shrink:0">Cobrar</button>`;
}

// ════════════════════════════════════════════════════════
//  RENDER PRINCIPAL DE LA SECCIÓN CAJA
// ════════════════════════════════════════════════════════
async function renderCaja() {
  await syncCaja();
  _renderCajaUI();
  renderResumenDiaCaja();
  _aplicarEstadoMontosCaja();
}

// ════════════════════════════════════════════════════════
//  OCULTAR/MOSTRAR MONTOS — botón "ojo" junto a Neto, como en las
//  apps de billeteras virtuales. Puramente visual: una clase en el
//  body tapa con puntitos cualquier elemento marcado con
//  class="monto-caja" (vía CSS) — no toca cálculos ni datos, ni qué
//  se manda al backend. El estado queda en localStorage para que no
//  se destapen los montos solo por recargar la página o volver a
//  entrar a Caja.
// ════════════════════════════════════════════════════════
// Mismo estilo outline (stroke, sin relleno) que los íconos de la barra
// inferior de navegación, para que el botón no desentone.
const _ICONO_OJO_ABIERTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const _ICONO_OJO_CERRADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3.5l17 17"/><path d="M10.6 5.1A11.6 11.6 0 0 1 12 4.5c6.5 0 10.5 7.5 10.5 7.5a19 19 0 0 1-3.4 4.6M6.6 6.6C3.2 8.7 1.5 12 1.5 12s4 7.5 10.5 7.5a10.6 10.6 0 0 0 4.9-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

function _aplicarEstadoMontosCaja() {
  const oculto = localStorage.getItem('caja_montos_ocultos') === '1';
  document.body.classList.toggle('caja-montos-ocultos', oculto);
  const btn = document.getElementById('cajaOjoBtn');
  if (btn) btn.innerHTML = oculto ? _ICONO_OJO_CERRADO : _ICONO_OJO_ABIERTO;
}

function toggleMontosCaja() {
  const oculto = localStorage.getItem('caja_montos_ocultos') === '1';
  localStorage.setItem('caja_montos_ocultos', oculto ? '0' : '1');
  _aplicarEstadoMontosCaja();
}

// ════════════════════════════════════════════════════════
//  RESUMEN DIARIO — filtrado por fecha, como Turnos.
//  A diferencia del bloque "Caja abierta" de arriba (que solo existe
//  mientras hay una sesión abierta), este resumen se arma cruzando
//  getTodosMovimientos() — TODOS los movimientos, de TODAS las
//  sesiones — así que muestra cualquier día, incluidos los ya
//  cerrados/liquidados. No pide nada nuevo al backend: usa el mismo
//  caché que ya trae forzarSync() desde la Etapa 3 (Clientes).
// ════════════════════════════════════════════════════════
let fechaCajaActiva = todayStr();

function _movimientosDelDia(fecha) {
  return getTodosMovimientos().filter(m => {
    if (!m.fecha) return false;
    const d = new Date(m.fecha);
    if (isNaN(d.getTime())) return false;
    return fmtDate(d) === fecha;
  });
}

function moverFechaCaja(delta) {
  const dt = new Date(fechaCajaActiva + 'T00:00:00');
  dt.setDate(dt.getDate() + delta);
  fechaCajaActiva = fmtDate(dt);
  renderResumenDiaCaja();
}
function irAHoyCaja() {
  fechaCajaActiva = todayStr();
  renderResumenDiaCaja();
}

// Fila de un movimiento individual — usada tanto en el Resumen diario
// (cruza todas las sesiones) como en la lista "Movimientos" de la
// sesión abierta. Único lugar que arma este markup, para no repetir
// la lógica de edición/eliminación en dos partes distintas.
function _movItemHTML(m) {
  const hora = m.creadoEn ? new Date(m.creadoEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
  const signo = m.tipo === 'ingreso' ? '+' : '−';
  const clase = m.tipo === 'ingreso' ? 'caja-mov-importe-ingreso' : 'caja-mov-importe-egreso';
  const etiqueta = m.cuentaDestino || m.metodoPago || '';
  const idEscapado = String(m.movimientoId).replace(/'/g, "\\'");
  // Título: el cliente, no el servicio — es lo que Gise busca de un
  // vistazo ("¿ya cobré a Dora?"), el servicio queda en el detalle al
  // tocar la fila. Si no hay cliente (movimiento manual), se usa el
  // concepto como antes.
  const titulo = m.nombreCliente || m.concepto || (m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso');
  return `<li class="caja-mov-item" onclick="abrirDetalleMovimiento('${idEscapado}')">
    <span style="color:var(--text-muted);flex-shrink:0">${hora}</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:500">${titulo}</div>
      <div style="margin-top:2px">${_badgeMetodo(etiqueta)}</div>
    </div>
    <div class="caja-mov-derecha">
      <span class="${clase} monto-caja">${signo} ${fmtMoneda(m.importe)}</span>
      <div class="caja-mov-acciones">
        <button onclick="event.stopPropagation();abrirEditarMovimiento('${idEscapado}')" class="btn btn-sm caja-mov-btn-editar" title="Editar">✎</button>
        <button onclick="event.stopPropagation();pedirEliminarMovimiento('${idEscapado}')" class="btn btn-sm caja-mov-btn-eliminar" title="Eliminar">🗑</button>
      </div>
    </div>
  </li>`;
}

// ════════════════════════════════════════════════════════
//  DETALLE DE UN MOVIMIENTO — se abre al tocar la fila (no los
//  botones editar/eliminar, que llevan su propio stopPropagation).
//  Muestra lo que la fila ya no muestra: nombre, mail, teléfono,
//  servicio realizado, importe y con qué se pagó.
// ════════════════════════════════════════════════════════
function abrirDetalleMovimiento(movimientoId) {
  const m = getTodosMovimientos().find(x => String(x.movimientoId) === String(movimientoId));
  if (!m) { showToast('No se encontró el movimiento'); return; }

  const filas = [];
  if (m.nombreCliente) filas.push(['Cliente', m.nombreCliente]);
  if (m.telefonoCliente) filas.push(['Teléfono', m.telefonoCliente]);
  if (m.mailCliente) filas.push(['Mail', m.mailCliente]);
  filas.push(['Servicio / concepto', m.concepto || '—']);
  filas.push(['Importe', fmtMoneda(m.importe)]);
  filas.push(['Método de pago', m.metodoPago || '—']);
  if (m.cuentaDestino) filas.push(['Cuenta', m.cuentaDestino]);
  if (m.creadoEn) filas.push(['Fecha', new Date(m.creadoEn).toLocaleString('es-AR')]);

  document.getElementById('dmTitulo').textContent = m.nombreCliente || (m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso');
  document.getElementById('dmCuerpo').innerHTML = filas.map(([label, val]) =>
    `<div class="dm-fila"><span>${label}</span><strong${label === 'Importe' ? ' class="monto-caja"' : ''}>${val}</strong></div>`
  ).join('');

  const idEscapado = String(movimientoId).replace(/'/g, "\\'");
  document.getElementById('dmEditarBtn').setAttribute('onclick', `cerrarModal('modalDetalleMovimiento');abrirEditarMovimiento('${idEscapado}')`);
  document.getElementById('dmEliminarBtn').setAttribute('onclick', `cerrarModal('modalDetalleMovimiento');pedirEliminarMovimiento('${idEscapado}')`);

  abrirModal('modalDetalleMovimiento');
}

function renderResumenDiaCaja() {
  const fechaEl = document.getElementById('cdnFecha');
  if (!fechaEl) return; // sección todavía no está en el DOM

  const hoy = todayStr();
  const dt  = new Date(fechaCajaActiva + 'T00:00:00');
  const label = fechaCajaActiva === hoy ? 'Hoy' : fmtDateHuman(dt);
  fechaEl.innerHTML = `${label}${fechaCajaActiva !== hoy ? `<small>${fmtDateHuman(dt)}</small>` : ''}`;

  const movs = _movimientosDelDia(fechaCajaActiva);
  let ingresos = 0, egresos = 0;
  const porMetodo = {};
  movs.forEach(m => {
    const importe = Number(m.importe) || 0;
    const tipo = String(m.tipo || '').toLowerCase();
    const label2 = m.cuentaDestino || m.metodoPago || 'Sin especificar';
    if (!porMetodo[label2]) porMetodo[label2] = { ingresos: 0, egresos: 0 };
    if (tipo === 'ingreso') { ingresos += importe; porMetodo[label2].ingresos += importe; }
    else if (tipo === 'egreso') { egresos += importe; porMetodo[label2].egresos += importe; }
  });

  document.getElementById('crdIngresos').textContent = fmtMoneda(ingresos);
  document.getElementById('crdEgresos').textContent  = fmtMoneda(egresos);
  document.getElementById('crdNeto').textContent      = fmtMoneda(ingresos - egresos);

  // Detalle total: métodos configurados (con movimientos ese día) +
  // "Apertura caja" siempre al final, aunque sea $0 (para que quede
  // claro que ese día no se abrió caja, y no falte la fila). La caja
  // de apertura se arma aparte (_aperturaBoxHTML) porque, a diferencia
  // de los métodos de pago, puede quedar clickeable para corregir el
  // saldoInicial.
  const filas = _filasPorMetodo(porMetodo);
  const cajasHTML = filas.map(f => _cdtBoxHTML(f.label, f.monto)).join('') + _aperturaBoxHTML(fechaCajaActiva);
  document.getElementById('cajaResumenDiaDesglose').innerHTML = `<div class="caja-detalle-total-grid">${cajasHTML}</div>`;

  const movsEl = document.getElementById('cajaResumenDiaMovs');
  if (movs.length) {
    const ordenados = [...movs].sort((a, b) => new Date(b.creadoEn || b.fecha) - new Date(a.creadoEn || a.fecha));
    movsEl.innerHTML = ordenados.map(_movItemHTML).join('');
  } else {
    movsEl.innerHTML = '<p class="today-empty">Sin movimientos para este día.</p>';
  }
}

// Tarjeta destacada de Caja en Inicio — usa el mismo cache que renderCaja(),
// no dispara su propio fetch (Inicio no necesita datos más frescos que los
// que ya trajo el último forzarSync()/renderCaja()).
function renderCajaInicio() {
  const cont = document.getElementById('inicioCajaCard');
  if (!cont) return;
  const sesion = getCajaSesion();

  if (!sesion) {
    cont.innerHTML = `
      <div class="caja-hero-card caja-hero-cerrada">
        <div class="caja-hero-top">
          <span class="caja-hero-dot"></span>
          <span class="caja-hero-estado">Caja cerrada</span>
        </div>
        <button class="btn btn-primary caja-hero-btn" onclick="irA('caja'); setTimeout(mostrarFormAbrirCaja, 150);">Abrir caja</button>
      </div>`;
    return;
  }

  const totales = getCajaTotales();
  cont.innerHTML = `
    <div class="caja-hero-card caja-hero-abierta">
      <div class="caja-hero-top">
        <span class="caja-hero-dot"></span>
        <span class="caja-hero-estado">Caja abierta</span>
      </div>
      <div class="caja-hero-datos">
        <div><span>Ingresos hoy</span><strong>${fmtMoneda(totales ? totales.totalIngresos : 0)}</strong></div>
        <div><span>Efectivo esperado</span><strong>${fmtMoneda(totales ? totales.efectivoEsperado : 0)}</strong></div>
      </div>
      <button class="btn btn-primary caja-hero-btn" onclick="irA('caja')">Ir a Caja</button>
    </div>`;
}

function _renderCajaUI() {
  const sesion = getCajaSesion();
  const wrapCerrada = document.getElementById('cajaCerradaWrap');
  const wrapAbierta = document.getElementById('cajaAbiertaWrap');
  if (!wrapCerrada || !wrapAbierta) return;

  if (!sesion) {
    wrapCerrada.style.display = '';
    wrapAbierta.style.display = 'none';
    document.getElementById('formAbrirCaja').style.display = 'none';
    return;
  }

  wrapCerrada.style.display = 'none';
  wrapAbierta.style.display = '';

  // Solo el estado + "Cerrar caja" — los totales, el desglose por
  // método y los movimientos del día ya están en "Resumen diario" de
  // arriba (que además cruza todas las sesiones, no solo esta), tenerlo
  // acá también era mostrar exactamente lo mismo dos veces en la misma
  // pantalla.
  const apertura = sesion.fechaApertura ? new Date(sesion.fechaApertura) : null;
  const horaApertura = apertura && !isNaN(apertura.getTime())
    ? apertura.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : '';
  document.getElementById('cajaEstadoInfo').innerHTML =
    `<strong style="color:#16a34a">● Caja abierta</strong>${horaApertura ? ' desde las ' + horaApertura : ''}` +
    `<br>Saldo inicial: ${fmtMoneda(sesion.saldoInicial)} ` +
    `<button onclick="abrirEditarSaldoInicial('${String(sesion.sesionId).replace(/'/g, "\\'")}', ${Number(sesion.saldoInicial) || 0})" class="btn btn-sm caja-mov-btn-editar" title="Editar saldo inicial">✎</button>`;
}

// ════════════════════════════════════════════════════════
//  EDITAR SALDO INICIAL — corrección de un error al abrir la caja
//  (ej. cargar $331.000 en vez de $0). Reusa el modal genérico
//  mostrarInput() (el mismo de "Renombrar categoría"), no crea ningún
//  modal nuevo. Se llama tanto desde "Caja abierta" como desde la
//  fila "Apertura caja" del Resumen diario para un día ya cerrado.
// ════════════════════════════════════════════════════════
function abrirEditarSaldoInicial(sesionId, saldoActual) {
  mostrarInput({
    titulo: 'Editar saldo inicial',
    label: 'Saldo con el que se abrió la caja',
    valorActual: String(Math.round(Number(saldoActual) || 0)),
    onOk: (v) => confirmarEditarSaldoInicial(sesionId, v)
  });
}

async function confirmarEditarSaldoInicial(sesionId, valor) {
  const nuevoSaldo = Number(valor);
  if (isNaN(nuevoSaldo) || nuevoSaldo < 0) { showToast('Ingresá un monto válido'); return; }
  const res = await apiPost({ action: 'editarSaldoInicialCaja', sesionId, saldoInicial: nuevoSaldo });
  if (res.ok) {
    showToast('✓ Saldo inicial actualizado');
    await renderCaja();
  } else {
    showToast(res.error || 'No se pudo actualizar el saldo inicial');
  }
}

// ════════════════════════════════════════════════════════
//  RESUMEN DEL MES — se abre desde la tarjeta "Resultado mes" de
//  Inicio. A diferencia del desglose de Caja (_filasPorMetodo, que
//  neta ingresos y egresos en un solo número por método), acá van
//  separados en dos listas: es lo que hace falta para ver de un
//  vistazo qué entró y qué salió de cada cuenta en todo el mes.
// ════════════════════════════════════════════════════════
function abrirResumenMes() {
  const hoy = new Date();
  const mesActual = todayStr().slice(0, 7);
  const movsMes = getTodosMovimientos().filter(m => {
    if (!m.fecha) return false;
    const d = new Date(m.fecha);
    return !isNaN(d.getTime()) && fmtDate(d).startsWith(mesActual);
  });

  const ingresosPorMetodo = {};
  const egresosPorMetodo = {};
  let totalIngresos = 0, totalEgresos = 0;

  movsMes.forEach(m => {
    const importe = Number(m.importe) || 0;
    const tipo = String(m.tipo || '').toLowerCase();
    const label = m.cuentaDestino || m.metodoPago || 'Sin especificar';
    if (tipo === 'ingreso') {
      totalIngresos += importe;
      ingresosPorMetodo[label] = (ingresosPorMetodo[label] || 0) + importe;
    } else if (tipo === 'egreso') {
      totalEgresos += importe;
      egresosPorMetodo[label] = (egresosPorMetodo[label] || 0) + importe;
    }
  });

  document.getElementById('rmTitulo').textContent = `Resultado de ${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`;
  document.getElementById('rmNeto').textContent = fmtMoneda(totalIngresos - totalEgresos);
  document.getElementById('rmIngresos').innerHTML = _detalleMesHTML(ingresosPorMetodo);
  document.getElementById('rmEgresos').innerHTML = _detalleMesHTML(egresosPorMetodo);
  document.getElementById('rmTotales').innerHTML =
    `Total ingresos: <strong class="monto-caja">${fmtMoneda(totalIngresos)}</strong><br>` +
    `Total egresos: <strong class="monto-caja">${fmtMoneda(totalEgresos)}</strong>`;

  abrirModal('modalResumenMes');
}

// Igual que _cdtBoxHTML/_detalleTotalHTML, pero para un solo lado
// (ingresos O egresos) — no neta nada, cada método muestra su monto
// tal cual quedó cargado.
function _detalleMesHTML(porMetodo) {
  const labels = Object.keys(porMetodo);
  if (!labels.length) return '<p class="today-empty">Sin movimientos</p>';
  const html = labels.sort().map(label => _cdtBoxHTML(label, porMetodo[label])).join('');
  return `<div class="caja-detalle-total-grid">${html}</div>`;
}

// Sub-cuentas fijas para Transferencia/Tarjeta — son la forma en que
// el cliente pagó, no un "método" nuevo en Configuración, así que van
// hardcodeadas acá (lista corta, se edita a mano si se suma un banco).
// Efectivo y Mercado Pago nunca preguntan cuenta destino: Efectivo no
// la necesita, y Mercado Pago tiene un solo destino (la cuenta de MP
// del negocio) — así se evita que quede una cuenta escrita a mano
// distinta ("Galicia", etc.) generando un bucket propio en el desglose
// en vez de sumar dentro de "Mercado Pago".
const CUENTAS_BANCARIAS = ['Banco Galicia', 'Otra'];

function _requiereCuenta(metodo) {
  const m = String(metodo || '').toLowerCase();
  return m === 'transferencia' || m === 'tarjeta';
}

function _renderChips(prefix, seleccionado, cuentaActual) {
  const cuentas = getCuentasCajaLocal();
  const cont = document.getElementById(prefix + 'MetodoChips');
  if (!cont) return;
  if (!cuentas.length) {
    cont.innerHTML = '<p class="today-empty">No hay métodos configurados en Configuración</p>';
    return;
  }
  cont.innerHTML = cuentas.map(c => {
    const metodo = c.metodo || '';
    const on = metodo === seleccionado ? 'on' : '';
    return `<div class="chip ${on}" onclick="_elegirMetodo('${prefix}','${metodo.replace(/'/g, "\\'")}')">${metodo}</div>`;
  }).join('');
  _actualizarCuentaWrap(prefix, seleccionado, cuentaActual || '');
}

function _elegirMetodo(prefix, metodo) {
  document.getElementById(prefix + 'Metodo').value = metodo;
  document.querySelectorAll(`#${prefix}MetodoChips .chip`).forEach(ch => {
    ch.classList.toggle('on', ch.textContent === metodo);
  });
  _actualizarCuentaWrap(prefix, metodo, '');
}

// Arma "Cuenta destino" según el método:
//  - Efectivo / Mercado Pago -> se oculta y se limpia (no hay nada que elegir)
//  - Transferencia / Tarjeta -> select fijo Banco Galicia/Otra; si elige
//    "Otra" aparece un campo de texto para escribirla
function _actualizarCuentaWrap(prefix, metodo, cuentaActual) {
  const wrap = document.getElementById(prefix + 'CuentaWrap');
  if (!wrap) return;
  const cuentaInput = document.getElementById(prefix + 'Cuenta');

  if (!_requiereCuenta(metodo)) {
    wrap.style.display = 'none';
    cuentaInput.value = '';
    return;
  }

  wrap.style.display = '';
  const sel = document.getElementById(prefix + 'CuentaSelect');
  const otroWrap = document.getElementById(prefix + 'CuentaOtroWrap');
  const otroInput = document.getElementById(prefix + 'CuentaOtro');

  sel.innerHTML = '<option value="">Elegí una cuenta…</option>' +
    CUENTAS_BANCARIAS.map(c => `<option value="${c}">${c}</option>`).join('');

  if (cuentaActual && CUENTAS_BANCARIAS.includes(cuentaActual)) {
    sel.value = cuentaActual;
    otroWrap.style.display = 'none';
    otroInput.value = '';
    cuentaInput.value = cuentaActual;
  } else if (cuentaActual) {
    sel.value = 'Otra';
    otroWrap.style.display = '';
    otroInput.value = cuentaActual;
    cuentaInput.value = cuentaActual;
  } else {
    sel.value = '';
    otroWrap.style.display = 'none';
    otroInput.value = '';
    cuentaInput.value = '';
  }
}

function _cuentaSelectCambio(prefix) {
  const val = document.getElementById(prefix + 'CuentaSelect').value;
  const otroWrap = document.getElementById(prefix + 'CuentaOtroWrap');
  const otroInput = document.getElementById(prefix + 'CuentaOtro');
  if (val === 'Otra') {
    otroWrap.style.display = '';
    document.getElementById(prefix + 'Cuenta').value = otroInput.value.trim();
    otroInput.focus();
  } else {
    otroWrap.style.display = 'none';
    document.getElementById(prefix + 'Cuenta').value = val;
  }
}

function _cuentaOtroInput(prefix) {
  document.getElementById(prefix + 'Cuenta').value = document.getElementById(prefix + 'CuentaOtro').value.trim();
}

// ════════════════════════════════════════════════════════
//  ABRIR CAJA
// ════════════════════════════════════════════════════════
function mostrarFormAbrirCaja() {
  document.getElementById('formAbrirCaja').style.display = '';
  document.getElementById('cajaSaldoInicial')?.focus();
}

async function confirmarAbrirCaja() {
  const saldo = Number(document.getElementById('cajaSaldoInicial').value);
  if (isNaN(saldo) || saldo < 0) { showToast('Ingresá un saldo inicial válido'); return; }
  const res = await apiPost({ action: 'abrirCaja', saldoInicial: saldo });
  if (res.ok) {
    showToast('✓ Caja abierta');
    document.getElementById('cajaSaldoInicial').value = '';
    await renderCaja();
  } else {
    showToast(res.error || 'No se pudo abrir la caja');
    if (res.sesionId) await renderCaja();
  }
}

// Abrir caja desde la tarjeta "Caja hoy" de Inicio — mismo endpoint
// que confirmarAbrirCaja(), en un modal propio para no salir del
// dashboard. Al confirmar, sincroniza caja y refresca Inicio.
function abrirModalAbrirCajaInicio() {
  const input = document.getElementById('inicioCajaSaldoInicial');
  if (input) input.value = '';
  abrirModal('modalAbrirCajaInicio');
  setTimeout(() => input?.focus(), 100);
}

async function confirmarAbrirCajaInicio() {
  const saldo = Number(document.getElementById('inicioCajaSaldoInicial').value);
  if (isNaN(saldo) || saldo < 0) { showToast('Ingresá un saldo inicial válido'); return; }
  const res = await apiPost({ action: 'abrirCaja', saldoInicial: saldo });
  if (res.ok) {
    showToast('✓ Caja abierta');
    cerrarModal('modalAbrirCajaInicio');
    await syncCaja();
    if (typeof renderInicio === 'function') renderInicio();
  } else {
    showToast(res.error || 'No se pudo abrir la caja');
  }
}

// ════════════════════════════════════════════════════════
//  MOVIMIENTO MANUAL
// ════════════════════════════════════════════════════════

// Buscador de cliente para "Nuevo movimiento" — antes era un <input
// list=...> (datalist nativo), poco confiable en el celular y difícil
// de tocar bien. Ahora es un buscador propio: se escribe, aparece una
// lista de resultados debajo, se toca uno y queda elegido. Usa
// getClientes() (la hoja "clientes" real) en vez de derivar clientes
// de los turnos, así trae también los cargados a mano desde Clientes.
function mvBuscarCliente() {
  const val = document.getElementById('mvClienteNombre').value.trim().toLowerCase();
  document.getElementById('mvClienteId').value = '';
  // Si estaba tipeando sobre un cliente ya elegido, invalida el
  // teléfono/mail que se habían autocompletado — si no los borra, un
  // nombre distinto tipeado a mano podría guardarse con el teléfono/
  // mail del cliente elegido antes.
  document.getElementById('mvClienteTelefono').value = '';
  document.getElementById('mvClienteMail').value = '';
  const cont = document.getElementById('mvClienteResultados');
  if (!val) { cont.innerHTML = ''; cont.style.display = 'none'; return; }

  const clientes = getClientes()
    .filter(c => (c.nombre || '').toLowerCase().includes(val))
    .slice(0, 8);

  cont.innerHTML = clientes.length
    ? clientes.map(c => `
        <div class="cliente-resultado-item" onmousedown="mvElegirCliente('${String(c.clienteId).replace(/'/g, "\\'")}')">
          <strong>${c.nombre || 'Sin nombre'}</strong>
          ${c.telefono ? `<span>${c.telefono}</span>` : ''}
        </div>`).join('')
    : '<div class="cliente-resultado-vacio">Sin coincidencias</div>';
  cont.style.display = 'block';
}

// Al elegir un cliente de la lista, se trae también su teléfono/mail
// guardados en Clientes — antes solo se copiaba el nombre, así que un
// movimiento cargado eligiendo un cliente existente terminaba sin
// teléfono ni mail aunque esos datos sí estuvieran cargados.
function mvElegirCliente(clienteId) {
  const c = getClientes().find(x => String(x.clienteId) === String(clienteId));
  if (!c) return;
  document.getElementById('mvClienteId').value = c.clienteId;
  document.getElementById('mvClienteNombre').value = c.nombre || '';
  document.getElementById('mvClienteTelefono').value = c.telefono || '';
  document.getElementById('mvClienteMail').value = c.mail || '';
  document.getElementById('mvClienteResultados').innerHTML = '';
  document.getElementById('mvClienteResultados').style.display = 'none';
}

function mvOcultarResultadosCliente() {
  // pequeño delay: si no, el blur cierra la lista ANTES de que el
  // onmousedown de mvElegirCliente llegue a dispararse
  setTimeout(() => {
    const cont = document.getElementById('mvClienteResultados');
    if (cont) cont.style.display = 'none';
  }, 150);
}

// movimientoId del movimiento en edición, o null si el modal está en
// modo "Nuevo movimiento" — decide qué acción dispara confirmarMovimientoCaja().
let _mvEditandoId = null;
// Tipo del movimiento que se está editando — el modal en modo edición
// oculta el selector de Tipo, así que hace falta guardarlo aparte para
// saber si corresponde exigir/mandar nombreCliente.
let _mvEditandoTipo = null;

function abrirModalMovimiento() {
  _mvEditandoId = null;
  _mvEditandoTipo = null;
  document.getElementById('modalMovimientoCajaTitulo').textContent = 'Nuevo movimiento';
  document.getElementById('mvConfirmarBtn').textContent = 'Confirmar';
  document.getElementById('mvTipoWrap').style.display = '';
  document.getElementById('mvTipo').value = 'ingreso';
  document.getElementById('mvTipoIngreso').classList.add('active-vis');
  document.getElementById('mvTipoEgreso').classList.remove('active-vis');
  document.getElementById('mvImporte').value = '';
  document.getElementById('mvConcepto').value = '';
  document.getElementById('mvClienteNombre').value = '';
  document.getElementById('mvClienteId').value = '';
  document.getElementById('mvClienteTelefono').value = '';
  document.getElementById('mvClienteMail').value = '';
  document.getElementById('mvClienteResultados').innerHTML = '';
  document.getElementById('mvClienteResultados').style.display = 'none';
  document.getElementById('mvClienteWrap').style.display = '';
  _renderChips('mv', '');
  abrirModal('modalMovimientoCaja');
}

function setMovTipo(tipo) {
  document.getElementById('mvTipo').value = tipo;
  document.getElementById('mvTipoIngreso').classList.toggle('active-vis', tipo === 'ingreso');
  document.getElementById('mvTipoEgreso').classList.toggle('active-vis', tipo === 'egreso');
  document.getElementById('mvClienteWrap').style.display = tipo === 'ingreso' ? '' : 'none';
}

// ════════════════════════════════════════════════════════
//  EDITAR / ELIMINAR UN MOVIMIENTO YA CARGADO
//  Reusa el modal de "Nuevo movimiento" en modo edición — se puede
//  corregir importe/método/cuenta/concepto y, si es un ingreso, el
//  nombre del cliente (el snapshot, no a qué clienteId/turnoId/sesión
//  pertenece: si eso está mal, se elimina y se carga de nuevo).
//  Funciona para un movimiento de cualquier día, esté la sesión
//  abierta o ya cerrada.
// ════════════════════════════════════════════════════════
function abrirEditarMovimiento(movimientoId) {
  const m = getTodosMovimientos().find(x => String(x.movimientoId) === String(movimientoId));
  if (!m) { showToast('No se encontró el movimiento'); return; }

  _mvEditandoId = movimientoId;
  _mvEditandoTipo = String(m.tipo || '').toLowerCase();
  const esIngreso = _mvEditandoTipo === 'ingreso';

  document.getElementById('modalMovimientoCajaTitulo').textContent = 'Editar movimiento';
  document.getElementById('mvConfirmarBtn').textContent = 'Guardar cambios';
  document.getElementById('mvTipoWrap').style.display = 'none';

  document.getElementById('mvClienteWrap').style.display = esIngreso ? '' : 'none';
  document.getElementById('mvClienteNombre').value = m.nombreCliente || '';
  document.getElementById('mvClienteId').value = m.clienteId || '';
  document.getElementById('mvClienteTelefono').value = m.telefonoCliente || '';
  document.getElementById('mvClienteMail').value = m.mailCliente || '';
  document.getElementById('mvClienteResultados').innerHTML = '';
  document.getElementById('mvClienteResultados').style.display = 'none';

  document.getElementById('mvImporte').value = m.importe || '';
  document.getElementById('mvConcepto').value = m.concepto || '';
  _renderChips('mv', m.metodoPago || '', m.cuentaDestino || '');
  abrirModal('modalMovimientoCaja');
}

function pedirEliminarMovimiento(movimientoId) {
  mostrarConfirm({
    icon: '🗑',
    titulo: 'Eliminar movimiento',
    msg: 'Esta acción no se puede deshacer. ¿Eliminar este movimiento de caja?',
    btnTxt: 'Eliminar',
    btnColor: '#dc2626',
    onOk: () => eliminarMovimientoCaja(movimientoId)
  });
}

async function eliminarMovimientoCaja(movimientoId) {
  const res = await apiPost({ action: 'eliminarMovimientoCaja', movimientoId });
  if (res.ok) {
    showToast('✓ Movimiento eliminado');
    await renderCaja();
  } else {
    showToast(res.error || 'No se pudo eliminar el movimiento');
  }
}

let _mvGuardando = false;

async function confirmarMovimientoCaja() {
  if (_mvGuardando) return;
  const btn = document.getElementById('mvConfirmarBtn');

  // ── Modo edición ──
  if (_mvEditandoId) {
    const importe = Number(document.getElementById('mvImporte').value);
    const metodoPago = document.getElementById('mvMetodo').value;
    const cuentaDestino = document.getElementById('mvCuenta').value.trim();
    const concepto = document.getElementById('mvConcepto').value.trim();
    const nombreCliente = document.getElementById('mvClienteNombre').value.trim();
    const telefonoCliente = document.getElementById('mvClienteTelefono').value.trim();
    const mailCliente = document.getElementById('mvClienteMail').value.trim();

    if (isNaN(importe) || importe <= 0) { showToast('Ingresá un importe válido'); return; }
    if (!metodoPago) { showToast('Elegí un método de pago'); return; }
    if (!concepto) { showToast('Ingresá un concepto'); return; }
    if (_mvEditandoTipo === 'ingreso' && !nombreCliente) { showToast('Ingresá el nombre del cliente'); return; }

    const cambios = { importe, metodoPago, cuentaDestino, concepto };
    if (_mvEditandoTipo === 'ingreso') {
      cambios.nombreCliente = nombreCliente;
      // Solo se mandan si hay algo nuevo (se completaron al elegir un
      // cliente de la lista) — si se tipeó el nombre a mano sin elegir
      // ninguno, quedan vacíos acá y NO se mandan, así no se pisa el
      // teléfono/mail que ya estaba guardado con un blanco.
      if (telefonoCliente) cambios.telefonoCliente = telefonoCliente;
      if (mailCliente) cambios.mailCliente = mailCliente;
    }

    _mvGuardando = true;
    _bloquearBoton(btn, 'Guardando…');
    try {
      const res = await apiPost({
        action: 'editarMovimientoCaja',
        movimientoId: _mvEditandoId,
        cambios
      });
      if (res.ok) {
        showToast('✓ Movimiento actualizado');
        cerrarModal('modalMovimientoCaja');
        await renderCaja();
      } else {
        showToast(res.error || 'No se pudo actualizar el movimiento');
      }
    } finally {
      _mvGuardando = false;
      _desbloquearBoton(btn);
    }
    return;
  }

  // ── Modo alta nueva ──
  const sesion = getCajaSesion();
  if (!sesion) { showToast('No hay caja abierta'); return; }
  const tipo = document.getElementById('mvTipo').value;
  const importe = Number(document.getElementById('mvImporte').value);
  const metodoPago = document.getElementById('mvMetodo').value;
  const cuentaDestino = document.getElementById('mvCuenta').value.trim();
  const concepto = document.getElementById('mvConcepto').value.trim();
  const clienteId = document.getElementById('mvClienteId').value;
  const nombreCliente = tipo === 'ingreso' ? document.getElementById('mvClienteNombre').value.trim() : '';
  const telefonoCliente = tipo === 'ingreso' ? document.getElementById('mvClienteTelefono').value.trim() : '';
  const mailCliente = tipo === 'ingreso' ? document.getElementById('mvClienteMail').value.trim() : '';

  if (isNaN(importe) || importe <= 0) { showToast('Ingresá un importe válido'); return; }
  if (!metodoPago) { showToast('Elegí un método de pago'); return; }
  if (!concepto) { showToast('Ingresá un concepto'); return; }
  // El nombre del cliente ya no es opcional en un ingreso — es lo que
  // se muestra como título de cada movimiento (en vez del concepto),
  // así se puede reconocer de un vistazo quién pagó.
  if (tipo === 'ingreso' && !nombreCliente) { showToast('Ingresá el nombre del cliente'); return; }

  _mvGuardando = true;
  _bloquearBoton(btn, 'Guardando…');
  try {
    const res = await apiPost({
      action: 'registrarMovimientoCaja',
      movimiento: {
        movimientoId: _cajaUuid(),
        sesionId: sesion.sesionId,
        tipo, importe, metodoPago, cuentaDestino, concepto,
        ...(nombreCliente ? { clienteId, nombreCliente, telefonoCliente, mailCliente } : {})
      }
    });

    if (res.ok) {
      showToast(tipo === 'ingreso' ? '✓ Ingreso registrado' : '✓ Egreso registrado');
      cerrarModal('modalMovimientoCaja');
      await renderCaja();
    } else {
      showToast(res.error || 'No se pudo registrar el movimiento');
    }
  } finally {
    _mvGuardando = false;
    _desbloquearBoton(btn);
  }
}

// ════════════════════════════════════════════════════════
//  COBRAR DESDE UN TURNO
// ════════════════════════════════════════════════════════
function abrirCobrar(turnoId) {
  const sesion = getCajaSesion();
  if (!sesion) { showToast('Abrí la caja antes de cobrar'); return; }

  const t = getTurnos().find(x => String(x.id) === String(turnoId));
  if (!t) { showToast('No se encontró el turno'); return; }

  document.getElementById('cbTurnoId').value = t.id;
  document.getElementById('cbClienteId').value = t.clienteId || '';
  document.getElementById('cbServicioInfo').textContent = `${t.servicio} · ${t.fecha} ${t.horario}`;
  document.getElementById('cbNombre').value = t.nombre || '';
  document.getElementById('cbTelefono').value = t.telefono || '';
  document.getElementById('cbMail').value = t.mail || '';
  document.getElementById('cbImporte').value = '';
  document.getElementById('cbConcepto').value = t.servicio || '';
  _renderChips('cb', '');

  abrirModal('modalCobrar');
}

let _cobroEnProceso = false;

async function confirmarCobro() {
  if (_cobroEnProceso) return; // evita que un doble toque registre el mismo cobro dos veces
  const sesion = getCajaSesion();
  if (!sesion) { showToast('No hay caja abierta'); return; }

  const turnoId = document.getElementById('cbTurnoId').value;
  const clienteId = document.getElementById('cbClienteId').value;
  const nombreCliente = document.getElementById('cbNombre').value.trim();
  const telefonoCliente = document.getElementById('cbTelefono').value.trim();
  const mailCliente = document.getElementById('cbMail').value.trim();
  const importe = Number(document.getElementById('cbImporte').value);
  const metodoPago = document.getElementById('cbMetodo').value;
  const cuentaDestino = document.getElementById('cbCuenta').value.trim();
  const concepto = document.getElementById('cbConcepto').value.trim();

  if (isNaN(importe) || importe <= 0) { showToast('Ingresá un importe válido'); return; }
  if (!metodoPago) { showToast('Elegí un método de pago'); return; }
  if (!nombreCliente) { showToast('Falta el nombre del cliente'); return; }

  const btn = document.getElementById('cbConfirmarBtn');
  _cobroEnProceso = true;
  _bloquearBoton(btn, 'Registrando…');
  try {
    const res = await apiPost({
      action: 'registrarMovimientoCaja',
      movimiento: {
        movimientoId: _cajaUuid(),
        sesionId: sesion.sesionId,
        tipo: 'ingreso',
        turnoId, clienteId, importe, metodoPago, cuentaDestino, concepto,
        nombreCliente, telefonoCliente, mailCliente
      }
    });

    if (res.ok) {
      showToast('✓ Cobro registrado');
      cerrarModal('modalCobrar');
      await renderCaja();
      // Refrescar donde puede estar visible el turno (badge "Cobrado")
      if (typeof renderInicio === 'function' && seccionActiva === 'inicio') renderInicio();
      if (typeof renderTurnos === 'function' && seccionActiva === 'turnos') renderTurnos();
    } else {
      showToast(res.error || 'No se pudo registrar el cobro');
    }
  } finally {
    _cobroEnProceso = false;
    _desbloquearBoton(btn);
  }
}

// ════════════════════════════════════════════════════════
//  CIERRE DE CAJA
// ════════════════════════════════════════════════════════
function abrirModalCierreCaja() {
  const sesion = getCajaSesion();
  const totales = getCajaTotales();
  if (!sesion || !totales) { showToast('No hay caja abierta'); return; }

  document.getElementById('czSesionId').value = sesion.sesionId;
  document.getElementById('czEsperado').textContent = fmtMoneda(totales.efectivoEsperado);
  document.getElementById('czContado').value = '';
  document.getElementById('czDiferencia').textContent = '—';

  document.getElementById('czDesglose').innerHTML = _detalleTotalHTML(_filasPorMetodo(totales.porMetodo));

  document.getElementById('czTotales').innerHTML =
    `Total ingresos: <strong class="monto-caja">${fmtMoneda(totales.totalIngresos)}</strong><br>` +
    `Total egresos: <strong class="monto-caja">${fmtMoneda(totales.totalEgresos)}</strong><br>` +
    `Resultado neto: <strong class="monto-caja">${fmtMoneda(totales.resultadoNeto)}</strong>`;

  abrirModal('modalCierreCaja');
}

function actualizarDiferenciaCierre() {
  const totales = getCajaTotales();
  if (!totales) return;
  const contado = Number(document.getElementById('czContado').value);
  const dif = document.getElementById('czDiferencia');
  if (isNaN(contado) || document.getElementById('czContado').value === '') {
    dif.textContent = '—';
    dif.style.color = '';
    return;
  }
  const diferencia = contado - totales.efectivoEsperado;
  dif.textContent = (diferencia > 0 ? '+' : '') + fmtMoneda(diferencia);
  dif.style.color = diferencia === 0 ? '#16a34a' : (diferencia < 0 ? '#dc2626' : '#f59e0b');
}

function pedirConfirmarCierre() {
  const contadoVal = document.getElementById('czContado').value;
  const contado = Number(contadoVal);
  if (contadoVal === '' || isNaN(contado) || contado < 0) { showToast('Ingresá el efectivo contado'); return; }

  mostrarConfirm({
    icon: '💰',
    titulo: 'Cerrar caja',
    msg: 'Esta acción no se puede deshacer. ¿Confirmás el cierre del día?',
    btnTxt: 'Cerrar caja',
    btnColor: 'var(--accent)',
    onOk: () => confirmarCierreCaja(contado)
  });
}

let _cierreEnProceso = false;

async function confirmarCierreCaja(contado) {
  if (_cierreEnProceso) return; // mostrarConfirm ya cierra su modal al primer toque, esto es un resguardo extra
  _cierreEnProceso = true;
  try {
    const sesionId = document.getElementById('czSesionId').value;
    const res = await apiPost({ action: 'cerrarCaja', sesionId, efectivoContado: contado });
    if (res.ok) {
      cerrarModal('modalCierreCaja');
      await renderCaja();
      if (typeof renderInicio === 'function' && seccionActiva === 'inicio') renderInicio();
      if (typeof renderTurnos === 'function' && seccionActiva === 'turnos') renderTurnos();
      mostrarResultadoCierre(res);
    } else {
      showToast(res.error || 'No se pudo cerrar la caja');
    }
  } finally {
    _cierreEnProceso = false;
  }
}

// ════════════════════════════════════════════════════════
//  RESULTADO DEL CIERRE — pantalla final con el número que Gise
//  necesita: cuánto debería haber en cada cuenta. "Efectivo" acá
//  es lo que debería estar físicamente en la caja (incluye el saldo
//  con el que se abrió); Mercado Pago/Transferencia no tienen
//  apertura, así que ahí es directo ingresos−egresos del día.
// ════════════════════════════════════════════════════════
function mostrarResultadoCierre(res) {
  document.getElementById('crTotalDia').textContent = fmtMoneda(res.resultadoNeto);

  const filas = _filasPorMetodo(res.porMetodo).map(f => {
    if (f.label.toLowerCase() === 'efectivo' && res.efectivo) {
      return { label: f.label, monto: Number(res.efectivo.esperado) || 0 };
    }
    return f;
  });
  document.getElementById('crDetalle').innerHTML = _detalleTotalHTML(filas);

  abrirModal('modalCierreResultado');
}

function verDetallesCierre() {
  cerrarModal('modalCierreResultado');
  irA('caja');
  fechaCajaActiva = todayStr();
  renderResumenDiaCaja();
}
