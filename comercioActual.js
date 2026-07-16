// Contexto compartido del comercio actual — resuelve el patrón de datos que no
// se refrescan tras un cambio hecho en otra pantalla (ej. editar "Mi negocio"
// no se veía reflejado en Home hasta cambiar de negocio o reabrir la app).
// comercioId nunca cambia dentro de una sesión de Home; comercioNombre (y lo
// que se agregue después) sí puede cambiar, y este Context es el único lugar
// donde se actualiza — todo lo demás lo consume de aquí en vez de una copia
// congelada en route.params.
import { createContext, useContext, useState, useCallback } from 'react';

const ComercioActualContext = createContext(null);

export function ComercioActualProvider({ children }) {
  const [comercioActual, setComercioActualState] = useState(null);

  const setComercioActual = useCallback((datos) => {
    setComercioActualState((prev) => ({ ...prev, ...datos }));
  }, []);

  return (
    <ComercioActualContext.Provider value={{ comercioActual, setComercioActual }}>
      {children}
    </ComercioActualContext.Provider>
  );
}

export function useComercioActual() {
  return useContext(ComercioActualContext);
}
