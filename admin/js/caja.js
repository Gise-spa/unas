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
  return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const [sesionRes, cuentasRes] = await Promise.all([
    apiGetRaw('getSesionCaja'),
    apiGetRaw('getCuentasCaja'),
  ]);
  if (cuentasRes.ok) saveCuentasCajaLocal(cuentasRes.data || []);

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

  const totales = getCajaTotales();
  const apertura = sesion.fechaApertura ? new Date(sesion.fechaApertura) : null;
  const horaApertura = apertura && !isNaN(apertura.getTime())
    ? apertura.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : '';
  document.getElementById('cajaEstadoInfo').innerHTML =
    `<strong style="color:#16a34a">● Caja abierta</strong>${horaApertura ? ' desde las ' + horaApertura : ''}` +
    `<br>Saldo inicial: ${fmtMoneda(sesion.saldoInicial)}`;

  document.getElementById('cjIngresos').textContent = totales ? fmtMoneda(totales.totalIngresos) : '—';
  document.getElementById('cjEgresos').textContent  = totales ? fmtMoneda(totales.totalEgresos) : '—';
  document.getElementById('cjEsperado').textContent = totales ? fmtMoneda(totales.efectivoEsperado) : '—';

  const desgloseEl = document.getElementById('cajaDesglose');
  if (totales && totales.porMetodo && Object.keys(totales.porMetodo).length) {
    desgloseEl.innerHTML = Object.keys(totales.porMetodo).sort().map(label => {
      const m = totales.porMetodo[label];
      return `<div class="caja-desglose-row"><span>${label}</span><span>${fmtMoneda(m.ingresos - m.egresos)}</span></div>`;
    }).join('');
  } else {
    desgloseEl.innerHTML = '<p class="today-empty">Sin movimientos todavía</p>';
  }

  const movs = getCajaMovimientos();
  const movsList = document.getElementById('cajaMovimientosList');
  if (movs.length) {
    const ordenados = [...movs].sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn));
    movsList.innerHTML = ordenados.map(m => {
      const hora = m.creadoEn ? new Date(m.creadoEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
      const signo = m.tipo === 'ingreso' ? '+' : '−';
      const clase = m.tipo === 'ingreso' ? 'caja-mov-importe-ingreso' : 'caja-mov-importe-egreso';
      const etiqueta = m.cuentaDestino || m.metodoPago || '';
      return `<li class="caja-mov-item">
        <span style="color:var(--text-muted);flex-shrink:0">${hora}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:500">${m.concepto || (m.nombreCliente ? 'Cobro — ' + m.nombreCliente : (m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'))}</div>
          <div style="font-size:.76rem;color:var(--text-muted)">${etiqueta}</div>
        </div>
        <span class="${clase}">${signo} ${fmtMoneda(m.importe)}</span>
      </li>`;
    }).join('');
  } else {
    movsList.innerHTML = '<p class="today-empty">Sin movimientos todavía</p>';
  }
}

function _renderChips(containerId, hiddenInputId, cuentaWrapId, seleccionado) {
  const cuentas = getCuentasCajaLocal();
  const cont = document.getElementById(containerId);
  if (!cont) return;
  if (!cuentas.length) {
    cont.innerHTML = '<p class="today-empty">No hay métodos configurados en Configuración</p>';
    return;
  }
  cont.innerHTML = cuentas.map(c => {
    const metodo = c.metodo || '';
    const on = metodo === seleccionado ? 'on' : '';
    return `<div class="chip ${on}" onclick="_elegirMetodo('${containerId}','${hiddenInputId}','${cuentaWrapId}','${metodo.replace(/'/g, "\\'")}')">${metodo}</div>`;
  }).join('');
}

function _elegirMetodo(containerId, hiddenInputId, cuentaWrapId, metodo) {
  document.getElementById(hiddenInputId).value = metodo;
  document.querySelectorAll(`#${containerId} .chip`).forEach(ch => {
    ch.classList.toggle('on', ch.textContent === metodo);
  });
  const wrap = document.getElementById(cuentaWrapId);
  if (wrap) wrap.style.display = (metodo.toLowerCase() === 'efectivo') ? 'none' : '';
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

// ════════════════════════════════════════════════════════
//  MOVIMIENTO MANUAL
// ════════════════════════════════════════════════════════
function abrirModalMovimiento() {
  document.getElementById('mvTipo').value = 'ingreso';
  document.getElementById('mvTipoIngreso').classList.add('active-vis');
  document.getElementById('mvTipoEgreso').classList.remove('active-vis');
  document.getElementById('mvImporte').value = '';
  document.getElementById('mvMetodo').value = '';
  document.getElementById('mvCuenta').value = '';
  document.getElementById('mvConcepto').value = '';
  document.getElementById('mvCuentaWrap').style.display = 'none';
  _renderChips('mvMetodoChips', 'mvMetodo', 'mvCuentaWrap', '');
  abrirModal('modalMovimientoCaja');
}

function setMovTipo(tipo) {
  document.getElementById('mvTipo').value = tipo;
  document.getElementById('mvTipoIngreso').classList.toggle('active-vis', tipo === 'ingreso');
  document.getElementById('mvTipoEgreso').classList.toggle('active-vis', tipo === 'egreso');
}

async function confirmarMovimientoCaja() {
  const sesion = getCajaSesion();
  if (!sesion) { showToast('No hay caja abierta'); return; }
  const tipo = document.getElementById('mvTipo').value;
  const importe = Number(document.getElementById('mvImporte').value);
  const metodoPago = document.getElementById('mvMetodo').value;
  const cuentaDestino = document.getElementById('mvCuenta').value.trim();
  const concepto = document.getElementById('mvConcepto').value.trim();

  if (isNaN(importe) || importe <= 0) { showToast('Ingresá un importe válido'); return; }
  if (!metodoPago) { showToast('Elegí un método de pago'); return; }
  if (!concepto) { showToast('Ingresá un concepto'); return; }

  const res = await apiPost({
    action: 'registrarMovimientoCaja',
    movimiento: {
      movimientoId: _cajaUuid(),
      sesionId: sesion.sesionId,
      tipo, importe, metodoPago, cuentaDestino, concepto
    }
  });

  if (res.ok) {
    showToast(tipo === 'ingreso' ? '✓ Ingreso registrado' : '✓ Egreso registrado');
    cerrarModal('modalMovimientoCaja');
    await renderCaja();
  } else {
    showToast(res.error || 'No se pudo registrar el movimiento');
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
  document.getElementById('cbMetodo').value = '';
  document.getElementById('cbCuenta').value = '';
  document.getElementById('cbConcepto').value = t.servicio || '';
  document.getElementById('cbCuentaWrap').style.display = 'none';
  _renderChips('cbMetodoChips', 'cbMetodo', 'cbCuentaWrap', '');

  abrirModal('modalCobrar');
}

async function confirmarCobro() {
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

  const desgloseEl = document.getElementById('czDesglose');
  if (totales.porMetodo && Object.keys(totales.porMetodo).length) {
    desgloseEl.innerHTML = Object.keys(totales.porMetodo).sort().map(label => {
      const m = totales.porMetodo[label];
      return `<div class="caja-desglose-row"><span>${label}</span><span>${fmtMoneda(m.ingresos - m.egresos)}</span></div>`;
    }).join('');
  } else {
    desgloseEl.innerHTML = '<p class="today-empty">Sin movimientos</p>';
  }

  document.getElementById('czTotales').innerHTML =
    `Total ingresos: <strong>${fmtMoneda(totales.totalIngresos)}</strong><br>` +
    `Total egresos: <strong>${fmtMoneda(totales.totalEgresos)}</strong><br>` +
    `Resultado neto: <strong>${fmtMoneda(totales.resultadoNeto)}</strong>`;

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

async function confirmarCierreCaja(contado) {
  const sesionId = document.getElementById('czSesionId').value;
  const res = await apiPost({ action: 'cerrarCaja', sesionId, efectivoContado: contado });
  if (res.ok) {
    showToast('✓ Caja cerrada');
    cerrarModal('modalCierreCaja');
    await renderCaja();
    if (typeof renderInicio === 'function' && seccionActiva === 'inicio') renderInicio();
    if (typeof renderTurnos === 'function' && seccionActiva === 'turnos') renderTurnos();
  } else {
    showToast(res.error || 'No se pudo cerrar la caja');
  }
}
