// ============================================================
//  admin/js/clientes.js — Clientes
//  Lista + ficha + edición + activar/desactivar. La lista sale de
//  getClientes() (hoja `clientes` completa, sincronizada por
//  forzarSync). La ficha cruza esos datos con getTurnos() y
//  getTodosMovimientos() del lado del cliente, sin pedir nada nuevo
//  al backend salvo al guardar/activar (ver más abajo).
//
//  Backend: Clientes.gs expone `guardarCliente` (editar datos +
//  recalcula normalizados si cambia tel/mail) y `toggleActivoCliente`
//  (activo=true/false, nunca borra). Después de cualquiera de las
//  dos, se vuelve a pedir getClientes() al servidor y se actualiza
//  la caché local — mismo patrón que syncCaja() en caja.js, para no
//  quedar con una foto vieja hasta el próximo "↻ Sync".
//
//  Límite conocido: `turnos` en caché es solo agenda operativa (últimos
//  ~30 días + futuros) — el historial más viejo vive en `turnos_historico`
//  y no es accesible desde el admin todavía. Por eso el bloque de turnos
//  de la ficha se etiqueta como "recientes / próximos", no como
//  "historial completo".
// ============================================================

let clientesFiltroActivo = true;   // true = ver activos, false = ver inactivos
let _fichaClienteId = null;        // clienteId de la ficha abierta actualmente

function _nombreCompletoCliente(c) {
  const nombre = c.nombre || '';
  const apellido = (c.apellido || '').trim();
  return apellido ? `${nombre} ${apellido}` : (nombre || 'Sin nombre');
}

function _clienteMatch(c, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return String(c.nombre || '').toLowerCase().includes(s) ||
         String(c.apellido || '').toLowerCase().includes(s) ||
         String(c.telefono || '').toLowerCase().includes(s) ||
         String(c.mail || '').toLowerCase().includes(s);
}

// activo puede venir como boolean real o como texto ("TRUE"/"FALSE")
// según cómo lo haya guardado Sheets — se normaliza acá una sola vez.
function _clienteActivo(c) {
  return c.activo === true || String(c.activo).toLowerCase() === 'true';
}

function setFiltroClientes(activo) {
  clientesFiltroActivo = activo;
  const bAct = document.getElementById('clientesTabActivos');
  const bIna = document.getElementById('clientesTabInactivos');
  if (bAct) bAct.classList.toggle('active-vis', activo);
  if (bIna) bIna.classList.toggle('active-vis', !activo);
  renderClientes();
}

function renderClientes() {
  const q = (document.getElementById('clientesBuscar')?.value || '').trim();
  const todos = getClientes()
    .filter(c => c.clienteId)
    .filter(c => _clienteActivo(c) === clientesFiltroActivo)
    .filter(c => _clienteMatch(c, q))
    .sort((a, b) => _nombreCompletoCliente(a).localeCompare(_nombreCompletoCliente(b), 'es'));

  const cont = document.getElementById('clientesLista');
  if (!todos.length) {
    const vacioBase = clientesFiltroActivo
      ? 'Todavía no hay clientes sincronizados — probá "↻ Sync".'
      : 'No hay clientes inactivos.';
    cont.innerHTML = `<div class="turnos-empty">${q ? 'Sin resultados para esa búsqueda.' : vacioBase}</div>`;
    return;
  }
  cont.innerHTML = todos.map(c => `
    <div class="cliente-card" onclick="abrirFichaCliente('${c.clienteId}')">
      <div class="cliente-card-nombre">${_nombreCompletoCliente(c)}</div>
      <div class="cliente-card-sub">${[c.telefono, c.mail].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
    </div>
  `).join('');
}

function _turnosDeCliente(clienteId) {
  return getTurnos()
    .filter(t => String(t.clienteId) === String(clienteId))
    .sort((a, b) => (b.fecha + b.horario).localeCompare(a.fecha + a.horario));
}

function _pagosDeCliente(clienteId) {
  return getTodosMovimientos()
    .filter(m => String(m.clienteId) === String(clienteId) && String(m.tipo).toLowerCase() === 'ingreso')
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

function abrirFichaCliente(clienteId) {
  const cliente = getClientes().find(c => String(c.clienteId) === String(clienteId));
  if (!cliente) { showToast('Cliente no encontrado'); return; }
  _fichaClienteId = clienteId;

  const turnos = _turnosDeCliente(clienteId);
  const pagos  = _pagosDeCliente(clienteId);
  const hoy = todayStr(), ahora = new Date().toTimeString().slice(0, 5);

  const proximo = [...turnos].reverse().find(t =>
    t.estado !== 'cancelado' && (t.fecha + t.horario) >= (hoy + ahora)
  );
  const ultimo = turnos.find(t => (t.fecha + t.horario) < (hoy + ahora));

  document.getElementById('fcNombre').textContent = _nombreCompletoCliente(cliente);
  document.getElementById('fcContacto').innerHTML =
    [cliente.telefono ? `📞 ${cliente.telefono}` : '', cliente.mail ? `✉ ${cliente.mail}` : '']
      .filter(Boolean).join(' · ') || 'Sin datos de contacto';

  document.getElementById('fcResumen').innerHTML = `
    <div class="fc-resumen-item">
      <span class="fc-resumen-label">Próximo turno</span>
      <span class="fc-resumen-valor">${proximo ? `${fmtDateHuman(new Date(proximo.fecha + 'T00:00:00'))}, ${proximo.horario}` : '—'}</span>
    </div>
    <div class="fc-resumen-item">
      <span class="fc-resumen-label">Último turno</span>
      <span class="fc-resumen-valor">${ultimo ? `${fmtDateHuman(new Date(ultimo.fecha + 'T00:00:00'))}` : '—'}</span>
    </div>
  `;

  // Datos para facturación
  document.getElementById('fcFacturacion').innerHTML = `
    <div class="fc-resumen-item">
      <span class="fc-resumen-label">Condición IVA</span>
      <span class="fc-resumen-valor">${cliente.condicionIVA || '—'}</span>
    </div>
    <div class="fc-resumen-item">
      <span class="fc-resumen-label">Documento</span>
      <span class="fc-resumen-valor">${cliente.tipoDocumento ? `${cliente.tipoDocumento} ${cliente.numeroDocumento || ''}` : '—'}</span>
    </div>
  `;

  // Datos internos
  document.getElementById('fcInternos').innerHTML = `
    <div class="fc-resumen-item">
      <span class="fc-resumen-label">ID cliente</span>
      <span class="fc-resumen-valor" style="font-size:.72rem;word-break:break-all">${cliente.clienteId}</span>
    </div>
    <div class="fc-resumen-item">
      <span class="fc-resumen-label">Fecha de alta</span>
      <span class="fc-resumen-valor">${cliente.fechaAlta ? String(cliente.fechaAlta).slice(0, 10) : '—'}</span>
    </div>
  `;

  _pintarSwitchActivo(_clienteActivo(cliente));

  const cont2 = document.getElementById('fcTurnos');
  cont2.innerHTML = turnos.length ? turnos.map(t => `
    <div class="fc-lista-item">
      <span>${t.fecha} · ${t.horario} — ${t.servicio || ''}</span>
      <span class="fc-lista-estado">${t.estado}</span>
    </div>
  `).join('') : '<div class="fc-lista-vacio">Sin turnos recientes ni próximos.</div>';

  const cont3 = document.getElementById('fcPagos');
  cont3.innerHTML = pagos.length ? pagos.map(m => `
    <div class="fc-lista-item">
      <span>${m.fecha ? String(m.fecha).slice(0, 10) : ''} — ${m.concepto || m.metodoPago || ''}</span>
      <span class="fc-lista-monto">$${Number(m.importe || 0).toLocaleString('es-AR')}</span>
    </div>
  `).join('') : '<div class="fc-lista-vacio">Sin pagos registrados.</div>';

  abrirModal('modalFichaCliente');
}

// ── Switch Activo/Inactivo ──────────────────────────────────
function _pintarSwitchActivo(activo) {
  const sw = document.getElementById('fcSwitchActivo');
  const lbl = document.getElementById('fcSwitchActivoLabel');
  if (!sw) return;
  sw.classList.toggle('on', activo);
  if (lbl) lbl.textContent = activo ? 'Activo' : 'Inactivo';
}

function toggleActivoClienteUI() {
  const cliente = getClientes().find(c => String(c.clienteId) === String(_fichaClienteId));
  if (!cliente) return;
  const activoActual = _clienteActivo(cliente);

  if (activoActual) {
    // Desactivar pide confirmación (nunca borra el registro).
    mostrarConfirm({
      icon: '🚫', titulo: 'Desactivar cliente',
      msg: `¿Marcás a "${_nombreCompletoCliente(cliente)}" como inactivo? Podés reactivarlo cuando quieras, no se borra nada.`,
      btnTxt: 'Desactivar', btnColor: 'rgba(239,68,68,.85)',
      onOk: () => guardarActivoCliente(_fichaClienteId, false),
    });
  } else {
    // Reactivar no necesita confirmación.
    guardarActivoCliente(_fichaClienteId, true);
  }
}

async function guardarActivoCliente(clienteId, activo) {
  const res = await apiPost({ action: 'toggleActivoCliente', clienteId, activo });
  if (res.ok) {
    await _refrescarClientes();
    _pintarSwitchActivo(activo);
    renderClientes();
    showToast(activo ? '✓ Cliente reactivado' : '✓ Cliente desactivado');
  } else {
    showToast(res.error || 'No se pudo actualizar el estado del cliente');
  }
}

// ── Editar / crear cliente (mismo formulario, misma función de guardado) ──
// _clienteFormOrigen indica qué hacer después de guardar: 'ficha' (edición
// normal, ya existía) vuelve a la ficha del cliente; 'mas' (alta desde el
// + central) solo confirma y refresca la lista; 'caja' (alta desde el
// buscador de Caja cuando no aparece nadie) cierra este formulario y
// vuelve al modal de Caja con el cliente recién creado ya seleccionado.
let _clienteFormOrigen = 'ficha';

function abrirModalEditarCliente() {
  const cliente = getClientes().find(c => String(c.clienteId) === String(_fichaClienteId));
  if (!cliente) return;

  _clienteFormOrigen = 'ficha';
  document.getElementById('ecTitulo').textContent = 'Editar cliente';
  document.getElementById('ecClienteId').value       = cliente.clienteId;
  document.getElementById('ecNombre').value           = cliente.nombre || '';
  document.getElementById('ecApellido').value         = cliente.apellido || '';
  document.getElementById('ecMail').value              = cliente.mail || '';
  document.getElementById('ecTelefono').value          = cliente.telefono || '';
  document.getElementById('ecCondicionIVA').value      = cliente.condicionIVA || '';
  document.getElementById('ecTipoDocumento').value     = cliente.tipoDocumento || '';
  document.getElementById('ecNumeroDocumento').value   = cliente.numeroDocumento || '';

  cerrarModal('modalFichaCliente');
  abrirModal('modalEditarCliente');
}

// Alta manual — botón "+" central ("Nuevo cliente") o buscador de Caja
// cuando no aparece nadie ("+ Crear nuevo cliente"). Mismo formulario y
// misma función guardarCliente() de abajo: al no traer ecClienteId,
// guardarCliente() sabe que tiene que crear en vez de editar.
// prefill: { nombre?, telefono?, mail? } — opcional, para precargar lo
// que ya se haya tipeado antes de abrir el formulario.
function abrirModalNuevoCliente(prefill, origen) {
  _clienteFormOrigen = origen || 'mas';
  document.getElementById('ecTitulo').textContent = 'Nuevo cliente';
  document.getElementById('ecClienteId').value        = '';
  document.getElementById('ecNombre').value            = (prefill && prefill.nombre) || '';
  document.getElementById('ecApellido').value          = '';
  document.getElementById('ecMail').value               = (prefill && prefill.mail) || '';
  document.getElementById('ecTelefono').value           = (prefill && prefill.telefono) || '';
  document.getElementById('ecCondicionIVA').value       = '';
  document.getElementById('ecTipoDocumento').value      = '';
  document.getElementById('ecNumeroDocumento').value    = '';

  abrirModal('modalEditarCliente');
}

// Cierre del formulario (X / Cancelar). Si se había abierto desde el
// buscador de Caja, vuelve al modal de Caja en vez de dejar todo cerrado
// — así no se pierde el importe/tipo/método que ya se hubiera cargado.
function cerrarModalEditarCliente() {
  const volverACaja = _clienteFormOrigen === 'caja';
  cerrarModal('modalEditarCliente');
  if (volverACaja) abrirModal('modalMovimientoCaja');
}

let _guardandoCliente = false;

async function guardarCliente() {
  if (_guardandoCliente) return;
  const clienteId = document.getElementById('ecClienteId').value;
  const nombre = document.getElementById('ecNombre').value.trim();
  if (!nombre) { showToast('Ingresá al menos el nombre'); return; }

  const datosCliente = {
    nombre,
    apellido:        document.getElementById('ecApellido').value.trim(),
    mail:            document.getElementById('ecMail').value.trim(),
    telefono:        document.getElementById('ecTelefono').value.trim(),
    condicionIVA:    document.getElementById('ecCondicionIVA').value,
    tipoDocumento:   document.getElementById('ecTipoDocumento').value,
    numeroDocumento: document.getElementById('ecNumeroDocumento').value.trim(),
  };
  const esNuevo = !clienteId;

  const btn = document.getElementById('ecGuardarBtn');
  const original = btn ? btn.textContent : '';
  _guardandoCliente = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const res = esNuevo
      ? await apiPost({ action: 'crearCliente', cliente: datosCliente })
      : await apiPost({ action: 'guardarCliente', cliente: { clienteId, ...datosCliente } });

    if (!res.ok) { showToast(res.error || 'No se pudo guardar el cliente'); return; }

    await _refrescarClientes();
    cerrarModal('modalEditarCliente');

    if (esNuevo) {
      showToast('✓ Cliente creado');
      if (_clienteFormOrigen === 'caja') {
        // Vuelve al modal de Caja con el cliente recién creado ya
        // seleccionado — sin tener que buscarlo de nuevo ni perder lo
        // que ya se hubiera cargado (importe/tipo/método).
        _mvSeleccionarClienteNuevo(res.clienteId, datosCliente);
      } else {
        renderClientes();
      }
    } else {
      renderClientes();
      if (_fichaClienteId) abrirFichaCliente(_fichaClienteId);
      showToast('✓ Cliente actualizado');
    }
  } finally {
    _guardandoCliente = false;
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

// ── Sync puntual tras editar/activar (no espera al próximo "↻ Sync") ──
async function _refrescarClientes() {
  const data = await apiGet('getClientes');
  if (data.length) saveClientes(data);
}
