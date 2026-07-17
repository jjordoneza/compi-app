import { useState } from 'react';

// Compartido entre Proveedores nuevos y Productos nuevos: buscar si ya existe
// en el catálogo maestro antes de crear uno nuevo. `buscar` usa las RPCs de
// similitud (pg_trgm, migración 0025) — este componente no sabe ni le
// importa cómo busca, solo renderiza lo que le llega.
export default function AprobacionPanel({ buscar, onAprobar, onRechazar, renderMatch }) {
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [mostrarRechazo, setMostrarRechazo] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  async function onChangeQuery(valor) {
    setQuery(valor);
    setSeleccionado(null);
    if (!valor.trim()) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    try {
      setResultados(await buscar(valor));
    } catch (e) {
      setError(e.message);
    } finally {
      setBuscando(false);
    }
  }

  async function aprobar() {
    setError('');
    setProcesando(true);
    try {
      await onAprobar(seleccionado?.id ?? null);
    } catch (e) {
      setError(e.message);
      setProcesando(false);
    }
  }

  async function rechazar() {
    setError('');
    setProcesando(true);
    try {
      await onRechazar(motivo.trim() || null);
    } catch (e) {
      setError(e.message);
      setProcesando(false);
    }
  }

  return (
    <div className="panel">
      <p className="ayuda">¿Ya existe en el catálogo? Busca antes de crear uno nuevo.</p>
      <input
        placeholder="Buscar por nombre..."
        value={query}
        onChange={(e) => onChangeQuery(e.target.value)}
      />
      {buscando && <p className="ayuda">Buscando...</p>}
      {resultados.length > 0 && (
        <ul className="resultados">
          {resultados.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={seleccionado?.id === r.id ? 'match activo' : 'match'}
                onClick={() => setSeleccionado(r)}
              >
                {renderMatch(r)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="error">{error}</p>}

      <div className="acciones">
        <button type="button" className="aprobar" disabled={procesando} onClick={aprobar}>
          {procesando
            ? 'Procesando...'
            : seleccionado
              ? `Aprobar — vincular a "${renderMatch(seleccionado)}"`
              : 'Aprobar — crear nuevo'}
        </button>
        <button
          type="button"
          className="rechazar"
          disabled={procesando}
          onClick={() => setMostrarRechazo((v) => !v)}
        >
          Rechazar
        </button>
      </div>

      {mostrarRechazo && (
        <div className="rechazo">
          <input
            placeholder="Motivo (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <button type="button" disabled={procesando} onClick={rechazar}>
            {procesando ? 'Procesando...' : 'Confirmar rechazo'}
          </button>
        </div>
      )}
    </div>
  );
}
