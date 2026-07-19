// Umbrales de alerta visual del dashboard. Separados a propósito — no son el
// mismo número por coincidencia, se ajustan de forma independiente si hace falta.
export const UMBRAL_ALERTA_CURADURIA_DIAS = 3;
export const UMBRAL_ALERTA_SENALES_NEGATIVAS = 3;

// Lista de apoyo para el datalist de "barrio" en Maestro negocios/proveedores
// — misma lista que constants.js del lado RN (nombrada por separado, no
// compartida entre apps). NO es exhaustiva ni oficial, ni se valida contra
// ella: el campo sigue siendo texto libre, solo sugiere.
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

// Lista de apoyo para el datalist de "ciudad" — misma lista que constants.js
// del lado RN (nombrada por separado). NO es exhaustiva ni oficial, no se
// valida contra ella, solo sugiere.
export const CIUDADES_COLOMBIA = [
  'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Cúcuta', 'Bucaramanga',
  'Pereira', 'Santa Marta', 'Ibagué', 'Pasto', 'Manizales', 'Neiva', 'Villavicencio',
  'Armenia', 'Valledupar', 'Montería', 'Sincelejo', 'Popayán', 'Tunja', 'Florencia',
  'Riohacha', 'Yopal', 'Quibdó', 'Arauca', 'Mocoa', 'San José del Guaviare',
  'Puerto Carreño', 'Leticia', 'Inírida', 'Mitú', 'San Andrés',
  'Soledad', 'Bello', 'Itagüí', 'Envigado', 'Sabaneta', 'La Estrella', 'Caldas',
  'Copacabana', 'Girardota', 'Barbosa', 'Rionegro', 'Soacha', 'Chía', 'Zipaquirá',
  'Facatativá', 'Fusagasugá', 'Girardot', 'Palmira', 'Buenaventura', 'Tuluá',
  'Cartago', 'Buga', 'Jamundí', 'Yumbo', 'Dosquebradas', 'Magangué', 'Turbo',
  'Apartadó', 'Sahagún', 'Ciénaga', 'Maicao', 'Tumaco', 'Ipiales', 'Duitama',
  'Sogamoso', 'Chiquinquirá', 'Barrancabermeja', 'Piedecuesta', 'Floridablanca',
  'Girón', 'Ocaña', 'Pitalito', 'Garzón', 'La Dorada', 'Chinchiná', 'Espinal',
  'Honda', 'Aguachica',
];
