/*
 * Datos que devuelve la preparación de la sincronización.
 *
 * El login solo confirma la identidad (rut + correo); el perfil completo del
 * operador —nombre, cargo, tipo— llega recién acá. Por eso la preparación no
 * es opcional: sin ella la sesión queda sin nombre para mostrar.
 */
export interface UsuarioPreparado {
  login: string;
  rut: string;
  rutNormalizado: string;
  nombreCompleto: string;
  nombres: string;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  cargo: string;
  tipoUsuario: string;
  esUsuarioCliente: boolean;
  autenticado: boolean;
}

/*
 * `idTienda` es el id del backend. No se persiste: sod_sucursal usa su propio
 * AUTOINCREMENT y la identidad compartida entre ambos mundos es codigoTienda.
 */
export interface TiendaPreparada {
  idTienda: number;
  codigoTienda: string;
  nombreTienda: string;
  zonaOperativa: string | null;
}

/*
 * Código válido para un producto en la muestra.
 * El backend agrupa múltiples filas (SKU + barras) en codigos[] por producto.
 */
export interface CodigoProductoPreparado {
  codigoLectura: string;
  tipoCodigo: string | null;
  codigoBarras: string | null;
}

/*
 * Una línea de la muestra: el producto que hay que contar.
 * `codigos[]` es obligatorio desde el servidor real.
 */
export interface DetalleMuestraPreparado {
  idMuestraDet: number;
  sku: string;
  codigoBarras: string | null;
  descripcion: string | null;
  stockSistema: number;
  codigos: CodigoProductoPreparado[];
}

/*
 * El endpoint manda la muestra aplanada: el encabezado se repite en cada fila
 * junto con su detalle. Acá ya viene agrupada — un encabezado, N detalles.
 */
export interface MuestraPreparada {
  idMuestra: number;
  codigoMuestra: string;
  idAgenda: number | null;
  numeroAgenda: string | null;
  nombreMuestra: string | null;
  fechaInicioVigencia: string | null;
  fechaFinVigencia: string | null;
  detalles: DetalleMuestraPreparado[];
}

/*
 * El día de trabajo.
 *
 * `fechaProgramada` NO es opcional. Antes lo era, y las dos únicas cosas que
 * hacían con un evento sin fecha era descartarlo (`if (!evento?.fechaProgramada)
 * return`). Un evento sin día no se puede ni mostrar ni guardar —sod_evento la
 * usa como parte de su identidad— así que ahora el parser directamente no lo
 * construye, y a cambio nadie más aguas abajo tiene que preguntar.
 *
 * `fechaEjecucion` y `fechaRegistro` no se piden — las pone el dispositivo al
 * iniciar el conteo.
 */
export interface EventoPreparado {
  fechaProgramada: string;
  estado: string;
}

/*
 * Zona de la tienda. El endpoint las manda como tuplas
 * [codigo, descripcion, tag_desde, tag_hasta].
 */
export interface ZonaPreparada {
  codigo: string;
  descripcion: string | null;
  tagDesde: number | null;
  tagHasta: number | null;
}

/*
 * Un día de trabajo completo: el evento, la muestra que le toca y en qué tienda.
 *
 * Es la unidad que el operador elige en pantalla. Existe porque la preparación
 * pasó a traer HOY y MAÑANA, y antes evento y muestra colgaban sueltos de
 * DatosPreparacion, emparejados solo por venir en la misma respuesta. Con dos
 * jornadas ese emparejamiento implícito ya no se sostiene: hay que poder decir
 * QUÉ muestra es de QUÉ día sin depender del orden de dos arrays paralelos.
 *
 * `muestra` es null en el flujo del analista, que recibe una preparación
 * liviana sin productos.
 *
 * `tienda` viaja acá y no se toma de `tiendas[0]` porque nada garantiza que las
 * dos jornadas sean de la misma tienda. Hoy en la práctica lo son, pero el
 * backend manda un `sucursal_id` por evento y esa es la respuesta correcta;
 * asumir la primera de la lista es justo el bug de "el conteo es de otra
 * tienda" que ya nos tocó arreglar una vez.
 */
export interface JornadaPreparada {
  evento: EventoPreparado;
  muestra: MuestraPreparada | null;
  tienda: TiendaPreparada;
}

/*
 * La identidad de una jornada es su día.
 *
 * El backend garantiza una sola jornada por fecha, y la fecha es además lo
 * único que el operador ve para distinguirlas ("hoy" / "mañana"). También es lo
 * que sod_evento usa como clave junto con la sucursal, así que elegir cualquier
 * otra cosa obligaría a traducir entre dos identidades.
 *
 * Se expone como función y no se lee `.evento.fechaProgramada` suelto por el
 * código para que, si algún día la identidad pasa a ser el id de agenda, haya
 * un solo lugar que cambiar.
 */
export function idJornada(jornada: JornadaPreparada): string {
  return jornada.evento.fechaProgramada;
}

/*
 * `jornadas` reemplaza a `muestra` + `evento`.
 *
 * Puede venir vacío y eso NO es un error: significa que el operador no tiene
 * trabajo asignado ni para hoy ni para mañana. Antes esa situación llegaba como
 * un 401 confundido con "credenciales inválidas".
 */
export interface DatosPreparacion {
  usuario: UsuarioPreparado;
  tiendas: TiendaPreparada[];
  jornadas: JornadaPreparada[];
  zonas: ZonaPreparada[];
  analista: DatosAnalista | null;
}

/*
 * Datos específicos para el dashboard del analista.
 * Viene del WS dentro de `data.analista` solo para ANALISTA_CLIENTE.
 * Todos los datos se derivan de la muestra recibida.
 */
export interface ContextoAnalista {
  codigoTienda: string;
  nombreTienda: string;
  idAgenda: number | null;
  numeroAgenda: string;
  codigoMuestra: string;
  nombreMuestra: string;
  fechaJornada: string;
  idKardex: number | null;
}

export interface KpisAnalista {
  diferenciasPendientes: number;
  valorDiferencias: number;
  diferenciasCriticas: number;
  reconteosRealizados: number;
  diferenciasResueltas: number;
  persistenConDiferencia: number;
  totalProductos: number;
}

export interface TagAnalista {
  tagCodigo: string;
  ubicacionCodigo: string;
  zonaNombre: string;
  zonaDescripcion: string | null;
  cantidadOperador: number;
}

export interface FilaAnalista {
  sku: string;
  descripcion: string | null;
  codigoBarras: string;
  zona: string;
  tag: string;
  stockSistema: number;
  cantidadContada: number;
  diferenciaUnidades: number;
  diferenciaValor: number;
  precioUnitario: number;
  prioridad: string;
  estado: string;
  tags: TagAnalista[];
}

export interface RegistroAnalista {
  filaSku: string;
  tagCodigo: string;
  ubicacionCodigo: string;
  zonaNombre: string;
  cantidadAnalista: number;
  estado: 'PENDIENTE' | 'ENVIADO' | 'ERROR';
  fechaHora: string;
  error?: string;
}

/*
 * Validación operacional — modelos para el bloque de validación que el
 * analista revisa (Altillos, Punto de Venta, Pre Variance, Recuento).
 * Se derivan de las Q11/Q12 del backend y se persisten en sod_validacion_*.
 */
export interface ValidacionResumenAnalista {
  codigoZona: string;
  nombreZona: string;
  objetivoPorcentaje: number;
  tagsUsados: number;
  tagsConfirmados: number;
  tagsPendientes: number;
  porcentaje: number;
  cumple: boolean;
}

export interface ValidacionTagAnalista {
  idTagBackend: number | null;
  numeroTag: number | null;
  codigoZona: string;
  nombreZona: string;
  productosTotal: number;
  productosConfirmados: number;
  estadoValidacion: 'PENDIENTE' | 'CONFIRMADO';
}

export interface ValidacionProductoAnalista {
  idTagBackend: number | null;
  numeroTag: number | null;
  idProductoBackend: number | null;
  sku: string;
  descripcion: string | null;
  cantidadInventariada: number;
  cantidadAnalista: number | null;
  estadoValidacion: 'PENDIENTE' | 'CONFIRMADO';
  flIncorporado: 'S' | 'N';
}

export interface ValidacionBloqueAnalista {
  resumen: ValidacionResumenAnalista;
  tags: ValidacionTagAnalista[];
  productos: ValidacionProductoAnalista[];
}

export interface ValidacionOperacionalAnalista {
  altillos: ValidacionBloqueAnalista;
  puntoVenta: ValidacionBloqueAnalista;
  preVariance: PreVarianceAnalista;
  recuento: RecuentoAnalista;
}

/*
 * Pre Variance — modelos para la revisión contra Kárdex.
 * Diferencia valorizada absoluta estricta > $500.000.
 */
export interface PreVarianceResumenAnalista {
  skuTotal: number;
  skuPendientes: number;
  skuRevisados: number;
  diferenciaTotal: number;
  mayorDiferenciaValor: number;
  mayorDiferenciaSku: string | null;
  mayorDiferenciaDescripcion: string | null;
}

export interface PreVarianceUbicacionAnalista {
  idTagBackend: number | null;
  numeroTag: number | null;
  zona: string;
  cantidadInventariada: number;
  cantidadPreVariance: number | null;
}

export interface PreVarianceProductoAnalista {
  idProductoBackend: number | null;
  sku: string;
  descripcion: string | null;
  stockTeorico: number;
  valorUnitario: number;
  inventariadoAntesPreVariance: number;
  fisicoVigente: number;
  diferenciaUnidades: number;
  diferenciaEnCosto: number;
  estadoPreVariance: 'PENDIENTE' | 'REVISADO';
  ubicaciones: PreVarianceUbicacionAnalista[];
}

export interface PreVarianceAnalista {
  resumen: PreVarianceResumenAnalista;
  productos: PreVarianceProductoAnalista[];
}

/*
 * Recuento — modelos para la revisión contra Kárdex (Conteo 3).
 * Excluye universo Pre Variance por defecto.
 * Prioridad: C3_RECUENTO > C2_PRE_VARIANCE > C2_VALIDACION > C1_INICIAL.
 */
export interface RecuentoResumenAnalista {
  skuTotal: number;
  skuPendientes: number;
  skuRecontados: number;
  diferenciaTotal: number;
  mayorDiferenciaValor: number;
  mayorDiferenciaSku: string | null;
  mayorDiferenciaDescripcion: string | null;
}

export interface RecuentoUbicacionAnalista {
  idTagBackend: number | null;
  numeroTag: number | null;
  zona: string;
  cantidadInventariada: number;
  cantidadRecuento: number | null;
}

export interface RecuentoProductoAnalista {
  idProductoBackend: number | null;
  sku: string;
  descripcion: string | null;
  stockTeorico: number;
  valorUnitario: number;
  fisicoActual: number;
  diferenciaUnidades: number;
  diferenciaEnCosto: number;
  esPreVariance: boolean;
  estadoRecuento: 'PENDIENTE' | 'RECONTADO';
  ubicaciones: RecuentoUbicacionAnalista[];
}

export interface RecuentoAnalista {
  resumen: RecuentoResumenAnalista;
  productos: RecuentoProductoAnalista[];
}

export interface DatosAnalista {
  contexto: ContextoAnalista;
  kpis: KpisAnalista;
  filas: FilaAnalista[];
  validacionOperacional: ValidacionOperacionalAnalista | null;
}

export interface PreparacionRequest {
  correo: string;
  rut: string;
}

/*
 * Etapas que atraviesa la sincronización inicial. La UI las usa para no dar
 * por terminada la carga hasta que las tablas quedaron efectivamente escritas.
 */
export type EtapaSincronizacion = 'DESCARGANDO' | 'GUARDANDO' | 'LISTO';
