// Umbrales de negocio ajustables — mismo patrón que apps/admin-web/src/constants.js
// (nombrados por separado, no compartidos por coincidencia de valor).

// Cuánto puede diferir un precio tecleado de la mediana de la red (en
// cualquier dirección) antes de mostrar un chequeo de sanidad suave.
export const UMBRAL_DESVIACION_PRECIO = 0.25;

// Después de cuántos días sin actualizar un precio se avisa que puede estar viejo.
export const UMBRAL_PRECIO_VIEJO_DIAS = 60;
