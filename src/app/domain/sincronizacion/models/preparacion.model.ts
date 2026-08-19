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
 * `fechaProgramada` puede venir null: el backend todavía no la define.
 * `fechaEjecucion` y `fechaRegistro` no se piden — las pone el dispositivo al
 * iniciar el conteo.
 */
export interface EventoPreparado {
  fechaProgramada: string | null;
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

export interface DatosPreparacion {
  usuario: UsuarioPreparado;
  tiendas: TiendaPreparada[];
  muestra: MuestraPreparada | null;
  evento: EventoPreparado | null;
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
  codigoMuestra: string;
  nombreMuestra: string;
  fechaJornada: string;
  numeroAgenda: string;
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

export interface DatosAnalista {
  contexto: ContextoAnalista;
  kpis: KpisAnalista;
  filas: FilaAnalista[];
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
