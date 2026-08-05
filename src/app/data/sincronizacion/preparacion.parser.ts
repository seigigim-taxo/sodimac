import { ContractError } from '../../domain/shared/errors/contract.error';
import {
  DatosPreparacion,
  EventoPreparado,
  MuestraPreparada,
  TiendaPreparada,
  UsuarioPreparado,
} from '../../domain/sincronizacion/models/preparacion.model';

/*
 * Traduce la respuesta cruda de preparacion.php al dominio, validando sobre la
 * marcha.
 *
 * El criterio de qué es obligatorio no es "qué manda el backend" sino "qué
 * necesita la app para funcionar": solo se exige lo que, si falta, deja un dato
 * inservible o corrompe una tabla. Todo lo demás degrada a null y la
 * sincronización sigue. Así un campo nuevo o uno que desaparece no rompe nada,
 * pero un contrato que cambia de verdad falla con el nombre del campo a la
 * vista en vez de un "cannot read property of undefined".
 */

type Json = Record<string, unknown>;

const ESTADOS_EVENTO = ['ABIERTO', 'EN_ANALISIS', 'RECONTEO', 'CERRADO'] as const;
type EstadoEvento = (typeof ESTADOS_EVENTO)[number];

function esJson(valor: unknown): valor is Json {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function objeto(valor: unknown, campo: string): Json {
  if (!esJson(valor)) {
    throw new ContractError(campo, `se esperaba un objeto y llegó ${describir(valor)}`);
  }
  return valor;
}

function texto(obj: Json, clave: string, campo: string): string {
  const valor = obj[clave];
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new ContractError(`${campo}.${clave}`, `se esperaba texto y llegó ${describir(valor)}`);
  }
  return valor;
}

function textoOpcional(obj: Json, clave: string): string | null {
  const valor = obj[clave];
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

function enteroOpcional(obj: Json, clave: string): number | null {
  const valor = obj[clave];
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function describir(valor: unknown): string {
  if (valor === null) return 'null';
  if (valor === undefined) return 'nada';
  if (Array.isArray(valor)) return 'un array';
  return `${typeof valor} (${JSON.stringify(valor)?.slice(0, 40)})`;
}

/*
 * El endpoint manda una colección como objeto suelto cuando trae un solo
 * elemento, y como array cuando trae varios. Normalizarlo acá evita que esa
 * inconsistencia del protocolo se filtre al dominio.
 */
function comoLista(valor: unknown): Json[] {
  if (valor === null || valor === undefined) return [];
  if (Array.isArray(valor)) return valor.filter(esJson);
  return esJson(valor) ? [valor] : [];
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

/* `login` y `rut_normalizado` son obligatorios: con ellos se arma la sesión. */
function parsearUsuario(raw: unknown): UsuarioPreparado {
  const campo = 'data.usuario';
  const u = objeto(raw, campo);

  return {
    login: texto(u, 'login', campo),
    rutNormalizado: texto(u, 'rut_normalizado', campo),
    rut: textoOpcional(u, 'rut') ?? '',
    nombreCompleto: textoOpcional(u, 'nombre_completo') ?? '',
    nombres: textoOpcional(u, 'nombres') ?? '',
    apellidoPaterno: textoOpcional(u, 'apellido_paterno'),
    apellidoMaterno: textoOpcional(u, 'apellido_materno'),
    cargo: textoOpcional(u, 'cargo') ?? '',
    tipoUsuario: textoOpcional(u, 'tipo_usuario') ?? '',
    esUsuarioCliente: u['usuario_cliente'] === 'S',
    autenticado: u['autenticado'] === true,
  };
}

/* `codigo_tienda` es la clave con que se vincula todo; `nombre` es NOT NULL. */
function parsearTiendas(raw: unknown): TiendaPreparada[] {
  return comoLista(raw).map((t, i) => {
    const campo = `data.tiendas[${i}]`;
    return {
      idTienda: enteroOpcional(t, 'id_tienda') ?? 0,
      codigoTienda: texto(t, 'codigo_tienda', campo),
      nombreTienda: texto(t, 'nombre_tienda', campo),
    };
  });
}

/*
 * Las filas vienen aplanadas: encabezado repetido + una línea de detalle cada
 * una. Se agrupan por codigo_muestra y se devuelve la primera muestra, que es
 * la única que la app maneja hoy.
 */
function parsearPrimeraMuestra(raw: unknown): MuestraPreparada | null {
  const filas = comoLista(raw);
  const primera = filas[0];
  if (!primera) return null;

  const codigo = texto(primera, 'codigo_muestra', 'data.muestras[0]');
  const suyas = filas.filter((f) => f['codigo_muestra'] === codigo);

  return {
    idMuestra: enteroOpcional(primera, 'id_muestra') ?? 0,
    codigoMuestra: codigo,
    nombreMuestra: textoOpcional(primera, 'nombre_muestra'),
    fechaInicioVigencia: aFechaIso(textoOpcional(primera, 'fecha_inicio_vigencia')),
    fechaFinVigencia: aFechaIso(textoOpcional(primera, 'fecha_fin_vigencia')),
    detalles: suyas.map((f, i) => ({
      /* Sin sku la línea no sirve: es la clave con que se resuelve el producto. */
      sku: texto(f, 'sku', `data.muestras[${i}]`),
      idMuestraDet: enteroOpcional(f, 'id_muestra_det') ?? 0,
      codigoBarras: textoOpcional(f, 'codigo_barras'),
      descripcion: textoOpcional(f, 'descripcion'),
    })),
  };
}

/*
 * Un estado desconocido sí es error: la columna no tiene CHECK, así que un valor
 * inventado entraría a la base y rompería la lógica de bloqueo y reconteo.
 */
function parsearEvento(raw: unknown): EventoPreparado | null {
  const primero = comoLista(raw)[0];
  if (!primero) return null;

  const estado = textoOpcional(primero, 'estado') ?? 'ABIERTO';
  if (!ESTADOS_EVENTO.includes(estado as EstadoEvento)) {
    throw new ContractError(
      'data.eventos.estado',
      `"${estado}" no es un estado válido (${ESTADOS_EVENTO.join(', ')})`
    );
  }

  return {
    fechaProgramada: aFechaIso(textoOpcional(primero, 'fecha_programada')),
    estado,
  };
}

export function parsearPreparacion(raw: unknown): DatosPreparacion {
  const data = objeto(raw, 'data');

  return {
    usuario: parsearUsuario(data['usuario']),
    tiendas: parsearTiendas(data['tiendas']),
    muestra: parsearPrimeraMuestra(data['muestras']),
    evento: parsearEvento(data['eventos']),
  };
}
