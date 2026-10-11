// ============================================================
//  admin/js/turnos-nuevo.js — Nuevo turno cargado por Gise (Paso 5c)
//  Sin seña. La clienta se elige de la hoja `clientes` (misma base de
//  Clientes y Caja); nombre/mail/teléfono los copia el servidor desde la
//  ficha. La disponibilidad la trae el backend (hoja turnos + calendario
//  "Spa Sosiego - Turnos"); el backend vuelve a revisarla al guardar, así
//  que esta pantalla solo ayuda a elegir — no decide.
//  Se puede cargar cualquier día y horario que no esté ocupado.
//  Backend: TurnosAdmin.gs (getDisponibilidadAdmin, crearTurnoAdmin).
// ============================================================

let _ntClienteId  = '';
let _ntDisp       = null;   // última respuesta de disponibilidad del día
let _ntHora       = '';     // 'HH:MM' elegido (atajo o a mano)
let _ntServ       = {};     // { servicioId: true }
let _ntGuardando  = false;
let _ntReqSeq     = 0;

function _ntEsc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _ntMin(hhmm) {
  const p = String(hhmm).split(':');
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
}

// ── Abrir ────────────────────────────────────────────────
function abrirModalNuevoTurno() {
  _ntClienteId = ''; _ntHora = ''; _ntDisp = null; _ntServ = {};
  document.getElementById('ntClienteBuscar').value = '';
  document.getElementById('ntHoraManual').value = '';
  const hoy = todayStr();
  const f = document.getElementById('ntFecha');
  f.min = hoy;
  f.value = (typeof turnoFechaActiva === 'string' && turnoFechaActiva >= hoy) ? turnoFechaActiva : hoy;
  ntRenderCliente();
  ntRenderServicios();
  abrirModal('modalNuevoTurno');
  ntCargarDisponibilidad();
}

// ── Clienta ──────────────────────────────────────────────
function ntBuscarCliente() {
  const val = document.getElementById('ntClienteBuscar').value.trim();
  const cont = document.getElementById('ntClienteResultados');
  if (!val) { cont.innerHTML = ''; cont.style.display = 'none'; return; }
  const lista = getClientes().filter(c => c.clienteId && _clienteMatch(c, val)).slice(0, 8);
  cont.innerHTML = lista.length
    ? lista.map(c => _clienteActivo(c)
        ? `<div class="cliente-resultado-item" onmousedown="ntElegirCliente('${String(c.clienteId).replace(/'/g, "\\'")}')">
             <strong>${_ntEsc(_nombreCompletoCliente(c))}</strong>${c.mail ? `<span>${_ntEsc(c.mail)}</span>` : ''}
           </div>`
        : `<div class="cliente-resultado-item" style="opacity:.55;cursor:not-allowed">
             <strong>${_ntEsc(_nombreCompletoCliente(c))}</strong><span>inactiva</span>
           </div>`).join('')
    : `<div class="cliente-resultado-vacio">No encontramos ninguna clienta con esos datos.</div>
       <div class="cliente-resultado-item cliente-resultado-crear" onmousedown="ntCrearClienteDesdeAqui()">
         <strong>➕ Crear nueva clienta</strong>
       </div>`;
  cont.style.display = 'block';
}
function ntOcultarResultadosCliente() {
  setTimeout(() => {
    const cont = document.getElementById('ntClienteResultados');
    if (cont) cont.style.display = 'none';
  }, 200);
}
function ntElegirCliente(clienteId) {
  _ntClienteId = String(clienteId);
  document.getElementById('ntClienteBuscar').value = '';
  const cont = document.getElementById('ntClienteResultados');
  cont.innerHTML = ''; cont.style.display = 'none';
  ntRenderCliente();
}
function ntQuitarCliente() {
  _ntClienteId = '';
  ntRenderCliente();
}
function ntRenderCliente() {
  const box = document.getElementById('ntClienteElegido');
  const inp = document.getElementById('ntClienteBuscar');
  const c = _ntClienteId ? getClientes().find(x => String(x.clienteId) === _ntClienteId) : null;
  if (!c) {
    _ntClienteId = '';
    box.style.display = 'none'; box.innerHTML = '';
    inp.style.display = '';
    return;
  }
  inp.style.display = 'none';
  box.style.display = 'block';
  box.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:var(--radius);padding:.6rem .75rem;display:flex;justify-content:space-between;gap:.6rem;align-items:flex-start">
      <div style="min-width:0">
        <strong style="font-size:.92rem">${_ntEsc(_nombreCompletoCliente(c))}</strong>
        <div style="font-size:.78rem;color:var(--text-muted)">${_ntEsc(c.telefono || 'Sin teléfono')}${c.mail ? ' · ' + _ntEsc(c.mail) : ''}</div>
      </div>
      <div style="display:flex;gap:.35rem;flex-shrink:0">
        <button type="button" class="btn btn-outline btn-sm" onclick="ntEditarCliente()">Editar datos</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="ntQuitarCliente()">Cambiar</button>
      </div>
    </div>`;
}
// Mismo heurístico que el buscador de Caja: "@" → mail, mayormente dígitos → teléfono, si no nombre.
function ntCrearClienteDesdeAqui() {
  const val = document.getElementById('ntClienteBuscar').value.trim();
  const prefill = { nombre: '', telefono: '', mail: '' };
  if (val.includes('@')) prefill.mail = val;
  else {
    const dig = val.replace(/[^0-9]/g, ''), sinSep = val.replace(/[\s+()-]/g, '');
    if (dig.length >= 6 && sinSep.length > 0 && dig.length >= sinSep.length * 0.6) prefill.telefono = val;
    else prefill.nombre = val;
  }
  document.getElementById('ntClienteResultados').style.display = 'none';
  cerrarModal('modalNuevoTurno');           // el formulario vuelve acá al guardar o cancelar
  abrirModalNuevoCliente(prefill, 'turno');
}
// Edita a la clienta elegida con el mismo formulario de la ficha (editarCliente).
function ntEditarCliente() {
  if (!_ntClienteId) return;
  _fichaClienteId = _ntClienteId;
  abrirModalEditarCliente();
  _clienteFormOrigen = 'turno';
  cerrarModal('modalNuevoTurno');
}
// La llama clientes.js después de crear o editar con origen 'turno'.
function _ntClienteListo(clienteId) {
  _ntClienteId = String(clienteId);
  ntRenderCliente();
  abrirModal('modalNuevoTurno');
}

// ── Servicios ────────────────────────────────────────────
function _ntServicios() {
  const ag = getAgenda();
  return (ag.servicios && ag.servicios.length ? ag.servicios : getDefaultServicios());
}
function ntRenderServicios() {
  document.getElementById('ntServicios').innerHTML =
    '<div class="chip-grid">' + _ntServicios().map(s => {
      const id = String(s.id);
      return `<span class="chip ${_ntServ[id] ? 'on' : ''}" onclick="ntToggleServicio(this.dataset.id)" data-id="${_ntEsc(id)}">${_ntEsc(s.nombre)}</span>`;
    }).join('') + '</div>';
}
function ntToggleServicio(id) {
  if (_ntServ[id]) delete _ntServ[id]; else _ntServ[id] = true;
  ntRenderServicios();
}

// ── Disponibilidad ───────────────────────────────────────
async function ntCargarDisponibilidad() {
  const fecha = document.getElementById('ntFecha').value;
  _ntHora = '';
  document.getElementById('ntHoraManual').value = '';
  _ntDisp = null;
  const slotsEl = document.getElementById('ntSlots');
  const infoEl  = document.getElementById('ntDispInfo');
  document.getElementById('ntOcupados').innerHTML = '';
  document.getElementById('ntHoraEstado').innerHTML = '';
  if (!fecha) { slotsEl.innerHTML = ''; infoEl.textContent = 'Elegí una fecha.'; return; }
  infoEl.textContent = 'Consultando disponibilidad…';
  slotsEl.innerHTML = '';
  const seq = ++_ntReqSeq;
  const r = await apiGetRaw('getDisponibilidadAdmin', { fecha });
  if (seq !== _ntReqSeq) return;               // llegó una respuesta vieja: se descarta
  if (!r || r.ok === false || r.error) {
    infoEl.innerHTML = `<span style="color:#dc2626">⚠ ${_ntEsc((r && r.error) || 'No se pudo consultar la disponibilidad')}</span>`;
    return;
  }
  _ntDisp = r;
  ntRenderDisp();
}
function ntRenderDisp() {
  const r = _ntDisp; if (!r) return;
  let info = '';
  if (r.diaBloqueado) info = 'Este día está bloqueado en tu agenda para el público, pero igual podés cargar un turno.';
  else if (!r.diaHabitual) info = 'Este día no está en tu agenda habitual: podés cargar igual, elegí la hora a mano.';
  document.getElementById('ntDispInfo').textContent = info;

  document.getElementById('ntSlots').innerHTML = r.slots.length
    ? r.slots.map(s => {
        if (!s.libre || s.pasado) {
          return `<span class="chip" style="opacity:.45;text-decoration:line-through;cursor:not-allowed" title="${s.pasado ? 'Ya pasó' : 'Ocupado'}">${s.hora}</span>`;
        }
        return `<span class="chip ${_ntHora === s.hora ? 'on' : ''}" onclick="ntElegirSlot('${s.hora}')">${s.hora}</span>`;
      }).join('')
    : '';

  document.getElementById('ntOcupados').innerHTML = r.ocupados.length
    ? `<div style="font-size:.78rem;color:var(--text-muted);margin-top:.5rem">Ocupado: ${r.ocupados.map(o => `${o.desde}–${o.hasta}`).join(' · ')}</div>`
    : `<div style="font-size:.78rem;color:var(--text-muted);margin-top:.5rem">Sin turnos ni eventos ese día.</div>`;
  ntActualizarEstadoHora();
}
function ntElegirSlot(hora) {
  _ntHora = hora;
  document.getElementById('ntHoraManual').value = '';
  ntRenderDisp();
}
function ntHoraManualCambio() {
  _ntHora = document.getElementById('ntHoraManual').value || '';
  ntRenderDisp();
}
// Devuelve '' si el horario elegido está libre, o un texto con el motivo.
function ntConflicto() {
  if (!_ntHora || !_ntDisp) return '';
  const fecha = document.getElementById('ntFecha').value;
  const ini = _ntMin(_ntHora), fin = ini + _ntDisp.duracion;
  if (fecha === todayStr()) {
    const n = new Date();
    if (ini <= n.getHours() * 60 + n.getMinutes()) return 'Ese horario ya pasó.';
  }
  const o = _ntDisp.ocupados.find(x => ini < _ntMin(x.hasta) && _ntMin(x.desde) < fin);
  if (o) return `Ocupado de ${o.desde} a ${o.hasta}. Un turno dura ${_ntDisp.duracion} min.`;
  return '';
}
function ntActualizarEstadoHora() {
  const el = document.getElementById('ntHoraEstado');
  if (!_ntHora || !_ntDisp) { el.innerHTML = ''; return; }
  const c = ntConflicto();
  el.innerHTML = c
    ? `<div style="font-size:.82rem;color:#dc2626;margin-top:.5rem">✗ ${_ntEsc(_ntHora)} — ${_ntEsc(c)}</div>`
    : `<div style="font-size:.82rem;color:#16a34a;margin-top:.5rem">✓ ${_ntEsc(_ntHora)} libre (${_ntDisp.duracion} min)</div>`;
}

// ── Guardar ──────────────────────────────────────────────
function ntGuardar() {
  if (_ntGuardando) return;
  const fecha = document.getElementById('ntFecha').value;
  const ids = Object.keys(_ntServ);
  if (!_ntClienteId) { showToast('⚠ Elegí una clienta de la lista'); return; }
  if (!fecha)        { showToast('⚠ Elegí una fecha'); return; }
  if (!_ntDisp)      { showToast('⚠ Esperá a que cargue la disponibilidad'); return; }
  if (!_ntHora)      { showToast('⚠ Elegí un horario'); return; }
  const conflicto = ntConflicto();
  if (conflicto)     { showToast('⚠ ' + conflicto); return; }
  if (!ids.length)   { showToast('⚠ Elegí al menos un servicio'); return; }

  const c = getClientes().find(x => String(x.clienteId) === _ntClienteId);
  const dt = new Date(fecha + 'T00:00:00');
  mostrarConfirm({
    icon: '📅', titulo: 'Cargar turno',
    msg: `${c ? _nombreCompletoCliente(c) : 'Clienta'} · ${fmtDateHuman(dt)} a las ${_ntHora} · sin seña. ¿Lo cargás?`,
    btnTxt: 'Sí, cargar',
    onOk: () => ntEnviar(fecha, ids)
  });
}
async function ntEnviar(fecha, ids) {
  if (_ntGuardando) return;
  _ntGuardando = true;
  const btn = document.getElementById('ntGuardarBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const r = await apiPost({
      action: 'crearTurnoAdmin',
      turno: { clienteId: _ntClienteId, fecha, horario: _ntHora, servicioIds: ids }
    });
    if (!r || r.ok !== true) {
      showToast('⚠ ' + ((r && r.error) || 'No se pudo cargar el turno'));
      if (r && (r.code === 'SLOT_TAKEN' || r.code === 'PASADO')) ntCargarDisponibilidad(); // refresca lo libre
      return;
    }
    cerrarModal('modalNuevoTurno');
    await syncTurnos();                       // trae el turno nuevo de la hoja
    if (typeof turnoFechaActiva !== 'undefined') turnoFechaActiva = fecha;
    if (typeof renderTurnos === 'function') renderTurnos();
    if (typeof actualizarBadges === 'function') actualizarBadges();
    showToast(r.calendar ? '✓ Turno cargado y agendado en el calendario'
                         : '✓ Turno cargado — ⚠ no se pudo crear en el calendario, agendalo a mano', r.calendar ? 3000 : 7000);
  } finally {
    _ntGuardando = false;
    btn.disabled = false; btn.textContent = original;
  }
}


// ============================================================
//  TURNOS CON SEÑA (reservados desde el sitio): cancelar y mover
//  Backend: TurnosAdminSena.gs (cancelarTurnoConSenaAdmin, moverTurnoConSenaAdmin).
//  La plata la maneja Gise a mano desde su Mercado Pago: acá solo se decide
//  qué pasa con la seña y se deja anotado.
// ============================================================

// ── Cancelar ─────────────────────────────────────────────
let _cancelandoSena = false;
function pedirCancelarTurnoSena(id) {
  const t = getTurnos().find(x => String(x.id) === String(id));
  if (!t) return;
  const monto = Number(t.montoSena) || 0;
  mostrarConfirm({
    icon: '✗', titulo: 'Cancelar turno con seña',
    msg: `Turno de ${t.nombre} el ${t.fecha} a las ${t.horario}. Pagó una seña de $${monto.toLocaleString('es-AR')}. El horario queda libre en los dos casos. ¿Qué pasa con la seña?`,
    btnTxt: 'Devolver la seña', btnColor: 'rgba(239,68,68,.85)',
    onOk:  () => cancelarTurnoSenaUI(id, true),
    btnSecTxt: 'Quedarme con la seña',
    onSec: () => cancelarTurnoSenaUI(id, false),
    btnCancelTxt: 'Volver'
  });
}
async function cancelarTurnoSenaUI(id, devolver) {
  if (_cancelandoSena) return;
  _cancelandoSena = true;
  try {
    const r = await apiPost({ action: 'cancelarTurnoSenaAdmin', id, devolver });
    if (!r || r.ok !== true) { showToast('⚠ ' + ((r && r.error) || 'No se pudo cancelar el turno')); return; }
    await syncTurnos();
    renderTurnos(); actualizarBadges();
    const plata = r.devolver
      ? `Falta devolver la seña de $${Number(r.monto).toLocaleString('es-AR')} desde tu Mercado Pago (te mandamos el detalle por mail).`
      : (r.retenida ? 'La seña queda retenida.' : '');
    const cal = r.calendar ? '' : ' ⚠ No se pudo borrar del calendario: borralo a mano.';
    showToast(('✗ Turno cancelado y horario liberado. ' + plata + cal).trim(), (r.devolver || !r.calendar) ? 9000 : 4000);
  } finally {
    _cancelandoSena = false;
  }
}

// ── Mover ────────────────────────────────────────────────
let _msId = '', _msDisp = null, _msHora = '', _msReqSeq = 0, _msGuardando = false;

function _msAsegurarModal() {
  if (document.getElementById('modalMoverTurno')) return;
  let horas = '<option value="">—</option>';
  for (let i = 0; i < 24; i++) { const hh = String(i).padStart(2, '0') + ':00'; horas += `<option value="${hh}">${hh}</option>`; }
  document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="modalMoverTurno">
  <div class="modal-box" style="max-width:440px">
    <div class="modal-header">
      <h3>Mover turno</h3>
      <button class="modal-close" onclick="cerrarModal('modalMoverTurno')">×</button>
    </div>
    <p id="msInfo" style="font-size:.84rem;color:var(--text-muted);margin-bottom:1rem"></p>
    <div class="form-group">
      <label>Nueva fecha</label>
      <input type="date" id="msFecha" class="input-sm" style="width:100%" onchange="msCargarDisponibilidad()">
    </div>
    <div class="form-group">
      <label>Nuevo horario</label>
      <div id="msDispInfo" style="font-size:.78rem;color:var(--text-muted);margin-bottom:.4rem"></div>
      <div class="chip-grid" id="msSlots"></div>
      <div id="msOcupados"></div>
      <div style="display:flex;align-items:center;gap:.6rem;margin-top:.6rem">
        <span style="font-size:.8rem;color:var(--text-muted)">Otro horario</span>
        <select id="msHoraManual" class="input-sm" onchange="msHoraManualCambio()">${horas}</select>
      </div>
      <div id="msHoraEstado"></div>
    </div>
    <p style="font-size:.76rem;color:var(--text-muted);margin:.25rem 0 1rem">La seña se queda en este turno. El horario viejo se libera y se actualiza el calendario.</p>
    <div style="display:flex;gap:.6rem">
      <button class="btn btn-primary" style="flex:1" id="msGuardarBtn" onclick="msGuardar()">Mover turno</button>
      <button class="btn btn-outline" onclick="cerrarModal('modalMoverTurno')">Cancelar</button>
    </div>
  </div>
</div>`);
}

function abrirMoverTurnoSena(id) {
  const t = getTurnos().find(x => String(x.id) === String(id));
  if (!t) return;
  _msAsegurarModal();
  _msId = String(id); _msHora = ''; _msDisp = null;
  document.getElementById('msInfo').textContent = `${t.nombre} · ${t.servicio} · ahora: ${t.fecha} a las ${t.horario}`;
  document.getElementById('msHoraManual').value = '';
  const hoy = todayStr();
  const f = document.getElementById('msFecha');
  f.min = hoy;
  f.value = t.fecha >= hoy ? t.fecha : hoy;
  abrirModal('modalMoverTurno');
  msCargarDisponibilidad();
}

async function msCargarDisponibilidad() {
  const fecha = document.getElementById('msFecha').value;
  _msHora = '';
  document.getElementById('msHoraManual').value = '';
  _msDisp = null;
  const slotsEl = document.getElementById('msSlots');
  const infoEl  = document.getElementById('msDispInfo');
  document.getElementById('msOcupados').innerHTML = '';
  document.getElementById('msHoraEstado').innerHTML = '';
  if (!fecha) { slotsEl.innerHTML = ''; infoEl.textContent = 'Elegí una fecha.'; return; }
  infoEl.textContent = 'Consultando disponibilidad…';
  slotsEl.innerHTML = '';
  const seq = ++_msReqSeq;
  // idExcluir: el propio turno (y su evento) no cuentan como ocupados.
  const r = await apiGetRaw('getDisponibilidadAdmin', { fecha, idExcluir: _msId });
  if (seq !== _msReqSeq) return;               // llegó una respuesta vieja: se descarta
  if (!r || r.ok === false || r.error) {
    infoEl.innerHTML = `<span style="color:#dc2626">⚠ ${_ntEsc((r && r.error) || 'No se pudo consultar la disponibilidad')}</span>`;
    return;
  }
  _msDisp = r;
  msRenderDisp();
}
function msRenderDisp() {
  const r = _msDisp; if (!r) return;
  let info = '';
  if (r.diaBloqueado) info = 'Este día está bloqueado en tu agenda para el público, pero igual podés mover el turno.';
  else if (!r.diaHabitual) info = 'Este día no está en tu agenda habitual: podés mover igual, elegí la hora a mano.';
  document.getElementById('msDispInfo').textContent = info;
  document.getElementById('msSlots').innerHTML = r.slots.length
    ? r.slots.map(s => {
        if (!s.libre || s.pasado) {
          return `<span class="chip" style="opacity:.45;text-decoration:line-through;cursor:not-allowed" title="${s.pasado ? 'Ya pasó' : 'Ocupado'}">${s.hora}</span>`;
        }
        return `<span class="chip ${_msHora === s.hora ? 'on' : ''}" onclick="msElegirSlot('${s.hora}')">${s.hora}</span>`;
      }).join('')
    : '';
  document.getElementById('msOcupados').innerHTML = r.ocupados.length
    ? `<div style="font-size:.78rem;color:var(--text-muted);margin-top:.5rem">Ocupado: ${r.ocupados.map(o => `${o.desde}–${o.hasta}`).join(' · ')}</div>`
    : `<div style="font-size:.78rem;color:var(--text-muted);margin-top:.5rem">Sin turnos ni eventos ese día.</div>`;
  msActualizarEstadoHora();
}
function msElegirSlot(hora) {
  _msHora = hora;
  document.getElementById('msHoraManual').value = '';
  msRenderDisp();
}
function msHoraManualCambio() {
  _msHora = document.getElementById('msHoraManual').value || '';
  msRenderDisp();
}
// Devuelve '' si el horario elegido está libre, o un texto con el motivo.
function msConflicto() {
  if (!_msHora || !_msDisp) return '';
  const fecha = document.getElementById('msFecha').value;
  const t = getTurnos().find(x => String(x.id) === _msId);
  if (t && t.fecha === fecha && String(t.horario).slice(0, 5) === _msHora) return 'Es el horario actual del turno.';
  const ini = _ntMin(_msHora), fin = ini + _msDisp.duracion;
  if (fecha === todayStr()) {
    const n = new Date();
    if (ini <= n.getHours() * 60 + n.getMinutes()) return 'Ese horario ya pasó.';
  }
  const o = _msDisp.ocupados.find(x => ini < _ntMin(x.hasta) && _ntMin(x.desde) < fin);
  if (o) return `Ocupado de ${o.desde} a ${o.hasta}. Un turno dura ${_msDisp.duracion} min.`;
  return '';
}
function msActualizarEstadoHora() {
  const el = document.getElementById('msHoraEstado');
  if (!_msHora || !_msDisp) { el.innerHTML = ''; return; }
  const c = msConflicto();
  el.innerHTML = c
    ? `<div style="font-size:.82rem;color:#dc2626;margin-top:.5rem">✗ ${_ntEsc(_msHora)} — ${_ntEsc(c)}</div>`
    : `<div style="font-size:.82rem;color:#16a34a;margin-top:.5rem">✓ ${_ntEsc(_msHora)} libre (${_msDisp.duracion} min)</div>`;
}

function msGuardar() {
  if (_msGuardando) return;
  const fecha = document.getElementById('msFecha').value;
  if (!fecha)    { showToast('⚠ Elegí una fecha'); return; }
  if (!_msDisp)  { showToast('⚠ Esperá a que cargue la disponibilidad'); return; }
  if (!_msHora)  { showToast('⚠ Elegí un horario'); return; }
  const conflicto = msConflicto();
  if (conflicto) { showToast('⚠ ' + conflicto); return; }
  const t = getTurnos().find(x => String(x.id) === _msId);
  const dt = new Date(fecha + 'T00:00:00');
  mostrarConfirm({
    icon: '↺', titulo: 'Mover turno',
    msg: `${t ? t.nombre : 'La clienta'} pasa a ${fmtDateHuman(dt)} a las ${_msHora}. La seña se mantiene. ¿Lo movés?`,
    btnTxt: 'Sí, mover',
    onOk: () => msEnviar(fecha)
  });
}
async function msEnviar(fecha) {
  if (_msGuardando) return;
  _msGuardando = true;
  const btn = document.getElementById('msGuardarBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Moviendo…';
  try {
    const r = await apiPost({ action: 'moverTurnoSenaAdmin', id: _msId, fecha, horario: _msHora });
    if (!r || r.ok !== true) {
      showToast('⚠ ' + ((r && r.error) || 'No se pudo mover el turno'));
      if (r && (r.code === 'SLOT_TAKEN' || r.code === 'PASADO')) msCargarDisponibilidad();   // refresca lo libre
      return;
    }
    cerrarModal('modalMoverTurno');
    await syncTurnos();
    if (typeof turnoFechaActiva !== 'undefined') turnoFechaActiva = fecha;
    renderTurnos(); actualizarBadges();
    showToast(r.calendar ? '↺ Turno movido y calendario actualizado'
                         : '↺ Turno movido — ⚠ revisá el calendario (te mandamos un mail)', r.calendar ? 3000 : 7000);
  } finally {
    _msGuardando = false;
    btn.disabled = false; btn.textContent = original;
  }
}
