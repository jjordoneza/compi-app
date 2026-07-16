import { useEffect, useMemo, useState } from 'react';
import { listarComercios, actualizarComercio } from '../api';

// Único lugar donde se edita comercios directo, sin cola de aprobación — el
// admin es el único que ve esta pantalla. No hay crear/eliminar a mano: los
// negocios reales nacen solo por el onboarding del tendero (crear_comercio).
function FilaComercio({ item, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(item.nombre || '');
  const [ciudad, setCiudad] = useState(item.ciudad || '');
  const [barrio, setBarrio] = useState(item.barrio || '');
  const [direccion, setDireccion] = useState(item.direccion || '');
  const [telefono, setTelefono] = useState(item.telefono || '');
  const [contactoNombre, setContactoNombre] = useState(item.contacto_nombre || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      await actualizarComercio(item.id, {
        nombre: nombre.trim(),
        ciudad: ciudad.trim() || null,
        barrio: barrio.trim(),
        direccion: direccion.trim() || null,
        telefono: telefono.trim() || null,
        contacto_nombre: contactoNombre.trim() || null,
      });
      setEditando(false);
      await onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  const coordenadas = item.lat != null && item.lng != null ? `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}` : 'Sin GPS';

  return (
    <li className="tarjeta">
      <button type="button" className="filaTop" onClick={() => setEditando((v) => !v)}>
        <div>
          <strong>{item.nombre}</strong>
          <p className="sub">{[item.ciudad, item.barrio].filter(Boolean).join(' — ') || 'Sin ciudad/barrio'}</p>
          <p className="sub">
            {item.telefono || 'Sin teléfono'}
            {item.contacto_nombre ? ` · ${item.contacto_nombre}` : ''}
          </p>
        </div>
        <span className="fecha">{coordenadas}</span>
      </button>
      {editando && (
        <div className="panel">
          {error && <p className="error">{error}</p>}
          <input placeholder="Nombre del negocio" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <input placeholder="Ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
          <input placeholder="Barrio" value={barrio} onChange={(e) => setBarrio(e.target.value)} />
          <input placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          <input placeholder="Teléfono de contacto" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <input
            placeholder="Nombre de quien atiende"
            value={contactoNombre}
            onChange={(e) => setContactoNombre(e.target.value)}
          />
          <button type="button" className="aprobar" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </li>
  );
}

export default function MaestroNegocios() {
  const [comercios, setComercios] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');

  async function cargar() {
    try {
      setComercios(await listarComercios());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    if (!comercios) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return comercios;
    return comercios.filter((c) =>
      [c.nombre, c.ciudad, c.barrio, c.direccion, c.telefono, c.contacto_nombre]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q))
    );
  }, [comercios, busqueda]);

  if (error) return <p className="error">{error}</p>;
  if (comercios === null) return <p className="ayuda">Cargando...</p>;

  return (
    <div>
      <input
        placeholder="Buscar por nombre, ciudad, barrio, teléfono..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        style={{ marginBottom: 14, width: '100%' }}
      />
      {filtrados.length === 0 ? (
        <p className="vacio">No hay negocios que coincidan.</p>
      ) : (
        <ul className="lista">
          {filtrados.map((item) => (
            <FilaComercio key={item.id} item={item} onGuardado={cargar} />
          ))}
        </ul>
      )}
    </div>
  );
}
