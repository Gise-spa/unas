/* ============================================================
   shared/js/identity.js
   Identidad comercial global. Un solo lugar para nombre, símbolo
   de logo y datos de contacto — cambiar el nombre del comercio
   (ej. si "Spa Sosiego" cambia de nombre) se hace acá,
   una sola vez, y se propaga a todas las páginas que lo consuman.

   Script plano (sin type="module"), para no romper el patrón que
   ya usan script.js / admin/script.js. Cargar ANTES de nav.js.
   ============================================================ */

var IDENTITY = {
  nombre:  'Spa Sosiego',
  simbolo: '✦',
  // Logo real (círculo, .png) — ruta relativa a la RAÍZ del repo.
  // Cada consumidor la resuelve según su propia ubicación: las páginas
  // de la raíz (index.html, catalogo.html) la usan tal cual; el admin
  // (un nivel más abajo) le antepone '../' (ver admin/script.js).
  // Mientras el archivo no exista todavía en el repo, el <img> rompe
  // silenciosamente (ícono roto del navegador) — subir a esa ruta
  // exacta resuelve todo sin tocar código de nuevo.
  logoUrl: 'assets/logo.png',
  favicon: 'assets/favicon-32.png', // versión chica del logo (se genera a partir de assets/logo.png)
  // Quién desarrolló el sitio (se muestra en el pie). logo es opcional: si el archivo no existe, simplemente no se ve.
  creditos: {
    nombre: 'ElevaLab',
    url:    'https://elevalab.com.ar',
    logo:   'assets/elevalab.png'
  },
  contacto: {
    // Completar cuando estén disponibles. Mientras un campo quede vacío
    // ('' o ausente), el ícono/botón correspondiente no se muestra en
    // ningún lado — no rompe nada mientras tanto.
    whatsapp:  '', // solo números, con código de país, ej: '5491122334455'
    instagram: '', // usuario sin @, ej: 'tu_usuario'
  },
};
