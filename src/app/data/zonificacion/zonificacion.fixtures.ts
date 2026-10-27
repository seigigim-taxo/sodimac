/*
 * Respuestas reales del contrato v1 del WS (sodimac-ws/tests/zonificacion/contrato/v1/),
 * en la forma en que las recibe la app: solo la parte `data`, que es lo que
 * ApiService entrega al repositorio. Solo para specs.
 *
 * Generado desde los JSON del contrato; si el contrato cambia, se regenera.
 */

export const CATALOGO_V1_DATA: unknown = {
  "version": "2026-10-21",
  "zonas": [
    {
      "id_regla": 1,
      "codigo_zona": "ALTILLO",
      "nombre": "ALTILLO",
      "tag_desde": 1000,
      "tag_hasta": 2999,
      "orden": 10,
      "codigo_tipo_ubicacion": "ALTILLO",
      "id_tipo_ubicacion": 2
    },
    {
      "id_regla": 2,
      "codigo_zona": "PUNTO_VENTA",
      "nombre": "PUNTO DE VENTA",
      "tag_desde": 3000,
      "tag_hasta": 4999,
      "orden": 20,
      "codigo_tipo_ubicacion": "PUNTO_VENTA",
      "id_tipo_ubicacion": 1
    },
    {
      "id_regla": 3,
      "codigo_zona": "BODEGA_TRASTIENDA",
      "nombre": "ZONAS DE REMATE / BODEGAS / TRASTIENDA",
      "tag_desde": 5000,
      "tag_hasta": 5999,
      "orden": 30,
      "codigo_tipo_ubicacion": "BODEGA",
      "id_tipo_ubicacion": 4
    },
    {
      "id_regla": 4,
      "codigo_zona": "EXHIBICIONES",
      "nombre": "EXHIBICIONES",
      "tag_desde": 6000,
      "tag_hasta": 6999,
      "orden": 40,
      "codigo_tipo_ubicacion": "EXHIBICION",
      "id_tipo_ubicacion": 7
    },
    {
      "id_regla": 5,
      "codigo_zona": "VENTAS_ADICIONALES",
      "nombre": "ZONAS DE VENTAS ADICIONALES",
      "tag_desde": 7000,
      "tag_hasta": 8000,
      "orden": 50,
      "codigo_tipo_ubicacion": "OTRO",
      "id_tipo_ubicacion": 9
    }
  ],
  "parametros": {
    "cantidad_advertencia": null,
    "cantidad_maxima": null,
    "motivo_largo_minimo": 10,
    "referencia_largo_maximo": 250
  }
};

export const AGENDAS_V1_DATA: unknown = {
  "hoy": "2026-10-23",
  "agendas": [
    {
      "id_agenda": 3120,
      "numero_agenda": "AG-20261023-1604-01",
      "fecha_agenda": "2026-10-23",
      "tienda": {
        "id_tienda": 78,
        "codigo_tienda": "1604",
        "nombre_tienda": "HC TAXO"
      },
      "codigo_estado": "EN_CONTEO",
      "operable": true,
      "solo_lectura": false,
      "zonificacion": {
        "estado": "BORRADOR",
        "cantidad_zonas": 3,
        "tags_zonificados": 11,
        "tags_capturados": 4
      }
    },
    {
      "id_agenda": 3151,
      "numero_agenda": "AG-20261026-1604-01",
      "fecha_agenda": "2026-10-26",
      "tienda": {
        "id_tienda": 78,
        "codigo_tienda": "1604",
        "nombre_tienda": "HC TAXO"
      },
      "codigo_estado": "PLANIFICADA",
      "operable": true,
      "solo_lectura": false,
      "zonificacion": {
        "estado": "SIN_ZONIFICACION",
        "cantidad_zonas": 0,
        "tags_zonificados": 0,
        "tags_capturados": 0
      }
    }
  ],
  "hora_servidor": "2026-10-23T09:12:41-03:00"
};

export const ESTADO_V1_DATA: unknown = {
  "estado": {
    "agenda": {
      "id_agenda": 2092,
      "numero_agenda": "AG-20260909-4081-01",
      "fecha_agenda": "2026-09-09",
      "codigo_estado": "EN_CONTEO",
      "operable": true,
      "solo_lectura": false
    },
    "zonificacion": {
      "id_zonificacion": 4647,
      "estado": "BORRADOR",
      "fecha_modificacion": "2026-09-09 10:42:11",
      "login_modificacion": "operador1@prueba.local",
      "fecha_confirmacion": null
    },
    "resumen": {
      "cantidad_zonas": 4,
      "tags_zonificados": 9,
      "tags_usados": 0,
      "tags_pendientes": 9,
      "porcentaje_tags_contados": 0.0,
      "fl_desbalance": "N",
      "fl_zonificacion_ok": "N"
    },
    "rangos": [
      {
        "id_zonificacion_det": 758,
        "orden": 1,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1128,
        "tag_hasta": 1131,
        "referencia_ubicacion": "P48",
        "qty_zonificado": 4,
        "qty_usado": 0,
        "qty_pendiente": 4,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 761,
        "orden": 2,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1132,
        "tag_hasta": 1134,
        "referencia_ubicacion": "ARRIENDO",
        "qty_zonificado": 3,
        "qty_usado": 0,
        "qty_pendiente": 3,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 762,
        "orden": 3,
        "codigo_zona": "PUNTO_VENTA",
        "nombre_zona": "PUNTO DE VENTA",
        "codigo_tipo_ubicacion": "PUNTO_VENTA",
        "tag_desde": 3117,
        "tag_hasta": 3117,
        "referencia_ubicacion": "P48 M19",
        "qty_zonificado": 1,
        "qty_usado": 0,
        "qty_pendiente": 1,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 763,
        "orden": 4,
        "codigo_zona": "PUNTO_VENTA",
        "nombre_zona": "PUNTO DE VENTA",
        "codigo_tipo_ubicacion": "PUNTO_VENTA",
        "tag_desde": 3118,
        "tag_hasta": 3118,
        "referencia_ubicacion": "ARRIENDO",
        "qty_zonificado": 1,
        "qty_usado": 0,
        "qty_pendiente": 1,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      }
    ],
    "tags_anulados": [],
    "tags_fuera": {
      "total": 0,
      "ejemplos": []
    },
    "hora_servidor": "2026-09-09T10:42:12-03:00"
  }
};

export const GUARDAR_APLICADA_V1_DATA: unknown = {
  "resultado": "APLICADA",
  "operacion_uid": "6f1c2a9e-3b7d-4c55-9a10-0d2f7e8b1a01",
  "id_zonificacion_det": 764,
  "estado": {
    "agenda": {
      "id_agenda": 2092,
      "numero_agenda": "AG-20260909-4081-01",
      "fecha_agenda": "2026-09-09",
      "codigo_estado": "EN_CONTEO",
      "operable": true,
      "solo_lectura": false
    },
    "zonificacion": {
      "id_zonificacion": 4647,
      "estado": "BORRADOR",
      "fecha_modificacion": "2026-09-09 10:42:11",
      "login_modificacion": "operador1@prueba.local",
      "fecha_confirmacion": null
    },
    "resumen": {
      "cantidad_zonas": 5,
      "tags_zonificados": 15,
      "tags_usados": 0,
      "tags_pendientes": 15,
      "porcentaje_tags_contados": 0.0,
      "fl_desbalance": "N",
      "fl_zonificacion_ok": "N"
    },
    "rangos": [
      {
        "id_zonificacion_det": 758,
        "orden": 1,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1128,
        "tag_hasta": 1131,
        "referencia_ubicacion": "P48",
        "qty_zonificado": 4,
        "qty_usado": 0,
        "qty_pendiente": 4,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 761,
        "orden": 2,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1132,
        "tag_hasta": 1134,
        "referencia_ubicacion": "ARRIENDO",
        "qty_zonificado": 3,
        "qty_usado": 0,
        "qty_pendiente": 3,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 762,
        "orden": 3,
        "codigo_zona": "PUNTO_VENTA",
        "nombre_zona": "PUNTO DE VENTA",
        "codigo_tipo_ubicacion": "PUNTO_VENTA",
        "tag_desde": 3117,
        "tag_hasta": 3117,
        "referencia_ubicacion": "P48 M19",
        "qty_zonificado": 1,
        "qty_usado": 0,
        "qty_pendiente": 1,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 763,
        "orden": 4,
        "codigo_zona": "PUNTO_VENTA",
        "nombre_zona": "PUNTO DE VENTA",
        "codigo_tipo_ubicacion": "PUNTO_VENTA",
        "tag_desde": 3118,
        "tag_hasta": 3118,
        "referencia_ubicacion": "ARRIENDO",
        "qty_zonificado": 1,
        "qty_usado": 0,
        "qty_pendiente": 1,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 764,
        "orden": 5,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1135,
        "tag_hasta": 1140,
        "referencia_ubicacion": "P49",
        "qty_zonificado": 6,
        "qty_usado": 0,
        "qty_pendiente": 6,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      }
    ],
    "tags_anulados": [],
    "tags_fuera": {
      "total": 0,
      "ejemplos": []
    },
    "hora_servidor": "2026-09-09T10:42:12-03:00"
  }
};

export const GUARDAR_YA_APLICADA_V1_DATA: unknown = {
  "resultado": "YA_APLICADA",
  "operacion_uid": "6f1c2a9e-3b7d-4c55-9a10-0d2f7e8b1a01",
  "id_zonificacion_det": 764,
  "estado": {
    "agenda": {
      "id_agenda": 2092,
      "numero_agenda": "AG-20260909-4081-01",
      "fecha_agenda": "2026-09-09",
      "codigo_estado": "EN_CONTEO",
      "operable": true,
      "solo_lectura": false
    },
    "zonificacion": {
      "id_zonificacion": 4647,
      "estado": "BORRADOR",
      "fecha_modificacion": "2026-09-09 10:42:11",
      "login_modificacion": "operador1@prueba.local",
      "fecha_confirmacion": null
    },
    "resumen": {
      "cantidad_zonas": 5,
      "tags_zonificados": 15,
      "tags_usados": 0,
      "tags_pendientes": 15,
      "porcentaje_tags_contados": 0.0,
      "fl_desbalance": "N",
      "fl_zonificacion_ok": "N"
    },
    "rangos": [
      {
        "id_zonificacion_det": 758,
        "orden": 1,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1128,
        "tag_hasta": 1131,
        "referencia_ubicacion": "P48",
        "qty_zonificado": 4,
        "qty_usado": 0,
        "qty_pendiente": 4,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 761,
        "orden": 2,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1132,
        "tag_hasta": 1134,
        "referencia_ubicacion": "ARRIENDO",
        "qty_zonificado": 3,
        "qty_usado": 0,
        "qty_pendiente": 3,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 762,
        "orden": 3,
        "codigo_zona": "PUNTO_VENTA",
        "nombre_zona": "PUNTO DE VENTA",
        "codigo_tipo_ubicacion": "PUNTO_VENTA",
        "tag_desde": 3117,
        "tag_hasta": 3117,
        "referencia_ubicacion": "P48 M19",
        "qty_zonificado": 1,
        "qty_usado": 0,
        "qty_pendiente": 1,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 763,
        "orden": 4,
        "codigo_zona": "PUNTO_VENTA",
        "nombre_zona": "PUNTO DE VENTA",
        "codigo_tipo_ubicacion": "PUNTO_VENTA",
        "tag_desde": 3118,
        "tag_hasta": 3118,
        "referencia_ubicacion": "ARRIENDO",
        "qty_zonificado": 1,
        "qty_usado": 0,
        "qty_pendiente": 1,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 764,
        "orden": 5,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1135,
        "tag_hasta": 1140,
        "referencia_ubicacion": "P49",
        "qty_zonificado": 6,
        "qty_usado": 0,
        "qty_pendiente": 6,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      }
    ],
    "tags_anulados": [],
    "tags_fuera": {
      "total": 0,
      "ejemplos": []
    },
    "hora_servidor": "2026-09-09T10:42:12-03:00"
  }
};

export const ELIMINAR_APLICADA_V1_DATA: unknown = {
  "resultado": "APLICADA",
  "operacion_uid": "6f1c2a9e-3b7d-4c55-9a10-0d2f7e8b1a03",
  "id_zonificacion_det": 763,
  "estado": {
    "agenda": {
      "id_agenda": 2092,
      "numero_agenda": "AG-20260909-4081-01",
      "fecha_agenda": "2026-09-09",
      "codigo_estado": "EN_CONTEO",
      "operable": true,
      "solo_lectura": false
    },
    "zonificacion": {
      "id_zonificacion": 4647,
      "estado": "BORRADOR",
      "fecha_modificacion": "2026-09-09 10:42:11",
      "login_modificacion": "operador1@prueba.local",
      "fecha_confirmacion": null
    },
    "resumen": {
      "cantidad_zonas": 3,
      "tags_zonificados": 8,
      "tags_usados": 0,
      "tags_pendientes": 8,
      "porcentaje_tags_contados": 0.0,
      "fl_desbalance": "N",
      "fl_zonificacion_ok": "N"
    },
    "rangos": [
      {
        "id_zonificacion_det": 758,
        "orden": 1,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1128,
        "tag_hasta": 1131,
        "referencia_ubicacion": "P48",
        "qty_zonificado": 4,
        "qty_usado": 0,
        "qty_pendiente": 4,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 761,
        "orden": 2,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1132,
        "tag_hasta": 1134,
        "referencia_ubicacion": "ARRIENDO",
        "qty_zonificado": 3,
        "qty_usado": 0,
        "qty_pendiente": 3,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 762,
        "orden": 3,
        "codigo_zona": "PUNTO_VENTA",
        "nombre_zona": "PUNTO DE VENTA",
        "codigo_tipo_ubicacion": "PUNTO_VENTA",
        "tag_desde": 3117,
        "tag_hasta": 3117,
        "referencia_ubicacion": "P48 M19",
        "qty_zonificado": 1,
        "qty_usado": 0,
        "qty_pendiente": 1,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      }
    ],
    "tags_anulados": [],
    "tags_fuera": {
      "total": 0,
      "ejemplos": []
    },
    "hora_servidor": "2026-09-09T10:42:12-03:00"
  }
};

export const ANULAR_TAG_APLICADA_V1_DATA: unknown = {
  "resultado": "APLICADA",
  "operacion_uid": "6f1c2a9e-3b7d-4c55-9a10-0d2f7e8b1a04",
  "numero_tag": 1133,
  "estado": {
    "agenda": {
      "id_agenda": 2092,
      "numero_agenda": "AG-20260909-4081-01",
      "fecha_agenda": "2026-09-09",
      "codigo_estado": "EN_CONTEO",
      "operable": true,
      "solo_lectura": false
    },
    "zonificacion": {
      "id_zonificacion": 4647,
      "estado": "BORRADOR",
      "fecha_modificacion": "2026-09-09 10:42:11",
      "login_modificacion": "operador1@prueba.local",
      "fecha_confirmacion": null
    },
    "resumen": {
      "cantidad_zonas": 4,
      "tags_zonificados": 8,
      "tags_usados": 0,
      "tags_pendientes": 8,
      "porcentaje_tags_contados": 0.0,
      "fl_desbalance": "N",
      "fl_zonificacion_ok": "N"
    },
    "rangos": [
      {
        "id_zonificacion_det": 758,
        "orden": 1,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1128,
        "tag_hasta": 1131,
        "referencia_ubicacion": "P48",
        "qty_zonificado": 4,
        "qty_usado": 0,
        "qty_pendiente": 4,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 761,
        "orden": 2,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1132,
        "tag_hasta": 1134,
        "referencia_ubicacion": "ARRIENDO",
        "qty_zonificado": 2,
        "qty_usado": 0,
        "qty_pendiente": 2,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 762,
        "orden": 3,
        "codigo_zona": "PUNTO_VENTA",
        "nombre_zona": "PUNTO DE VENTA",
        "codigo_tipo_ubicacion": "PUNTO_VENTA",
        "tag_desde": 3117,
        "tag_hasta": 3117,
        "referencia_ubicacion": "P48 M19",
        "qty_zonificado": 1,
        "qty_usado": 0,
        "qty_pendiente": 1,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 763,
        "orden": 4,
        "codigo_zona": "PUNTO_VENTA",
        "nombre_zona": "PUNTO DE VENTA",
        "codigo_tipo_ubicacion": "PUNTO_VENTA",
        "tag_desde": 3118,
        "tag_hasta": 3118,
        "referencia_ubicacion": "ARRIENDO",
        "qty_zonificado": 1,
        "qty_usado": 0,
        "qty_pendiente": 1,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      }
    ],
    "tags_anulados": [
      {
        "numero_tag": 1133,
        "motivo": "No se encontro el TAG en la tienda",
        "fecha_anulacion": "2026-09-09 10:44:03",
        "login_anulacion": "operador1@prueba.local"
      }
    ],
    "tags_fuera": {
      "total": 0,
      "ejemplos": []
    },
    "hora_servidor": "2026-09-09T10:42:12-03:00"
  }
};

export const CONFIRMAR_APLICADA_V1_DATA: unknown = {
  "resultado": "APLICADA",
  "operacion_uid": "6f1c2a9e-3b7d-4c55-9a10-0d2f7e8b1a05",
  "estado": {
    "agenda": {
      "id_agenda": 2092,
      "numero_agenda": "AG-20260909-4081-01",
      "fecha_agenda": "2026-09-09",
      "codigo_estado": "EN_CONTEO",
      "operable": true,
      "solo_lectura": false
    },
    "zonificacion": {
      "id_zonificacion": 4647,
      "estado": "CONFIRMADA",
      "fecha_modificacion": "2026-09-09 10:42:11",
      "login_modificacion": "operador1@prueba.local",
      "fecha_confirmacion": "2026-09-09 10:42:11"
    },
    "resumen": {
      "cantidad_zonas": 3,
      "tags_zonificados": 8,
      "tags_usados": 0,
      "tags_pendientes": 8,
      "porcentaje_tags_contados": 0.0,
      "fl_desbalance": "N",
      "fl_zonificacion_ok": "S"
    },
    "rangos": [
      {
        "id_zonificacion_det": 758,
        "orden": 1,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1128,
        "tag_hasta": 1131,
        "referencia_ubicacion": "P48",
        "qty_zonificado": 4,
        "qty_usado": 0,
        "qty_pendiente": 4,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 761,
        "orden": 2,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1132,
        "tag_hasta": 1134,
        "referencia_ubicacion": "ARRIENDO",
        "qty_zonificado": 3,
        "qty_usado": 0,
        "qty_pendiente": 3,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 762,
        "orden": 3,
        "codigo_zona": "PUNTO_VENTA",
        "nombre_zona": "PUNTO DE VENTA",
        "codigo_tipo_ubicacion": "PUNTO_VENTA",
        "tag_desde": 3117,
        "tag_hasta": 3117,
        "referencia_ubicacion": "P48 M19",
        "qty_zonificado": 1,
        "qty_usado": 0,
        "qty_pendiente": 1,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      }
    ],
    "tags_anulados": [],
    "tags_fuera": {
      "total": 0,
      "ejemplos": []
    },
    "hora_servidor": "2026-09-09T10:42:12-03:00"
  }
};

export const REABRIR_APLICADA_V1_DATA: unknown = {
  "resultado": "APLICADA",
  "operacion_uid": "6f1c2a9e-3b7d-4c55-9a10-0d2f7e8b1a06",
  "estado": {
    "agenda": {
      "id_agenda": 2092,
      "numero_agenda": "AG-20260909-4081-01",
      "fecha_agenda": "2026-09-09",
      "codigo_estado": "EN_CONTEO",
      "operable": true,
      "solo_lectura": false
    },
    "zonificacion": {
      "id_zonificacion": 4647,
      "estado": "BORRADOR",
      "fecha_modificacion": "2026-09-09 10:42:11",
      "login_modificacion": "operador1@prueba.local",
      "fecha_confirmacion": "2026-09-09 10:42:11"
    },
    "resumen": {
      "cantidad_zonas": 3,
      "tags_zonificados": 8,
      "tags_usados": 0,
      "tags_pendientes": 8,
      "porcentaje_tags_contados": 0.0,
      "fl_desbalance": "N",
      "fl_zonificacion_ok": "N"
    },
    "rangos": [
      {
        "id_zonificacion_det": 758,
        "orden": 1,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1128,
        "tag_hasta": 1131,
        "referencia_ubicacion": "P48",
        "qty_zonificado": 4,
        "qty_usado": 0,
        "qty_pendiente": 4,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 761,
        "orden": 2,
        "codigo_zona": "ALTILLO",
        "nombre_zona": "ALTILLO",
        "codigo_tipo_ubicacion": "ALTILLO",
        "tag_desde": 1132,
        "tag_hasta": 1134,
        "referencia_ubicacion": "ARRIENDO",
        "qty_zonificado": 3,
        "qty_usado": 0,
        "qty_pendiente": 3,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      },
      {
        "id_zonificacion_det": 762,
        "orden": 3,
        "codigo_zona": "PUNTO_VENTA",
        "nombre_zona": "PUNTO DE VENTA",
        "codigo_tipo_ubicacion": "PUNTO_VENTA",
        "tag_desde": 3117,
        "tag_hasta": 3117,
        "referencia_ubicacion": "P48 M19",
        "qty_zonificado": 1,
        "qty_usado": 0,
        "qty_pendiente": 1,
        "porcentaje_cierre": 0.0,
        "fl_desbalance": "N"
      }
    ],
    "tags_anulados": [],
    "tags_fuera": {
      "total": 0,
      "ejemplos": []
    },
    "hora_servidor": "2026-09-09T10:42:12-03:00"
  }
};
