/* ============================================================
   shared/js/nav.js
   Navegación global del sitio público (header + footer + menú
   hamburguesa mobile). Agregar/quitar una sección del sitio es
   agregar un elemento a NAV_LINKS — cero HTML tocado en ninguna
   página existente.

   Requiere: identity.js cargado ANTES.
   Requiere en el HTML: <div id="site-nav"></div> y
   <div id="site-footer"></div> como placeholders vacíos.

   El nav del panel de administración (drawer) NO usa este archivo
   — es una pieza propia del admin, acoplada a su lógica de
   secciones/badges. Esto es solo para el sitio público.
   ============================================================ */

var NAV_LINKS = [
  { label: 'Inicio',    href: 'index.html#inicio' },
  { label: 'Servicios', href: 'index.html#servicios' },
  { label: 'Catálogo',  href: 'catalogo.html' },
  { label: 'Turnos',    href: 'index.html#turnos' },
];

function _navEsPaginaActual(href) {
  var pagina = location.pathname.split('/').pop() || 'index.html';
  var hrefPagina = href.split('#')[0] || 'index.html';
  return hrefPagina === pagina || (pagina === '' && hrefPagina === 'index.html');
}

function renderNav() {
  var cont = document.getElementById('site-nav');
  if (!cont) return;

  var links = NAV_LINKS.map(function (l) {
    var activo = _navEsPaginaActual(l.href) ? ' class="active"' : '';
    return '<li><a href="' + l.href + '"' + activo + '>' + l.label + '</a></li>';
  }).join('');

  cont.innerHTML =
    '<nav class="nav">' +
      '<a href="index.html" class="nav-logo">' + IDENTITY.simbolo + ' <span>' + IDENTITY.nombre + '</span></a>' +
      '<ul class="nav-links">' +
        links +
        '<li><a href="admin/" class="nav-admin">Admin</a></li>' +
      '</ul>' +
      '<div class="nav-right">' +
        '<button class="theme-btn" aria-label="Cambiar tema"></button>' +
        '<button class="hamburger" aria-label="Menú"><span></span><span></span><span></span></button>' +
      '</div>' +
    '</nav>';

  // Wiring — se hace acá porque los elementos recién existen tras el innerHTML
  var themeBtn = cont.querySelector('.theme-btn');
  themeBtn && themeBtn.addEventListener('click', function () {
    var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  var hamburger = cont.querySelector('.hamburger');
  var navLinksEl = cont.querySelector('.nav-links');
  hamburger && hamburger.addEventListener('click', function () {
    navLinksEl.classList.toggle('open');
  });
  navLinksEl && navLinksEl.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { navLinksEl.classList.remove('open'); });
  });
}

function renderFooter() {
  var cont = document.getElementById('site-footer');
  if (!cont) return;

  var links = NAV_LINKS.map(function (l) {
    return '<li><a href="' + l.href + '">' + l.label + '</a></li>';
  }).join('');

  cont.innerHTML =
    '<footer class="footer">' +
      '<div class="footer-inner">' +
        '<div class="footer-logo">' + IDENTITY.simbolo + ' <span>' + IDENTITY.nombre + '</span></div>' +
        '<ul class="footer-links">' +
          links +
          '<li><a href="admin/">Admin</a></li>' +
        '</ul>' +
      '</div>' +
      '<div class="footer-copy">' +
        '<span>© ' + new Date().getFullYear() + ' · Todos los derechos reservados</span>' +
        '<span>Hecho con 💛</span>' +
      '</div>' +
    '</footer>';
}

// El nombre del comercio en <title> vivía hardcodeado por página (una
// de ellas todavía decía "Nails", nombre viejo) — se corrige acá, en
// el único lugar que ya centraliza identidad para el sitio público.
// Espera el formato "Página — Nombre"; si no lo encuentra, no toca nada.
function actualizarTituloDesdeIdentity() {
  if (typeof IDENTITY === 'undefined' || !IDENTITY.nombre) return;
  var partes = document.title.split('—');
  if (partes.length === 2) {
    document.title = partes[0].trim() + ' — ' + IDENTITY.nombre;
  }
}

actualizarTituloDesdeIdentity();
renderNav();
renderFooter();
