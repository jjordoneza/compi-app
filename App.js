import { useEffect } from 'react';
import { TouchableOpacity, Text, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { refrescarSiHaceFalta } from './auth';
import SplashScreen from './screens/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import VerificacionScreen from './screens/VerificacionScreen';
import RegistroNegocioScreen from './screens/RegistroNegocioScreen';
import ImportarContactosScreen from './screens/ImportarContactosScreen';
import OnboardingProveedoresScreen from './screens/OnboardingProveedoresScreen';
import SeleccionarNegocioScreen from './screens/SeleccionarNegocioScreen';
import TabNavigator from './screens/tendero/TabNavigator';
import CatalogoMaestroScreen from './screens/CatalogoMaestroScreen';
import MiNegocioScreen from './screens/MiNegocioScreen';
import RelacionesScreen from './screens/RelacionesScreen';
import RelacionDetalleScreen from './screens/RelacionDetalleScreen';
import NuevoAbastecimientoScreen from './screens/NuevoAbastecimientoScreen';
import ConfirmarPedidoScreen from './screens/tendero/ConfirmarPedidoScreen';
import MiNegocioTenderoScreen from './screens/tendero/MiNegocioTenderoScreen';
import PedidoEnviadoScreen from './screens/tendero/PedidoEnviadoScreen';
import SeguimientoScreen from './screens/tendero/SeguimientoScreen';
import ReabastecimientoRespuestaScreen from './screens/tendero/ReabastecimientoRespuestaScreen';
import AgregarProveedorScreen from './screens/tendero/AgregarProveedorScreen';
import PegarPedidoScreen from './screens/PegarPedidoScreen';
import PedidosAdminScreen from './screens/PedidosAdminScreen';
import SugerenciasCambioScreen from './screens/SugerenciasCambioScreen';
import { COLORS } from './theme';

const Stack = createNativeStackNavigator();

function BotonVolver({ navigation }) {
  return (
    <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingVertical: 6, paddingRight: 12 }}>
      <Text style={{ color: COLORS.primary, fontSize: 16, fontWeight: '500' }}>‹ Atrás</Text>
    </TouchableOpacity>
  );
}

function BotonAlInicio({ navigation, route }) {
  const { comercioId, comercioNombre } = route.params || {};
  return (
    <TouchableOpacity
      onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home', params: { comercioId, comercioNombre } }] })}
      style={{ paddingVertical: 6, paddingRight: 12 }}
    >
      <Text style={{ color: COLORS.primary, fontSize: 16, fontWeight: '500' }}>‹ Inicio</Text>
    </TouchableOpacity>
  );
}

// El access_token vive ~1h. cargarSesion() lo refresca solo una vez, al abrir la
// app — una sesión larga sin reiniciar (o que vuelve de background) podía quedarse
// con un token vencido, y bajo RLS eso no da error: PostgREST simplemente no
// devuelve filas, así que datos que sí existen "desaparecen" de la UI en silencio.
// Este intervalo + el listener de AppState mantienen el token vigente durante el uso.
const INTERVALO_REFRESCO_MS = 4 * 60 * 1000;

function useRefrescoSesion() {
  useEffect(() => {
    const intervalo = setInterval(() => { refrescarSiHaceFalta(); }, INTERVALO_REFRESCO_MS);
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') refrescarSiHaceFalta();
    });
    return () => {
      clearInterval(intervalo);
      suscripcion.remove();
    };
  }, []);
}

export default function App() {
  useRefrescoSesion();

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: true,
            headerTitleStyle: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
            headerStyle: { backgroundColor: COLORS.white },
          }}
        >
          <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Verificacion" component={VerificacionScreen} options={{ headerShown: false }} />
          <Stack.Screen name="RegistroNegocio" component={RegistroNegocioScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ImportarContactos" component={ImportarContactosScreen} options={{ headerShown: false }} />
          <Stack.Screen name="OnboardingProveedores" component={OnboardingProveedoresScreen} options={{ headerShown: false }} />
          <Stack.Screen name="SeleccionarNegocio" component={SeleccionarNegocioScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Home" component={TabNavigator} options={{ headerShown: false }} />
          <Stack.Screen
            name="NuevoAbastecimiento"
            component={NuevoAbastecimientoScreen}
            options={({ navigation }) => ({ title: 'Nuevo pedido', headerLeft: () => <BotonVolver navigation={navigation} /> })}
          />
          <Stack.Screen
            name="ConfirmarPedido"
            component={ConfirmarPedidoScreen}
            options={({ navigation }) => ({ title: 'Confirmar', headerLeft: () => <BotonVolver navigation={navigation} /> })}
          />
          <Stack.Screen
            name="MiNegocioTendero"
            component={MiNegocioTenderoScreen}
            options={({ navigation }) => ({ title: 'Mi negocio', headerLeft: () => <BotonVolver navigation={navigation} /> })}
          />
          <Stack.Screen name="PedidoEnviado" component={PedidoEnviadoScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="Seguimiento"
            component={SeguimientoScreen}
            options={({ navigation, route }) => ({ title: 'Seguimiento', headerLeft: () => <BotonAlInicio navigation={navigation} route={route} /> })}
          />
          <Stack.Screen name="RespuestaReabastecimiento" component={ReabastecimientoRespuestaScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="AgregarProveedor"
            component={AgregarProveedorScreen}
            options={({ navigation }) => ({ title: 'Agregar proveedor', headerLeft: () => <BotonVolver navigation={navigation} /> })}
          />
          <Stack.Screen
            name="PegarPedido"
            component={PegarPedidoScreen}
            options={({ navigation }) => ({ title: 'Pegar pedido', headerLeft: () => <BotonVolver navigation={navigation} /> })}
          />
          <Stack.Screen
            name="CatalogoMaestro"
            component={CatalogoMaestroScreen}
            options={({ navigation }) => ({ title: 'Catálogo Maestro', headerLeft: () => <BotonVolver navigation={navigation} /> })}
          />
          <Stack.Screen
            name="MiNegocio"
            component={MiNegocioScreen}
            options={({ navigation }) => ({ title: 'Mi Negocio', headerLeft: () => <BotonVolver navigation={navigation} /> })}
          />
          <Stack.Screen
            name="Relaciones"
            component={RelacionesScreen}
            options={({ navigation }) => ({ title: 'Proveedores', headerLeft: () => <BotonVolver navigation={navigation} /> })}
          />
          <Stack.Screen
            name="RelacionDetalle"
            component={RelacionDetalleScreen}
            options={({ navigation }) => ({ title: 'Productos', headerLeft: () => <BotonVolver navigation={navigation} /> })}
          />
          <Stack.Screen
            name="PedidosAdmin"
            component={PedidosAdminScreen}
            options={({ navigation }) => ({ title: 'Pedidos (todos)', headerLeft: () => <BotonVolver navigation={navigation} /> })}
          />
          <Stack.Screen
            name="SugerenciasCambio"
            component={SugerenciasCambioScreen}
            options={({ navigation }) => ({ title: 'Sugerencias', headerLeft: () => <BotonVolver navigation={navigation} /> })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
