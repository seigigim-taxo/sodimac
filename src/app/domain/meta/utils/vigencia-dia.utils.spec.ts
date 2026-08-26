import { datosSonDeHoy, debeCerrarSesionPorDia, necesitaPreparar } from './vigencia-dia.utils';

const HOY = '2026-08-26';

describe('vigencia del día', () => {
  describe('necesitaPreparar', () => {
    it('no hace falta si los datos se bajaron hoy', () => {
      expect(necesitaPreparar(HOY, HOY)).toBe(false);
    });

    it('hace falta si son de ayer', () => {
      expect(necesitaPreparar('2026-08-25', HOY)).toBe(true);
    });

    // El caso del operador nuevo: nunca preparó nada, hay que bajar todo.
    it('hace falta si nunca se preparó', () => {
      expect(necesitaPreparar(null, HOY)).toBe(true);
    });

    /*
     * Una fecha futura también es "distinta de hoy". No debería pasar, pero si
     * el reloj del equipo se corre hacia adelante y vuelve, es mejor volver a
     * bajar datos que confiar en un registro que no corresponde.
     */
    it('hace falta si la fecha guardada es futura', () => {
      expect(necesitaPreparar('2026-08-27', HOY)).toBe(true);
    });
  });

  /*
   * Cerrar la sesión es más agresivo que sincronizar, así que pide más certeza.
   * La diferencia con necesitaPreparar está solo en el null y es deliberada:
   * sacar al operador de la app en medio del turno por no tener un dato es peor
   * que dejarlo seguir.
   */
  describe('debeCerrarSesionPorDia', () => {
    it('cierra si los datos son de otro día', () => {
      expect(debeCerrarSesionPorDia('2026-08-25', HOY)).toBe(true);
    });

    it('no cierra si son de hoy', () => {
      expect(debeCerrarSesionPorDia(HOY, HOY)).toBe(false);
    });

    it('NO cierra cuando no hay fecha registrada, a diferencia de necesitaPreparar', () => {
      expect(debeCerrarSesionPorDia(null, HOY)).toBe(false);
      expect(necesitaPreparar(null, HOY)).toBe(true);
    });
  });

  describe('datosSonDeHoy', () => {
    it('compara la fecha completa, no solo el día del mes', () => {
      expect(datosSonDeHoy('2026-07-26', HOY)).toBe(false);
      expect(datosSonDeHoy('2025-08-26', HOY)).toBe(false);
      expect(datosSonDeHoy(HOY, HOY)).toBe(true);
    });
  });
});
