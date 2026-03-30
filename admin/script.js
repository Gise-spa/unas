// ============================================================
//  admin/script.js — Panel de administración
//  Requiere ../script.js cargado antes
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbx7Q7Qpw3TQ2Pv8CYLLlc7qXoDZpz0kWLUaJB0c1wK0cwPfb2nPHb6QbQhWvSDadrJ6/exec';

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

// ── Badges ────────────────────────────────────────────────
function actualizarBadges() {
  const pendientes = getTurnos().filter(t => t.estado === 'pendiente').length;
  const badge = document.getElementById('turnosBadge');
  if (badge) {
    badge.textContent = pendientes || '';
    badge.style.display = pendientes ? 'flex' : 'none';
  }
}

// ════════════════════════════════════════════════════════
//  INICIO — Dashboard
// ════════════════════════════════════════════════════════
function renderInicio() {
  const turnos = getTurnos();
  const inv    = getInventario();
  const hoy    = todayStr();
  const mes    = hoy.slice(0,7);

  document.getElementById('stPend').textContent = turnos.filter(t => t.estado === 'pendiente').length;
  document.getElementById('stConf').textContent = turnos.filter(t => t.estado === 'confirmado').length;
  document.getElementById('stHoy').textContent  = turnos.filter(t => t.fecha === hoy).length;
  document.getElementById('stMes').textContent  = turnos.filter(t => (t.fecha||'').startsWith(mes)).length;
  document.getElementById('stInv').textContent  = inv.length;
  document.getElementById('stLow').textContent  = inv.filter(p => Number(p.stock) > 0 && Number(p.stock) <= 2).length;

  const hoyTurnos = turnos.filter(t => t.fecha === hoy).sort((a,b) => a.horario.localeCompare(b.horario));
  const listEl = document.getElementById('listHoy');
  listEl.innerHTML = hoyTurnos.length
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
  const pendList = document.getElementById('listPend');
  pendList.innerHTML = pendTurnos.length
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

function confirmarTurnoRapido(id) {
  cambiarEstadoTurno(id, 'confirmado');
  renderInicio();
}

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
    const dt   = new Date(t.fecha + 'T00:00:00');
    const dotC = { pendiente:'dot-pend', confirmado:'dot-conf', cancelado:'dot-canc' }[t.estado] || '';
    const waN  = t.tel ? '549' + t.tel.replace(/\D/g,'') : '';
    const waR  = waN ? `https://wa.me/${waN}?text=${encodeURIComponent(`Hola ${t.nombre}! Recordatorio: turno de ${t.servicio} hoy a las ${t.horario}hs.`)}` : '';
    return `<tr>
      <td data-label="Estado"><span class="dot ${dotC}"></span>${t.estado}</td>
      <td data-label="Cliente">
        <div style="font-weight:500">${t.nombre}</div>
        <div style="font-size:.76rem;color:var(--text-muted)">${t.mail||''}</div>
      </td>
      <td data-label="Servicio">${t.servicio}</td>
      <td data-label="Fecha">${fmtDateHuman(dt)}</td>
      <td data-label="Horario">${t.horario} · ${t.duracion}min</td>
      <td class="td-actions">
        ${t.estado==='pendiente'?`
          <button onclick="cambiarEstadoTurno('${t.id}','confirmado')" class="btn btn-sm" style="background:rgba(34,197,94,.12);color:#16a34a;border:none;padding:.28rem .7rem">✓ Confirmar</button>
          <button onclick="cambiarEstadoTurno('${t.id}','cancelado')"  class="btn btn-sm" style="background:rgba(239,68,68,.1);color:#dc2626;border:none;padding:.28rem .7rem">✗ Cancelar</button>`:''}
        ${t.estado==='confirmado'&&waR?`<a href="${waR}" target="_blank" class="btn btn-sm" style="background:var(--bg-yellow);border:none;color:var(--text);padding:.28rem .7rem">⏰ WA</a>`:''}
        <button onclick="exportarICS('${t.id}')" class="btn btn-sm" style="background:none;border:1px solid var(--border);color:var(--text-muted);padding:.28rem .7rem">📅 .ics</button>
      </td>
    </tr>`;
  }).join('');
}

function cambiarEstadoTurno(id, estado) {
  const arr = getTurnos();
  const idx = arr.findIndex(t => String(t.id) === String(id));
  if (idx < 0) return;
  if (estado === 'cancelado') removeTakenSlot(arr[idx].fecha, arr[idx].horario);
  arr[idx].estado = estado;
  saveTurnos(arr);
  apiPost({ action: 'updateEstado', id, estado });
  renderTurnos();
  actualizarBadges();
  showToast(estado === 'confirmado' ? '✓ Turno confirmado' : '✗ Turno cancelado');
}

function exportarICS(id) {
  const t = getTurnos().find(x => String(x.id) === String(id));
  if (t) downloadICS(t);
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
  if (idx >= 0) arr.splice(idx,1); else arr.push(i);
  renderDias();
}
function guardarDias() {
  const ag = getAgenda(); ag.diasHabilitados = agTemp.diasHabilitados;
  DB.set('agenda_config', ag); showToast('✓ Días guardados');
}

function renderSlots() {
  document.getElementById('slotsChips').innerHTML = agTemp.slots.map(s =>
    `<div class="chip on-gold" style="display:flex;align-items:center;gap:.3rem">
      ${s}<span onclick="quitarSlot('${s}')" style="cursor:pointer;color:var(--text-muted);font-size:.9rem;line-height:1">×</span>
    </div>`
  ).join('');
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
let invCatActiva = '';

function renderInvTabs() {
  const cats = ['Todos', ...getCategorias()];
  document.getElementById('invTabs').innerHTML = cats.map(c =>
    `<div class="chip ${(invCatActiva===c||(!invCatActiva&&c==='Todos'))?'on-gold':''} scrollable" onclick="setInvCat('${c}')">${c}</div>`
  ).join('');
}
function setInvCat(c) { invCatActiva = c === 'Todos' ? '' : c; renderInvTabs(); renderInventario(); }

function renderInventario() {
  renderInvTabs();
  const todos = getInventario();
  const q     = (document.getElementById('invBuscar')?.value || '').toLowerCase();
  const lista = todos.filter(p => {
    const matchCat = !invCatActiva || p.categoria === invCatActiva;
    const matchQ   = !q || (p.nombre||'').toLowerCase().includes(q) || (p.marca||'').toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const bajo = todos.filter(p => Number(p.stock) > 0 && Number(p.stock) <= 2);
  const alertEl = document.getElementById('stockAlerta');
  if (alertEl) {
    alertEl.style.display = bajo.length ? 'block' : 'none';
    document.getElementById('stockAlertaLista').innerHTML = bajo.map(p =>
      `<span class="chip" style="background:rgba(245,158,11,.15);color:#92400e;border-color:transparent">${p.nombre} (${p.stock}u.)</span>`
    ).join('');
  }

  const tbody = document.getElementById('invBody');
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">
      ${todos.length===0?'Todavía no cargaste productos. Hacé click en \"+ Agregar\".':'Sin resultados.'}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => {
    const stock = Number(p.stock) || 0;
    const src   = p.fotoUrl || p.foto || '';
    let dotC = 'dot-ok', estadoTxt = 'Ok';
    if (stock <= 0)      { dotC = 'dot-out'; estadoTxt = 'Sin stock'; }
    else if (stock <= 2) { dotC = 'dot-low'; estadoTxt = 'Stock bajo'; }

    const fotoEl = (src && src !== '⏳')
      ? `<img src="${src}" style="width:38px;height:38px;border-radius:6px;object-fit:cover;border:1px solid var(--border)" onerror="this.style.display='none'">`
      : `<div style="width:38px;height:38px;border-radius:6px;background:${p.color||'var(--bg-pink)'};border:1px solid var(--border)"></div>`;

    return `<tr>
      <td data-label="Foto">${fotoEl}</td>
      <td data-label="Nombre">
        <div style="font-weight:500">${p.nombre}</div>
        ${p.notas?`<div style="font-size:.73rem;color:var(--text-muted)">${p.notas}</div>`:''}
      </td>
      <td data-label="Marca">${p.marca||'—'}</td>
      <td data-label="Categoría"><span class="chip" style="font-size:.7rem;padding:.15rem .6rem">${p.categoria||'—'}</span></td>
      <td data-label="Stock">
        <div class="qty-control">
          <button class="qty-btn" onclick="ajustarStock('${p.id}',-1)">−</button>
          <span class="qty-num" data-qty-id="${p.id}">${stock}</span>
          <button class="qty-btn" onclick="ajustarStock('${p.id}',+1)">+</button>
        </div>
      </td>
      <td data-label="Estado"><span class="dot ${dotC}"></span>${estadoTxt}</td>
      <td class="td-actions">
        <span class="vis-btn ${p.visibilidad==='publico'?'pub':''}" onclick="toggleVis('${p.id}')">
          ${p.visibilidad==='publico'?'👁 Público':'🔒 Privado'}
        </span>
        <button onclick="abrirModalProducto('${p.id}')" class="btn btn-sm" style="background:var(--bg-yellow);border:none;padding:.28rem .7rem">Editar</button>
        <button onclick="confirmarEliminar('${p.id}')" class="btn btn-sm" style="background:rgba(239,68,68,.1);color:#dc2626;border:none;padding:.28rem .7rem">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
}

function ajustarStock(id, delta) {
  const arr = getInventario(), idx = arr.findIndex(p => String(p.id) === String(id));
  if (idx < 0) { showToast('⚠ Hacé Sync primero'); return; }
  arr[idx].stock = Math.max(0, (Number(arr[idx].stock)||0) + delta);
  saveInventario(arr);
  apiPost({ action: 'updateStock', id, stock: arr[idx].stock });
  const el = document.querySelector(`[data-qty-id="${id}"]`);
  if (el) el.textContent = arr[idx].stock;
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

  // Mostrar modal con opciones según si tiene foto en Drive
  const overlay = document.getElementById('modalEliminar');
  if (overlay) {
    document.getElementById('elimNombre').textContent  = p.nombre || 'este producto';
    document.getElementById('elimFotoWrap').style.display = tieneFoto ? 'block' : 'none';
    window._elimId      = id;
    window._elimFotoUrl = p.fotoUrl || '';
    overlay.classList.add('open');
  } else {
    // Fallback al confirm genérico si no existe el modal
    mostrarConfirm({
      icon: '🗑', titulo: 'Eliminar producto',
      msg: `¿Eliminás "${p.nombre||'este producto'}"? No se puede deshacer.`,
      btnTxt: 'Sí, eliminar', btnColor: 'rgba(239,68,68,.85)',
      onOk: () => eliminarProducto(id, false),
    });
  }
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
  renderInventario();
  showToast('✓ Producto eliminado');
}

function cerrarModalEliminar() {
  document.getElementById('modalEliminar')?.classList.remove('open');
  window._elimId = null; window._elimFotoUrl = '';
}
function confirmarEliminarSolo()     { cerrarModalEliminar(); eliminarProducto(window._elimId, false); }
function confirmarEliminarConFoto()  { cerrarModalEliminar(); eliminarProducto(window._elimId, true);  }

function exportCSV() {
  const h = ['Nombre','Marca','Categoría','Color','Stock','Estado','Visibilidad','Notas'];
  const rows = getInventario().map(p => [
    p.nombre||'', p.marca||'', p.categoria||'', p.color||'', p.stock||0,
    Number(p.stock)<=0?'Sin stock':Number(p.stock)<=2?'Stock bajo':'Ok',
    p.visibilidad||'privado', p.notas||'',
  ]);
  const csv = [h,...rows].map(r => r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})), download: 'inventario.csv' });
  a.click(); showToast('⬇ CSV descargado');
}

// ── Modal producto ────────────────────────────────────────
window._fotoB64 = '';

function abrirModalProducto(id) {
  poblarCatSelect();
  document.getElementById('mIdx').value = id || '';
  document.getElementById('modalProdTitulo').textContent = id ? 'Editar producto' : 'Agregar producto';
  document.getElementById('mFotoPreview').style.display = 'none';
  document.getElementById('fotoLabel').style.display = 'block';
  document.getElementById('fotoLabel').textContent = '📷 Tocá para subir una foto';
  window._fotoB64 = '';

  if (id) {
    const p = getInventario().find(x => String(x.id) === String(id));
    if (!p) { showToast('⚠ Hacé Sync primero'); return; }
    document.getElementById('mNombre').value      = p.nombre    || '';
    document.getElementById('mMarca').value       = p.marca     || '';
    document.getElementById('mCategoria').value   = p.categoria || getCategorias()[0];
    document.getElementById('mColor').value       = p.color     || '';
    document.getElementById('mColorPicker').value = p.color     || '#FBCFE8';
    document.getElementById('mStock').value       = p.stock     ?? 1;
    document.getElementById('mNotas').value       = p.notas     || '';
    setVis(p.visibilidad || 'privado');
    const src = p.fotoUrl || p.foto || '';
    if (src && src !== '⏳') {
      document.getElementById('mFotoPreview').src = src;
      document.getElementById('mFotoPreview').style.display = 'block';
      document.getElementById('fotoLabel').textContent = '📷 Cambiar foto';
    }
  } else {
    document.getElementById('mNombre').value      = '';
    document.getElementById('mMarca').value       = '';
    document.getElementById('mColor').value       = '';
    document.getElementById('mColorPicker').value = '#FBCFE8';
    document.getElementById('mStock').value       = 1;
    document.getElementById('mNotas').value       = '';
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
      document.getElementById('mFotoPreview').style.display = 'block';
      document.getElementById('fotoLabel').textContent = '📷 Cambiar foto';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function guardarProducto() {
  const nombre = document.getElementById('mNombre').value.trim();
  if (!nombre) { showToast('⚠ El nombre es obligatorio'); return; }

  const producto = {
    id:          document.getElementById('mIdx').value || Date.now().toString(),
    nombre,
    marca:       document.getElementById('mMarca').value.trim(),
    categoria:   document.getElementById('mCategoria').value,
    color:       document.getElementById('mColor').value.trim() || document.getElementById('mColorPicker').value,
    stock:       Math.max(0, parseInt(document.getElementById('mStock').value)||0),
    notas:       document.getElementById('mNotas').value.trim(),
    visibilidad: document.getElementById('mVis').value,
    fotoUrl:     '',
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

let _confirmOk = null;
function mostrarConfirm({ icon='⚠️', titulo, msg, btnTxt='Confirmar', btnColor='var(--accent)', onOk }) {
  document.getElementById('cfIcon').textContent   = icon;
  document.getElementById('cfTitulo').textContent = titulo;
  document.getElementById('cfMsg').textContent    = msg;
  document.getElementById('cfBtn').textContent    = btnTxt;
  document.getElementById('cfBtn').style.background = btnColor;
  _confirmOk = onOk; abrirModal('modalConfirmar');
}
function confirmarOk()   { cerrarModal('modalConfirmar'); _confirmOk?.(); }
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

  // Login — async contra GAS
  document.getElementById('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const u   = document.getElementById('loginUser').value.trim();
    const p   = document.getElementById('loginPass').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const err = document.getElementById('loginError');

    btn.disabled = true;
    btn.textContent = 'Verificando...';
    err.style.display = 'none';

    const result = await doLogin(u, p);
    btn.disabled = false;
    btn.textContent = 'Ingresar →';

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

  ['modalProducto','modalConfirmar','modalInput'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function(e) {
      if (e.target === this) cerrarModal(id);
    });
  });

  document.getElementById('inpVal')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmarInput();
  });
});

function iniciarAdmin() {
  initDrawer();
  irA('inicio');
  actualizarBadges();
  forzarSync(); // sync completo al entrar: turnos + inventario + categorías
}

// Override doLogout — path correcto desde admin/
function doLogout() {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_TOKEN);
  location.href = '../index.html';
}
