import { ahoraSql, ahoraSqlMs, enVentanaOperativa, hoySql, manianaSql, selloUid } from './fecha.utils';

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

  describe('ahoraSqlMs', () => {
    it('es ahoraSql más los milisegundos', () => {
      const f = new Date(2026, 7, 27, 9, 22, 26, 123);
      expect(ahoraSqlMs(f)).toBe('2026-08-27 09:22:26.123');
      expect(ahoraSqlMs(f).startsWith(ahoraSql(f))).toBeTrue();
    });

    it('rellena los milisegundos a tres dígitos', () => {
      expect(ahoraSqlMs(new Date(2026, 7, 27, 9, 22, 26, 7))).toBe('2026-08-27 09:22:26.007');
    });

    /*
     * Su razón de ser: con pistola se escanean varios SKU dentro del mismo
     * segundo, así que sin milisegundos dos productos consecutivos quedarían con
     * el mismo instante y el detalle_uid no los distinguiría.
     */
    it('separa dos capturas del mismo segundo, que ahoraSql confunde', () => {
      const a = new Date(2026, 7, 27, 9, 22, 26, 100);
      const b = new Date(2026, 7, 27, 9, 22, 26, 340);

      expect(ahoraSql(a)).toBe(ahoraSql(b));
      expect(ahoraSqlMs(a)).not.toBe(ahoraSqlMs(b));
    });
  });

  describe('selloUid', () => {
    it('compacta la fecha a solo dígitos', () => {
      expect(selloUid('2026-08-27 09:22:26.123')).toBe('20260827092226123');
    });

    /*
     * Una lectura registrada antes de que existiera ahoraSqlMs no trae
     * milisegundos. Tiene que dar un sello válido igual: si devolviera algo más
     * corto, el detalle_uid quedaría malformado y una línea vieja tumbaría la
     * sincronización del TAG entero.
     */
    it('completa con ceros una fecha sin milisegundos', () => {
      expect(selloUid('2026-08-27 09:22:26')).toBe('20260827092226000');
    });

    // Largo fijo por el mismo motivo que ahoraSql: el orden alfabético tiene
    // que seguir siendo el cronológico.
    it('siempre da 17 dígitos', () => {
      expect(selloUid('2026-08-27 09:22:26.123').length).toBe(17);
      expect(selloUid('2026-08-27 09:22:26').length).toBe(17);
      expect(selloUid('').length).toBe(17);
    });

    it('conserva el orden entre capturas del mismo segundo', () => {
      expect(selloUid('2026-08-27 09:22:26.100') < selloUid('2026-08-27 09:22:26.340')).toBeTrue();
    });
  });

  describe('manianaSql', () => {
    it('devuelve el dia siguiente', () => {
      expect(manianaSql(new Date(2026, 7, 31, 10, 0, 0))).toBe('2026-09-01');
    });

    /*
     * Se usa setDate y no sumar 86.400.000 ms justamente por estos dos casos:
     * el calendario resuelve el fin de mes y el bisiesto, la aritmetica de
     * milisegundos no.
     */
    it('cruza el fin de mes', () => {
      expect(manianaSql(new Date(2026, 0, 31))).toBe('2026-02-01');
    });

    it('cruza el fin de anio', () => {
      expect(manianaSql(new Date(2026, 11, 31, 23, 59, 59))).toBe('2027-01-01');
    });

    it('resuelve el 29 de febrero de un bisiesto', () => {
      expect(manianaSql(new Date(2028, 1, 28))).toBe('2028-02-29');
    });
  });

  /*
   * La ventana con la que trabaja el operador: HOY y MANANA.
   *
   * Reemplaza al `=== hoySql()` que estaba repetido en cuatro pantallas. El
   * riesgo de tenerlo repetido era que la app se contradijera --mostrar una
   * jornada que despues no dejara sincronizar-- con solo olvidar un lugar.
   */
  describe('enVentanaOperativa', () => {
    const HOY = '2026-08-31';

    it('acepta hoy', () => {
      expect(enVentanaOperativa('2026-08-31', HOY)).toBeTrue();
    });

    it('acepta manana', () => {
      expect(enVentanaOperativa('2026-09-01', HOY)).toBeTrue();
    });

    // Al cambiar el dia lo anterior se da por cerrado, incluso lo que no
    // alcanzo a sincronizarse. Es una regla de negocio, no un descuido.
    it('rechaza ayer', () => {
      expect(enVentanaOperativa('2026-08-30', HOY)).toBeFalse();
    });

    it('rechaza pasado manana', () => {
      expect(enVentanaOperativa('2026-09-02', HOY)).toBeFalse();
    });

    // El evento llega del backend con hora en algunos casos.
    it('tolera que la fecha venga con hora', () => {
      expect(enVentanaOperativa('2026-09-01 08:30:00', HOY)).toBeTrue();
    });

    describe('bordes de calendario', () => {
      it('fin de mes', () => {
        expect(enVentanaOperativa('2026-09-01', '2026-08-31')).toBeTrue();
      });

      it('fin de anio', () => {
        expect(enVentanaOperativa('2027-01-01', '2026-12-31')).toBeTrue();
      });
    });

    describe('entradas que no sirven', () => {
      it('cadena vacia', () => {
        expect(enVentanaOperativa('', HOY)).toBeFalse();
      });

      // Sin esto, un `hoy` malformado haria que siguienteDia devolviera '' y
      // una fecha vacia entrara en la ventana por coincidencia.
      it('un hoy malformado no valida nada', () => {
        expect(enVentanaOperativa('2026-09-01', 'no-es-fecha')).toBeFalse();
      });
    });

    /*
     * Sin el segundo argumento usa el reloj real. Se compara contra hoySql()
     * y manianaSql() en vez de contra una fecha fija: un test con fecha fija
     * pasa hoy y falla maniana.
     */
    it('sin argumento usa el dia real', () => {
      expect(enVentanaOperativa(hoySql())).toBeTrue();
      expect(enVentanaOperativa(manianaSql())).toBeTrue();
    });
  });
});
