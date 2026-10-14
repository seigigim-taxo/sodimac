import {
  ESPERAS_TRAS_FALLO_MS, MAX_FALLOS_SEGUIDOS, MIN_ENTRE_INTENTOS_MS, esperaTrasFallo, puedeIntentarYa,
} from './politica-reintento';

describe('politica-reintento', () => {
  describe('esperaTrasFallo', () => {
    it('crece con cada fallo: 30 s, 1, 2, 5 y 10 minutos', () => {
      expect([1, 2, 3, 4, 5].map(esperaTrasFallo)).toEqual([30_000, 60_000, 120_000, 300_000, 600_000]);
    });

    it('nunca baja de una espera a la siguiente', () => {
      const esperas = [1, 2, 3, 4, 5].map((n) => esperaTrasFallo(n) as number);
      for (let i = 1; i < esperas.length; i++) expect(esperas[i]).toBeGreaterThan(esperas[i - 1]);
    });

    it('tras el último fallo permitido ya no programa nada (solo un evento lo retoma)', () => {
      expect(esperaTrasFallo(MAX_FALLOS_SEGUIDOS)).toBeNull();
      expect(esperaTrasFallo(MAX_FALLOS_SEGUIDOS + 3)).toBeNull();
    });

    it('son el intento original y 5 reintentos', () => {
      expect(MAX_FALLOS_SEGUIDOS).toBe(ESPERAS_TRAS_FALLO_MS.length + 1);
      expect(esperaTrasFallo(MAX_FALLOS_SEGUIDOS - 1)).not.toBeNull();
    });

    it('sin fallos no hay nada que programar', () => {
      expect(esperaTrasFallo(0)).toBeNull();
      expect(esperaTrasFallo(-1)).toBeNull();
    });

    it('la espera más corta no es agresiva con la batería (≥ 30 s)', () => {
      expect(ESPERAS_TRAS_FALLO_MS[0]).toBeGreaterThanOrEqual(30_000);
    });
  });

  describe('puedeIntentarYa', () => {
    it('sin intento previo, sí', () => {
      expect(puedeIntentarYa(null, 1_000)).toBeTrue();
    });

    it('antes del mínimo, no', () => {
      expect(puedeIntentarYa(1_000, 1_000 + MIN_ENTRE_INTENTOS_MS - 1)).toBeFalse();
    });

    it('justo en el mínimo, sí', () => {
      expect(puedeIntentarYa(1_000, 1_000 + MIN_ENTRE_INTENTOS_MS)).toBeTrue();
    });

    it('el mínimo entre intentos es de al menos 15 s', () => {
      expect(MIN_ENTRE_INTENTOS_MS).toBeGreaterThanOrEqual(15_000);
    });
  });
});
