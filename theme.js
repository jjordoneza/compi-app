export const COLORS = {
  primary: '#0E7C86',
  primaryDark: '#0A3D42',
  accent: '#FF8A5B',
  bg: '#F2F8F8',
  white: '#FFFFFF',
  text: '#0A3D42',
  textSecondary: '#6B6459',
  border: '#D9D6CE',
  borderLight: '#E5E4DF',
  success: '#2E7D5B',
  successBg: '#EAF3DE',
  warning: '#854F0B',
  warningBg: '#FAEEDA',
  error: '#A32D2D',
};

export const RADIUS = { sm: 10, md: 14, lg: 18, full: 999 };

export function formatMoney(valor) {
  if (valor == null) return '';
  return new Intl.NumberFormat('es-CO').format(valor);
}

// "Caja x24 · $50.000 ($2.083/unidad)" — null si no hay con qué calcularlo
// (factor_conversion ausente o 1, o sin precio). factor_conversion=1 no
// genera texto porque presentación y unidad_base ya coinciden 1 a 1.
export function textoPrecioUnitario(precio, factorConversion) {
  if (precio == null || !factorConversion || factorConversion <= 1) return null;
  return `$${formatMoney(Math.round(precio / factorConversion))}/unidad`;
}