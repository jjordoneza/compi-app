import { useEffect, useMemo, useState } from 'react';
import { listarComercios, actualizarComercio } from '../api';

// Único lugar donde se edita comercios directo, sin cola de aprobación — el
// admin es el único que ve esta pantalla. No hay crear/eliminar a mano: los
// negocios reales nacen solo por el onboarding del tendero (crear_comercio).
const CAMPOS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'barrio', label: 'Barrio' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'contacto_nombre', label: 'Contacto' },
];

function FilaComercio({ item, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState(() =>
    Object.fromEntries(CAMPOS.map((c) => [c.key, item[c.key] || '']))
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function setCampo(key, valor) {
    setValores((prev) => ({ ...prev, [key]: valor }));
  }

  function cancelar() {
    setValores(Object.fromEntries(CAMPOS.map((c) => [c.key, item[c.key] || ''])));
    setEditando(false);
    setError('');
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      await actualizarComercio(item.id, {
        nombre: valores.nombre.trim(),
        ciudad: valores.ciudad.trim() || null,
        barrio: valores.barrio.trim(),
        direccion: valores.direccion.trim() || null,
        telefono: valores.telefono.trim() || null,
        contacto_nombre: valores.contacto_nombre.trim() || null,
      });
      setEditando(false);
      await onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  const coordenadas = item.lat != null && item.lng != null ? `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}` : '—';

  return (
    <tr>
      {CAMPOS.map((c) => (
        <td key={c.key}>
          {editando ? (
            <input value={valores[c.key]} onChange={(e) => setCampo(c.key, e.target.value)} />
          ) : (
            item[c.key] || <span style={{ color: 'var(--text-muted)' }}>—</span>
          )}
        </td>
      ))}
      <td className="mono">{coordenadas}</td>
      <td className="acciones-cell">
        {error && <span className="error">{error}</span>}
        {editando ? (
          <>
            <button type="button" className="gridBoton" disabled={guardando} onClick={guardar}>
              {guardando ? '...' : 'Guardar'}
            </button>
            <button type="button" className="gridBoton secundario" disabled={guardando} onClick={cancelar}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className="gridBoton secundario" onClick={() => setEditando(true)}>
            Editar
          </button>
        )}
      </td>
    </tr>
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
        className="buscadorGrid"
        placeholder="Buscar por nombre, ciudad, barrio, teléfono..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      {filtrados.length === 0 ? (
        <p className="vacio">No hay negocios que coincidan.</p>
      ) : (
        <div className="gridWrap">
          <table className="grid">
            <thead>
              <tr>
                {CAMPOS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>GPS</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item) => (
                <FilaComercio key={item.id} item={item} onGuardado={cargar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
