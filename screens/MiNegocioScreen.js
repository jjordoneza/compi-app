import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Comercios } from '../supabase';
import { COLORS, RADIUS } from '../theme';

export default function MiNegocioScreen({ navigation }) {
  const [comercios, setComercios] = useState([]);
  const [nombre, setNombre] = useState('');
  const [barrio, setBarrio] = useState('');

  async function cargar() {
    try {
      setComercios(await Comercios.listar());
    } catch (e) {
      Alert.alert('Error cargando', e.message);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!nombre.trim()) return;
    try {
      await Comercios.crear({ nombre, barrio, proveedores_totales: 0 });
      setNombre('');
      setBarrio('');
      cargar();
    } catch (e) {
      Alert.alert('Error guardando', e.message);
    }
  }

  function confirmarEliminar(item) {
  Alert.alert(
    'Eliminar negocio',
    `¿Seguro que quieres eliminar "${item.nombre}"? Esto también elimina sus proveedores vinculados y los precios pactados con ellos. No se puede deshacer.`,
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => eliminar(item.id) },
    ]
  );
}

  async function eliminar(id) {
    try {
      await Comercios.eliminar(id);
      cargar();
    } catch (e) {
      Alert.alert('Error eliminando', e.message);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.titulo}>Mis negocios</Text>
        <Text style={styles.subtitulo}>Crea tu negocio o toca uno para gestionar sus proveedores</Text>

        <TextInput style={styles.input} placeholder="Nombre del negocio" value={nombre} onChangeText={setNombre} />
        <TextInput style={styles.input} placeholder="Barrio" value={barrio} onChangeText={setBarrio} />
        <TouchableOpacity style={styles.boton} onPress={crear}>
          <Text style={styles.botonTexto}>Crear negocio</Text>
        </TouchableOpacity>

        <View style={{ marginTop: 16 }}>
          {[...comercios].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <TouchableOpacity
                style={styles.item}
                onPress={() => navigation.navigate('Relaciones', { comercioId: item.id, comercioNombre: item.nombre })}
              >
                <Text style={styles.itemNombre}>{item.nombre}</Text>
                <Text style={styles.itemSub}>{item.barrio || 'Sin barrio'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.botonEliminar} onPress={() => confirmarEliminar(item)}>
                <Text style={styles.botonEliminarTexto}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 18, paddingTop: 20 },
  titulo: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  subtitulo: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 14 },
  input: { height: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 10 },
  boton: { height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: COLORS.white, fontWeight: '600' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  item: { flex: 1, backgroundColor: COLORS.white, padding: 14, borderRadius: RADIUS.md, borderWidth: 0.5, borderColor: COLORS.borderLight },
  itemNombre: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  itemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  botonEliminar: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: RADIUS.sm, backgroundColor: '#FBEAEA' },
  botonEliminarTexto: { color: COLORS.error, fontSize: 12, fontWeight: '600' },
});