import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './screens/Login';
import ProveedoresNuevos from './screens/ProveedoresNuevos';
import ProductosNuevos from './screens/ProductosNuevos';
import CambiosPendientes from './screens/CambiosPendientes';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [esAdmin, setEsAdmin] = useState(null);
  const [tab, setTab] = useState('proveedores');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setEsAdmin(null);
      return;
    }
    supabase.rpc('is_admin').then(({ data, error }) => setEsAdmin(!error && data === true));
  }, [session]);

  if (session === undefined) return <div className="centro">Cargando...</div>;
  if (!session) return <Login />;
  if (esAdmin === null) return <div className="centro">Verificando acceso...</div>;

  if (!esAdmin) {
    return (
      <div className="centro">
        <p>Esta cuenta no tiene permisos de administrador.</p>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Compi admin</h1>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </header>
      <nav className="tabs">
        <button type="button" className={tab === 'proveedores' ? 'activo' : ''} onClick={() => setTab('proveedores')}>
          Proveedores nuevos
        </button>
        <button type="button" className={tab === 'productos' ? 'activo' : ''} onClick={() => setTab('productos')}>
          Productos nuevos
        </button>
        <button type="button" className={tab === 'cambios' ? 'activo' : ''} onClick={() => setTab('cambios')}>
          Cambios pendientes
        </button>
      </nav>
      <main>
        {tab === 'proveedores' && <ProveedoresNuevos />}
        {tab === 'productos' && <ProductosNuevos />}
        {tab === 'cambios' && <CambiosPendientes />}
      </main>
    </div>
  );
}
