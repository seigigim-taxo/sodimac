import {
  Migracion,
  VERSION_MINIMA_MIGRABLE,
  VERSION_PREVIA_A_META,
  planificarEsquema,
  resolverVersionInicial,
} from './migraciones';

function migracion(version: number): Migracion {
  return { version, descripcion: `m${version}`, sql: [`-- ${version}`] };
}

/*
 * Estas dos funciones deciden si una PDA conserva o pierde lo contado. Todo lo
 * demás de la inicialización es ejecutar lo que digan.
 */
describe('resolverVersionInicial', () => {
  it('usa sod_meta cuando está', () => {
    expect(resolverVersionInicial({ versionEnMeta: 46, versionEnPreferences: 43, hayTablas: true })).toBe(46);
  });

  /*
   * EL caso que justifica todo esto: una PDA que ya trabajó guarda su versión
   * en Preferences, fuera de la base. Si se la tratara como instalación nueva,
   * la primera APK con migraciones borraría justo lo que viene a proteger.
   */
  it('cae a Preferences cuando sod_meta todavía no existe', () => {
    expect(resolverVersionInicial({ versionEnMeta: null, versionEnPreferences: 43, hayTablas: true })).toBe(43);
  });

  it('sin registro pero con tablas asume la última publicada', () => {
    expect(resolverVersionInicial({ versionEnMeta: null, versionEnPreferences: null, hayTablas: true }))
      .toBe(VERSION_PREVIA_A_META);
  });

  it('devuelve null solo en una instalación limpia de verdad', () => {
    expect(resolverVersionInicial({ versionEnMeta: null, versionEnPreferences: null, hayTablas: false })).toBeNull();
  });
});

describe('planificarEsquema', () => {
  const registro = [migracion(44), migracion(45), migracion(46), migracion(47)];

  it('una base nueva no migra: se crea el esquema y listo', () => {
    expect(planificarEsquema(null, 46, registro)).toEqual({ tipo: 'NUEVA' });
  });

  it('misma versión no hace nada', () => {
    expect(planificarEsquema(46, 46, registro)).toEqual({ tipo: 'AL_DIA' });
  });

  it('aplica solo las migraciones del tramo, en orden', () => {
    const plan = planificarEsquema(44, 46, registro);

    expect(plan.tipo).toBe('MIGRAR');
    expect(plan.tipo === 'MIGRAR' && plan.migraciones.map((m) => m.version)).toEqual([45, 46]);
  });

  it('no adelanta migraciones más allá del destino', () => {
    const plan = planificarEsquema(45, 46, registro);

    expect(plan.tipo === 'MIGRAR' && plan.migraciones.map((m) => m.version)).toEqual([46]);
  });

  it('ordena aunque el registro venga desordenado', () => {
    const desordenado = [migracion(46), migracion(44), migracion(45)];
    const plan = planificarEsquema(43, 46, desordenado);

    expect(plan.tipo === 'MIGRAR' && plan.migraciones.map((m) => m.version)).toEqual([44, 45, 46]);
  });

  /*
   * El caso real de esta entrega: de la v43 publicada a la v46 no hay ninguna
   * migración, porque lo único que cambió fue una tabla nueva —que se crea sola
   * con IF NOT EXISTS— y DEFAULTs que ya no se disparan. Sin migraciones NO
   * significa recrear: significa que no hay nada que hacer.
   */
  it('un tramo sin migraciones migra igual, con la lista vacía', () => {
    const plan = planificarEsquema(43, 46, []);

    expect(plan).toEqual({ tipo: 'MIGRAR', migraciones: [] });
  });

  describe('recrear como último recurso', () => {
    it('si la base está en una versión mayor que el código (APK más vieja)', () => {
      const plan = planificarEsquema(50, 46, registro);

      expect(plan.tipo).toBe('RECREAR');
      expect(plan.tipo === 'RECREAR' && plan.motivo).toContain('v50');
    });

    it('si la base es anterior a la mínima migrable', () => {
      const plan = planificarEsquema(VERSION_MINIMA_MIGRABLE - 1, 46, registro);

      expect(plan.tipo).toBe('RECREAR');
    });

    it('la mínima migrable sí se migra', () => {
      expect(planificarEsquema(VERSION_MINIMA_MIGRABLE, 46, registro).tipo).toBe('MIGRAR');
    });
  });
});
