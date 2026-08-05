import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/http/api.service';
import { DatosPreparacion, MuestraPreparada, PreparacionRequest } from '../../domain/sincronizacion/models/preparacion.model';
import { PreparacionApiRepository } from '../../domain/sincronizacion/repositories/preparacion-api.repository';

/* Forma cruda del endpoint: snake_case y flags 'S'/'N'. */
interface ApiUsuarioPreparado {
  login: string;
  rut: string;
  rut_normalizado: string;
  nombre_completo: string;
  nombres: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  cargo: string;
  tipo_usuario: string;
  usuario_cliente: string;
  autenticado: boolean;
}

interface ApiTiendaPreparada {
  id_tienda: number;
  codigo_tienda: string;
  nombre_tienda: string;
}

/*
 * Fila plana: el encabezado de la muestra se repite en cada línea de detalle.
 * `id_producto` es el id remoto del producto y se descarta — la clave natural
 * es el sku, que además ya es UNIQUE en sod_producto.
 */
interface ApiFilaMuestra {
  id_muestra: number;
  codigo_muestra: string;
  nombre_muestra: string | null;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
  id_muestra_det: number;
  sku: string;
  codigo_barras: string | null;
  descripcion: string | null;
}

interface ApiEventoPreparado {
  fecha_programada: string | null;
  estado: string;
}

interface ApiPreparacionData {
  usuario: ApiUsuarioPreparado;
  /* Objeto cuando es una sola, array cuando son varias — ver comoLista(). */
  tiendas?: ApiTiendaPreparada | ApiTiendaPreparada[] | null;
  muestras?: ApiFilaMuestra | ApiFilaMuestra[] | null;
  eventos?: ApiEventoPreparado | ApiEventoPreparado[] | null;
}

/*
 * El endpoint manda una colección como objeto suelto cuando trae un solo
 * elemento, y como array cuando trae varios. Normalizarlo acá evita que esa
 * inconsistencia del protocolo se filtre al dominio.
 */
function comoLista<T>(valor: T | T[] | null | undefined): T[] {
  if (valor === null || valor === undefined) return [];
  return Array.isArray(valor) ? valor : [valor];
}

/*
 * El backend mezcla formatos de fecha: las de vigencia vienen ISO
 * ("2026-07-17") y la programada del evento en DD-MM-YYYY ("05-08-2026").
 * Toda la app compara y ordena fechas como texto ISO, así que se normaliza acá.
 * Un formato desconocido se deja pasar tal cual en vez de inventar una fecha.
 */
function aFechaIso(valor: string | null): string | null {
  if (!valor) return null;

  const ddmmaaaa = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(valor);
  if (ddmmaaaa) {
    const [, dia, mes, anio] = ddmmaaaa;
    return `${anio}-${mes}-${dia}`;
  }

  return valor;
}

/*
 * Las filas vienen aplanadas: encabezado repetido + una línea de detalle cada
 * una. Se agrupan por codigo_muestra y se devuelve la primera muestra, que es
 * la única que la app maneja hoy.
 */
function armarPrimeraMuestra(filas: ApiFilaMuestra[]): MuestraPreparada | null {
  const primera = filas[0];
  if (!primera) return null;

  const suyas = filas.filter((f) => f.codigo_muestra === primera.codigo_muestra);

  return {
    idMuestra: primera.id_muestra,
    codigoMuestra: primera.codigo_muestra,
    nombreMuestra: primera.nombre_muestra,
    fechaInicioVigencia: aFechaIso(primera.fecha_inicio_vigencia),
    fechaFinVigencia: aFechaIso(primera.fecha_fin_vigencia),
    detalles: suyas.map((f) => ({
      idMuestraDet: f.id_muestra_det,
      sku: f.sku,
      codigoBarras: f.codigo_barras,
      descripcion: f.descripcion,
    })),
  };
}

@Injectable({ providedIn: 'root' })
export class PreparacionApiService implements PreparacionApiRepository {
  private api = inject(ApiService);

  async preparar(request: PreparacionRequest): Promise<DatosPreparacion> {
    const data = await this.api.post<ApiPreparacionData>(
      'sincronizaciones/preparacion.php',
      request
    );

    const u = data.usuario;
    const evento = comoLista(data.eventos)[0] ?? null;

    return {
      muestra: armarPrimeraMuestra(comoLista(data.muestras)),
      evento: evento && {
        fechaProgramada: aFechaIso(evento.fecha_programada),
        estado: evento.estado,
      },
      /*
       * `tiendas` es opcional porque el endpoint está en desarrollo: si todavía
       * no lo manda, la sincronización sigue en vez de romper.
       */
      tiendas: comoLista(data.tiendas).map((t) => ({
        idTienda: t.id_tienda,
        codigoTienda: t.codigo_tienda,
        nombreTienda: t.nombre_tienda,
      })),
      usuario: {
        login: u.login,
        rut: u.rut,
        rutNormalizado: u.rut_normalizado,
        nombreCompleto: u.nombre_completo,
        nombres: u.nombres,
        apellidoPaterno: u.apellido_paterno,
        apellidoMaterno: u.apellido_materno,
        cargo: u.cargo,
        tipoUsuario: u.tipo_usuario,
        esUsuarioCliente: u.usuario_cliente === 'S',
        autenticado: u.autenticado,
      },
    };
  }
}
