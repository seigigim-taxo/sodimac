/*
 * DATOS DE MAQUETA — no hay repositorio detrás todavía.
 *
 * Estos valores replican la referencia visual acordada en reunión para validar
 * la pantalla con el negocio. Cuando exista el caso de uso que los calcule
 * desde SQLite, este archivo se borra y los tipos se mudan a domain/dashboard/.
 *
 * Ojo con los montos: sod_producto no tiene precio hoy, así que TODO lo
 * monetario de esta pantalla es simulado, no derivable de la base local.
 */

export type PrioridadDiferencia = 'ALTA' | 'MEDIA' | 'BAJA';
export type EstadoDiferencia = 'CRITICA' | 'PENDIENTE' | 'RESUELTA';

export interface DiferenciaItem {
  id: number;
  prioridad: PrioridadDiferencia;
  zona: string;
  tag: string;
  sku: string;
  producto: string;
  primerConteo: number;
  kardex: number;
  /* Negativo = falta stock físico respecto al kárdex. */
  difUnidades: number;
  difMonto: number;
  estado: EstadoDiferencia;
}

export interface ZonaPrioridad {
  zona: string;
  monto: number;
}

export interface ActividadItem {
  descripcion: string;
  hora: string;
  referencia: string;
  tono: 'critica' | 'exito' | 'info';
}

/*
 * Indicadores del evento COMPLETO. No se derivan de DIFERENCIAS_MOCK a
 * propósito: la cola de abajo es el top priorizado, no el universo. Derivarlos
 * de las filas visibles daría cifras que se contradicen con el encabezado.
 */
export interface IndicadoresEvento {
  diferenciasPendientes: number;
  altaPrioridad: number;
  valorDiferencias: number;
  criticas: number;
  umbralCritica: number;
  recontosRealizados: number;
  diferenciasResueltas: number;
  persistenConDiferencia: number;
}

export const INDICADORES_MOCK: IndicadoresEvento = {
  diferenciasPendientes: 128,
  altaPrioridad: 23,
  valorDiferencias: 8_420_000,
  criticas: 11,
  umbralCritica: 500_000,
  recontosRealizados: 46,
  diferenciasResueltas: 31,
  persistenConDiferencia: 15,
};

export interface JornadaActiva {
  codigoTienda: string;
  nombreTienda: string;
  fecha: string;
  folio: string;
  muestra: string;
  inicioValidacion: string;
}

export const JORNADA_MOCK: JornadaActiva = {
  codigoTienda: '4726',
  nombreTienda: 'HC Tobalaba',
  fecha: 'Lunes 10 de agosto de 2026',
  folio: 'AG-20260810-4726-01',
  muestra: 'Revisión Inventario Nacional',
  inicioValidacion: '16:12',
};

export const ZONAS_MOCK = [
  'Pasillo 04 · Hogar',
  'Exhibición',
  'Patio Constructor',
  'Bodega Altillo',
];

export const DIFERENCIAS_MOCK: DiferenciaItem[] = [
  {
    id: 1,
    prioridad: 'ALTA',
    zona: 'Exhibición',
    tag: 'R-EXH-0041',
    sku: '845921',
    producto: 'Taladro inalámbrico 20V',
    primerConteo: 2,
    kardex: 14,
    difUnidades: -12,
    difMonto: 1248000,
    estado: 'CRITICA',
  },
  {
    id: 2,
    prioridad: 'ALTA',
    zona: 'Pasillo 04 · Hogar',
    tag: 'TAG-044-021',
    sku: '778214',
    producto: 'Juego comedor 6 sillas',
    primerConteo: 1,
    kardex: 5,
    difUnidades: -4,
    difMonto: 799960,
    estado: 'CRITICA',
  },
  {
    id: 3,
    prioridad: 'MEDIA',
    zona: 'Patio Constructor',
    tag: 'TAG-PC-118',
    sku: '662180',
    producto: 'Cerámica gris 60x60',
    primerConteo: 28,
    kardex: 44,
    difUnidades: -16,
    difMonto: 367840,
    estado: 'PENDIENTE',
  },
  {
    id: 4,
    prioridad: 'MEDIA',
    zona: 'Pasillo 04 · Hogar',
    tag: 'TAG-044-035',
    sku: '451902',
    producto: 'Repisa mural 80 cm',
    primerConteo: 9,
    kardex: 17,
    difUnidades: -8,
    difMonto: 159920,
    estado: 'PENDIENTE',
  },
  {
    id: 5,
    prioridad: 'MEDIA',
    zona: 'Exhibición',
    tag: 'R-EXH-0032',
    sku: '310475',
    producto: 'Set herramientas 42 piezas',
    primerConteo: 12,
    kardex: 15,
    difUnidades: -3,
    difMonto: 89970,
    estado: 'RESUELTA',
  },
  {
    id: 6,
    prioridad: 'BAJA',
    zona: 'Bodega Altillo',
    tag: 'TAG-ALT-007',
    sku: '905612',
    producto: 'Pintura látex 4 galones',
    primerConteo: 33,
    kardex: 35,
    difUnidades: -2,
    difMonto: 51800,
    estado: 'PENDIENTE',
  },
  {
    id: 7,
    prioridad: 'BAJA',
    zona: 'Patio Constructor',
    tag: 'TAG-PC-092',
    sku: '118340',
    producto: 'Saco cemento 25 kg',
    primerConteo: 120,
    kardex: 118,
    difUnidades: 2,
    difMonto: 12900,
    estado: 'RESUELTA',
  },
];

export const PRIORIDAD_ZONA_MOCK: ZonaPrioridad[] = [
  { zona: 'Exhibición', monto: 3_100_000 },
  { zona: 'Pasillo 04 · Hogar', monto: 2_400_000 },
  { zona: 'Patio Constructor', monto: 1_800_000 },
];

export const ACTIVIDAD_MOCK: ActividadItem[] = [
  {
    descripcion: 'SKU 845921 marcado como diferencia crítica.',
    hora: '16:56',
    referencia: 'Exhibición',
    tono: 'critica',
  },
  {
    descripcion: 'Reconteo de SKU 310475 resolvió la diferencia.',
    hora: '16:51',
    referencia: 'R-EXH-0032',
    tono: 'exito',
  },
  {
    descripcion: 'Sincronización con servidor completada.',
    hora: '16:48',
    referencia: '23 capturas enviadas',
    tono: 'info',
  },
];
