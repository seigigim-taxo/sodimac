/*
 * Los 27 códigos de error del contrato v1 (sodimac-ws/tests/zonificacion/contrato/v1/errores.json).
 *
 * Lo que decide la app es si el error es DEFINITIVO o TRANSITORIO:
 *  - definitivo: el servidor entendió la operación y la rechaza; reintentarla da
 *    lo mismo. El envío queda RECHAZADO y el operador ve el motivo.
 *  - transitorio (500 y 503): no se sabe si se aplicó; se reintenta con el mismo
 *    `operacion_uid`, que el servidor reconoce como YA_APLICADA si sí se aplicó.
 */
export interface InfoErrorZonificacion {
  http: number;
  definitivo: boolean;
}

export const ERRORES_ZONIFICACION = {
  PETICION_INVALIDA: { http: 400, definitivo: true },
  TIPO_OPERACION_INVALIDO: { http: 400, definitivo: true },
  ZONA_INVALIDA: { http: 400, definitivo: true },
  RANGO_FUERA_DE_ZONA: { http: 400, definitivo: true },
  RANGO_INVALIDO: { http: 400, definitivo: true },
  CANTIDAD_EXCESIVA: { http: 400, definitivo: true },
  REFERENCIA_LARGA: { http: 400, definitivo: true },
  MOTIVO_CORTO: { http: 400, definitivo: true },
  SIN_ACCESO: { http: 403, definitivo: true },
  SIN_PERMISO: { http: 403, definitivo: true },
  AGENDA_NO_ASIGNADA: { http: 403, definitivo: true },
  AGENDA_NO_ENCONTRADA: { http: 404, definitivo: true },
  RANGO_NO_ENCONTRADO: { http: 404, definitivo: true },
  TAG_NO_EXISTE: { http: 404, definitivo: true },
  AGENDA_NO_OPERABLE: { http: 409, definitivo: true },
  AGENDA_FUERA_DE_VENTANA: { http: 409, definitivo: true },
  ZONIFICACION_CONFIRMADA: { http: 409, definitivo: true },
  ZONA_SIN_TIPO: { http: 409, definitivo: true },
  RANGO_CRUZADO: { http: 409, definitivo: true },
  TAG_YA_ANULADO: { http: 409, definitivo: true },
  TAG_CON_CAPTURAS: { http: 409, definitivo: true },
  OPERACION_REUTILIZADA: { http: 409, definitivo: true },
  ZONIFICACION_NO_CONFIRMADA: { http: 409, definitivo: true },
  ZONIFICACION_VACIA: { http: 409, definitivo: true },
  TAGS_SIN_COBERTURA: { http: 409, definitivo: true },
  ZONIFICACION_OCUPADA: { http: 503, definitivo: false },
  ERROR_INTERNO: { http: 500, definitivo: false },
} as const satisfies Record<string, InfoErrorZonificacion>;

export type CodigoErrorZonificacion = keyof typeof ERRORES_ZONIFICACION;

export interface ErrorZonificacion {
  codigo: CodigoErrorZonificacion;
  data: Record<string, unknown>;
}

export const esCodigoErrorZonificacion = (codigo: unknown): codigo is CodigoErrorZonificacion =>
  typeof codigo === 'string' && Object.prototype.hasOwnProperty.call(ERRORES_ZONIFICACION, codigo);

/* Un código que la app no conoce se trata como transitorio: es más seguro reintentar que descartar. */
export const esErrorDefinitivo = (codigo: string): boolean =>
  esCodigoErrorZonificacion(codigo) ? ERRORES_ZONIFICACION[codigo].definitivo : false;
