// Umbrales de negocio ajustables — mismo patrón que apps/admin-web/src/constants.js
// (nombrados por separado, no compartidos por coincidencia de valor).

// Cuánto puede diferir un precio tecleado de la mediana de la red (en
// cualquier dirección) antes de mostrar un chequeo de sanidad suave.
export const UMBRAL_DESVIACION_PRECIO = 0.25;

// Después de cuántos días sin actualizar un precio se avisa que puede estar viejo.
export const UMBRAL_PRECIO_VIEJO_DIAS = 60;

// Lista de apoyo para autocompletar "barrio" (Registro de negocio, Crear
// proveedor) — NO es exhaustiva ni oficial (Medellín tiene ~250 barrios
// repartidos en 16 comunas) ni se valida contra ella: el campo sigue siendo
// texto libre, esto solo sugiere mientras el tendero escribe para reducir
// variantes de escritura del mismo barrio (ayuda al matching por barrio del
// motor de cobertura/patrón de día). Cubre los barrios más conocidos/densos.
export const BARRIOS_MEDELLIN = [
  'Popular', 'Santo Domingo Savio', 'Santa Cruz', 'Andalucía', 'Manrique Central',
  'Manrique Oriental', 'Campo Valdés', 'La Salle', 'Aranjuez', 'Berlín', 'Moravia',
  'Miranda', 'Palermo', 'Sevilla', 'Castilla', 'Tricentenario', 'Caribe',
  'Doce de Octubre', 'Kennedy', 'Pedregal', 'Picacho', 'Robledo', 'Pilarica',
  'El Volador', 'Aures', 'San Germán', 'Villa Hermosa', 'Enciso', 'Sucre',
  'La Ladera', 'Buenos Aires', 'Miraflores', 'La Milagrosa', 'Cataluña',
  'La Candelaria', 'Boston', 'Prado', 'Guayaquil', 'San Diego', 'Villa Nueva',
  'Corazón de Jesús', 'San Benito', 'Laureles', 'Estadio', 'Los Colores',
  'Conquistadores', 'Suramericana', 'Bolivariana', 'San Joaquín', 'La Castellana',
  'La América', 'Santa Lucía', 'La Floresta', 'Calasanz', 'Santa Teresita',
  'San Javier', 'El Salado', 'Belencito', 'Antonio Nariño', 'El Poblado', 'Manila',
  'Provenza', 'Astorga', 'Patio Bonito', 'El Tesoro', 'Los Balsos',
  'La Aguacatala', 'Santa María de los Ángeles', 'Altos del Poblado', 'Las Lomas',
  'Alejandría', 'Los Naranjos', 'San Lucas', 'Castropol', 'Lalinde',
  'Guayabal', 'Cristo Rey', 'Trinidad', 'Colombia', 'Belén', 'Cerro Nutibara',
  'Rosales', 'Fátima', 'Granada', 'San Bernardo', 'Las Playas', 'La Mota',
  'La Gloria', 'Altavista', 'Zafra', 'Los Alpes', 'Las Violetas',
  'Nueva Villa de Aburrá', 'Miravalle', 'La Hondonada',
];
