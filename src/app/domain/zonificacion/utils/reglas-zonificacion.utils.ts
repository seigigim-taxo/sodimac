import { CatalogoZonificacion, ParametrosZonificacion, ZonaZonificacion } from '../models/catalogo-zonificacion.model';
import { CodigoErrorZonificacion, ErrorZonificacion } from '../models/error-zonificacion.model';
import { EstadoZonificacion, puedeEditarRangos } from '../models/estado-zonificacion.model';
import { IdRango, RangoActivo } from '../models/rango-zonificacion.model';

/*
 * Reglas de zonificación en la app. Son el espejo de
 * sodimac-ws/api/sincronizaciones/zonificacion/reglas.php: sirven para avisar al
 * operador antes de enviar, no para reemplazar al servidor, que valida siempre y
 * tiene la última palabra (otra PDA o el SGO pudieron cambiar el estado).
 *
 * Son funciones puras: sin Angular, sin SQLite, sin red. Cuando una regla falla
 * devuelven el MISMO código y los mismos campos `data` que el servidor
 * (contrato v1), así la pantalla muestra un solo mensaje por código, venga el
 * rechazo de aquí o del servidor.
 */

/* Los TAG por sobre este número no se zonifican, aunque el catálogo los cubra. */
export const TAG_TOPE_ZONIFICACION = 8000;

/*
 * Un rango de más de 99 TAG se avisa: lo más probable es un último TAG mal
 * escaneado. Es solo un aviso, no impide guardar. Rige mientras el catálogo no
 * traiga su propio umbral (hoy `cantidad_advertencia` llega vacío): si el servidor
 * manda uno, manda ese.
 */
export const CANTIDAD_ADVERTENCIA_POR_DEFECTO = 99;

export type ResultadoRegla<T> = ({ ok: true } & T) | ({ ok: false } & ErrorZonificacion);

const error = (codigo: CodigoErrorZonificacion, data: Record<string, unknown> = {}): { ok: false } & ErrorZonificacion => ({
  ok: false,
  codigo,
  data,
});

/* Un TAG o un límite de rango: entero y positivo. */
export const esNumeroTagValido = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

/* Zona que contiene al TAG dentro de lo zonificable (hasta 8000), o null. */
export function zonaDelTag(zonas: ZonaZonificacion[], tag: number): ZonaZonificacion | null {
  return (
    zonas.find((z) => tag >= z.tagDesde && tag <= Math.min(z.tagHasta, TAG_TOPE_ZONIFICACION)) ?? null
  );
}

/*
 * Cantidad efectiva de un rango: los TAG del rango menos los anulados que caen
 * dentro (igual que las vistas del SGO). Un TAG anulado repetido cuenta una vez.
 */
export function calcularCantidad(desde: number, hasta: number, anulados: number[] = []): number {
  if (hasta < desde) {
    return 0;
  }
  const dentro = new Set(anulados.filter((n) => n >= desde && n <= hasta));
  return hasta - desde + 1 - dentro.size;
}

/* Primer rango activo que se cruza con [desde, hasta]; `excluirId` es el rango que se está editando. */
export function buscarCruce(
  desde: number,
  hasta: number,
  rangos: RangoActivo[],
  excluirId: IdRango | null = null,
): RangoActivo | null {
  return (
    rangos.find((r) => (excluirId === null || r.id !== excluirId) && desde <= r.tagHasta && hasta >= r.tagDesde) ?? null
  );
}

export interface DatosRango {
  idRango: IdRango | null;
  codigoZona: string;
  tagDesde: number;
  tagHasta: number;
  referenciaUbicacion: string | null;
}

export interface RangoValidado {
  zona: ZonaZonificacion;
  cantidad: number;
  /* La cantidad pasa el umbral de advertencia (no el máximo): se avisa pero se puede guardar. */
  advertencia: boolean;
  referenciaUbicacion: string | null;
}

export interface ContextoRango {
  estado: EstadoZonificacion;
  catalogo: CatalogoZonificacion;
  rangosActivos: RangoActivo[];
  tagsAnulados: number[];
}

/*
 * Valida un rango antes de guardarlo. Mismo orden que el servidor; el primero
 * que falla gana: estado → tipos → zona → orden → banda (y tope 8000) →
 * referencia → cruce → cantidad.
 */
export function validarGuardarRango(datos: DatosRango, ctx: ContextoRango): ResultadoRegla<RangoValidado> {
  if (!puedeEditarRangos(ctx.estado)) {
    return error('ZONIFICACION_CONFIRMADA', { estado: ctx.estado });
  }
  if (!esNumeroTagValido(datos.tagDesde)) {
    return error('PETICION_INVALIDA', { campo: 'tag_desde' });
  }
  if (!esNumeroTagValido(datos.tagHasta)) {
    return error('PETICION_INVALIDA', { campo: 'tag_hasta' });
  }

  const zona = ctx.catalogo.zonas.find((z) => z.codigoZona === datos.codigoZona);
  if (!datos.codigoZona || !zona) {
    return error('ZONA_INVALIDA', { codigo_zona: datos.codigoZona });
  }
  if (!zona.codigoTipoUbicacion || !zona.idTipoUbicacion) {
    return error('ZONA_SIN_TIPO', { codigo_zona: datos.codigoZona });
  }
  if (datos.tagHasta < datos.tagDesde) {
    return error('RANGO_INVALIDO');
  }

  const permitidoDesde = zona.tagDesde;
  const permitidoHasta = Math.min(zona.tagHasta, TAG_TOPE_ZONIFICACION);
  const extremos: [string, number][] = [
    ['tag_desde', datos.tagDesde],
    ['tag_hasta', datos.tagHasta],
  ];
  for (const [campo, valor] of extremos) {
    if (valor < permitidoDesde || valor > permitidoHasta) {
      return error('RANGO_FUERA_DE_ZONA', {
        codigo_zona: datos.codigoZona,
        permitido_desde: permitidoDesde,
        permitido_hasta: permitidoHasta,
        campo,
      });
    }
  }

  const { parametros } = ctx.catalogo;
  const maxReferencia = parametros.referenciaLargoMaximo;
  if (datos.referenciaUbicacion !== null && [...datos.referenciaUbicacion].length > maxReferencia) {
    return error('REFERENCIA_LARGA', { maximo: maxReferencia });
  }

  const cruce = buscarCruce(datos.tagDesde, datos.tagHasta, ctx.rangosActivos, datos.idRango);
  if (cruce) {
    return error('RANGO_CRUZADO', { con: { id_zonificacion_det: cruce.id, tag_desde: cruce.tagDesde, tag_hasta: cruce.tagHasta } });
  }

  const cantidad = calcularCantidad(datos.tagDesde, datos.tagHasta, ctx.tagsAnulados);
  const evaluada = evaluarCantidad(cantidad, {
    cantidadAdvertencia: parametros.cantidadAdvertencia ?? CANTIDAD_ADVERTENCIA_POR_DEFECTO,
    cantidadMaxima: parametros.cantidadMaxima,
  });
  if (!evaluada.ok) {
    return evaluada;
  }

  return {
    ok: true,
    zona,
    cantidad,
    advertencia: evaluada.advertencia,
    referenciaUbicacion: datos.referenciaUbicacion === '' ? null : datos.referenciaUbicacion,
  };
}

/* Umbrales nulos = sin límite. Sobre el máximo se rechaza; sobre la advertencia solo se avisa. */
export function evaluarCantidad(
  cantidad: number,
  parametros: Pick<ParametrosZonificacion, 'cantidadAdvertencia' | 'cantidadMaxima'>,
): ResultadoRegla<{ advertencia: boolean }> {
  const { cantidadAdvertencia, cantidadMaxima } = parametros;
  if (cantidadMaxima !== null && cantidad > cantidadMaxima) {
    return error('CANTIDAD_EXCESIVA', { cantidad, maximo: cantidadMaxima });
  }
  return { ok: true, advertencia: cantidadAdvertencia !== null && cantidad > cantidadAdvertencia };
}

/* Motivo de anulación: al menos el mínimo de caracteres sin contar espacios en los extremos. */
export function validarMotivo(motivo: string, minimo: number): { ok: true } | ({ ok: false } & ErrorZonificacion) {
  if ([...motivo.trim()].length < minimo) {
    return error('MOTIVO_CORTO', { minimo });
  }
  return { ok: true };
}

/*
 * Parte de ANULAR_TAG que la app puede verificar sola: número válido, motivo, el
 * TAG pertenece a un rango activo y no está ya anulado. Las capturas vigentes
 * (TAG_CON_CAPTURAS) solo las conoce el servidor.
 */
export function validarAnularTag(
  numeroTag: number,
  motivo: string,
  rangosActivos: RangoActivo[],
  tagsAnulados: number[],
  minimoMotivo: number,
): { ok: true } | ({ ok: false } & ErrorZonificacion) {
  if (!esNumeroTagValido(numeroTag)) {
    return error('PETICION_INVALIDA', { campo: 'numero_tag' });
  }
  const motivoValido = validarMotivo(motivo, minimoMotivo);
  if (!motivoValido.ok) {
    return motivoValido;
  }
  if (!rangosActivos.some((r) => numeroTag >= r.tagDesde && numeroTag <= r.tagHasta)) {
    return error('TAG_NO_EXISTE', { numero_tag: numeroTag });
  }
  if (tagsAnulados.includes(numeroTag)) {
    return error('TAG_YA_ANULADO', { numero_tag: numeroTag });
  }
  return { ok: true };
}

/*
 * Parte de CONFIRMAR que la app puede verificar sola (el servidor revisa además
 * los TAG utilizados sin cobertura): estado, sin rangos o sin TAG válidos, rango
 * sin tipo y rangos cruzados, en el mismo orden del SGO.
 */
export function validarConfirmarLocal(
  estado: EstadoZonificacion,
  rangos: (RangoActivo & { idTipoUbicacion: number | null })[],
  tagsAnulados: number[],
): { ok: true } | ({ ok: false } & ErrorZonificacion) {
  if (!puedeEditarRangos(estado)) {
    return error('ZONIFICACION_CONFIRMADA', { estado });
  }
  const tags = rangos.reduce((suma, r) => suma + calcularCantidad(r.tagDesde, r.tagHasta, tagsAnulados), 0);
  if (rangos.length === 0 || tags <= 0) {
    return error('ZONIFICACION_VACIA');
  }
  const sinTipo = rangos.find((r) => !r.idTipoUbicacion || r.idTipoUbicacion <= 0);
  if (sinTipo) {
    return error('ZONA_SIN_TIPO', { codigo_zona: null, id_zonificacion_det: sinTipo.id });
  }
  for (let i = 0; i < rangos.length; i++) {
    for (let k = i + 1; k < rangos.length; k++) {
      const a = rangos[i];
      const b = rangos[k];
      if (a.tagDesde <= b.tagHasta && a.tagHasta >= b.tagDesde) {
        return error('RANGO_CRUZADO', { con: { id_zonificacion_det: b.id, tag_desde: b.tagDesde, tag_hasta: b.tagHasta } });
      }
    }
  }
  return { ok: true };
}

/* REABRIR: solo una zonificación CONFIRMADA vuelve a BORRADOR. */
export function validarReabrir(estado: EstadoZonificacion): { ok: true } | ({ ok: false } & ErrorZonificacion) {
  return estado === 'CONFIRMADA' ? { ok: true } : error('ZONIFICACION_NO_CONFIRMADA', { estado });
}
