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
  contacto: {
    // completar cuando esté disponible: whatsapp, instagram, etc.
  },
};
