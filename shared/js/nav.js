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
  { label: 'Inspirate', href: 'index.html#inspirate' },
  { label: 'Catálogo',  href: 'catalogo.html' },
  { label: 'Reservar',  href: 'index.html#turnos' },
];

// Logo del header/footer público: img real si IDENTITY.logoUrl está
// cargado (páginas de raíz, ruta tal cual, sin '../' — a diferencia del
// admin que vive un nivel más abajo), con fallback automático al símbolo
// de texto si el archivo todavía no existe en assets/.
function _identityLogoHtml() {
  if (!IDENTITY.logoUrl) return IDENTITY.simbolo + ' <span>' + IDENTITY.nombre + '</span>';
  return '<img src="' + IDENTITY.logoUrl + '" alt="' + IDENTITY.nombre + '" class="identity-logo-img" ' +
    'onerror="this.remove(); this.parentNode.insertAdjacentHTML(\'afterbegin\', ' +
    JSON.stringify(IDENTITY.simbolo + ' ') + ')"> <span>' + IDENTITY.nombre + '</span>';
}

// Íconos de tema — idénticos a los de admin/script.js, para que el
// botón se vea y se comporte igual en todo el sitio (público y admin).
function _iconoTemaSol() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="4.2" y1="4.2" x2="6" y2="6"/><line x1="18" y1="18" x2="19.8" y2="19.8"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.2" y1="19.8" x2="6" y2="18"/><line x1="18" y1="6" x2="19.8" y2="4.2"/></svg>';
}
function _iconoTemaLuna() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>';
}
// Misma convención que el admin: el ícono muestra el modo AL QUE SE
// PASA al tocarlo (en oscuro se ve el sol, en claro se ve la luna).
function _actualizarIconoTemaPublico(btn) {
  if (!btn) return;
  var esOscuro = html.getAttribute('data-theme') === 'dark';
  btn.innerHTML = esOscuro ? _iconoTemaSol() : _iconoTemaLuna();
}

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
      '<a href="index.html" class="nav-logo">' + _identityLogoHtml() + '</a>' +
      '<ul class="nav-links">' +
        links +
        '<li><a href="admin/" class="nav-admin">Iniciar sesión</a></li>' +
      '</ul>' +
      '<div class="nav-right">' +
        '<button class="theme-btn" aria-label="Cambiar tema"></button>' +
        '<button class="hamburger" aria-label="Menú"><span></span><span></span><span></span></button>' +
      '</div>' +
    '</nav>';

  // Wiring — se hace acá porque los elementos recién existen tras el innerHTML
  var themeBtn = cont.querySelector('.theme-btn');
  _actualizarIconoTemaPublico(themeBtn);
  themeBtn && themeBtn.addEventListener('click', function () {
    var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    _actualizarIconoTemaPublico(themeBtn);
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

  var contacto = (typeof IDENTITY !== 'undefined' && IDENTITY.contacto) || {};
  var socialItems = [];
  if (contacto.whatsapp) {
    socialItems.push('<a href="https://wa.me/' + contacto.whatsapp + '" target="_blank" rel="noopener" class="footer-social-link" aria-label="WhatsApp">📱</a>');
  }
  if (contacto.instagram) {
    socialItems.push('<a href="https://instagram.com/' + contacto.instagram + '" target="_blank" rel="noopener" class="footer-social-link" aria-label="Instagram">📷</a>');
  }
  var socialHtml = socialItems.length
    ? '<div class="footer-social">' + socialItems.join('') + '</div>'
    : '';

  cont.innerHTML =
    '<footer class="footer">' +
      '<div class="footer-inner">' +
        '<div class="footer-logo">' + _identityLogoHtml() + '</div>' +
        '<ul class="footer-links">' +
          links +
        '</ul>' +
        socialHtml +
      '</div>' +
      '<div class="footer-copy">' +
        '<span>© ' + new Date().getFullYear() + ' · Todos los derechos reservados</span>' +
        '<span>Hecho con 💛</span>' +
      '</div>' +
    '</footer>';

  // Botón flotante de WhatsApp — aparece en todas las páginas públicas
  // solo si hay un número cargado en IDENTITY.contacto.whatsapp.
  if (contacto.whatsapp && !document.getElementById('waFloat')) {
    var wa = document.createElement('a');
    wa.id = 'waFloat';
    wa.className = 'wa-float';
    wa.href = 'https://wa.me/' + contacto.whatsapp;
    wa.target = '_blank';
    wa.rel = 'noopener';
    wa.setAttribute('aria-label', 'Escribir por WhatsApp');
    wa.textContent = '📱';
    document.body.appendChild(wa);
  }
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

// Favicon del sitio público a partir de IDENTITY.favicon (páginas de
// raíz, ruta tal cual). Si el archivo no existe todavía, el navegador
// simplemente no muestra ícono — no rompe nada.
function actualizarFaviconDesdeIdentity() {
  if (typeof IDENTITY === 'undefined' || !IDENTITY.favicon) return;
  var link = document.querySelector("link[rel~='icon']");
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.href = IDENTITY.favicon;
}

actualizarTituloDesdeIdentity();
actualizarFaviconDesdeIdentity();
renderNav();
renderFooter();
