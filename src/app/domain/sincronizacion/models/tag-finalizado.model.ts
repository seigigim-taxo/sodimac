import { MedioCaptura } from '../../conteo/models/medio-captura.model';
import { selloUid } from '../../../shared/utils/fecha.utils';

/*
 * Un código usado en la línea, cómo entró y cuántas unidades le corresponden.
 *
 * Va agrupado por (código, medio): diez escaneos del mismo EAN son una entrada
 * con la suma, no diez entradas. La PDA sí guarda el detalle captura por
 * captura — acá se manda el agregado que el SGO necesita.
 *
 * `cantidad` es el movimiento neto de unidades de ese par y PUEDE SER NEGATIVA
 * o cero: quitar unidades agrega un movimiento negativo en vez de borrar la
 * captura anterior. La suma de todas las lecturas da cantidad_fisica.
 *
 * `codigo_lectura` es NULO para los ajustes con los botones +/-, que mueven
 * unidades sin que el operador lea nada.
 *
 * IMPORTANTE para el reporte: "¿se escaneó este código?" se responde por la
 * PRESENCIA del par (código, medio), no por el signo de `cantidad`. Un código
 * escaneado y después retractado suma cero y sigue siendo un código escaneado.
 */
export interface TagFinalizadoLecturaPayload {
  codigo_lectura: string | null;
  medio_captura: MedioCaptura;
  cantidad: number;
}

/*
 * El identificador de un producto dentro de una carga, tal como lo recibe el
 * SGO. Es la clave con la que el servidor deduplica: si llega dos veces el
 * mismo detalle_uid, responde DUPLICADO_IGNORADO en vez de insertarlo otra vez.
 * De ahí que tenga que ser estable entre un envío y su reintento.
 *
 * Lleva las dos cosas a propósito:
 *
 *   - el id de la línea, que garantiza unicidad dura dentro de la carga;
 *   - el instante de la primera captura, que es lo que pidió Rodrigo para poder
 *     distinguir productos mirando la tabla, y de paso agrega trazabilidad que
 *     el UID anterior no tenía (todos los detalles de un TAG compartían el
 *     timestamp del momento en que se finalizó, no el del escaneo).
 *
 * El sello solo bastaría casi siempre —dos SKU distintos no se escanean en el
 * mismo milisegundo—, pero "casi siempre" es peor que la garantía dura que ya
 * daba el id, y conservarlo no cuesta nada.
 *
 * PENDIENTE: confirmar con Rodrigo el ancho de la columna en MySQL. Esto suma
 * ~18 caracteres sobre el UID anterior; un VARCHAR corto truncaría en silencio
 * y crearía justo las colisiones que se quieren evitar.
 */
export function detalleUid(cargaUid: string, detalleId: number, fechaPrimeraLectura: string): string {
  return `${cargaUid}-DET${detalleId}-${selloUid(fechaPrimeraLectura)}`;
}

export interface TagFinalizadoDetallePayload {
  detalle_uid: string;
  codigo_lectura: string | null;
  sku: string;
  codigo_barras: string | null;
  descripcion: string | null;
  stock_sistema: number | null;
  cantidad_fisica: number;
  fecha_hora: string;
  lecturas: TagFinalizadoLecturaPayload[];
}

export interface TagFinalizadoPayload {
  carga_uid: string;
  codigo_tienda: string;
  fecha_programada: string;
  iteracion: number;
  tag_codigo: string;
  zona_nombre: string;
  zona_descripcion: string | null;
  operador_rut: string;
  operador_login: string;
  pda_codigo: string;

  /*
   * Con qué versión de la app se contó este TAG.
   *
   * Viaja con la carga y no en un log aparte porque la pregunta llega meses
   * después y sobre una carga puntual: "esta viene rara, ¿de qué versión
   * salió?". Un log local no responde eso — la PDA ya se formateó, o es otra.
   *
   * Se lee del sistema, no de la constante APP_VERSION (ver AppInfoService).
   * Van los dos: `version_app` es lo que una persona reconoce, `version_code`
   * es lo único que ordena de verdad.
   */
  version_app: string;
  version_code: number;

  codigo_muestra: string | null;
  id_agenda: number | null;
  numero_agenda: string | null;
  detalles: TagFinalizadoDetallePayload[];
}

/*
 * El mismo payload, pero LEÍDO de sod_sincronizacion.
 *
 * Un payload que se arma hoy siempre trae la versión; uno que quedó guardado
 * como PENDIENTE antes de que existiera el campo, no. Son dos verdades
 * distintas y por eso son dos tipos.
 *
 * Sin esta distinción, `JSON.parse(payloadJson) as TagFinalizadoPayload` le
 * promete al compilador un `version_app: string` que en esas filas viejas es
 * `undefined`: el primero que lo lea —comparar, recortar, mostrarlo— se lleva
 * un undefined en runtime sin que nada lo haya advertido.
 *
 * Los campos siguen siendo obligatorios al CONSTRUIR, que es donde importa:
 * si mañana aparece otro lugar que arme un payload y se olvide de la versión,
 * el compilador lo detiene.
 */
export type TagFinalizadoPayloadAlmacenado =
  Omit<TagFinalizadoPayload, 'version_app' | 'version_code'> &
  Partial<Pick<TagFinalizadoPayload, 'version_app' | 'version_code'>>;

export interface TagFinalizadoResponse {
  carga_uid: string;
  carga_id: number;
  total_productos: number;
  total_unidades: number;
}
