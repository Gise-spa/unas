/* ============================================================
   script.js — Lógica compartida entre todas las páginas
   ============================================================ */

const API_URL = 'https://script.google.com/macros/s/AKfycbx7Q7Qpw3TQ2Pv8CYLLlc7qXoDZpz0kWLUaJB0c1wK0cwPfb2nPHb6QbQhWvSDadrJ6/exec';

// ── Dark mode ──────────────────────────────────────────────
const html     = document.documentElement;
const themeBtn = document.querySelector('.theme-btn');

const savedTheme = localStorage.getItem('theme') || 'light';
html.setAttribute('data-theme', savedTheme);

themeBtn?.addEventListener('click', () => {
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ── Nav hamburger ──────────────────────────────────────────
const hamburger = document.querySelector('.hamburger');
const navLinks  = document.querySelector('.nav-links');

hamburger?.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

navLinks?.querySelectorAll('a').forEach(a =>
  a.addEventListener('click', () => navLinks.classList.remove('open'))
);

// ── Marcar link activo ─────────────────────────────────────
const page = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-links a').forEach(a => {
  const href = a.getAttribute('href');
  if (href === page || (page === '' && href === 'index.html')) {
    a.classList.add('active');
  }
});

// ── Scroll reveal ──────────────────────────────────────────
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ── Toast ──────────────────────────────────────────────────
function showToast(msg, duration = 3000) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ── Auth — validada en el GAS, sin credenciales en el front ─
const AUTH_KEY   = 'nails_auth';
const AUTH_TOKEN = 'nails_token';

function isLoggedIn()   { return sessionStorage.getItem(AUTH_KEY) === '1'; }
function getAuthToken() { return sessionStorage.getItem(AUTH_TOKEN) || ''; }

async function doLogin(u, p) {
  try {
    const url  = API_URL + '?action=login&user=' + encodeURIComponent(u) + '&pass=' + encodeURIComponent(p);
    const res  = await fetch(url);
    const json = await res.json();
    if (json.ok) {
      sessionStorage.setItem(AUTH_KEY, '1');
      sessionStorage.setItem(AUTH_TOKEN, json.token || '');
      return { ok: true };
    }
    return { ok: false, error: json.error || 'Usuario o contraseña incorrectos' };
  } catch(e) {
    return { ok: false, error: 'Sin conexión con el servidor' };
  }
}

function doLogout() {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_TOKEN);
  location.href = 'index.html';
}

// ── Utilidades de fecha ────────────────────────────────────
const MESES     = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS      = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_FULL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function fmtDate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtDateHuman(dt) {
  return `${DIAS_FULL[dt.getDay()]} ${dt.getDate()} de ${MESES[dt.getMonth()]}`;
}

function todayStr() { return fmtDate(new Date()); }

// ── Generar .ics para turnos ───────────────────────────────
function generateICS({ fecha, horario, duracion, servicio, nombre }) {
  const [y, mo, d] = fecha.split('-').map(Number);
  const [hh, mm]   = horario.split(':').map(Number);
  const start = new Date(y, mo - 1, d, hh, mm);
  const end   = new Date(start.getTime() + (duracion || 60) * 60000);

  const fmt = dt =>
    String(dt.getFullYear()) +
    String(dt.getMonth() + 1).padStart(2, '0') +
    String(dt.getDate()).padStart(2, '0') + 'T' +
    String(dt.getHours()).padStart(2, '0') +
    String(dt.getMinutes()).padStart(2, '0') + '00';

  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Gise Spa//Turnos//ES',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${servicio}`,
    `DESCRIPTION:Turno de ${nombre}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Tu turno es en 1 hora',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadICS(data) {
  const blob = new Blob([generateICS(data)], { type: 'text/calendar' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `turno-${data.fecha}.ics`,
  });
  a.click();
}

// ── localStorage helpers ───────────────────────────────────
const DB = {
  get:  key        => JSON.parse(localStorage.getItem(key) || 'null'),
  set:  (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  push: (key, val) => {
    const arr = DB.get(key) || [];
    arr.push(val);
    DB.set(key, arr);
    return arr;
  },
};

// ── Agenda config ──────────────────────────────────────────
function getAgenda() {
  return DB.get('agenda_config') || {
    diasHabilitados: [1, 2, 3, 4, 5, 6],
    slots: ['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00'],
    diasBloqueados: [],
    servicios: getDefaultServicios(),
  };
}

function getDefaultServicios() {
  return [
    { id: 's01', nombre: 'Manos — Común',            grupo: 'Manos',    duracion: 45 },
    { id: 's02', nombre: 'Manos — Semi con retiro',  grupo: 'Manos',    duracion: 75 },
    { id: 's03', nombre: 'Manos — Semi sin retiro',  grupo: 'Manos',    duracion: 60 },
    { id: 's04', nombre: 'Manos — Soft gel',         grupo: 'Manos',    duracion: 90 },
    { id: 's05', nombre: 'Pies — Esmaltado común',   grupo: 'Pies',     duracion: 45 },
    { id: 's06', nombre: 'Pies — Esmaltado semi',    grupo: 'Pies',     duracion: 60 },
    { id: 's07', nombre: 'Pies — Sin esmaltado',     grupo: 'Pies',     duracion: 40 },
    { id: 's08', nombre: 'Pedicura',                 grupo: 'Pedicura', duracion: 60 },
    { id: 's09', nombre: 'Pedicura — Esmalte común', grupo: 'Pedicura', duracion: 75 },
    { id: 's10', nombre: 'Pedicura — Esmalte semi',  grupo: 'Pedicura', duracion: 90 },
  ];
}

function getTakenSlots() { return DB.get('taken_slots') || {}; }
function addTakenSlot(fecha, slot) {
  const taken = getTakenSlots();
  if (!taken[fecha]) taken[fecha] = [];
  if (!taken[fecha].includes(slot)) taken[fecha].push(slot);
  DB.set('taken_slots', taken);
}
function removeTakenSlot(fecha, slot) {
  const taken = getTakenSlots();
  if (taken[fecha]) taken[fecha] = taken[fecha].filter(s => s !== slot);
  DB.set('taken_slots', taken);
}

// ── Turnos ─────────────────────────────────────────────────
function getTurnos()     { return DB.get('turnos') || []; }
function saveTurnos(arr) { DB.set('turnos', arr); }

// ── Inventario ─────────────────────────────────────────────
function getInventario()     { return DB.get('inventario') || []; }
function saveInventario(arr) { DB.set('inventario', arr); }

function getCategorias() {
  return DB.get('categorias') || [
    'Esmaltes gel',
    'Esmaltes semipermanentes',
    'Esmaltes comunes',
    'Insumos',
    'Equipamiento',
  ];
}
function saveCategorias(arr) { DB.set('categorias', arr); }
