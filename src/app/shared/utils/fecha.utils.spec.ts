import {
  HORIZONTE_VENTANA_DIAS, ahoraSql, ahoraSqlMs, diasOfrecidos, enVentanaOperativa, etiquetaDia, hoySql,
  manianaSql,
  selloUid, sumarDias, ventanaOperativa,
} from './fecha.utils';

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

  describe('sumarDias', () => {
    it('suma dentro del mes', () => {
      expect(sumarDias('2026-08-25', 3)).toBe('2026-08-28');
    });

    it('cruza el fin de mes', () => {
      expect(sumarDias('2026-08-31', 1)).toBe('2026-09-01');
    });

    it('cruza el fin de anio', () => {
      expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('resuelve el 29 de febrero solo en bisiestos', () => {
      expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
      expect(sumarDias('2027-02-28', 1)).toBe('2027-03-01');
    });

    // El calendario resuelve el cambio de horario; sumar 86.400.000 ms por dia no.
    it('cruza un cambio de horario sin correrse un dia', () => {
      expect(sumarDias('2026-04-04', 2)).toBe('2026-04-06');
      expect(sumarDias('2026-09-05', 2)).toBe('2026-09-07');
    });

    it('con cero dias devuelve el mismo dia', () => {
      expect(sumarDias('2026-08-25', 0)).toBe('2026-08-25');
    });

    it('acepta dias negativos', () => {
      expect(sumarDias('2026-09-01', -1)).toBe('2026-08-31');
    });

    it('una fecha malformada da cadena vacia', () => {
      expect(sumarDias('no-es-fecha', 1)).toBe('');
      expect(sumarDias('', 1)).toBe('');
    });
  });

  /*
   * La ventana con la que trabaja el operador: HOY y la PROXIMA jornada.
   *
   * La proxima ya no es "manana" a secas: un viernes es el lunes, y con feriados
   * en medio puede estar varios dias adelante. El backend entrega la primera
   * fecha con agenda dentro de 7 dias; la app acepta hasta HORIZONTE_VENTANA_DIAS
   * para que subir ese tope alla no obligue a publicar otra APK.
   *
   * Reemplaza al `=== hoySql()` que estaba repetido en cuatro pantallas. El
   * riesgo de tenerlo repetido era que la app se contradijera --mostrar una
   * jornada que despues no dejara sincronizar-- con solo olvidar un lugar.
   */
  describe('ventanaOperativa', () => {
    it('va desde hoy hasta hoy mas el horizonte', () => {
      expect(ventanaOperativa('2026-08-31')).toEqual({
        desde: '2026-08-31',
        hasta: sumarDias('2026-08-31', HORIZONTE_VENTANA_DIAS),
      });
    });

    it('el horizonte es de 14 dias', () => {
      expect(HORIZONTE_VENTANA_DIAS).toBe(14);
      expect(ventanaOperativa('2026-08-31').hasta).toBe('2026-09-14');
    });

    it('un hoy malformado da una ventana vacia', () => {
      expect(ventanaOperativa('no-es-fecha')).toEqual({ desde: '', hasta: '' });
    });
  });

  describe('enVentanaOperativa', () => {
    const HOY = '2026-08-31';

    it('acepta hoy', () => {
      expect(enVentanaOperativa('2026-08-31', HOY)).toBeTrue();
    });

    it('acepta manana', () => {
      expect(enVentanaOperativa('2026-09-01', HOY)).toBeTrue();
    });

    // Viernes: la proxima jornada es el lunes.
    it('acepta el lunes de un viernes', () => {
      expect(enVentanaOperativa('2026-10-12', '2026-10-09')).toBeTrue();
    });

    // Lunes con martes y miercoles feriados: la proxima jornada es el jueves.
    it('acepta el jueves de un lunes con dos feriados en medio', () => {
      expect(enVentanaOperativa('2026-10-15', '2026-10-12')).toBeTrue();
    });

    // Al cambiar el dia lo anterior se da por cerrado, incluso lo que no
    // alcanzo a sincronizarse. Es una regla de negocio, no un descuido.
    it('rechaza ayer', () => {
      expect(enVentanaOperativa('2026-08-30', HOY)).toBeFalse();
    });

    it('acepta el ultimo dia del horizonte', () => {
      expect(enVentanaOperativa(sumarDias(HOY, HORIZONTE_VENTANA_DIAS), HOY)).toBeTrue();
    });

    it('rechaza el dia siguiente al horizonte', () => {
      expect(enVentanaOperativa(sumarDias(HOY, HORIZONTE_VENTANA_DIAS + 1), HOY)).toBeFalse();
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

      it('un viernes de fin de mes ve el lunes del mes siguiente', () => {
        expect(enVentanaOperativa('2026-11-02', '2026-10-30')).toBeTrue();
      });
    });

    describe('entradas que no sirven', () => {
      it('cadena vacia', () => {
        expect(enVentanaOperativa('', HOY)).toBeFalse();
      });

      // Sin esto, un `hoy` malformado dejaria una ventana sin limite superior y
      // cualquier fecha entraria por comparacion de textos.
      it('un hoy malformado no valida nada', () => {
        expect(enVentanaOperativa('2026-09-01', 'no-es-fecha')).toBeFalse();
      });
    });

    /*
     * Sin el segundo argumento usa el reloj real. Se compara contra hoySql() y
     * sumarDias() en vez de contra una fecha fija: un test con fecha fija pasa
     * hoy y falla manana.
     */
    it('sin argumento usa el dia real', () => {
      expect(enVentanaOperativa(hoySql())).toBeTrue();
      expect(enVentanaOperativa(sumarDias(hoySql(), 1))).toBeTrue();
      expect(enVentanaOperativa(sumarDias(hoySql(), -1))).toBeFalse();
    });
  });

  /*
   * Como se nombra el dia en la tarjeta y en el aviso de "Actualizar maestra".
   *
   * "Hoy" y "Manana" bastan mientras la jornada sea contigua; un lunes visto
   * desde el viernes necesita el dia de la semana, o el operador tiene que
   * calcular que fecha es. El formato es "Lun 12/10": corto para la pantalla de
   * una PDA. Los nombres van escritos aca y no salen de Intl: el WebView de la
   * PDA puede no traer el locale.
   */
  describe('etiquetaDia', () => {
    const HOY = '2026-10-09'; // viernes

    it('hoy', () => {
      expect(etiquetaDia('2026-10-09', HOY)).toBe('Hoy');
    });

    it('manana', () => {
      expect(etiquetaDia('2026-10-10', HOY)).toBe('Mañana');
    });

    it('el lunes de un viernes', () => {
      expect(etiquetaDia('2026-10-12', HOY)).toBe('Lun 12/10');
    });

    it('un jueves con feriados en medio', () => {
      expect(etiquetaDia('2026-10-15', '2026-10-12')).toBe('Jue 15/10');
    });

    it('rellena dia y mes con cero y cruza de mes', () => {
      expect(etiquetaDia('2026-11-02', '2026-10-30')).toBe('Lun 02/11');
    });

    it('tolera que la fecha venga con hora', () => {
      expect(etiquetaDia('2026-10-12 08:30:00', HOY)).toBe('Lun 12/10');
      expect(etiquetaDia('2026-10-09 08:30:00', HOY)).toBe('Hoy');
    });

    // Fuera de la ventana no se inventa "Ayer": se dice el dia, que es un hecho.
    it('un dia pasado se nombra por su fecha, no por "Hoy"', () => {
      expect(etiquetaDia('2026-10-08', HOY)).toBe('Jue 08/10');
    });

    it('nombra bien cada dia de la semana', () => {
      const lunes = '2026-10-12';
      const esperado = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      esperado.forEach((nombre, i) => {
        const dia = sumarDias(lunes, i);
        expect(etiquetaDia(dia, '2026-10-01')).toBe(`${nombre} ${dia.slice(8, 10)}/10`);
      });
    });

    describe('entradas que no sirven', () => {
      it('una fecha malformada se devuelve tal cual', () => {
        expect(etiquetaDia('no-es-fecha', HOY)).toBe('no-es-fecha');
      });

      it('cadena vacia', () => {
        expect(etiquetaDia('', HOY)).toBe('');
      });
    });

    it('sin segundo argumento usa el dia real', () => {
      expect(etiquetaDia(hoySql())).toBe('Hoy');
      expect(etiquetaDia(sumarDias(hoySql(), 1))).toBe('Mañana');
    });
  });

  /*
   * De lo que cabe en la ventana, Home ofrece solo HOY y la PROXIMA jornada. La
   * ventana es ancha para no perder trabajo; las tarjetas son las dos que
   * existen de verdad para el operador.
   */
  describe('diasOfrecidos', () => {
    const HOY = '2026-10-12'; // lunes

    it('hoy y la proxima fecha', () => {
      expect(diasOfrecidos(['2026-10-12', '2026-10-15'], HOY)).toEqual(['2026-10-12', '2026-10-15']);
    });

    it('con varias futuras se queda con la mas cercana', () => {
      expect(diasOfrecidos(['2026-10-12', '2026-10-20', '2026-10-15'], HOY)).toEqual(['2026-10-12', '2026-10-15']);
    });

    it('solo hoy', () => {
      expect(diasOfrecidos(['2026-10-12'], HOY)).toEqual(['2026-10-12']);
    });

    it('sin jornada hoy, ofrece solo la proxima', () => {
      expect(diasOfrecidos(['2026-10-15', '2026-10-16'], HOY)).toEqual(['2026-10-15']);
    });

    it('no repite un dia y tolera fechas con hora', () => {
      expect(diasOfrecidos(['2026-10-12 08:00:00', '2026-10-12', '2026-10-15 08:00:00'], HOY))
        .toEqual(['2026-10-12', '2026-10-15']);
    });

    it('ignora lo anterior a hoy', () => {
      expect(diasOfrecidos(['2026-10-09', '2026-10-12'], HOY)).toEqual(['2026-10-12']);
    });

    it('sin dias da una lista vacia', () => {
      expect(diasOfrecidos([], HOY)).toEqual([]);
    });
  });
});
