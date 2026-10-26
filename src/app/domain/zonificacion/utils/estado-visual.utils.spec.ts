import { ETIQUETA_ESTADO_VISUAL, TONO_ESTADO_VISUAL, estadoVisualDeLista, estadoVisualDeResumen } from './estado-visual.utils';

describe('estadoVisualDeLista', () => {
  it('sin cabecera, sin zonificar', () => {
    expect(estadoVisualDeLista('SIN_ZONIFICACION', 0)).toBe('SIN_ZONIFICAR');
  });

  it('borrador sin capturas es borrador; con capturas el conteo va adelante: pendiente en conteo', () => {
    expect(estadoVisualDeLista('BORRADOR', 0)).toBe('BORRADOR');
    expect(estadoVisualDeLista('BORRADOR', 4)).toBe('PENDIENTE_EN_CONTEO');
  });

  it('confirmada manda sobre las capturas', () => {
    expect(estadoVisualDeLista('CONFIRMADA', 4)).toBe('CONFIRMADA');
  });
});

describe('estadoVisualDeResumen', () => {
  const limpio = { tagsUsados: 0, desbalance: false };

  it('una agenda sin cabecera y sin rangos está sin zonificar', () => {
    expect(estadoVisualDeResumen('SIN_ZONIFICACION', null, 0, false)).toBe('SIN_ZONIFICAR');
  });

  it('con un rango pendiente de envío ya es borrador aunque el servidor aún no la conozca', () => {
    expect(estadoVisualDeResumen('SIN_ZONIFICACION', null, 0, true)).toBe('BORRADOR');
  });

  it('borrador sin nada raro', () => {
    expect(estadoVisualDeResumen('BORRADOR', limpio, 0, true)).toBe('BORRADOR');
  });

  it('el conteo ya usa TAG: pendiente en conteo', () => {
    expect(estadoVisualDeResumen('BORRADOR', { tagsUsados: 4, desbalance: false }, 0, true)).toBe('PENDIENTE_EN_CONTEO');
  });

  it('rangos desbalanceados requieren ajuste, aunque también haya TAG usados', () => {
    expect(estadoVisualDeResumen('BORRADOR', { tagsUsados: 4, desbalance: true }, 0, true)).toBe('REQUIERE_AJUSTE');
  });

  it('TAG usados fuera de todo rango requieren ajuste', () => {
    expect(estadoVisualDeResumen('BORRADOR', { tagsUsados: 4, desbalance: false }, 3, true)).toBe('REQUIERE_AJUSTE');
  });

  it('confirmada manda sobre todo', () => {
    expect(estadoVisualDeResumen('CONFIRMADA', { tagsUsados: 4, desbalance: true }, 3, true)).toBe('CONFIRMADA');
  });

  it('cada estado tiene etiqueta y tono', () => {
    for (const estado of ['SIN_ZONIFICAR', 'BORRADOR', 'PENDIENTE_EN_CONTEO', 'REQUIERE_AJUSTE', 'CONFIRMADA'] as const) {
      expect(ETIQUETA_ESTADO_VISUAL[estado].length).toBeGreaterThan(0);
      expect(TONO_ESTADO_VISUAL[estado]).toBeDefined();
    }
  });
});
