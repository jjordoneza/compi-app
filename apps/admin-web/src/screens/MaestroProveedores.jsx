import { useEffect, useState } from 'react';
import { listarProveedoresMaestro, crearProveedorMaestro, actualizarProveedorMaestro, listarStatsPorProveedor } from '../api';
import { BARRIOS_MEDELLIN } from '../constants';

const CATEGORIAS = [
  'Huevos', 'Lácteos', 'Bebidas', 'Snacks', 'Aseo',
  'Panadería', 'Carnes', 'Granos y abarrotes', 'Cigarrería', 'Verduras y frutas',
];

const NIVELES_SERVICIO = [
  { value: 'personal', label: 'Personal (WhatsApp)' },
  { value: 'compi', label: 'Compi (panel)' },
  { value: 'enterprise', label: 'Enterprise (API)' },
];

// Proxy de "calidad" por volumen en la red (sin señales reales de calidad
// todavía) — umbrales provisionales, recalibrables sin tocar el backend.
function etiquetaAdopcion(nTiendasActivas) {
  if (nTiendasActivas >= 5) return { texto: 'Alta adopción', clase: 'pillAlta' };
  if (nTiendasActivas >= 2) return { texto: 'Adopción media', clase: 'pillMedia' };
  return { texto: 'Nuevo / baja adopción', clase: 'pillBaja' };
}

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

function FilaProveedor({ item, stats, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(item.nombre || '');
  const [categorias, setCategorias] = useState(
    (item.categoria || '').split(',').map((c) => c.trim()).filter(Boolean)
  );
  const [nivelServicio, setNivelServicio] = useState(item.nivel_servicio || 'personal');
  const [barrio, setBarrio] = useState(item.barrio || '');
  const [ciudad, setCiudad] = useState(item.ciudad || '');
  const [direccion, setDireccion] = useState(item.direccion || '');
  const [contactoNombre, setContactoNombre] = useState(item.contacto_nombre || '');
  const [telefonoSecundario, setTelefonoSecundario] = useState(item.telefono_secundario || '');
  const [zonasCobertura, setZonasCobertura] = useState(item.zonas_cobertura || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function toggle(cat) {
    setCategorias((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  function cancelar() {
    setNombre(item.nombre || '');
    setCategorias((item.categoria || '').split(',').map((c) => c.trim()).filter(Boolean));
    setNivelServicio(item.nivel_servicio || 'personal');
    setBarrio(item.barrio || '');
    setCiudad(item.ciudad || '');
    setDireccion(item.direccion || '');
    setContactoNombre(item.contacto_nombre || '');
    setTelefonoSecundario(item.telefono_secundario || '');
    setZonasCobertura(item.zonas_cobertura || '');
    setError('');
    setEditando(false);
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      await actualizarProveedorMaestro(item.id, {
        nombre: nombre.trim(),
        categoria: categorias.join(', '),
        nivel_servicio: nivelServicio,
        barrio: barrio.trim() || null,
        ciudad: ciudad.trim() || null,
        direccion: direccion.trim() || null,
        contacto_nombre: contactoNombre.trim() || null,
        telefono_secundario: telefonoSecundario.trim() || null,
        zonas_cobertura: zonasCobertura.trim() || null,
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
      <td>
        {editando ? <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} /> : item.ciudad || <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>
      <td>
        {editando ? <input list="barrios-list" value={barrio} onChange={(e) => setBarrio(e.target.value)} /> : item.barrio || <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>
      <td>
        {editando ? <input value={direccion} onChange={(e) => setDireccion(e.target.value)} /> : item.direccion || <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>
      <td>
        {editando ? <input value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} /> : item.contacto_nombre || <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>
      <td>{item.telefono || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
      <td>
        {editando ? <input value={telefonoSecundario} onChange={(e) => setTelefonoSecundario(e.target.value)} /> : item.telefono_secundario || <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>
      <td style={{ minWidth: 180 }}>
        {editando ? (
          <input
            placeholder="Ej. Belén, Laureles"
            value={zonasCobertura}
            onChange={(e) => setZonasCobertura(e.target.value)}
          />
        ) : (
          item.zonas_cobertura || <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td className="mono">{stats?.n_productos ?? 0}</td>
      <td className="mono">{stats?.n_pedidos ?? 0}</td>
      <td>
        {(() => {
          const { texto, clase } = etiquetaAdopcion(stats?.n_tiendas_activas ?? 0);
          return <span className={clase}>{texto}</span>;
        })()}
      </td>
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

export default function MaestroProveedores() {
  const [proveedores, setProveedores] = useState(null);
  const [stats, setStats] = useState({}); // proveedor_id -> { n_productos, n_pedidos }
  const [error, setError] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [categoriasNuevo, setCategoriasNuevo] = useState([]);
  const [ciudadNuevo, setCiudadNuevo] = useState('');
  const [barrioNuevo, setBarrioNuevo] = useState('');
  const [direccionNuevo, setDireccionNuevo] = useState('');
  const [creando, setCreando] = useState(false);
  const [mostrarCrear, setMostrarCrear] = useState(false);

  async function cargar() {
    try {
      const [lista, statsLista] = await Promise.all([listarProveedoresMaestro(), listarStatsPorProveedor()]);
      setProveedores(lista);
      setStats(Object.fromEntries(statsLista.map((s) => [s.proveedor_id, s])));
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
      await crearProveedorMaestro({
        nombre: nombreNuevo.trim(),
        categoria: categoriasNuevo.join(', '),
        ciudad: ciudadNuevo.trim() || null,
        barrio: barrioNuevo.trim() || null,
        direccion: direccionNuevo.trim() || null,
      });
      setNombreNuevo('');
      setCategoriasNuevo([]);
      setCiudadNuevo('');
      setBarrioNuevo('');
      setDireccionNuevo('');
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
      <datalist id="barrios-list">
        {BARRIOS_MEDELLIN.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

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
          <input
            placeholder="Ciudad"
            value={ciudadNuevo}
            onChange={(e) => setCiudadNuevo(e.target.value)}
            style={{ marginTop: 10, marginBottom: 10, width: '100%', maxWidth: 320 }}
          />
          <input
            list="barrios-list"
            placeholder="Barrio"
            value={barrioNuevo}
            onChange={(e) => setBarrioNuevo(e.target.value)}
            style={{ marginBottom: 10, width: '100%', maxWidth: 320 }}
          />
          <input
            placeholder="Dirección"
            value={direccionNuevo}
            onChange={(e) => setDireccionNuevo(e.target.value)}
            style={{ marginBottom: 10, width: '100%', maxWidth: 320 }}
          />
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
                <th>Ciudad</th>
                <th>Barrio</th>
                <th>Dirección</th>
                <th>Contacto</th>
                <th>Celular</th>
                <th>Celular 2</th>
                <th>Zonas de cobertura (manual)</th>
                <th># productos</th>
                <th># pedidos</th>
                <th>Adopción</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((item) => (
                <FilaProveedor key={item.id} item={item} stats={stats[item.id]} onGuardado={cargar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
