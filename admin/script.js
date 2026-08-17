// ============================================================
//  admin/script.js — Panel de administración
//  Requiere ../script.js cargado antes
// ============================================================

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

async function forzarSync() {
  showToast('↻ Sincronizando...');
  try {
    const [t, i, cats] = await Promise.all([
      apiGet('getTurnos'),
      apiGet('getInventario'),
      apiGet('getCategorias'),
    ]);
    if (t.length) saveTurnos(t);
    if (i.length) {
      const deleted = JSON.parse(localStorage.getItem('deleted_ids') || '[]');
      saveInventario(i.filter(p => !deleted.includes(String(p.id))));
    }
    if (cats.length) saveCategorias(cats);
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
  btn.addEventListener('click', () => {
    const isOpen = drawer.classList.contains('open');
    drawer.classList.toggle('open', !isOpen);
    overlay.classList.toggle('open', !isOpen);
    btn.classList.toggle('open', !isOpen);
  });
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

function irA(seccion) {
  seccionActiva = seccion;
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + seccion)?.classList.add('active');
  document.querySelectorAll('.drawer-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll(`.drawer-item[data-sec="${seccion}"]`).forEach(i => i.classList.add('active'));
  cerrarDrawer();
  renderSeccionActiva();
}

function renderSeccionActiva() {
  if (seccionActiva === 'inicio')     renderInicio();
  if (seccionActiva === 'turnos')     renderTurnos();
  if (seccionActiva === 'agenda')     renderAgenda();
  if (seccionActiva === 'inventario') renderInventario();
  if (seccionActiva === 'categorias') renderCategorias();
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
function renderInicio() {
  const turnos = getTurnos(), inv = getInventario();
  const hoy = todayStr(), mes = hoy.slice(0,7);

  document.getElementById('stPend').textContent = turnos.filter(t => t.estado === 'pendiente').length;
  document.getElementById('stConf').textContent = turnos.filter(t => t.estado === 'confirmado').length;
  document.getElementById('stHoy').textContent  = turnos.filter(t => t.fecha === hoy).length;
  document.getElementById('stMes').textContent  = turnos.filter(t => (t.fecha||'').startsWith(mes)).length;
  document.getElementById('stInv').textContent  = inv.length;

  const lowCount = inv.filter(p => Number(p.stock) <= 2).length;
  document.getElementById('stLow').textContent = lowCount;
  const statLowCard = document.getElementById('stLow')?.closest('.stat-card');
  if (statLowCard) {
    if (lowCount > 0) {
      statLowCard.style.cursor = 'pointer';
      statLowCard.title = 'Ver productos con stock bajo';
      statLowCard.onclick = () => { irA('inventario'); setTimeout(filtrarStockBajo, 150); };
    } else {
      statLowCard.style.cursor = 'default';
      statLowCard.onclick = null;
    }
  }

  const hoyTurnos = turnos.filter(t => t.fecha === hoy).sort((a,b) => a.horario.localeCompare(b.horario));
  document.getElementById('listHoy').innerHTML = hoyTurnos.length
    ? hoyTurnos.map(t => `
        <li class="today-item">
          <span class="today-time">${t.horario}</span>
          <div>
            <div style="font-weight:500">${t.nombre}</div>
            <div style="font-size:.76rem;color:var(--text-muted)">${t.servicio}</div>
          </div>
          <span class="dot dot-${t.estado==='confirmado'?'conf':t.estado==='cancelado'?'canc':'pend'}" style="margin-left:auto"></span>
        </li>`).join('')
    : '<p class="today-empty">Sin turnos para hoy</p>';

  const pendTurnos = turnos.filter(t => t.estado === 'pendiente')
    .sort((a,b) => (a.fecha+a.horario).localeCompare(b.fecha+b.horario)).slice(0,5);
  document.getElementById('listPend').innerHTML = pendTurnos.length
    ? pendTurnos.map(t => {
        const dt = new Date(t.fecha + 'T00:00:00');
        return `<li class="today-item">
          <div style="flex:1">
            <div style="font-weight:500">${t.nombre}</div>
            <div style="font-size:.76rem;color:var(--text-muted)">${fmtDateHuman(dt)} · ${t.horario} · ${t.servicio}</div>
          </div>
          <button onclick="confirmarTurnoRapido('${t.id}')" class="btn btn-sm" style="background:rgba(34,197,94,.12);color:#16a34a;border:none;padding:.28rem .7rem;flex-shrink:0">✓</button>
        </li>`;
      }).join('')
    : '<p class="today-empty">Sin turnos pendientes</p>';
}

function confirmarTurnoRapido(id) { cambiarEstadoTurno(id, 'confirmado'); renderInicio(); }

// ════════════════════════════════════════════════════════
//  TURNOS
// ════════════════════════════════════════════════════════
function renderTurnos() {
  const filtro = document.getElementById('turnoFiltro')?.value || '';
  const todos  = getTurnos();
  const lista  = filtro ? todos.filter(t => t.estado === filtro) : todos;
  const sorted = [...lista].sort((a,b) => (a.fecha+a.horario).localeCompare(b.fecha+b.horario));
  const hoy = todayStr(), mes = hoy.slice(0,7);
  document.getElementById('tStPend').textContent = todos.filter(t=>t.estado==='pendiente').length;
  document.getElementById('tStConf').textContent = todos.filter(t=>t.estado==='confirmado').length;
  document.getElementById('tStHoy').textContent  = todos.filter(t=>t.fecha===hoy).length;
  document.getElementById('tStMes').textContent  = todos.filter(t=>(t.fecha||'').startsWith(mes)).length;
  const tbody = document.getElementById('turnosBody');
  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin turnos${filtro?' en este estado':''}.</td></tr>`;
    return;
  }
  tbody.innerHTML = sorted.map(t => {
    const dt    = new Date(t.fecha + 'T00:00:00');
    const dotC  = { pendiente:'dot-pend', confirmado:'dot-conf', cancelado:'dot-canc' }[t.estado] || '';
    const tieneSena = t.sena === 'si';
    return `<tr>
      <td data-label="Estado"><span class="dot ${dotC}"></span>${t.estado}${tieneSena ? ' <span style="font-size:.7rem;background:var(--bg-yellow);border-radius:4px;padding:1px 5px">seña</span>' : ''}</td>
      <td data-label="Cliente"><div style="font-weight:500">${t.nombre}</div><div style="font-size:.76rem;color:var(--text-muted)">${t.mail||''}</div></td>
      <td data-label="Servicio">${t.servicio}</td>
      <td data-label="Fecha">${fmtDateHuman(dt)}</td>
      <td data-label="Horario">${t.horario} · ${t.duracion}min</td>
      <td class="td-actions">
        ${t.estado==='pendiente'?`
          <button onclick="cambiarEstadoTurno('${t.id}','confirmado')" class="btn btn-sm" style="background:rgba(34,197,94,.12);color:#16a34a;border:none;padding:.28rem .7rem">✓ Confirmar</button>
          <button onclick="cambiarEstadoTurno('${t.id}','cancelado')"  class="btn btn-sm" style="background:rgba(239,68,68,.1);color:#dc2626;border:none;padding:.28rem .7rem">✗ Cancelar</button>`:''}
        ${t.estado!=='cancelado'&&!tieneSena?`
          <button onclick="abrirCambiarTurno('${t.id}')" class="btn btn-sm" style="background:none;border:1px solid var(--border);color:var(--text-muted);padding:.28rem .7rem">↺ Cambiar</button>`:''}
        <button onclick="pedirEliminarTurno('${t.id}')" class="btn btn-sm" style="background:rgba(239,68,68,.08);color:#dc2626;border:none;padding:.28rem .7rem">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function cambiarEstadoTurno(id, estado) {
  const arr = getTurnos(), idx = arr.findIndex(t => String(t.id) === String(id));
  if (idx < 0) return;
  if (estado === 'cancelado') {
    removeTakenSlot(arr[idx].fecha, arr[idx].horario);
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
  removeTakenSlot(t.fecha, t.horario);
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
  // Liberar slot viejo, tomar nuevo
  removeTakenSlot(t.fecha, t.horario);
  addTakenSlot(fecha, horario);
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
}
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
  DB.set('agenda_config', ag); showToast('✓ Días guardados');
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
  DB.set('agenda_config', ag); showToast('✓ Horarios guardados');
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
  ag.servicios = svcs; DB.set('agenda_config', ag); showToast('✓ Duraciones guardadas');
}
function bloquearFecha() {
  const v = document.getElementById('fechaBloqueo').value; if (!v) return;
  const ag = getAgenda();
  if (!ag.diasBloqueados.includes(v)) ag.diasBloqueados.push(v);
  DB.set('agenda_config', ag); agTemp = JSON.parse(JSON.stringify(ag)); renderBloqueadas(); showToast('✓ Fecha bloqueada');
}
function desbloquearFecha(v) {
  const ag = getAgenda(); ag.diasBloqueados = ag.diasBloqueados.filter(d => d !== v);
  DB.set('agenda_config', ag); agTemp = JSON.parse(JSON.stringify(ag)); renderBloqueadas();
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
  // apiPost toma el token de sessionStorage — hay que avisar al servidor
  // ANTES de limpiarlo, o el logout le llegaría con el token ya vacío.
  if (getAuthToken()) apiPost({ action: 'logout' });
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_TOKEN);
  location.href = '../index.html';
}
