import { ContractError } from '../../domain/shared/errors/contract.error';
import {
  CodigoProductoPreparado,
  DatosPreparacion,
  DetalleMuestraPreparado,
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

function numeroOpcional(obj: Json, clave: string): number | null {
  const valor = obj[clave];
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
  const lista = comoLista(raw);
  if (lista.length === 0) return [];

  const t = lista[0];
  const campo = 'data.tiendas';
  return [
    {
      idTienda: enteroOpcional(t, 'id_tienda') ?? 0,
      codigoTienda: texto(t, 'codigo_tienda', campo),
      nombreTienda: texto(t, 'nombre_tienda', campo),
      zonaOperativa: textoOpcional(t, 'zona_operativa'),
    },
  ];
}

/*
 * Parsea un código de producto desde el array codigos[].
 * El campo codigo_lectura es obligatorio.
 */
function parsearCodigoProducto(codigoRaw: Json, indexProducto: number, indexCodigo: number): CodigoProductoPreparado {
  const campo = `data.productos[${indexProducto}].codigos[${indexCodigo}]`;
  return {
    codigoLectura: texto(codigoRaw, 'codigo_lectura', campo),
    tipoCodigo: textoOpcional(codigoRaw, 'tipo_codigo'),
    codigoBarras: textoOpcional(codigoRaw, 'codigo_barras'),
  };
}

/*
 * La muestra viene como objeto suelto y los productos como array separado
 * en `data.productos`. Se agrupan los detalles por muestra.
 */
function parsearPrimeraMuestra(muestraRaw: unknown, productosRaw: unknown): MuestraPreparada | null {
  const muestra = esJson(muestraRaw) ? muestraRaw : null;
  if (!muestra) return null;

  const codigo = texto(muestra, 'codigo_muestra', 'data.muestras');

  const productos = comoLista(productosRaw);

  const detalles: DetalleMuestraPreparado[] = productos.map((p, i) => {
    const campoProducto = `data.productos[${i}]`;

    /* codigos[] es obligatorio desde el servidor real */
    const codigosRaw = p['codigos'];
    if (!Array.isArray(codigosRaw) || codigosRaw.length === 0) {
      throw new ContractError(
        `${campoProducto}.codigos`,
        'se esperaba un array con al menos un código y llegó vacío o no existente'
      );
    }

    const codigos = codigosRaw
      .filter((c): c is Json => esJson(c))
      .map((c, j) => parsearCodigoProducto(c, i, j));

    if (codigos.length === 0) {
      throw new ContractError(
        `${campoProducto}.codigos`,
        'ninguno de los códigos es válido'
      );
    }

    return {
      sku: texto(p, 'sku', campoProducto),
      idMuestraDet: enteroOpcional(p, 'id_muestra_det') ?? 0,
      codigoBarras: textoOpcional(p, 'codigo_barras'),
      descripcion: textoOpcional(p, 'descripcion'),
      stockSistema: numeroOpcional(p, 'stock_sistema') ?? 0,
      codigos,
    };
  });

  return {
    idMuestra: enteroOpcional(muestra, 'id_muestra') ?? 0,
    codigoMuestra: codigo,
    idAgenda: enteroOpcional(muestra, 'id_agenda'),
    numeroAgenda: textoOpcional(muestra, 'numero_agenda'),
    nombreMuestra: textoOpcional(muestra, 'nombre_muestra'),
    fechaInicioVigencia: aFechaIso(textoOpcional(muestra, 'fecha_inicio_vigencia')),
    fechaFinVigencia: aFechaIso(textoOpcional(muestra, 'fecha_fin_vigencia')),
    detalles,
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

/*
 * Las zonas vienen como tuplas [codigo, descripcion]. Se normalizan a objetos.
 */
function parsearZonas(raw: unknown): { codigo: string; descripcion: string | null }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is [unknown, unknown] => Array.isArray(t) && t.length >= 1)
    .map((t) => ({
      codigo: typeof t[0] === 'string' ? t[0] : '',
      descripcion: typeof t[1] === 'string' ? t[1] : null,
    }))
    .filter((z) => z.codigo !== '');
}

export function parsearPreparacion(raw: unknown): DatosPreparacion {
  const data = objeto(raw, 'data');

  return {
    usuario: parsearUsuario(data['usuario']),
    tiendas: parsearTiendas(data['tiendas']),
    muestra: parsearPrimeraMuestra(data['muestras'], data['productos']),
    evento: parsearEvento(data['eventos']),
    zonas: parsearZonas(data['zonas_tienda']),
  };
}
