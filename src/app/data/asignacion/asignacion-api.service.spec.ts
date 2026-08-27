import { parsearAsignacion } from './asignacion-api.service';

/*
 * El endpoint todavía no existe, así que lo único que se puede probar hoy es el
 * parser — y es justamente donde conviene tener red: cuando el backend lo
 * exponga, la primera respuesta real puede no coincidir con lo acordado, y la
 * app tiene que degradar sin romperle la pantalla al operador.
 *
 * La regla es que ante cualquier forma que no reconozca devuelve null, o sea
 * "todavía no hay trabajo asignado". Es el resultado normal de esta consulta,
 * no un error.
 */
describe('parsearAsignacion', () => {
  it('lee la respuesta acordada', () => {
    expect(parsearAsignacion({
      evento_id: 13,
      nombre: 'RADIOS',
      fecha_programada: '2026-08-27',
    })).toEqual({ eventoId: 13, nombre: 'RADIOS', fechaProgramada: '2026-08-27' });
  });

  // Por si el endpoint termina normalizando la salida a camelCase.
  it('acepta también camelCase', () => {
    expect(parsearAsignacion({
      eventoId: 13, nombre: 'RADIOS', fechaProgramada: '2026-08-27',
    })).toEqual({ eventoId: 13, nombre: 'RADIOS', fechaProgramada: '2026-08-27' });
  });

  it('recorta la fecha si viene con hora', () => {
    const r = parsearAsignacion({ evento_id: 13, nombre: 'X', fecha_programada: '2026-08-27 08:00:00' });

    expect(r?.fechaProgramada).toBe('2026-08-27');
  });

  describe('sin trabajo asignado', () => {
    it('con data en null', () => {
      expect(parsearAsignacion(null)).toBeNull();
    });

    it('con la clave ausente', () => {
      expect(parsearAsignacion(undefined)).toBeNull();
    });

    it('con un objeto vacío', () => {
      expect(parsearAsignacion({})).toBeNull();
    });
  });

  /*
   * Sin evento_id no hay nada que abrir: cualquier otro campo es decorativo.
   * Estos casos existen porque un PHP puede devolver "" o 0 con la misma
   * facilidad con la que devuelve null.
   */
  describe('respuestas que no sirven', () => {
    it('evento_id vacío', () => {
      expect(parsearAsignacion({ evento_id: '', nombre: 'X' })).toBeNull();
    });

    it('evento_id en cero', () => {
      expect(parsearAsignacion({ evento_id: 0, nombre: 'X' })).toBeNull();
    });

    it('evento_id no numérico', () => {
      expect(parsearAsignacion({ evento_id: 'abc' })).toBeNull();
    });

    it('un arreglo en vez de un objeto', () => {
      expect(parsearAsignacion([{ evento_id: 13 }])).toBeNull();
    });
  });

  /*
   * Con evento_id válido sí se sigue, aunque falte el resto: el nombre y la
   * fecha se resuelven después contra la base local. Cortar acá por un nombre
   * ausente dejaría al operador sin poder tomar un conteo que el SGO sí le
   * asignó.
   */
  describe('tolera campos incompletos si el evento es válido', () => {
    it('sin nombre, arma uno legible', () => {
      expect(parsearAsignacion({ evento_id: 13 })?.nombre).toBe('Conteo 13');
    });

    it('con nombre en blanco, lo reemplaza', () => {
      expect(parsearAsignacion({ evento_id: 13, nombre: '   ' })?.nombre).toBe('Conteo 13');
    });

    // Sin fecha no se puede ubicar el evento en el día; se deja vacío en vez de
    // inventar una, y Home lo filtra.
    it('sin fecha, la deja vacía', () => {
      expect(parsearAsignacion({ evento_id: 13, nombre: 'X' })?.fechaProgramada).toBe('');
    });

    it('acepta evento_id como texto numérico, que es lo que suele mandar PHP', () => {
      expect(parsearAsignacion({ evento_id: '13', nombre: 'X' })?.eventoId).toBe(13);
    });
  });
});
