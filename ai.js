const ANTHROPIC_API_KEY = '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'; // tu llave sk-ant-... ya configurada

export async function detectarProveedores(nombresContactos) {
  const prompt = `Eres un asistente que ayuda a un tendero (dueño de una tienda de barrio en Colombia) a identificar cuáles de sus contactos de celular son probablemente proveedores de su negocio (personas que le venden productos: huevos, bebidas, aseo, panadería, etc.), y no amigos, familia u otros contactos.

Aquí está la lista de nombres de contacto:
${nombresContactos.map((n) => `- ${n}`).join('\n')}

Para cada contacto, responde si es probablemente un proveedor y, si lo es, en qué categoría (elige una: Huevos, Lácteos, Bebidas, Snacks, Aseo, Panadería, Carnes, Granos y abarrotes, Cigarrería, Verduras y frutas, Otro).

Responde ÚNICAMENTE con un JSON válido, sin texto adicional ni explicación, con este formato exacto:
[{"nombre": "...", "esProveedor": true, "categoria": "..."}, ...]`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Error llamando a la IA');
  }

  const texto = data.content?.[0]?.text || '[]';
  const limpio = texto.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(limpio);
}

export async function extraerProductosDePedido(textoPedido) {
  const prompt = `Eres un asistente que ayuda a un tendero colombiano a digitalizar un pedido que le escribió a su proveedor por WhatsApp.

Aquí está el texto del pedido, tal como lo escribió (puede tener errores, jerga o abreviaturas):
"${textoPedido}"

Identifica cada producto mencionado, con su cantidad y una presentación normalizada.

MUY IMPORTANTE: la presentación debe seguir el mismo estilo que ya usamos en nuestro catálogo. Usa exactamente uno de estos formatos, el que mejor aplique, adaptando solo el número cuando haga falta:
- "Canasta x30" (huevos)
- "Six pack" (bebidas en paquete de 6)
- "Botella 1.5L", "Botella 600ml", "Botella 400ml" (líquidos embotellados — normaliza "litro y medio" a "1.5L", "un litro" a "1L", etc.)
- "Bolsa 1L", "Bolsa 500g", "Bolsa 1kg" (líquidos o sólidos en bolsa)
- "Libra", "Kilo" (peso)
- "Paquete", "Paquete x4", "Caja", "Caja x12", "Caja x20" (empaques)
- "Unidad" (si se pide una sola pieza, o si no aplica ninguno de los anteriores)

Convierte SIEMPRE medidas escritas en palabras a número + unidad (ej. "litro y medio" → "1.5L", "media libra" → "0.5 Libra", "una docena" → cantidad 12, presentación "Unidad").

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto:
[{"nombre": "...", "cantidad": 0, "presentacion": "..."}, ...]`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Error llamando a la IA');
  }

  const texto = data.content?.[0]?.text || '[]';
  const limpio = texto.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(limpio);
}