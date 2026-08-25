// ============================================================
//  admin/js/clientes.js — Clientes (Etapa 3 del rediseño)
//  Solo lectura: no crea ni edita clientes todavía. La lista sale de
//  getClientes() (hoja `clientes` completa, sincronizada por forzarSync).
//  La ficha cruza esos datos con getTurnos() y getTodosMovimientos()
//  del lado del cliente, sin pedir nada nuevo al backend por cliente.
//
//  Límite conocido: `turnos` en caché es solo agenda operativa (últimos
//  ~30 días + futuros) — el historial más viejo vive en `turnos_historico`
//  y no es accesible desde el admin todavía. Por eso el bloque de turnos
//  de la ficha se etiqueta como "recientes / próximos", no como
//  "historial completo".
// ============================================================

function _clienteMatch(c, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return String(c.nombre || '').toLowerCase().includes(s) ||
         String(c.telefono || '').toLowerCase().includes(s) ||
         String(c.mail || '').toLowerCase().includes(s);
}

function renderClientes() {
  const q = (document.getElementById('clientesBuscar')?.value || '').trim();
  const todos = getClientes()
    .filter(c => c.clienteId)
    .filter(c => _clienteMatch(c, q))
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));

  const cont = document.getElementById('clientesLista');
  if (!todos.length) {
    cont.innerHTML = `<div class="turnos-empty">${q ? 'Sin resultados para esa búsqueda.' : 'Todavía no hay clientes sincronizados — probá "↻ Sync".'}</div>`;
    return;
  }
  cont.innerHTML = todos.map(c => `
    <div class="cliente-card" onclick="abrirFichaCliente('${c.clienteId}')">
      <div class="cliente-card-nombre">${c.nombre || 'Sin nombre'}</div>
      <div class="cliente-card-sub">${c.telefono || c.mail || ''}</div>
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

  const turnos = _turnosDeCliente(clienteId);
  const pagos  = _pagosDeCliente(clienteId);
  const hoy = todayStr(), ahora = new Date().toTimeString().slice(0, 5);

  const proximo = [...turnos].reverse().find(t =>
    t.estado !== 'cancelado' && (t.fecha + t.horario) >= (hoy + ahora)
  );
  const ultimo = turnos.find(t => (t.fecha + t.horario) < (hoy + ahora));

  document.getElementById('fcNombre').textContent = cliente.nombre || 'Sin nombre';
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
