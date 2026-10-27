import { ERRORES_ZONIFICACION } from '../models/error-zonificacion.model';
import { MotivoLocal, mensajeZonificacion } from './mensajes-zonificacion.utils';

const GENERICO = 'No se pudo completar la acción.';
const MOTIVOS_LOCALES: MotivoLocal[] = ['SIN_SESION', 'SIN_CATALOGO', 'SIN_ESTADO', 'AGENDA_SOLO_LECTURA', 'RANGO_EN_ENVIO'];

describe('mensajeZonificacion', () => {
  it('cada uno de los 27 códigos del contrato tiene su propio mensaje (ninguno cae en el genérico)', () => {
    for (const codigo of Object.keys(ERRORES_ZONIFICACION)) {
      expect(mensajeZonificacion(codigo)).not.toBe(GENERICO, codigo);
    }
  });

  it('cada motivo local tiene su propio mensaje', () => {
    for (const motivo of MOTIVOS_LOCALES) {
      expect(mensajeZonificacion(motivo)).not.toBe(GENERICO, motivo);
    }
  });

  it('un código desconocido recibe el mensaje genérico, no un texto vacío', () => {
    expect(mensajeZonificacion('CODIGO_DEL_FUTURO')).toBe(GENERICO);
  });

  it('el mensaje de un código con datos los usa', () => {
    expect(mensajeZonificacion('RANGO_CRUZADO', { con: { id_zonificacion_det: 758, tag_desde: 1128, tag_hasta: 1131 } })).toBe(
      'El rango se cruza con otro (1128–1131).',
    );
    expect(mensajeZonificacion('MOTIVO_CORTO', { minimo: 10 })).toBe('El motivo debe tener al menos 10 caracteres.');
    expect(mensajeZonificacion('CANTIDAD_EXCESIVA', { cantidad: 120, maximo: 100 })).toBe('El rango tiene 120 TAG y el máximo es 100.');
    expect(mensajeZonificacion('TAG_CON_CAPTURAS', { numero_tag: 1133 })).toBe('El TAG 1133 ya tiene capturas en el conteo, no se puede anular.');
    expect(mensajeZonificacion('TAGS_SIN_COBERTURA', { total: 3, ejemplos: [1150] })).toContain('3 TAG');
  });

  it('RANGO_FUERA_DE_ZONA dice cuál extremo falla y la banda permitida', () => {
    expect(mensajeZonificacion('RANGO_FUERA_DE_ZONA', { campo: 'tag_desde', permitido_desde: 1000, permitido_hasta: 2999 })).toBe(
      'El TAG inicial queda fuera de la zona: debe estar entre 1000 y 2999.',
    );
    expect(mensajeZonificacion('RANGO_FUERA_DE_ZONA', { campo: 'tag_hasta', permitido_desde: 1000, permitido_hasta: 2999 })).toContain('TAG final');
  });

  it('AGENDA_NO_OPERABLE distingue cerrada de suspendida', () => {
    expect(mensajeZonificacion('AGENDA_NO_OPERABLE', { codigo_estado: 'CERRADA' })).toBe('La agenda está cerrada.');
    expect(mensajeZonificacion('AGENDA_NO_OPERABLE', { codigo_estado: 'SUSPENDIDA' })).toBe('La agenda está suspendida.');
  });

  it('un dato que no llegó no rompe el mensaje', () => {
    expect(mensajeZonificacion('RANGO_CRUZADO', {})).toContain('?');
  });
});
