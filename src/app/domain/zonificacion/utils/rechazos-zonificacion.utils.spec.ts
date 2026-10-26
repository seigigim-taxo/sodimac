import { ERRORES_ZONIFICACION } from '../models/error-zonificacion.model';
import { etiquetaCortaRechazo, tituloOperacion } from './rechazos-zonificacion.utils';

describe('etiquetaCortaRechazo', () => {
  it('los motivos más comunes tienen una etiqueta corta', () => {
    expect(etiquetaCortaRechazo('RANGO_CRUZADO')).toBe('Cruce');
    expect(etiquetaCortaRechazo('ZONIFICACION_CONFIRMADA')).toBe('Confirmada');
    expect(etiquetaCortaRechazo('TAG_CON_CAPTURAS')).toBe('Con capturas');
  });

  it('un código sin etiqueta propia, o ninguno, queda como "Rechazado"', () => {
    expect(etiquetaCortaRechazo('CODIGO_DEL_FUTURO')).toBe('Rechazado');
    expect(etiquetaCortaRechazo(null)).toBe('Rechazado');
  });

  it('todo rechazo definitivo posible del contrato tiene su etiqueta (salvo los de petición mal armada)', () => {
    const sinEtiqueta = Object.entries(ERRORES_ZONIFICACION)
      .filter(([, info]) => info.definitivo)
      .map(([codigo]) => codigo)
      .filter((codigo) => etiquetaCortaRechazo(codigo) === 'Rechazado');

    // Errores de programación o de datos del servidor: no los provoca el operador y "Rechazado" basta.
    expect(sinEtiqueta.sort()).toEqual(['PETICION_INVALIDA', 'REFERENCIA_LARGA', 'MOTIVO_CORTO', 'TIPO_OPERACION_INVALIDO', 'ZONA_INVALIDA', 'ZONA_SIN_TIPO'].sort());
  });
});

describe('tituloOperacion', () => {
  it('guardar un rango nuevo dice el rango', () => {
    expect(tituloOperacion({ tipo: 'GUARDAR_RANGO', datos: { id_zonificacion_det: null, tag_desde: 1138, tag_hasta: 1145 } })).toBe('Guardar rango 1138–1145');
  });

  it('editar un rango del servidor se llama "Editar"', () => {
    expect(tituloOperacion({ tipo: 'GUARDAR_RANGO', datos: { id_zonificacion_det: 758, tag_desde: 1128, tag_hasta: 1131 } })).toBe('Editar rango 1128–1131');
  });

  it('un rango de un solo TAG se muestra sin raya', () => {
    expect(tituloOperacion({ tipo: 'GUARDAR_RANGO', datos: { id_zonificacion_det: null, tag_desde: 3117, tag_hasta: 3117 } })).toBe('Guardar rango 3117');
  });

  it('eliminar usa el texto del rango si se conoce, y si no, es genérico', () => {
    expect(tituloOperacion({ tipo: 'ELIMINAR_RANGO', datos: { id_zonificacion_det: 763 } }, '6100–6101')).toBe('Eliminar rango 6100–6101');
    expect(tituloOperacion({ tipo: 'ELIMINAR_RANGO', datos: { id_zonificacion_det: 763 } })).toBe('Eliminar un rango');
  });

  it('anular, confirmar y reabrir', () => {
    expect(tituloOperacion({ tipo: 'ANULAR_TAG', datos: { numero_tag: 1133 } })).toBe('Anular TAG 1133');
    expect(tituloOperacion({ tipo: 'CONFIRMAR', datos: {} })).toBe('Confirmar la zonificación');
    expect(tituloOperacion({ tipo: 'REABRIR', datos: {} })).toBe('Reabrir la zonificación');
  });
});
