import { ERRORES_ZONIFICACION, esCodigoErrorZonificacion, esErrorDefinitivo } from './error-zonificacion.model';

/* Respaldo de sodimac-ws/tests/zonificacion/contrato/v1/errores.json (27 códigos). */
describe('errores de zonificación (contrato v1)', () => {
  it('son los 27 códigos del contrato', () => {
    expect(Object.keys(ERRORES_ZONIFICACION).length).toBe(27);
  });

  it('solo 500 y 503 son transitorios', () => {
    const transitorios = Object.entries(ERRORES_ZONIFICACION)
      .filter(([, info]) => !info.definitivo)
      .map(([codigo, info]) => `${codigo}:${info.http}`)
      .sort();
    expect(transitorios).toEqual(['ERROR_INTERNO:500', 'ZONIFICACION_OCUPADA:503']);
  });

  it('todo 4xx es definitivo', () => {
    for (const info of Object.values<{ http: number; definitivo: boolean }>(ERRORES_ZONIFICACION)) {
      if (info.http >= 400 && info.http < 500) {
        expect(info.definitivo).toBeTrue();
      }
    }
  });

  it('los rechazos de asignación y de ventana son definitivos', () => {
    expect(esErrorDefinitivo('AGENDA_NO_ASIGNADA')).toBeTrue();
    expect(esErrorDefinitivo('AGENDA_FUERA_DE_VENTANA')).toBeTrue();
    expect(esErrorDefinitivo('OPERACION_REUTILIZADA')).toBeTrue();
  });

  it('un código desconocido se trata como transitorio (se reintenta, no se descarta)', () => {
    expect(esCodigoErrorZonificacion('NUEVO_CODIGO')).toBeFalse();
    expect(esErrorDefinitivo('NUEVO_CODIGO')).toBeFalse();
  });
});
