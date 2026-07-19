import { useEffect } from 'react';

// Panel "medio pantalla" compartido para los formularios de "Agregar" de
// cada Maestro (Proveedores, Productos) — reemplaza el card inline que se
// abría arriba de la tabla. Overlay + panel centrado, cierra con el botón X,
// clic afuera, o Escape.
export default function Modal({ titulo, onCerrar, children }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onCerrar();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCerrar]);

  function onOverlayClick(e) {
    if (e.target === e.currentTarget) onCerrar();
  }

  return (
    <div className="modalOverlay" onClick={onOverlayClick}>
      <div className="modalPanel" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modalHeader">
          <h2 className="modalTitulo">{titulo}</h2>
          <button type="button" className="modalCerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}
