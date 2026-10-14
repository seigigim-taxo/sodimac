/*
 * Lo que interesa saber de un payload YA GUARDADO en la cola, sin tener que
 * volver a armarlo desde las lecturas.
 *
 * Sirve para dos cosas al resolver un envío contra lo que dice el servidor:
 *   - comparar cuántas lecturas tiene la PDA con las que tiene el servidor;
 *   - comprobar que el identificador que el servidor tiene corresponde al MISMO
 *     TAG (tienda, TAG, iteración y agenda), y no a otro que casualmente
 *     comparta el uid.
 *
 * Se lee del texto guardado y no de las tablas de conteo: lo que el servidor
 * recibió —o pudo recibir— es ese payload, aunque las filas locales hayan
 * cambiado después.
 */
export interface ResumenPayload {
  codigoTienda: string | null;
  tagCodigo: string | null;
  iteracion: number | null;
  numeroAgenda: string | null;
  totalProductos: number;
  totalLecturas: number;
}

const texto = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

const numero = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** null si no hay payload o no se puede leer. */
export function resumirPayload(payloadJson: string | null): ResumenPayload | null {
  if (!payloadJson) return null;

  let crudo: unknown;
  try {
    crudo = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (crudo === null || typeof crudo !== 'object') return null;

  const p = crudo as Record<string, unknown>;
  const detalles = Array.isArray(p['detalles']) ? (p['detalles'] as unknown[]) : [];

  let totalLecturas = 0;
  for (const d of detalles) {
    const lecturas = d !== null && typeof d === 'object' ? (d as Record<string, unknown>)['lecturas'] : null;
    if (Array.isArray(lecturas)) totalLecturas += lecturas.length;
  }

  return {
    codigoTienda: texto(p['codigo_tienda']),
    tagCodigo: texto(p['tag_codigo']),
    iteracion: numero(p['iteracion']),
    numeroAgenda: texto(p['numero_agenda']),
    totalProductos: detalles.length,
    totalLecturas,
  };
}

/*
 * ¿Es el MISMO contenido? Compara las lecturas —su identificador y su cantidad—
 * de dos payloads, sin mirar nada más: la versión de la app, por ejemplo, puede
 * ser distinta entre un envío y su reintento y no por eso el TAG cambió.
 *
 * Responde:
 *   true   las mismas lecturas con las mismas cantidades, en cualquier orden.
 *   false  se agregó, quitó o cambió alguna.
 *   null   no se puede saber porque uno de los dos no se puede leer. Quien llama
 *          decide qué hacer con la duda; aquí no se inventa una respuesta.
 *
 * Existe como red de seguridad: si un TAG cambia después de un envío que el
 * servidor tiene o pudo haber recibido, esos cambios no viajan, y darlo por
 * enviado dejaría datos solo en la PDA sin avisar.
 */
export function mismoContenido(a: string | null, b: string | null): boolean | null {
  const firmaA = firmaDeLecturas(a);
  const firmaB = firmaDeLecturas(b);
  if (firmaA === null || firmaB === null) return null;
  return firmaA === firmaB;
}

function firmaDeLecturas(payloadJson: string | null): string | null {
  if (!payloadJson) return null;

  let crudo: unknown;
  try {
    crudo = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (crudo === null || typeof crudo !== 'object') return null;

  const detalles = (crudo as Record<string, unknown>)['detalles'];
  const lecturas: string[] = [];

  for (const d of Array.isArray(detalles) ? detalles : []) {
    const ls = d !== null && typeof d === 'object' ? (d as Record<string, unknown>)['lecturas'] : null;
    if (!Array.isArray(ls)) continue;

    for (const l of ls) {
      const f = l !== null && typeof l === 'object' ? (l as Record<string, unknown>) : {};
      lecturas.push(`${String(f['lectura_uid'] ?? '')}|${Number(f['cantidad'])}`);
    }
  }

  return lecturas.sort().join('\n');
}
