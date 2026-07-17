import { useEffect, useState } from 'react';
import { listarProveedoresMaestro, crearProveedorMaestro, actualizarProveedorMaestro } from '../api';

const CATEGORIAS = [
  'Huevos', 'Lácteos', 'Bebidas', 'Snacks', 'Aseo',
  'Panadería', 'Carnes', 'Granos y abarrotes', 'Cigarrería', 'Verduras y frutas',
];

const NIVELES_SERVICIO = [
  { value: 'personal', label: 'Personal (WhatsApp)' },
  { value: 'compi', label: 'Compi (panel)' },
  { value: 'enterprise', label: 'Enterprise (API)' },
];

function Chips({ opciones, seleccion, onToggle }) {
  return (
    <div className="chipsContainer">
      {opciones.map((op) => {
        const activo = seleccion.includes(op);
        return (
          <button key={op} type="button" className={activo ? 'chip chipActivo' : 'chip'} onClick={() => onToggle(op)}>
            {activo ? '✓ ' : ''}
            {op}
          </button>
        );
      })}
    </div>
  );
}

function FilaProveedor({ item, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(item.nombre || '');
  const [categorias, setCategorias] = useState(
    (item.categoria || '').split(',').map((c) => c.trim()).filter(Boolean)
  );
  const [nivelServicio, setNivelServicio] = useState(item.nivel_servicio || 'personal');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function toggle(cat) {
    setCategorias((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      await actualizarProveedorMaestro(item.id, {
        nombre: nombre.trim(),
        categoria: categorias.join(', '),
        nivel_servicio: nivelServicio,
      });
      setEditando(false);
      await onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <tr>
      <td>{editando ? <input value={nombre} onChange={(e) => setNombre(e.target.value)} /> : item.nombre}</td>
      <td style={{ minWidth: 260 }}>
        {editando ? (
          <Chips opciones={CATEGORIAS} seleccion={categorias} onToggle={toggle} />
        ) : (
          item.categoria || <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td>
        {editando ? (
          <select value={nivelServicio} onChange={(e) => setNivelServicio(e.target.value)}>
            {NIVELES_SERVICIO.map((n) => (
              <option key={n.value} value={n.value}>{n.label}</option>
            ))}
          </select>
        ) : (
          NIVELES_SERVICIO.find((n) => n.value === item.nivel_servicio)?.label || 'Personal (WhatsApp)'
        )}
      </td>
      <td className="acciones-cell">
        {error && <span className="error">{error}</span>}
        {editando ? (
          <>
            <button type="button" className="gridBoton" disabled={guardando} onClick={guardar}>
              {guardando ? '...' : 'Guardar'}
            </button>
            <button type="button" className="gridBoton secundario" disabled={guardando} onClick={() => setEditando(false)}>
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

export default function MaestroProveedores() {
  const [proveedores, setProveedores] = useState(null);
  const [error, setError] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [categoriasNuevo, setCategoriasNuevo] = useState([]);
  const [creando, setCreando] = useState(false);
  const [mostrarCrear, setMostrarCrear] = useState(false);

  async function cargar() {
    try {
      setProveedores(await listarProveedoresMaestro());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function toggleNuevaCategoria(cat) {
    setCategoriasNuevo((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function crear() {
    if (!nombreNuevo.trim()) return;
    setCreando(true);
    setError('');
    try {
      await crearProveedorMaestro({ nombre: nombreNuevo.trim(), categoria: categoriasNuevo.join(', ') });
      setNombreNuevo('');
      setCategoriasNuevo([]);
      setMostrarCrear(false);
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  }

  if (proveedores === null) return error ? <p className="error">{error}</p> : <p className="ayuda">Cargando...</p>;

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <div style={{ marginBottom: 14 }}>
        <button type="button" className="gridBoton" style={{ height: 34 }} onClick={() => setMostrarCrear((v) => !v)}>
          {mostrarCrear ? 'Cancelar' : '+ Crear nuevo'}
        </button>
      </div>

      {mostrarCrear && (
        <div className="chartCard">
          <input
            placeholder="Nombre"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            style={{ marginBottom: 10, width: '100%', maxWidth: 320 }}
          />
          <Chips opciones={CATEGORIAS} seleccion={categoriasNuevo} onToggle={toggleNuevaCategoria} />
          <button
            type="button"
            disabled={creando || !nombreNuevo.trim()}
            onClick={crear}
            style={{ marginTop: 12, maxWidth: 200 }}
          >
            {creando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}

      {proveedores.length === 0 ? (
        <p className="vacio">Nada creado todavía.</p>
      ) : (
        <div className="gridWrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categorías</th>
                <th>Nivel de servicio</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((item) => (
                <FilaProveedor key={item.id} item={item} onGuardado={cargar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
