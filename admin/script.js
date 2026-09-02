// ============================================================
//  admin/script.js — Panel de administración
//  Requiere ../script.js cargado antes
// ============================================================

// ── Identidad (shared/js/identity.js, cargado antes) ───────
// Reemplaza el texto fijo de logo por IDENTITY — así el admin deja
// de tener el nombre del comercio hardcodeado en 2 lugares propios.
(function aplicarIdentidad() {
  if (typeof IDENTITY === 'undefined') return;
  // El admin vive un nivel debajo de la raíz del repo (admin/index.html),
  // por eso a IDENTITY.logoUrl ('assets/logo.png', relativo a la raíz)
  // se le antepone '../' acá — en el sitio público (shared/js/nav.js)
  // se usa tal cual porque esas páginas SÍ están en la raíz.
  const logoSrc = IDENTITY.logoUrl ? '../' + IDENTITY.logoUrl : null;
  // Logo + nombre a la derecha, en topbar y login — ya no hace falta
  // el logo solo: con el topbar liberado (tema/sync/caché/salir se
  // movieron al drawer) hay lugar de sobra para el texto sin que se apile.
  document.querySelectorAll('.topbar-logo, .login-logo').forEach(el => {
    if (!logoSrc) { el.innerHTML = `${IDENTITY.simbolo} <span>${IDENTITY.nombre}</span>`; return; }
    // Si el archivo todavía no existe en assets/, el <img> dispara
    // onerror UNA vez y recién ahí se cae al símbolo de texto — así
    // no queda un ícono roto del navegador mientras tanto.
    el.innerHTML = `<img src="${logoSrc}" alt="${IDENTITY.nombre}" class="identity-logo-img"> <span>${IDENTITY.nombre}</span>`;
    const img = el.querySelector('img');
    img.onerror = () => { img.remove(); el.insertAdjacentHTML('afterbegin', `${IDENTITY.simbolo} `); };
  });
  if (IDENTITY.favicon) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = '../' + IDENTITY.favicon;
  }
})();

// ── Tema claro/oscuro (movido del topbar al drawer, ver Etapa "pulido"
//    del usuario) — misma clave de localStorage que ../script.js, para
//    que ambos queden sincronizados si algún día vuelve a haber un
//    control de tema en más de un lugar.
function _iconoTemaSol() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="4.2" y1="4.2" x2="6" y2="6"/><line x1="18" y1="18" x2="19.8" y2="19.8"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.2" y1="19.8" x2="6" y2="18"/><line x1="18" y1="6" x2="19.8" y2="4.2"/></svg>';
}
function _iconoTemaLuna() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>';
}
function _actualizarIconoTema() {
  const esOscuro = document.documentElement.getAttribute('data-theme') === 'dark';
  // Convención: el ícono muestra el modo AL QUE SE PASA al tocarlo (no
  // el actual) — en oscuro se ve el sol (te lleva a claro), en claro
  // se ve la luna (te lleva a oscuro).
  const iconoHtml = esOscuro ? _iconoTemaSol() : _iconoTemaLuna();
  const labelTxt = esOscuro ? 'Modo claro' : 'Modo oscuro';
  const drawerIcon = document.getElementById('drawerThemeIcon');
  const drawerLabel = document.getElementById('drawerThemeLabel');
  const topbarIcon = document.getElementById('topbarThemeIcon');
  if (drawerIcon) drawerIcon.innerHTML = iconoHtml;
  if (drawerLabel) drawerLabel.textContent = labelTxt;
  if (topbarIcon) topbarIcon.innerHTML = iconoHtml;
}
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  _actualizarIconoTema();
}
_actualizarIconoTema();

// API_URL heredada de ../script.js

// ── API helpers ───────────────────────────────────────────
async function apiPost(data) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ ...data, token: getAuthToken() }),
    });
    return await res.json();
  } catch(e) {
    console.warn('apiPost error:', e);
    return { error: e.message };
  }
}

async function apiGet(action, params = {}) {
  try {
    const qs = new URLSearchParams({ action, token: getAuthToken(), ...params }).toString();
    const res  = await fetch(API_URL + '?' + qs);
    const json = await res.json();
    return json.data || [];
  } catch(e) {
    console.warn('apiGet error:', e);
    return [];
  }
}

// ── Sync ─────────────────────────────────────────────────
async function syncTurnos() {
  const data = await apiGet('getTurnos');
  if (data.length) saveTurnos(data);
}

async function sincronizarTurnos() {
  const btn = document.getElementById('btnSincronizarTurnos');
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner btn-spinner-light"></span> Buscando…'; }
  try {
    const res = await apiPost({ action: 'sincronizarCalendly' });
    if (res && res.error) {
      showToast('⚠ ' + res.error);
    } else if (res && typeof res.nuevos === 'number') {
      await syncTurnos();
      renderTurnos();
      actualizarBadges();
      const huboErrores = res.errores && res.errores.length;
      if (huboErrores) {
        showToast(`⚠ ${res.nuevos} nuevo${res.nuevos === 1 ? '' : 's'}, ${res.errores.length} con error`);
      } else {
        showToast(res.nuevos > 0
          ? `✓ ${res.nuevos} turno${res.nuevos === 1 ? '' : 's'} nuevo${res.nuevos === 1 ? '' : 's'}`
          : '✓ Ya estabas al día');
      }
    } else {
      // Respuesta inesperada del backend — igual refresca desde la
      // hoja, por si el problema fue solo en la respuesta, no en el guardado.
      await syncTurnos();
      renderTurnos();
      actualizarBadges();
      showToast('✓ Turnos actualizados');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

async function forzarSync() {
  showToast('↻ Sincronizando...');
  try {
    const [t, i, cats, cfg, clientes, movs, sesiones] = await Promise.all([
      apiGet('getTurnos'),
      apiGet('getInventario'),
      apiGet('getCategorias'),
      apiGet('getConfiguracion'),
      apiGet('getClientes'),
      apiGet('getTodosLosMovimientosCaja'),
      apiGet('getTodasSesionesCaja'),
    ]);
    if (t.length) saveTurnos(t);
    if (i.length) {
      const deleted = JSON.parse(localStorage.getItem('deleted_ids') || '[]');
      saveInventario(i.filter(p => !deleted.includes(String(p.id))));
    }
    if (cats.length) saveCategorias(cats);
    // getConfiguracion devuelve un objeto (no un array); apiGet solo hace
    // fallback a [] cuando json.data es falsy (todavía no hay nada guardado).
    if (cfg && !Array.isArray(cfg)) DB.set('agenda_config', cfg);
    if (clientes.length) saveClientes(clientes);
    if (movs.length) saveTodosMovimientos(movs);
    if (sesiones.length) saveTodasSesiones(sesiones);
    if (typeof syncCaja === 'function') await syncCaja();
    renderSeccionActiva();
    actualizarBadges();
    showToast('✓ Sincronizado');
  } catch(e) {
    showToast('Sin conexión — datos locales');
  }
}

// ── Drawer / navegación ──────────────────────────────────
let seccionActiva = 'inicio';

function initDrawer() {
  const btn     = document.getElementById('menuBtn');
  const drawer  = document.getElementById('adminDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const bnMas   = document.getElementById('bnMas');
  const toggleDrawer = () => {
    const isOpen = drawer.classList.contains('open');
    drawer.classList.toggle('open', !isOpen);
    overlay.classList.toggle('open', !isOpen);
    btn.classList.toggle('open', !isOpen);
  };
  btn.addEventListener('click', toggleDrawer);
  bnMas?.addEventListener('click', toggleDrawer);
  overlay.addEventListener('click', cerrarDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      cerrarDrawer();
      cerrarModal('modalProducto');
      cerrarModal('modalConfirmar');
      cerrarModal('modalInput');
    }
  });
}

function cerrarDrawer() {
  document.getElementById('adminDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
  document.getElementById('menuBtn').classList.remove('open');
}

// ── "+" central de la barra inferior — action sheet ─────────
function abrirActionSheet() {
  document.getElementById('actionSheet').classList.add('open');
}
function cerrarActionSheet() {
  document.getElementById('actionSheet').classList.remove('open');
}
function accionRapida(tipo) {
  cerrarActionSheet();
  if (tipo === 'cobrar') {
    irA('caja');
    if (getCajaSesion()) {
      setTimeout(() => abrirModalMovimiento(), 150);
    } else {
      showToast('Primero tenés que abrir la caja');
    }
  } else if (tipo === 'turno') {
    // Todavía no existe un flujo de carga manual de turno (hoy
    // los turnos entran solo por Calendly) — por ahora lleva a
    // la sección de Turnos. Queda pendiente para una próxima etapa.
    irA('turnos');
  } else if (tipo === 'producto') {
    irA('inventario');
    setTimeout(() => abrirModalProducto(), 150);
  }
}

function irA(seccion) {
  seccionActiva = seccion;
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + seccion)?.classList.add('active');
  document.querySelectorAll('.drawer-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll(`.drawer-item[data-sec="${seccion}"]`).forEach(i => i.classList.add('active'));
  // Barra inferior: resalta el ítem si tiene lugar propio (Inicio/Caja/Turnos);
  // si la sección se ve solo desde el drawer (Agenda/Inventario/Categorías),
  // resalta "Más", que es por donde se llegó.
  document.querySelectorAll('.bn-item').forEach(b => b.classList.remove('active'));
  const bnMatch = document.querySelector(`.bn-item[data-sec="${seccion}"]`);
  (bnMatch || document.getElementById('bnMas'))?.classList.add('active');
  cerrarDrawer();
  renderSeccionActiva();
}

function renderSeccionActiva() {
  if (seccionActiva === 'inicio')     renderInicio();
  if (seccionActiva === 'turnos')     renderTurnos();
  if (seccionActiva === 'clientes')   renderClientes();
  if (seccionActiva === 'agenda')     renderAgenda();
  if (seccionActiva === 'inventario') renderInventario();
  if (seccionActiva === 'caja')       renderCaja();
}

function actualizarBadges() {
  const pendientes = getTurnos().filter(t => t.estado === 'pendiente').length;
  const badge = document.getElementById('turnosBadge');
  if (badge) {
    badge.textContent = pendientes || '';
    badge.style.display = pendientes ? 'flex' : 'none';
  }
}

// ════════════════════════════════════════════════════════
//  INICIO
// ════════════════════════════════════════════════════════
// Formato de moneda propio del dashboard: sin decimales, aunque el
// Sheets guarde el importe con centavos — solo redondea la vista,
// no toca el dato guardado. fmtMoneda() (caja.js) sigue mostrando
// centavos en el resto de Caja, sin cambios.
function fmtMonedaDashboard(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
}

// Tarjeta "Caja hoy": si la caja está cerrada, abre el modal de
// apertura sin salir de Inicio; si está abierta, lleva a la sección Caja.
function cajaHoyTileClick() {
  const sesion = typeof getCajaSesion === 'function' ? getCajaSesion() : null;
  if (!sesion) {
    if (typeof abrirModalAbrirCajaInicio === 'function') abrirModalAbrirCajaInicio();
  } else {
    irA('caja');
  }
}

function renderInicio() {
  const turnos = getTurnos(), inv = getInventario();
  const hoy = todayStr(), ahora = new Date().toTimeString().slice(0,5), hoyDt = new Date();

  // Saludo + fecha
  const h = hoyDt.getHours();
  const saludo = h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  document.getElementById('inicioSaludo').textContent = `¡${saludo}, Gise! 👋`;
  document.getElementById('inicioFechaHoy').textContent = fmtDateHuman(hoyDt);

  // Turnos hoy
  const hoyTurnos = turnos.filter(t => t.fecha === hoy);
  const hoyConfirmados = hoyTurnos.filter(t => t.estado === 'confirmado').length;
  document.getElementById('stTurnosHoy').textContent = hoyTurnos.length;
  document.getElementById('stTurnosHoySub').textContent = `${hoyConfirmados} confirmado${hoyConfirmados===1?'':'s'}`;

  // Caja hoy — mismos datos que el Resumen diario de Caja (getTodosMovimientos), acá para hoy nomás.
  // Si la caja está cerrada, la tarjeta no muestra importe: invita a abrirla (ver cajaHoyTileClick).
  const cajaHoyCard = document.getElementById('inicioCajaHoyCard');
  const sesionActual = typeof getCajaSesion === 'function' ? getCajaSesion() : null;
  if (!sesionActual) {
    document.getElementById('stCajaHoy').textContent = 'Abrir caja';
    document.getElementById('stCajaHoySub').textContent = 'Caja cerrada — tocá para abrirla';
    if (cajaHoyCard) cajaHoyCard.classList.add('inicio-stat-card-accion');
  } else {
    const movsHoy = getTodosMovimientos().filter(m => {
      if (!m.fecha) return false;
      const d = new Date(m.fecha);
      return !isNaN(d.getTime()) && fmtDate(d) === hoy;
    });
    const ingresosHoy = movsHoy.filter(m => String(m.tipo).toLowerCase() === 'ingreso');
    const totalCajaHoy = ingresosHoy.reduce((s,m) => s + (Number(m.importe)||0), 0);
    document.getElementById('stCajaHoy').textContent = fmtMonedaDashboard(totalCajaHoy);
    document.getElementById('stCajaHoySub').textContent = `${ingresosHoy.length} pago${ingresosHoy.length===1?'':'s'} registrado${ingresosHoy.length===1?'':'s'}`;
    if (cajaHoyCard) cajaHoyCard.classList.remove('inicio-stat-card-accion');
  }

  // Resultado del mes (ingresos - egresos). El desglose completo por
  // método, con ingresos y egresos separados (no neteados), se ve al
  // tocar la tarjeta — abrirResumenMes(), en js/caja.js.
  const mesActual = hoy.slice(0,7);
  const movsMes = getTodosMovimientos().filter(m => {
    if (!m.fecha) return false;
    const d = new Date(m.fecha);
    return !isNaN(d.getTime()) && fmtDate(d).startsWith(mesActual);
  });
  const ingresosMes = movsMes.filter(m => String(m.tipo).toLowerCase() === 'ingreso').reduce((s,m) => s + (Number(m.importe)||0), 0);
  const egresosMes  = movsMes.filter(m => String(m.tipo).toLowerCase() === 'egreso').reduce((s,m) => s + (Number(m.importe)||0), 0);
  document.getElementById('stIngresosMes').textContent = fmtMonedaDashboard(ingresosMes - egresosMes);
  document.getElementById('stIngresosMesSub').textContent = `${MESES[hoyDt.getMonth()]} ${hoyDt.getFullYear()}`;

  // Stock bajo
  const lowCount = inv.filter(p => Number(p.stock) <= 2).length;
  document.getElementById('stStockBajo').textContent = lowCount;

  // Próximos turnos (hasta 3, desde ahora en adelante, nunca cancelados)
  const activos = turnos.filter(t => t.estado !== 'cancelado');
  const proximos = activos
    .filter(t => (t.fecha + t.horario) >= (hoy + ahora))
    .sort((a,b) => (a.fecha+a.horario).localeCompare(b.fecha+b.horario))
    .slice(0, 3);
  document.getElementById('listProximos').innerHTML = proximos.length
    ? proximos.map(t => `
        <li class="today-item">
          <span class="today-time">${t.horario}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:500">${t.nombre}</div>
            <div style="font-size:.76rem;color:var(--text-muted)">${t.servicio}</div>
          </div>
          <span class="inicio-badge inicio-badge-${t.estado === 'confirmado' ? 'confirmado' : 'pendiente'}">${t.estado === 'confirmado' ? 'Confirmado' : 'Pendiente'}</span>
        </li>`).join('')
    : '<p class="today-empty">Sin turnos próximos</p>';
}

// ════════════════════════════════════════════════════════
//  TURNOS
// ════════════════════════════════════════════════════════
let turnoFiltroActivo = '';

let turnoFechaActiva = todayStr();

function esTurnoPasado(t, hoy, ahora) {
  return t.estado !== 'cancelado' && (t.fecha + t.horario) < (hoy + ahora);
}
function estadoEfectivoTurno(t, hoy, ahora) {
  return esTurnoPasado(t, hoy, ahora) ? 'finalizado' : t.estado;
}

function renderTurnoChips() {
  const opciones = [
    { v: '', label: 'Todos' },
    { v: 'pendiente', label: 'Pendientes' },
    { v: 'confirmado', label: 'Confirmados' },
    { v: 'finalizado', label: 'Finalizados' },
    { v: 'cancelado', label: 'Cancelados' }
  ];
  document.getElementById('turnosChips').innerHTML = opciones.map(o =>
    `<div class="chip ${turnoFiltroActivo===o.v?'on-gold':''}" onclick="setTurnoFiltro('${o.v}')">${o.label}</div>`
  ).join('');
}
function setTurnoFiltro(v) {
  turnoFiltroActivo = v;
  renderTurnos();
}

function renderTurnosDateNav() {
  const hoy = todayStr();
  const dt  = new Date(turnoFechaActiva + 'T00:00:00');
  const label = turnoFechaActiva === hoy ? 'Hoy' : fmtDateHuman(dt);
  document.getElementById('tdnFecha').innerHTML =
    `${label}${turnoFechaActiva !== hoy ? `<small>${fmtDateHuman(dt)}</small>` : ''}`;
}
function moverFechaTurnos(delta) {
  const dt = new Date(turnoFechaActiva + 'T00:00:00');
  dt.setDate(dt.getDate() + delta);
  turnoFechaActiva = fmtDate(dt);
  renderTurnos();
}
function irAHoyTurnos() {
  turnoFechaActiva = todayStr();
  renderTurnos();
}

function renderTurnos() {
  renderTurnoChips();
  renderTurnosDateNav();
  const filtro = turnoFiltroActivo;
  const hoy = todayStr(), ahora = new Date().toTimeString().slice(0,5);
  const todos  = getTurnos().filter(t => t.fecha === turnoFechaActiva);
  const lista  = filtro ? todos.filter(t => estadoEfectivoTurno(t, hoy, ahora) === filtro) : todos;
  const sorted = [...lista].sort((a,b) => (b.fecha+b.horario).localeCompare(a.fecha+a.horario));
  const cont = document.getElementById('turnosBody');
  if (!sorted.length) {
    cont.innerHTML = `<div class="turnos-empty">Sin turnos${filtro?' en este estado':''} para este día.</div>`;
    return;
  }
  cont.innerHTML = sorted.map(t => {
    const pasado = esTurnoPasado(t, hoy, ahora);
    const dotC  = pasado ? 'dot-fin' : ({ pendiente:'dot-pend', confirmado:'dot-conf', cancelado:'dot-canc' }[t.estado] || '');
    const estadoTexto = estadoEfectivoTurno(t, hoy, ahora);
    const tieneSena = t.sena === 'si';
    return `<div class="turno-card">
      <div class="turno-card-top">
        <span class="turno-estado"><span class="dot ${dotC}"></span>${estadoTexto}${tieneSena ? ' <span class="badge-sena">seña</span>' : ''}</span>
        <span class="turno-fecha">${t.horario} · ${t.duracion}min</span>
      </div>
      <div class="turno-cliente">${t.nombre}</div>
      <div class="turno-servicio">${t.servicio}</div>
      ${t.mail ? `<div class="turno-mail">${t.mail}</div>` : ''}
      <div class="turno-actions">
        ${t.estado==='pendiente'&&!pasado?`
          <button onclick="cambiarEstadoTurno('${t.id}','confirmado')" class="btn btn-sm" style="background:rgba(34,197,94,.12);color:#16a34a;border:none;padding:.28rem .7rem">✓ Confirmar</button>
          <button onclick="cambiarEstadoTurno('${t.id}','cancelado')"  class="btn btn-sm" style="background:rgba(239,68,68,.1);color:#dc2626;border:none;padding:.28rem .7rem">✗ Cancelar</button>`:''}
        ${t.estado!=='cancelado'&&!tieneSena&&!pasado?`
          <button onclick="abrirCambiarTurno('${t.id}')" class="btn btn-sm" style="background:none;border:1px solid var(--border);color:var(--text-muted);padding:.28rem .7rem">↺ Cambiar</button>`:''}
        ${t.fecha===hoy && typeof botonCobrarHTML === 'function' ? botonCobrarHTML(t) : ''}
        <button onclick="pedirEliminarTurno('${t.id}')" class="btn btn-sm" style="background:rgba(239,68,68,.08);color:#dc2626;border:none;padding:.28rem .7rem">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function cambiarEstadoTurno(id, estado) {
  const arr = getTurnos(), idx = arr.findIndex(t => String(t.id) === String(id));
  if (idx < 0) return;
  if (estado === 'cancelado') {
    // Si tiene eventId, borrarlo del Calendar
    if (arr[idx].calEventId) {
      apiPost({ action: 'eliminarEventoCalendario', eventId: arr[idx].calEventId });
      arr[idx].calEventId = '';
      apiPost({ action: 'updateEstado', id, estado, calEventId: '' });
    }
  }
  if (estado === 'confirmado') {
    // Agendar en Google Calendar
    const t = arr[idx];
    apiPost({
      action: 'agregarEventoCalendario',
      turno: { id: t.id, nombre: t.nombre, servicio: t.servicio, fecha: t.fecha, horario: t.horario, duracion: t.duracion, mail: t.mail }
    }).then(r => {
      if (r.ok && r.eventId) {
        const arr2 = getTurnos();
        const i2 = arr2.findIndex(x => String(x.id) === String(id));
        if (i2 >= 0) { arr2[i2].calEventId = r.eventId; saveTurnos(arr2); }
        apiPost({ action: 'updateCalEventId', id, calEventId: r.eventId });
      }
      showToast(r.ok ? '📅 Agendado en Calendar' : '✓ Confirmado (Calendar: ' + (r.error||'error') + ')');
    });
  }
  arr[idx].estado = estado;
  saveTurnos(arr);
  apiPost({ action: 'updateEstado', id, estado });
  renderTurnos(); actualizarBadges();
  if (estado !== 'confirmado') showToast(estado === 'cancelado' ? '✗ Turno cancelado' : '✓ Turno confirmado');
}

// ── Eliminar turno ────────────────────────────────────────
function pedirEliminarTurno(id) {
  const t = getTurnos().find(x => String(x.id) === String(id));
  if (!t) return;
  mostrarConfirm({
    icon: '🗑', titulo: 'Eliminar turno',
    msg: `¿Eliminás el turno de ${t.nombre} el ${t.fecha} a las ${t.horario}?`,
    btnTxt: 'Sí, eliminar', btnColor: 'rgba(239,68,68,.85)',
    onOk: () => eliminarTurno(id)
  });
}

function eliminarTurno(id) {
  const arr = getTurnos();
  const t   = arr.find(x => String(x.id) === String(id));
  if (!t) return;
  if (t.calEventId) apiPost({ action: 'eliminarEventoCalendario', eventId: t.calEventId });
  saveTurnos(arr.filter(x => String(x.id) !== String(id)));
  apiPost({ action: 'deleteRow', sheet: 'turnos', id });
  renderTurnos(); actualizarBadges();
  showToast('✓ Turno eliminado');
}

// ── Cambiar fecha/horario ─────────────────────────────────
function abrirCambiarTurno(id) {
  const t = getTurnos().find(x => String(x.id) === String(id));
  if (!t) return;
  if (t.sena === 'si') { showToast('⚠ No se puede cambiar un turno con seña abonada'); return; }
  document.getElementById('ctId').value = id;
  document.getElementById('ctInfo').textContent = `${t.nombre} · ${t.servicio} · ${t.fecha} ${t.horario}`;
  document.getElementById('ctFecha').value = t.fecha;
  // Poblar horarios
  const slots = getAgenda().slots || [];
  document.getElementById('ctHorario').innerHTML = slots.map(s =>
    `<option value="${s}" ${s === t.horario ? 'selected' : ''}>${s}</option>`
  ).join('');
  abrirModal('modalCambiarTurno');
}

function confirmarCambioTurno() {
  const id      = document.getElementById('ctId').value;
  const fecha   = document.getElementById('ctFecha').value;
  const horario = document.getElementById('ctHorario').value;
  if (!fecha || !horario) { showToast('⚠ Completá fecha y horario'); return; }
  const arr = getTurnos(), idx = arr.findIndex(x => String(x.id) === String(id));
  if (idx < 0) return;
  const t = arr[idx];
  arr[idx].fecha   = fecha;
  arr[idx].horario = horario;
  saveTurnos(arr);
  // Actualizar en Sheet
  apiPost({ action: 'updateFechaTurno', id, fecha, horario });
  // Actualizar en Calendar si tiene evento
  if (t.calEventId) {
    apiPost({ action: 'actualizarEventoCalendario', eventId: t.calEventId, fecha, horario, duracion: t.duracion });
  }
  cerrarModal('modalCambiarTurno');
  renderTurnos();
  showToast('✓ Turno cambiado');
}

// ════════════════════════════════════════════════════════
//  AGENDA
// ════════════════════════════════════════════════════════
const DIAS_N = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
let agTemp = null;

function renderAgenda() {
  agTemp = JSON.parse(JSON.stringify(getAgenda()));
  renderDias(); renderSlots(); renderDuraciones(); renderBloqueadas();
  actualizarResumenesAgenda();
}
function actualizarResumenesAgenda() {
  const ag = getAgenda();
  const dias = [...ag.diasHabilitados].sort((a,b)=>a-b).map(i => DIAS_N[i]);
  document.getElementById('resumenDias').textContent = dias.length ? dias.join(', ') : 'Sin días configurados';
  document.getElementById('resumenSlots').textContent = ag.slots.length ? `${ag.slots.length} horario${ag.slots.length>1?'s':''} configurado${ag.slots.length>1?'s':''}` : 'Sin horarios configurados';
  const svcs = ag.servicios || getDefaultServicios();
  document.getElementById('resumenDuraciones').textContent = `${svcs.length} servicios`;
  document.getElementById('resumenBloqueos').textContent = ag.diasBloqueados.length ? `${ag.diasBloqueados.length} fecha${ag.diasBloqueados.length>1?'s':''} bloqueada${ag.diasBloqueados.length>1?'s':''}` : 'Sin fechas bloqueadas';
}
function abrirModalAgendaDias()       { agTemp = JSON.parse(JSON.stringify(getAgenda())); renderDias(); abrirModal('modalAgendaDias'); }
function abrirModalAgendaSlots()      { agTemp = JSON.parse(JSON.stringify(getAgenda())); renderSlots(); abrirModal('modalAgendaSlots'); }
function abrirModalAgendaDuraciones() { agTemp = JSON.parse(JSON.stringify(getAgenda())); renderDuraciones(); abrirModal('modalAgendaDuraciones'); }
function abrirModalAgendaBloqueos()   { renderBloqueadas(); abrirModal('modalAgendaBloqueos'); }
function renderDias() {
  document.getElementById('diasChips').innerHTML = DIAS_N.map((d,i) =>
    `<div class="chip ${agTemp.diasHabilitados.includes(i)?'on':''}" onclick="toggleDia(${i})">${d}</div>`
  ).join('');
}
function toggleDia(i) {
  const arr = agTemp.diasHabilitados, idx = arr.indexOf(i);
  if (idx >= 0) arr.splice(idx,1); else arr.push(i); renderDias();
}
function guardarDias() {
  const ag = getAgenda(); ag.diasHabilitados = agTemp.diasHabilitados;
  DB.set('agenda_config', ag);
  apiPost({ action: 'saveConfiguracion', config: ag });
  actualizarResumenesAgenda();
  showToast('✓ Días guardados');
}
function renderSlots() {
  document.getElementById('slotsChips').innerHTML = agTemp.slots.map(s =>
    `<div class="chip on-gold" style="display:flex;align-items:center;gap:.3rem">
      ${s}<span onclick="quitarSlot('${s}')" style="cursor:pointer;color:var(--text-muted);font-size:.9rem;line-height:1">×</span>
    </div>`).join('');
}
function agregarSlot() {
  const v = document.getElementById('nuevoSlot').value;
  if (!v || agTemp.slots.includes(v)) return;
  agTemp.slots.push(v); agTemp.slots.sort(); renderSlots();
}
function quitarSlot(s) { agTemp.slots = agTemp.slots.filter(x => x !== s); renderSlots(); }
function guardarSlots() {
  const ag = getAgenda(); ag.slots = agTemp.slots;
  DB.set('agenda_config', ag);
  apiPost({ action: 'saveConfiguracion', config: ag });
  actualizarResumenesAgenda();
  showToast('✓ Horarios guardados');
}
function renderDuraciones() {
  const svcs = agTemp.servicios || getDefaultServicios();
  const grupos = {};
  svcs.forEach(s => { if (!grupos[s.grupo]) grupos[s.grupo]=[]; grupos[s.grupo].push(s); });
  document.getElementById('duracionesWrap').innerHTML = Object.entries(grupos).map(([g, items]) => `
    <div style="margin-bottom:1.25rem">
      <div style="font-size:.68rem;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-bottom:.6rem">${g}</div>
      ${items.map(s => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:.55rem .75rem;background:var(--bg);border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:.4rem">
          <span style="font-size:.85rem">${s.nombre}</span>
          <div style="display:flex;align-items:center;gap:.4rem">
            <input type="number" class="input-sm" id="dur_${s.id}" value="${s.duracion}" min="5" step="5" style="width:65px;text-align:center">
            <span style="font-size:.75rem;color:var(--text-muted)">min</span>
          </div>
        </div>`).join('')}
    </div>`).join('');
}
function guardarDuraciones() {
  const ag = getAgenda(), svcs = ag.servicios || getDefaultServicios();
  svcs.forEach(s => { const el = document.getElementById('dur_'+s.id); if (el) s.duracion = parseInt(el.value)||s.duracion; });
  ag.servicios = svcs;
  DB.set('agenda_config', ag);
  apiPost({ action: 'saveConfiguracion', config: ag });
  actualizarResumenesAgenda();
  showToast('✓ Duraciones guardadas');
}
function bloquearFecha() {
  const v = document.getElementById('fechaBloqueo').value; if (!v) return;
  const ag = getAgenda();
  if (!ag.diasBloqueados.includes(v)) ag.diasBloqueados.push(v);
  DB.set('agenda_config', ag);
  apiPost({ action: 'saveConfiguracion', config: ag });
  agTemp = JSON.parse(JSON.stringify(ag)); renderBloqueadas(); actualizarResumenesAgenda(); showToast('✓ Fecha bloqueada');
}
function desbloquearFecha(v) {
  const ag = getAgenda(); ag.diasBloqueados = ag.diasBloqueados.filter(d => d !== v);
  DB.set('agenda_config', ag);
  apiPost({ action: 'saveConfiguracion', config: ag });
  agTemp = JSON.parse(JSON.stringify(ag)); renderBloqueadas(); actualizarResumenesAgenda();
}
function renderBloqueadas() {
  const ag = getAgenda();
  document.getElementById('fechasBloqueadas').innerHTML = ag.diasBloqueados.length
    ? ag.diasBloqueados.sort().map(d =>
        `<div class="chip danger" style="display:flex;align-items:center;gap:.3rem">${d}
          <span onclick="desbloquearFecha('${d}')" style="cursor:pointer;font-size:.9rem">×</span>
        </div>`).join('')
    : '<span style="font-size:.82rem;color:var(--text-muted)">Sin fechas bloqueadas.</span>';
}

// ════════════════════════════════════════════════════════
//  INVENTARIO
// ════════════════════════════════════════════════════════
let invCatActiva  = '';
let invVisFiltro  = ''; // '' = todos, 'publico', 'privado'

function setVisFiltro(vis) {
  invVisFiltro = vis;
  document.querySelectorAll('.vis-filtro-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.vis === vis);
  });
  window._filtroStockBajo = false;
  renderInventario();
}

function renderInvTabs() {
  const cats = ['Todos', ...getCategorias()];
  document.getElementById('invTabs').innerHTML = cats.map(c =>
    `<div class="chip ${(invCatActiva===c||(!invCatActiva&&c==='Todos'))?'on-gold':''} scrollable" onclick="setInvCat('${c}')">${c}</div>`
  ).join('');
}
function setInvCat(c) {
  invCatActiva = c === 'Todos' ? '' : c;
  window._filtroStockBajo = false;
  renderInvTabs(); renderInventario();
}
function filtrarStockBajo() {
  invCatActiva = '';
  window._filtroStockBajo = true;
  renderInvTabs(); renderInventario();
}

function actualizarAlertaStock() {
  const todos    = getInventario();
  const bajo     = todos.filter(p => Number(p.stock) > 0 && Number(p.stock) <= 2);
  const sinStock = todos.filter(p => Number(p.stock) <= 0);
  const alertEl  = document.getElementById('stockAlerta');
  if (!alertEl) return;
  const total = bajo.length + sinStock.length;
  if (total > 0) {
    alertEl.style.display = 'block';
    const partes = [];
    if (bajo.length)     partes.push(`<strong>${bajo.length}</strong> con stock bajo`);
    if (sinStock.length) partes.push(`<strong>${sinStock.length}</strong> sin stock`);
    document.getElementById('stockAlertaLista').innerHTML =
      `<span style="font-size:.84rem">${partes.join(' · ')} &nbsp;·&nbsp;
        <a href="#" onclick="filtrarStockBajo();return false;"
          style="color:var(--accent);font-weight:500;text-decoration:underline">Ver detalle →</a>
      </span>`;
  } else {
    alertEl.style.display = 'none';
  }
}

function renderInventario() {
  renderInvTabs();
  const todos = getInventario();
  const q     = (document.getElementById('invBuscar')?.value || '').toLowerCase();
  if (invCatActiva || q) window._filtroStockBajo = false;
  const lista = todos.filter(p => {
    const matchCat = !invCatActiva || p.categoria === invCatActiva;
    const matchQ   = !q || String(p.nombre||'').toLowerCase().includes(q) || String(p.marca||'').toLowerCase().includes(q) || String(p.notas||'').toLowerCase().includes(q);
    const matchLow = !window._filtroStockBajo || Number(p.stock) <= 2;
    const matchVis = !invVisFiltro || (p.visibilidad || 'privado') === invVisFiltro;
    return matchCat && matchQ && matchLow && matchVis;
  });

  actualizarAlertaStock();

  const wrap = document.getElementById('invGrid');
  if (!wrap) return;

  if (!lista.length) {
    wrap.innerHTML = `<div class="inv-empty">
      <span style="font-size:2.5rem;opacity:.3">💅</span>
      <p>${todos.length === 0 ? 'Todavía no cargaste productos.' : 'Sin resultados.'}</p>
    </div>`;
    return;
  }

  wrap.innerHTML = lista.map(p => {
    const stock = Number(p.stock) || 0;
    const src   = p.fotoUrl || p.foto || '';
    const color = p.color || '#FBCFE8';
    let stockClass = 'inv-stock-ok';
    if (stock <= 0)      stockClass = 'inv-stock-out';
    else if (stock <= 2) stockClass = 'inv-stock-low';

    const fotoHtml = (src && src !== '⏳')
      ? `<img class="inv-card-img" src="${src}" alt="${p.nombre}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const placeholder = `<div class="inv-card-img inv-card-placeholder" style="background:${color};${(src&&src!=='⏳')?'display:none':''}">
        <span style="font-size:2rem;opacity:.35">💅</span>
      </div>`;

    return `<div class="inv-card">
      <div class="inv-card-foto">
        ${fotoHtml}${placeholder}
        <div class="inv-color-dot" style="background:${color}" title="${color}"></div>
        <span class="inv-vis-badge ${p.visibilidad==='publico'?'pub':''}" onclick="toggleVis('${p.id}')">
          ${p.visibilidad==='publico'?'👁':'🔒'}
        </span>
      </div>
      <div class="inv-card-body">
        <div class="inv-card-cat">${p.categoria||''}</div>
        <div class="inv-card-nombre">${p.nombre}</div>
        <div class="inv-card-marca">${p.marca||''}</div>
        ${p.notas ? `<div class="inv-card-notas">Cód: ${p.notas}</div>` : ''}
        ${(p.precioVenta && p.precioVisible === 'si') ? `<div class="inv-card-precio">$${Number(p.precioVenta).toLocaleString('es-AR')}</div>` : ''}
        <div class="inv-card-footer">
          <div class="qty-control">
            <button class="qty-btn" onclick="ajustarStock('${p.id}',-1)">−</button>
            <span class="qty-num ${stockClass}" data-qty-id="${p.id}">${stock}</span>
            <button class="qty-btn" onclick="ajustarStock('${p.id}',+1)">+</button>
          </div>
          <div class="inv-card-actions">
            <button onclick="abrirModalProducto('${p.id}')" class="btn btn-sm inv-btn-editar">Editar</button>
            <button onclick="confirmarEliminar('${p.id}')" class="btn btn-sm inv-btn-eliminar">✕</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function ajustarStock(id, delta) {
  const arr = getInventario(), idx = arr.findIndex(p => String(p.id) === String(id));
  if (idx < 0) { showToast('⚠ Hacé Sync primero'); return; }
  arr[idx].stock = Math.max(0, (Number(arr[idx].stock)||0) + delta);
  saveInventario(arr);
  apiPost({ action: 'updateStock', id, stock: arr[idx].stock });
  const el = document.querySelector(`[data-qty-id="${id}"]`);
  if (el) {
    el.textContent = arr[idx].stock;
    el.className = 'qty-num ' + (arr[idx].stock <= 0 ? 'inv-stock-out' : arr[idx].stock <= 2 ? 'inv-stock-low' : 'inv-stock-ok');
  }
  actualizarAlertaStock();
}

function toggleVis(id) {
  const arr = getInventario(), idx = arr.findIndex(p => String(p.id) === String(id));
  if (idx < 0) { showToast('⚠ Hacé Sync primero'); return; }
  arr[idx].visibilidad = arr[idx].visibilidad === 'publico' ? 'privado' : 'publico';
  saveInventario(arr);
  apiPost({ action: 'updateVis', id, vis: arr[idx].visibilidad });
  renderInventario();
  showToast(arr[idx].visibilidad === 'publico' ? '👁 Ahora es público' : '🔒 Ahora es privado');
}

function confirmarEliminar(id) {
  const p = getInventario().find(x => String(x.id) === String(id));
  if (!p) return;
  const tieneFoto = !!(p.fotoUrl && p.fotoUrl.includes('lh3.googleusercontent.com'));
  mostrarConfirm({
    icon: '🗑', titulo: 'Eliminar producto',
    msg: `¿Eliminás "${p.nombre||'este producto'}"?`,
    btnTxt: tieneFoto ? 'Eliminar + foto Drive' : 'Sí, eliminar',
    btnColor: 'rgba(239,68,68,.85)',
    onOk: () => eliminarProducto(id, tieneFoto),
    btnSecTxt: tieneFoto ? 'Solo el registro' : null,
    onSec: tieneFoto ? () => eliminarProducto(id, false) : null,
  });
}

function eliminarProducto(id, borrarFoto) {
  const p = getInventario().find(x => String(x.id) === String(id));
  const deleted = JSON.parse(localStorage.getItem('deleted_ids') || '[]');
  if (!deleted.includes(String(id))) deleted.push(String(id));
  localStorage.setItem('deleted_ids', JSON.stringify(deleted));
  saveInventario(getInventario().filter(x => String(x.id) !== String(id)));
  if (borrarFoto && p?.fotoUrl) {
    apiPost({ action: 'eliminarConFoto', sheet: 'inventario', id, fotoUrl: p.fotoUrl });
  } else {
    apiPost({ action: 'deleteRow', sheet: 'inventario', id });
  }
  renderInventario(); showToast('✓ Producto eliminado');
}

// ════════════════════════════════════════════════════════
//  PDF
// ════════════════════════════════════════════════════════
function abrirModalPDF() {
  // Poblar selector de categorías
  const sel = document.getElementById('pdfCategoria');
  sel.innerHTML = getCategorias().map(c => `<option value="${c}">${c}</option>`).join('');
  // Reset radio
  document.querySelector('input[name="pdfFiltro"][value=""]').checked = true;
  abrirModal('modalPDF');
}

async function generarPDF() {
  const btn     = document.getElementById('btnGenerarPDF');
  const filtro  = document.querySelector('input[name="pdfFiltro"]:checked')?.value || '';
  const cat     = document.getElementById('pdfCategoria').value;
  const filtroFinal = filtro === 'categoria' ? cat : filtro;

  // Filtrar productos
  const todos = getInventario();
  let items;
  if (filtroFinal === 'bajo') {
    items = todos.filter(p => Number(p.stock) <= 2);
  } else if (filtroFinal && filtroFinal !== 'bajo') {
    items = todos.filter(p => p.categoria === filtroFinal);
  } else {
    items = todos;
  }

  if (!items.length) { showToast('⚠ No hay productos con ese filtro'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span> Generando...';

  const r = await apiPost({ action: 'exportarPDF', items, filtro: filtroFinal });

  btn.disabled = false;
  btn.innerHTML = '📄 Generar PDF';

  if (r.ok && r.url) {
    cerrarModal('modalPDF');
    showToast('✓ PDF generado — abriendo...');
    window.open(r.url, '_blank');
  } else {
    showToast('⚠ ' + (r.error || 'Error al generar el PDF'));
  }
}



// ── Modal producto ────────────────────────────────────────
window._fotoB64 = '';
window._fotoUrlActual = '';

function abrirModalProducto(id) {
  poblarCatSelect();
  document.getElementById('mIdx').value = id || '';
  document.getElementById('modalProdTitulo').textContent = id ? 'Editar producto' : 'Agregar producto';
  document.getElementById('fotoEmptyArea').style.display   = 'flex';
  document.getElementById('fotoPreviewArea').style.display = 'none';
  document.getElementById('mFotoPreview').src = '';
  document.getElementById('btnDetectarColor').style.display = 'none';
  window._fotoB64 = '';
  window._fotoUrlActual = '';

  if (id) {
    const p = getInventario().find(x => String(x.id) === String(id));
    if (!p) { showToast('⚠ Hacé Sync primero'); return; }
    document.getElementById('mNombre').value      = p.nombre    || '';
    document.getElementById('mMarca').value       = p.marca     || '';
    document.getElementById('mCategoria').value   = p.categoria || getCategorias()[0];
    document.getElementById('mColor').value       = p.color     || '';
    document.getElementById('mColorPicker').value = p.color     || '#FBCFE8';
    const dot = document.getElementById('colorPreviewDot');
    if (dot) dot.style.background = p.color || '#FBCFE8';
    document.getElementById('mStock').value       = p.stock     ?? 1;
    document.getElementById('mNotas').value             = p.notas        || '';
    document.getElementById('mPrecioCosto').value        = p.precioCosto  || '';
    document.getElementById('mPrecioVenta').value        = p.precioVenta  || '';
    setPrecioVis(p.precioVisible === 'si' ? 'si' : 'no');
    setVis(p.visibilidad || 'privado');
    const src = p.fotoUrl || p.foto || '';
    window._fotoUrlActual = src;
    if (src && src !== '⏳') {
      document.getElementById('mFotoPreview').src = src;
      document.getElementById('fotoEmptyArea').style.display   = 'none';
      document.getElementById('fotoPreviewArea').style.display = 'block';
      document.getElementById('btnDetectarColor').style.display = 'inline-flex';
    }
  } else {
    document.getElementById('mNombre').value      = '';
    document.getElementById('mMarca').value       = '';
    document.getElementById('mColor').value       = '';
    document.getElementById('mColorPicker').value = '#FBCFE8';
    const dot = document.getElementById('colorPreviewDot');
    if (dot) dot.style.background = '#FBCFE8';
    document.getElementById('mStock').value = 1;
    document.getElementById('mNotas').value          = '';
    document.getElementById('mPrecioCosto').value    = '';
    document.getElementById('mPrecioVenta').value    = '';
    setPrecioVis('no');
    setVis('privado');
  }
  abrirModal('modalProducto');
}

function setVis(val) {
  document.getElementById('mVis').value = val;
  const bp  = document.getElementById('visPrivado');
  const bpu = document.getElementById('visPublico');
  if (!bp || !bpu) return;
  bp.classList.toggle('active-vis',  val === 'privado');
  bpu.classList.toggle('active-vis', val === 'publico');
}

function setPrecioVis(val) {
  document.getElementById('mPrecioVisible').value = val;
  const boculto  = document.getElementById('precioOculto');
  const bpublico = document.getElementById('precioPublico');
  if (!boculto || !bpublico) return;
  boculto.classList.toggle('active-vis',  val === 'no');
  bpublico.classList.toggle('active-vis', val === 'si');
}

function poblarCatSelect() {
  document.getElementById('mCategoria').innerHTML =
    getCategorias().map(c => `<option value="${c}">${c}</option>`).join('');
}

function previewFoto(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const max = 400; let w = img.width, h = img.height;
      if (w > h && w > max) { h = Math.round(h*max/w); w = max; }
      else if (h > max)     { w = Math.round(w*max/h); h = max; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      window._fotoB64 = canvas.toDataURL('image/jpeg', .75);
      document.getElementById('mFotoPreview').src = window._fotoB64;
      document.getElementById('fotoEmptyArea').style.display   = 'none';
      document.getElementById('fotoPreviewArea').style.display = 'block';
      document.getElementById('btnDetectarColor').style.display = 'inline-flex';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

async function detectarColorGemini() {
  const btn = document.getElementById('btnDetectarColor');
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="btn-spinner"></span> Detectando...';
  btn.disabled = true;
  try {
    let b64;
    if (window._fotoB64 && window._fotoB64.startsWith('data:')) {
      // Foto nueva — ya tenemos el b64
      b64 = window._fotoB64;
    } else if (window._fotoUrlActual) {
      // Foto existente en Drive — la convertimos a b64 desde el canvas
      const img = document.getElementById('mFotoPreview');
      if (!img || !img.src) {
        showToast('⚠ No hay foto para analizar');
        btn.innerHTML = orig; btn.disabled = false; return;
      }
      // Dibujar en canvas para obtener b64 (evita CORS usando la img ya cargada)
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth  || img.width  || 400;
        canvas.height = img.naturalHeight || img.height || 400;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        b64 = canvas.toDataURL('image/jpeg', .85);
      } catch(corsErr) {
        // Si hay CORS, mandamos la URL igual y dejamos que Gemini intente
        b64 = null;
      }
    } else {
      showToast('⚠ No hay foto para analizar');
      btn.innerHTML = orig; btn.disabled = false; return;
    }

    const payload = b64
      ? { action: 'detectarColor', b64: b64 }
      : { action: 'detectarColor', url: window._fotoUrlActual };

    const r = await apiPost(payload);
    if (r.ok && r.color) {
      document.getElementById('mColor').value = r.color;
      document.getElementById('mColorPicker').value = r.color;
      const dot = document.getElementById('colorPreviewDot');
      if (dot) dot.style.background = r.color;
      showToast('🎨 Color detectado: ' + r.color);
    } else {
      showToast('⚠ ' + (r.error || 'No se pudo detectar el color'));
    }
  } catch(e) { showToast('⚠ Error al detectar color'); }
  btn.innerHTML = orig; btn.disabled = false;
}

function guardarProducto() {
  const nombre = document.getElementById('mNombre').value.trim();
  if (!nombre) { showToast('⚠ El nombre es obligatorio'); return; }
  const idActual  = document.getElementById('mIdx').value;
  const existente = idActual ? getInventario().find(p => String(p.id) === String(idActual)) : null;
  const producto = {
    id:            idActual || Date.now().toString(),
    nombre,
    marca:         document.getElementById('mMarca').value.trim(),
    categoria:     document.getElementById('mCategoria').value,
    color:         document.getElementById('mColor').value.trim() || document.getElementById('mColorPicker').value,
    stock:         Math.max(0, parseInt(document.getElementById('mStock').value)||0),
    notas:         document.getElementById('mNotas').value.trim(),
    visibilidad:   document.getElementById('mVis').value,
    precioCosto:   document.getElementById('mPrecioCosto').value.trim(),
    precioVenta:   document.getElementById('mPrecioVenta').value.trim(),
    precioVisible: document.getElementById('mPrecioVisible').value,
    fotoUrl:       existente?.fotoUrl || '',
  };
  const arr = getInventario();
  const idx = arr.findIndex(p => String(p.id) === String(producto.id));
  if (idx >= 0) arr[idx] = { ...arr[idx], ...producto };
  else arr.push(producto);
  saveInventario(arr);
  cerrarModal('modalProducto');
  renderInventario();
  apiPost({ action: 'saveInventario', row: producto });
  if (window._fotoB64 && window._fotoB64.startsWith('data:')) {
    showToast('⏳ Subiendo foto...');
    apiPost({ action: 'uploadFoto', id: producto.id, b64: window._fotoB64, nombre: producto.id, categoria: producto.categoria })
      .then(r => {
        if (r.url) {
          const arr2 = getInventario();
          const i2 = arr2.findIndex(p => String(p.id) === String(producto.id));
          if (i2 >= 0) { arr2[i2].fotoUrl = r.url; saveInventario(arr2); renderInventario(); }
        }
        showToast(r.ok ? '✓ Foto guardada en Drive' : '⚠ Error subiendo foto');
      });
  } else {
    showToast(idx >= 0 ? '✓ Producto actualizado' : '✓ Producto agregado');
  }
}

// ════════════════════════════════════════════════════════
//  CATEGORÍAS
// ════════════════════════════════════════════════════════
function abrirModalCategorias() {
  renderCategorias();
  abrirModal('modalCategorias');
}
function renderCategorias() {
  const cats = getCategorias();
  document.getElementById('catLista').innerHTML = cats.length
    ? cats.map((c,i) => `
        <div style="display:flex;align-items:center;gap:.5rem;padding:.6rem .75rem;background:var(--bg);border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:.4rem">
          <span style="flex:1;font-size:.88rem">${c}</span>
          <button onclick="editarCat(${i})" class="btn btn-sm" style="background:var(--bg-yellow);border:none;padding:.25rem .65rem;font-size:.76rem">Renombrar</button>
          <button onclick="pedirEliminarCat(${i})" class="btn btn-sm" style="background:rgba(239,68,68,.1);color:#dc2626;border:none;padding:.25rem .65rem;font-size:.76rem">Eliminar</button>
        </div>`).join('')
    : '<p style="color:var(--text-muted);font-size:.84rem">Sin categorías.</p>';
}
function agregarCategoria() {
  const v = document.getElementById('nuevaCat').value.trim(); if (!v) return;
  const cats = getCategorias();
  if (cats.includes(v)) { showToast('Ya existe esa categoría'); return; }
  cats.push(v); saveCategorias(cats);
  apiPost({ action: 'saveCategorias', categorias: cats });
  document.getElementById('nuevaCat').value = '';
  renderCategorias(); showToast('✓ Categoría agregada');
}
function editarCat(i) {
  const cats = getCategorias();
  mostrarInput({ titulo: 'Renombrar categoría', label: 'Nuevo nombre', valorActual: cats[i],
    onOk: nuevo => {
      if (nuevo === cats[i]) return;
      saveInventario(getInventario().map(p => p.categoria===cats[i]?{...p,categoria:nuevo}:p));
      cats[i] = nuevo; saveCategorias(cats);
      apiPost({ action: 'saveCategorias', categorias: cats });
      renderCategorias(); renderInvTabs(); showToast('✓ Categoría renombrada');
    }
  });
}
function pedirEliminarCat(i) {
  const cats = getCategorias();
  mostrarConfirm({ icon:'🏷', titulo:'Eliminar categoría',
    msg:`¿Eliminás "${cats[i]}"? Los productos quedarán sin categoría.`,
    btnTxt:'Sí, eliminar', btnColor:'rgba(239,68,68,.85)',
    onOk: () => { cats.splice(i,1); saveCategorias(cats);
      apiPost({ action: 'saveCategorias', categorias: cats });
      renderCategorias(); renderInvTabs(); showToast('Categoría eliminada'); }
  });
}

// ════════════════════════════════════════════════════════
//  MODALES GENÉRICOS
// ════════════════════════════════════════════════════════
function abrirModal(id)  { document.getElementById(id)?.classList.add('open'); }
function cerrarModal(id) { document.getElementById(id)?.classList.remove('open'); }

let _confirmOk = null, _confirmSec = null;
function mostrarConfirm({ icon='⚠️', titulo, msg, btnTxt='Confirmar', btnColor='var(--accent)', onOk, btnSecTxt=null, onSec=null }) {
  document.getElementById('cfIcon').textContent   = icon;
  document.getElementById('cfTitulo').textContent = titulo;
  document.getElementById('cfMsg').textContent    = msg;
  document.getElementById('cfBtn').textContent    = btnTxt;
  document.getElementById('cfBtn').style.background = btnColor;
  _confirmOk = onOk; _confirmSec = onSec;
  const secBtn = document.getElementById('cfBtnSec');
  if (secBtn) {
    secBtn.textContent    = btnSecTxt || '';
    secBtn.style.display  = btnSecTxt ? 'flex' : 'none';
  }
  abrirModal('modalConfirmar');
}
function confirmarOk()   { cerrarModal('modalConfirmar'); _confirmOk?.(); }
function confirmarSec()  { cerrarModal('modalConfirmar'); _confirmSec?.(); }
function cerrarConfirm() { cerrarModal('modalConfirmar'); }

let _inputOk = null;
function mostrarInput({ titulo, label, valorActual='', onOk }) {
  document.getElementById('inpTitulo').textContent = titulo;
  document.getElementById('inpLabel').textContent  = label;
  document.getElementById('inpVal').value          = valorActual;
  _inputOk = onOk; abrirModal('modalInput');
  setTimeout(() => document.getElementById('inpVal').focus(), 120);
}
function confirmarInput() {
  const v = document.getElementById('inpVal').value.trim(); if (!v) return;
  cerrarModal('modalInput'); _inputOk?.(v);
}

function limpiarCache() {
  mostrarConfirm({ icon:'🗑', titulo:'Limpiar caché',
    msg:'Se borra el inventario local y se recarga desde Google Sheet.',
    btnTxt:'Limpiar', btnColor:'var(--gold)',
    onOk: () => { localStorage.removeItem('inventario'); localStorage.removeItem('deleted_ids'); forzarSync(); }
  });
}

// ════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const u   = document.getElementById('loginUser').value.trim();
    const p   = document.getElementById('loginPass').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const err = document.getElementById('loginError');
    btn.disabled = true; btn.textContent = 'Verificando...';
    err.style.display = 'none';
    const result = await doLogin(u, p);
    btn.disabled = false; btn.textContent = 'Ingresar →';
    if (result.ok) {
      document.getElementById('loginPage').style.display = 'none';
      document.getElementById('adminPage').style.display = 'block';
      iniciarAdmin();
    } else {
      err.textContent = result.error || 'Usuario o contraseña incorrectos';
      err.style.display = 'block';
    }
  });

  if (isLoggedIn()) {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'block';
    iniciarAdmin();
  }

  // Modales solo cierran con ×, NO al clickear afuera
  document.getElementById('inpVal')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmarInput();
  });
});

function iniciarAdmin() {
  initDrawer(); irA('inicio'); actualizarBadges(); forzarSync();
}

function doLogout() {
  // apiPost toma el token de localStorage — hay que avisar al servidor
  // ANTES de limpiarlo, o el logout le llegaría con el token ya vacío.
  if (getAuthToken()) apiPost({ action: 'logout' });
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_TOKEN);
  location.href = '../index.html';
}
