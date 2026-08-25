import { Zona } from '../models/zona.model';

/*
 * Resolución de la zona a partir del número de TAG.
 *
 * El rango (tag_desde / tag_hasta) ya venía del WS y ya se usaba, pero al
 * revés: servía para validar el TAG contra la zona que el operador había
 * elegido a mano. Acá se invierte la dirección — el rango DERIVA la zona — y
 * con eso el operador deja de elegirla.
 *
 * Es una regla de negocio, no de pantalla: vive en el dominio y se prueba sin
 * Angular ni SQLite.
 */

/*
 * Los tres desenlaces se distinguen porque el operador tiene que hacer cosas
 * distintas en cada uno, y meterlos todos en `null` lo dejaría adivinando:
 *
 *  - SIN_RANGOS       → ninguna zona de la tienda tiene rango configurado. Es un
 *                       problema de datos del WS; el operador no puede resolverlo
 *                       reintentando y hay que avisarle a un supervisor.
 *  - SIN_COINCIDENCIA → hay rangos, pero este TAG no cae en ninguno. Lo más
 *                       probable es un error de tipeo, y ahí sí puede corregir.
 *  - RESUELTA         → se encontró la zona.
 */
export type ResolucionZona =
  | { estado: 'RESUELTA'; zona: Zona }
  | { estado: 'SIN_COINCIDENCIA' }
  | { estado: 'SIN_RANGOS' };

/* Una zona solo participa si tiene el rango completo: media cota no acota nada. */
export function tieneRango(zona: Zona): boolean {
  return zona.tagDesde !== null && zona.tagHasta !== null;
}

export function contieneTag(zona: Zona, tag: number): boolean {
  if (!tieneRango(zona)) return false;
  // Ambos extremos incluidos: el rango se define en términos del operador
  // ("del 1000 al 1999"), no como intervalo semiabierto.
  return tag >= (zona.tagDesde as number) && tag <= (zona.tagHasta as number);
}

/*
 * `tag` llega como el texto que se tipeó o escaneó. La pantalla ya exige que
 * sea numérico antes de llamar acá, pero igual se valida: esta función es la
 * dueña de la regla y no puede depender de que alguien haya validado antes.
 */
export function resolverZonaPorTag(tag: string, zonas: readonly Zona[]): ResolucionZona {
  const conRango = zonas.filter(tieneRango);
  if (conRango.length === 0) return { estado: 'SIN_RANGOS' };

  const numero = Number(tag.trim());
  if (!Number.isInteger(numero)) return { estado: 'SIN_COINCIDENCIA' };

  const zona = conRango.find((z) => contieneTag(z, numero));
  return zona ? { estado: 'RESUELTA', zona } : { estado: 'SIN_COINCIDENCIA' };
}

/*
 * Pares de zonas cuyos rangos se pisan. Hoy no debería haber ninguno —el
 * cliente confirmó que los rangos no se superponen— y justamente por eso vale
 * la pena mirarlo: si algún día el WS manda datos superpuestos, la derivación
 * empieza a devolver la primera que encuentra y nadie se entera. Esto lo hace
 * visible en vez de silencioso.
 */
export function detectarSuperposiciones(zonas: readonly Zona[]): [Zona, Zona][] {
  const conRango = zonas.filter(tieneRango);
  const pares: [Zona, Zona][] = [];

  for (let i = 0; i < conRango.length; i++) {
    for (let j = i + 1; j < conRango.length; j++) {
      const a = conRango[i];
      const b = conRango[j];
      const sePisan =
        (a.tagDesde as number) <= (b.tagHasta as number) &&
        (b.tagDesde as number) <= (a.tagHasta as number);
      if (sePisan) pares.push([a, b]);
    }
  }

  return pares;
}
