import { CatalogoZonificacion, ZonaZonificacion } from '../../domain/zonificacion/models/catalogo-zonificacion.model';
import { AgendaDeLista, AgendaZonificacion, CabeceraZonificacion, EstadoAgenda, ListaAgendas, ResumenZonificacion, TagAnulado, TagsFuera } from '../../domain/zonificacion/models/estado-agenda.model';
import { EstadoZonificacion } from '../../domain/zonificacion/models/estado-zonificacion.model';
import { ResultadoOperacion } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { RangoZonificacion } from '../../domain/zonificacion/models/rango-zonificacion.model';

/*
 * Lee las respuestas de los endpoints de zonificación (contrato v1).
 *
 * La entrada es `unknown` a propósito: castear el JSON a una interfaz no valida
 * nada en runtime. Si falta un campo que la app necesita, se lanza
 * RespuestaZonificacionInvalida.
 *
 * Esa excepción NO es un rechazo del servidor. Cuando llega tras una escritura
 * significa "no pude entender la respuesta", y la operación pudo haberse
 * aplicado: por eso quien envía la trata como transitoria y reintenta con el
 * mismo operacion_uid (el servidor contesta YA_APLICADA si ya la hizo).
 */
export class RespuestaZonificacionInvalida extends Error {
  constructor(detalle: string) {
    super(`Respuesta de zonificación inválida: ${detalle}`);
    this.name = 'RespuestaZonificacionInvalida';
  }
}

type Crudo = Record<string, unknown>;

function objeto(valor: unknown, campo: string): Crudo {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new RespuestaZonificacionInvalida(`"${campo}" no es un objeto`);
  }
  return valor as Crudo;
}

function lista(valor: unknown, campo: string): unknown[] {
  if (!Array.isArray(valor)) {
    throw new RespuestaZonificacionInvalida(`"${campo}" no es una lista`);
  }
  return valor;
}

function numero(valor: unknown, campo: string): number {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new RespuestaZonificacionInvalida(`"${campo}" no es un número`);
  }
  return n;
}

function numeroONulo(valor: unknown, campo: string): number | null {
  return valor === null || valor === undefined ? null : numero(valor, campo);
}

function texto(valor: unknown, campo: string): string {
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  if (typeof valor !== 'string') {
    throw new RespuestaZonificacionInvalida(`"${campo}" no es un texto`);
  }
  return valor;
}

function textoONulo(valor: unknown, campo: string): string | null {
  return valor === null || valor === undefined ? null : texto(valor, campo);
}

function booleano(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') {
    throw new RespuestaZonificacionInvalida(`"${campo}" no es verdadero/falso`);
  }
  return valor;
}

/* Las banderas del SGO vienen como 'S' / 'N'. */
function banderaSN(valor: unknown, campo: string): boolean {
  if (valor !== 'S' && valor !== 'N') {
    throw new RespuestaZonificacionInvalida(`"${campo}" no es S/N`);
  }
  return valor === 'S';
}

function estadoZonificacion(valor: unknown, campo: string): EstadoZonificacion {
  if (valor !== 'SIN_ZONIFICACION' && valor !== 'BORRADOR' && valor !== 'CONFIRMADA') {
    throw new RespuestaZonificacionInvalida(`"${campo}" tiene un estado desconocido`);
  }
  return valor;
}

/* catalogo.php */
export function parsearCatalogo(data: unknown): CatalogoZonificacion {
  const d = objeto(data, 'data');
  const p = objeto(d['parametros'], 'parametros');
  const zonas: ZonaZonificacion[] = lista(d['zonas'], 'zonas').map((z, i) => {
    const c = objeto(z, `zonas[${i}]`);
    return {
      idRegla: numero(c['id_regla'], 'id_regla'),
      codigoZona: texto(c['codigo_zona'], 'codigo_zona'),
      nombre: texto(c['nombre'], 'nombre'),
      tagDesde: numero(c['tag_desde'], 'tag_desde'),
      tagHasta: numero(c['tag_hasta'], 'tag_hasta'),
      orden: numero(c['orden'], 'orden'),
      codigoTipoUbicacion: textoONulo(c['codigo_tipo_ubicacion'], 'codigo_tipo_ubicacion'),
      idTipoUbicacion: numeroONulo(c['id_tipo_ubicacion'], 'id_tipo_ubicacion'),
    };
  });
  return {
    version: texto(d['version'], 'version'),
    zonas,
    parametros: {
      cantidadAdvertencia: numeroONulo(p['cantidad_advertencia'], 'cantidad_advertencia'),
      cantidadMaxima: numeroONulo(p['cantidad_maxima'], 'cantidad_maxima'),
      motivoLargoMinimo: numero(p['motivo_largo_minimo'], 'motivo_largo_minimo'),
      referenciaLargoMaximo: numero(p['referencia_largo_maximo'], 'referencia_largo_maximo'),
    },
  };
}

/* agendas.php */
export function parsearListaAgendas(data: unknown): ListaAgendas {
  const d = objeto(data, 'data');
  const agendas: AgendaDeLista[] = lista(d['agendas'], 'agendas').map((a, i) => {
    const c = objeto(a, `agendas[${i}]`);
    const t = objeto(c['tienda'], 'tienda');
    const z = objeto(c['zonificacion'], 'zonificacion');
    return {
      idAgenda: numero(c['id_agenda'], 'id_agenda'),
      numeroAgenda: texto(c['numero_agenda'], 'numero_agenda'),
      fechaAgenda: texto(c['fecha_agenda'], 'fecha_agenda'),
      tienda: {
        idTienda: numero(t['id_tienda'], 'id_tienda'),
        codigoTienda: texto(t['codigo_tienda'], 'codigo_tienda'),
        nombreTienda: texto(t['nombre_tienda'], 'nombre_tienda'),
      },
      codigoEstado: texto(c['codigo_estado'], 'codigo_estado'),
      operable: booleano(c['operable'], 'operable'),
      soloLectura: booleano(c['solo_lectura'], 'solo_lectura'),
      zonificacion: {
        estado: estadoZonificacion(z['estado'], 'zonificacion.estado'),
        cantidadZonas: numero(z['cantidad_zonas'], 'cantidad_zonas'),
        tagsZonificados: numero(z['tags_zonificados'], 'tags_zonificados'),
        tagsCapturados: numero(z['tags_capturados'], 'tags_capturados'),
      },
    };
  });
  return { hoy: texto(d['hoy'], 'hoy'), agendas };
}

function parsearAgenda(valor: unknown): AgendaZonificacion {
  const a = objeto(valor, 'agenda');
  return {
    idAgenda: numero(a['id_agenda'], 'id_agenda'),
    numeroAgenda: texto(a['numero_agenda'], 'numero_agenda'),
    fechaAgenda: texto(a['fecha_agenda'], 'fecha_agenda'),
    codigoEstado: texto(a['codigo_estado'], 'codigo_estado'),
    operable: booleano(a['operable'], 'operable'),
    soloLectura: booleano(a['solo_lectura'], 'solo_lectura'),
  };
}

function parsearCabecera(valor: unknown): CabeceraZonificacion {
  const z = objeto(valor, 'zonificacion');
  return {
    idZonificacion: numeroONulo(z['id_zonificacion'], 'id_zonificacion'),
    estado: estadoZonificacion(z['estado'], 'zonificacion.estado'),
    fechaModificacion: textoONulo(z['fecha_modificacion'], 'fecha_modificacion'),
    loginModificacion: textoONulo(z['login_modificacion'], 'login_modificacion'),
    fechaConfirmacion: textoONulo(z['fecha_confirmacion'], 'fecha_confirmacion'),
  };
}

function parsearResumen(valor: unknown): ResumenZonificacion {
  const r = objeto(valor, 'resumen');
  return {
    cantidadZonas: numero(r['cantidad_zonas'], 'cantidad_zonas'),
    tagsZonificados: numero(r['tags_zonificados'], 'tags_zonificados'),
    tagsUsados: numero(r['tags_usados'], 'tags_usados'),
    tagsPendientes: numero(r['tags_pendientes'], 'tags_pendientes'),
    porcentajeTagsContados: numero(r['porcentaje_tags_contados'], 'porcentaje_tags_contados'),
    desbalance: banderaSN(r['fl_desbalance'], 'fl_desbalance'),
    zonificacionOk: banderaSN(r['fl_zonificacion_ok'], 'fl_zonificacion_ok'),
  };
}

function parsearRango(valor: unknown, i: number): RangoZonificacion {
  const r = objeto(valor, `rangos[${i}]`);
  return {
    id: numero(r['id_zonificacion_det'], 'id_zonificacion_det'),
    orden: numero(r['orden'], 'orden'),
    codigoZona: texto(r['codigo_zona'], 'codigo_zona'),
    nombreZona: texto(r['nombre_zona'], 'nombre_zona'),
    codigoTipoUbicacion: textoONulo(r['codigo_tipo_ubicacion'], 'codigo_tipo_ubicacion'),
    tagDesde: numero(r['tag_desde'], 'tag_desde'),
    tagHasta: numero(r['tag_hasta'], 'tag_hasta'),
    referenciaUbicacion: textoONulo(r['referencia_ubicacion'], 'referencia_ubicacion'),
    qtyZonificado: numero(r['qty_zonificado'], 'qty_zonificado'),
    qtyUsado: numero(r['qty_usado'], 'qty_usado'),
    qtyPendiente: numero(r['qty_pendiente'], 'qty_pendiente'),
    porcentajeCierre: numero(r['porcentaje_cierre'], 'porcentaje_cierre'),
    desbalance: banderaSN(r['fl_desbalance'], 'fl_desbalance'),
  };
}

function parsearTagAnulado(valor: unknown, i: number): TagAnulado {
  const t = objeto(valor, `tags_anulados[${i}]`);
  return {
    numeroTag: numero(t['numero_tag'], 'numero_tag'),
    motivo: texto(t['motivo'], 'motivo'),
    fechaAnulacion: textoONulo(t['fecha_anulacion'], 'fecha_anulacion'),
    loginAnulacion: textoONulo(t['login_anulacion'], 'login_anulacion'),
  };
}

function parsearTagsFuera(valor: unknown): TagsFuera {
  const t = objeto(valor, 'tags_fuera');
  return {
    total: numero(t['total'], 'total'),
    ejemplos: lista(t['ejemplos'], 'ejemplos').map((e) => numero(e, 'ejemplos')),
  };
}

/* El objeto `estado` de estado.php y de toda respuesta de escritura. */
export function parsearEstadoAgenda(valor: unknown): EstadoAgenda {
  const e = objeto(valor, 'estado');
  return {
    agenda: parsearAgenda(e['agenda']),
    zonificacion: parsearCabecera(e['zonificacion']),
    resumen: parsearResumen(e['resumen']),
    rangos: lista(e['rangos'], 'rangos').map(parsearRango),
    tagsAnulados: lista(e['tags_anulados'], 'tags_anulados').map(parsearTagAnulado),
    tagsFuera: parsearTagsFuera(e['tags_fuera']),
    horaServidor: textoONulo(e['hora_servidor'], 'hora_servidor'),
  };
}

/* estado.php: la respuesta trae el estado dentro de `data.estado`. */
export function parsearRespuestaEstado(data: unknown): EstadoAgenda {
  return parsearEstadoAgenda(objeto(data, 'data')['estado']);
}

/* rango-guardar, rango-eliminar, tag-anular, confirmar y reabrir. */
export function parsearResultadoOperacion(data: unknown): ResultadoOperacion {
  const d = objeto(data, 'data');
  const resultado = d['resultado'];
  if (resultado !== 'APLICADA' && resultado !== 'YA_APLICADA') {
    throw new RespuestaZonificacionInvalida('"resultado" no es APLICADA ni YA_APLICADA');
  }
  return {
    resultado,
    operacionUid: texto(d['operacion_uid'], 'operacion_uid'),
    idZonificacionDet: numeroONulo(d['id_zonificacion_det'], 'id_zonificacion_det'),
    numeroTag: numeroONulo(d['numero_tag'], 'numero_tag'),
    estado: parsearEstadoAgenda(d['estado']),
  };
}
