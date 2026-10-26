import { CatalogoZonificacion, ZonaZonificacion } from '../models/catalogo-zonificacion.model';
import { EstadoZonificacion } from '../models/estado-zonificacion.model';
import { IdRango } from '../models/rango-zonificacion.model';
import { VistaZonificacion } from '../models/vista-zonificacion.model';
import { mensajeZonificacion } from './mensajes-zonificacion.utils';
import { TAG_TOPE_ZONIFICACION, calcularCantidad, validarAnularTag, validarGuardarRango, zonaDelTag } from './reglas-zonificacion.utils';
import { rangosParaReglas } from './vista-con-pendientes.utils';
import { textoRango } from './filas-resumen.utils';

/*
 * Lo que el formulario le muestra al operador MIENTRAS escribe: la zona que se
 * detecta, cuántos TAG son y qué lo impide, sin esperar a apretar Guardar.
 *
 * Usa las mismas reglas que el WS (reglas-zonificacion), así que lo que aquí se
 * ve como válido el servidor lo acepta, salvo que otra PDA o el SGO hayan
 * cambiado la agenda mientras tanto.
 */

/* Un TAG tal como se escribe o se escanea: solo dígitos, entero positivo. null si no lo es. */
export function parsearTag(texto: string): number | null {
  const limpio = texto.trim();
  if (!/^\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export interface EntradaFormularioRango {
  /* Lo escrito en cada campo, tal cual. */
  desde: string;
  hasta: string;
  referencia: string;
  /* Rango que se está editando (se excluye de los cruces); null si es uno nuevo. */
  idRango: IdRango | null;
}

export interface ContextoFormularioRango {
  estado: EstadoZonificacion;
  catalogo: CatalogoZonificacion;
  vista: VistaZonificacion;
}

export interface EvaluacionFormularioRango {
  desde: number | null;
  hasta: number | null;
  /* La zona de `desde`, o null si todavía no se puede decir. */
  zona: ZonaZonificacion | null;
  /* Banda permitida de la zona, para mostrarla ("Rango permitido: 1000–2999"). */
  banda: string | null;
  /* TAG del rango, con los anulados ya descontados; null mientras no haya dos TAG válidos. */
  cantidad: number | null;
  /* Problema con el campo "desde" / "hasta" en particular. */
  errorDesde: string | null;
  errorHasta: string | null;
  /* Lo que impide guardar y no es de un solo campo (cruce, cantidad, referencia...). */
  bloqueo: string | null;
  /* Aviso que no impide guardar (cantidad alta). */
  advertencia: string | null;
  puedeGuardar: boolean;
}

const VACIA: EvaluacionFormularioRango = {
  desde: null,
  hasta: null,
  zona: null,
  banda: null,
  cantidad: null,
  errorDesde: null,
  errorHasta: null,
  bloqueo: null,
  advertencia: null,
  puedeGuardar: false,
};

export function evaluarFormularioRango(entrada: EntradaFormularioRango, ctx: ContextoFormularioRango): EvaluacionFormularioRango {
  const { zonas } = ctx.catalogo;
  const desdeTexto = entrada.desde.trim();
  const hastaTexto = entrada.hasta.trim();
  const desde = parsearTag(desdeTexto);
  const hasta = parsearTag(hastaTexto);

  const errorDesde = desdeTexto === '' || desde !== null ? null : 'El TAG debe ser un número.';
  const errorHasta = hastaTexto === '' || hasta !== null ? null : 'El TAG debe ser un número.';

  // La zona sale del primer TAG: sin él no hay zona que mostrar.
  const zona = desde === null ? null : zonaDelTag(zonas, desde);
  const banda = zona ? textoRango(zona.tagDesde, Math.min(zona.tagHasta, TAG_TOPE_ZONIFICACION)) : null;
  const sinZona = desde !== null && zona === null;

  const base: EvaluacionFormularioRango = {
    ...VACIA,
    desde,
    hasta,
    zona,
    banda,
    errorDesde: errorDesde ?? (sinZona ? `El TAG ${desde} no pertenece a ninguna zona. Revisa el número.` : null),
    errorHasta,
    cantidad: desde !== null && hasta !== null && hasta >= desde ? calcularCantidad(desde, hasta, ctx.vista.tagsAnulados.map((t) => t.numeroTag)) : null,
  };

  // Falta algo o hay un error de un campo: no hay más que validar todavía.
  if (desde === null || hasta === null || !zona || errorDesde || errorHasta) return base;

  const resultado = validarGuardarRango(
    { idRango: entrada.idRango, codigoZona: zona.codigoZona, tagDesde: desde, tagHasta: hasta, referenciaUbicacion: entrada.referencia.trim() === '' ? null : entrada.referencia },
    { estado: ctx.estado, catalogo: ctx.catalogo, rangosActivos: rangosParaReglas(ctx.vista), tagsAnulados: ctx.vista.tagsAnulados.map((t) => t.numeroTag) },
  );

  if (!resultado.ok) {
    // El "hasta" fuera de la zona es un problema de ese campo, no del formulario entero.
    if (resultado.codigo === 'RANGO_FUERA_DE_ZONA' && resultado.data['campo'] === 'tag_hasta') {
      return { ...base, errorHasta: mensajeZonificacion(resultado.codigo, resultado.data) };
    }
    return { ...base, bloqueo: mensajeZonificacion(resultado.codigo, resultado.data) };
  }

  return {
    ...base,
    cantidad: resultado.cantidad,
    advertencia: resultado.advertencia ? `Son ${resultado.cantidad} TAG. Revisa que el último TAG sea correcto.` : null,
    puedeGuardar: true,
  };
}

/* ------------------------------------------------------------------ */
/* Anular un TAG                                                       */
/* ------------------------------------------------------------------ */

export interface EvaluacionAnulacion {
  numero: number | null;
  /* El rango al que pertenece el TAG, con cuánto baja su cantidad. */
  rango: { zona: string; texto: string; cantidadAntes: number; cantidadDespues: number } | null;
  /* Problema con el número, si lo hay. */
  errorNumero: string | null;
  errorMotivo: string | null;
  /* Caracteres del motivo sin contar espacios en los extremos. */
  caracteres: number;
  puedeAnular: boolean;
}

export function evaluarAnulacion(
  entrada: { numero: string; motivo: string },
  vista: VistaZonificacion,
  minimoMotivo: number,
): EvaluacionAnulacion {
  const numeroTexto = entrada.numero.trim();
  const numero = parsearTag(numeroTexto);
  const caracteres = [...entrada.motivo.trim()].length;

  const vacia: EvaluacionAnulacion = { numero, rango: null, errorNumero: null, errorMotivo: null, caracteres, puedeAnular: false };
  if (numeroTexto === '') return vacia;
  if (numero === null) return { ...vacia, errorNumero: 'El TAG debe ser un número.' };

  const contenedor = vista.rangos.find((r) => numero >= r.tagDesde && numero <= r.tagHasta);
  const anulados = vista.tagsAnulados.map((t) => t.numeroTag);
  const rango = contenedor
    ? {
        zona: contenedor.nombreZona,
        texto: textoRango(contenedor.tagDesde, contenedor.tagHasta),
        cantidadAntes: contenedor.cantidad,
        cantidadDespues: Math.max(0, contenedor.cantidad - (anulados.includes(numero) ? 0 : 1)),
      }
    : null;

  const valido = validarAnularTag(numero, entrada.motivo, rangosParaReglas(vista), anulados, minimoMotivo);
  if (valido.ok) return { ...vacia, rango, puedeAnular: true };

  // Mientras el operador todavía escribe el motivo, el motivo corto no es un error: es lo que falta.
  if (valido.codigo === 'MOTIVO_CORTO') return { ...vacia, rango, errorMotivo: entrada.motivo.trim() === '' ? null : mensajeZonificacion(valido.codigo, valido.data) };
  return { ...vacia, rango, errorNumero: mensajeZonificacion(valido.codigo, valido.data) };
}
