/* ============================================================
   shared/js/identity.js
   Identidad comercial global. Un solo lugar para nombre, símbolo
   de logo y datos de contacto — cambiar el nombre del comercio
   (ej. si "Eva Spa" pasa a llamarse "Gise Spa") se hace acá,
   una sola vez, y se propaga a todas las páginas que lo consuman.

   Script plano (sin type="module"), para no romper el patrón que
   ya usan script.js / admin/script.js. Cargar ANTES de nav.js.
   ============================================================ */

var IDENTITY = {
  nombre:  'Eva Spa',
  simbolo: '✦',
  // Logo real (círculo, .png) — ruta relativa a la RAÍZ del repo.
  // Cada consumidor la resuelve según su propia ubicación: las páginas
  // de la raíz (index.html, catalogo.html) la usan tal cual; el admin
  // (un nivel más abajo) le antepone '../' (ver admin/script.js).
  // Mientras el archivo no exista todavía en el repo, el <img> rompe
  // silenciosamente (ícono roto del navegador) — subir a esa ruta
  // exacta resuelve todo sin tocar código de nuevo.
  logoUrl: 'assets/logo.png',
  favicon: 'assets/logo.png', // mismo archivo sirve como favicon
  contacto: {
    // Completar cuando estén disponibles. Mientras un campo quede vacío
    // ('' o ausente), el ícono/botón correspondiente no se muestra en
    // ningún lado — no rompe nada mientras tanto.
    whatsapp:  '', // solo números, con código de país, ej: '5491122334455'
    instagram: '', // usuario sin @, ej: 'evaspa.unas'
  },
};
