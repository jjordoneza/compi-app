import { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import InicioScreen from './InicioScreen';
import PedidosTabScreen from './PedidosTabScreen';
import ProveedoresTabScreen from './ProveedoresTabScreen';
import PerfilScreen from './PerfilScreen';
import { useComercioActual } from '../../comercioActual';
import { COLORS } from '../../theme';

const Tab = createBottomTabNavigator();

function Icono({ emoji, color }) {
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

export default function TabNavigator({ route }) {
  const { comercioId, comercioNombre } = route.params || {};
  const { setComercioActual } = useComercioActual();

  // Sincroniza el Context al entrar/reentrar a Home (incluido "Cambiar negocio",
  // que remonta todo con un comercioId distinto). De aquí en adelante, las
  // pantallas leen el nombre del Context, no de este initialParams congelado.
  useEffect(() => {
    setComercioActual({ comercioId, comercioNombre });
  }, [comercioId, comercioNombre, setComercioActual]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: { borderTopColor: COLORS.borderLight },
      }}
    >
      <Tab.Screen
        name="InicioTab"
        component={InicioScreen}
        initialParams={{ comercioId, comercioNombre }}
        options={{ title: 'Inicio', tabBarIcon: ({ color }) => <Icono emoji="🏠" color={color} /> }}
      />
      <Tab.Screen
        name="PedidosTab"
        component={PedidosTabScreen}
        initialParams={{ comercioId, comercioNombre }}
        options={{ title: 'Pedidos', tabBarIcon: ({ color }) => <Icono emoji="📋" color={color} /> }}
      />
      <Tab.Screen
        name="ProveedoresTab"
        component={ProveedoresTabScreen}
        initialParams={{ comercioId, comercioNombre }}
        options={{ title: 'Proveedores', tabBarIcon: ({ color }) => <Icono emoji="👥" color={color} /> }}
      />
      <Tab.Screen
        name="PerfilTab"
        component={PerfilScreen}
        initialParams={{ comercioId, comercioNombre }}
        options={{ title: 'Perfil', tabBarIcon: ({ color }) => <Icono emoji="⚙️" color={color} /> }}
      />
    </Tab.Navigator>
  );
}