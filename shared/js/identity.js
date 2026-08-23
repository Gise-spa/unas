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
  // Logo como imagen real: no implementado todavía — mientras logoUrl
  // sea null, todas las páginas usan `simbolo` como logo de texto.
  // El día que haya un archivo de logo, completar acá (ej. 'assets/logo.png')
  // y ahí se decide en cada página si conviene usarlo — no rompe nada
  // mientras tanto.
  logoUrl: null,
  favicon: null, // ej. 'assets/favicon.png' — no implementado todavía
  contacto: {
    // completar cuando esté disponible: whatsapp, instagram, etc.
  },
};
