import { ahoraSql, hoySql } from './fecha.utils';

/*
 * Se prueban con una fecha inyectada, no con la del reloj: el bug que motivó
 * este archivo dependía de la hora del día, y un test que use `new Date()` real
 * pasa 20 horas al día y falla las otras 4.
 */
describe('fecha.utils', () => {
  describe('hoySql', () => {
    it('devuelve YYYY-MM-DD', () => {
      expect(hoySql(new Date(2026, 7, 25, 14, 30, 0))).toBe('2026-08-25');
    });

    it('rellena mes y día con cero', () => {
      expect(hoySql(new Date(2026, 0, 5, 9, 0, 0))).toBe('2026-01-05');
    });

    /*
     * El caso que rompía la selección de eventos: a las 20:00 en Chile (UTC−4)
     * ya es el día siguiente en UTC. Con toISOString() el evento del día quedaba
     * vencido durante las últimas 4 horas del turno.
     */
    it('a las 20:00 sigue siendo hoy, no mañana', () => {
      const tarde = new Date(2026, 7, 25, 20, 30, 0);
      expect(hoySql(tarde)).toBe('2026-08-25');
    });

    it('a las 23:59 sigue siendo hoy', () => {
      expect(hoySql(new Date(2026, 7, 25, 23, 59, 59))).toBe('2026-08-25');
    });

    it('recién a las 00:00 pasa al día siguiente', () => {
      expect(hoySql(new Date(2026, 7, 26, 0, 0, 0))).toBe('2026-08-26');
    });
  });

  describe('ahoraSql', () => {
    it('devuelve YYYY-MM-DD HH:MM:SS — el mismo formato que daba CURRENT_TIMESTAMP', () => {
      expect(ahoraSql(new Date(2026, 7, 25, 14, 30, 5))).toBe('2026-08-25 14:30:05');
    });

    it('usa 24 horas, no AM/PM', () => {
      expect(ahoraSql(new Date(2026, 7, 25, 23, 5, 9))).toBe('2026-08-25 23:05:09');
    });

    it('rellena la medianoche con ceros', () => {
      expect(ahoraSql(new Date(2026, 7, 25, 0, 0, 0))).toBe('2026-08-25 00:00:00');
    });

    // El SGO ordena y compara estos strings: si el formato se corriera un
    // carácter, el orden cronológico dejaría de coincidir con el alfabético.
    it('mantiene el largo fijo de 19 caracteres', () => {
      expect(ahoraSql(new Date(2026, 0, 1, 1, 1, 1)).length).toBe(19);
    });

    it('comparte la parte de fecha con hoySql', () => {
      const f = new Date(2026, 7, 25, 18, 45, 12);
      expect(ahoraSql(f).slice(0, 10)).toBe(hoySql(f));
    });
  });
});
