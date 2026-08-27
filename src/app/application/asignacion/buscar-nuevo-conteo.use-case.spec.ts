import { TestBed } from '@angular/core/testing';
import { BuscarNuevoConteoUseCase } from './buscar-nuevo-conteo.use-case';
import { SincronizarDatosInicialesUseCase } from '../sincronizacion/sincronizar-datos-iniciales.use-case';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { Session } from '../../domain/auth/models/session.model';

/*
 * La decisión de INSERTAR O NO.
 *
 * Es lo único que este caso de uso agrega, y es donde se juegan las dos formas
 * de romperlo: dejar al operador esperando un conteo que sí llegó, o pisarle la
 * muestra que está usando con una preparación que era la misma de antes.
 *
 * La identidad es el codigo_muestra, la misma que usa resolverEvento para
 * decidir a qué evento cuelga la muestra. Con dos claves distintas —se había
 * planteado id_agenda— las dos decisiones pueden discrepar, y ahí se le avisa
 * al operador de un conteo que después queda colgado del evento viejo.
 */

const SESION: Session = { operadorId: 1, rutNormalizado: '12345678', correo: 'op@sodimac.cl' } as Session;
const SUCURSAL = 4;

function preparacion(codigoMuestra: string | null, nombre = 'RADIOS') {
  return {
    evento:  { fechaProgramada: '2026-08-28' },
    muestra: codigoMuestra === null ? null : {
      codigoMuestra, nombreMuestra: nombre, idAgenda: 1644, numeroAgenda: 'AG-01', detalles: [],
    },
  } as never;
}

describe('BuscarNuevoConteoUseCase', () => {
  let uc: BuscarNuevoConteoUseCase;
  let descargar: jasmine.Spy;
  let persistir: jasmine.Spy;
  let getEventoIdPorCodigo: jasmine.Spy;

  beforeEach(() => {
    descargar = jasmine.createSpy('descargar').and.resolveTo(preparacion('MUE-NUEVA'));
    persistir = jasmine.createSpy('persistir').and.resolveTo({ usuario: {}, analista: null });
    getEventoIdPorCodigo = jasmine.createSpy('getEventoIdPorCodigo').and.resolveTo(null);

    TestBed.configureTestingModule({
      providers: [
        BuscarNuevoConteoUseCase,
        { provide: SincronizarDatosInicialesUseCase, useValue: { descargar, persistir } },
        { provide: MUESTRA_REPOSITORY_TOKEN, useValue: { getEventoIdPorCodigo } },
      ],
    });
    uc = TestBed.inject(BuscarNuevoConteoUseCase);
  });

  describe('la muestra ya está en la base', () => {
    beforeEach(() => getEventoIdPorCodigo.and.resolveTo(12));

    /*
     * El resultado NORMAL de esta consulta: el operador que terminó temprano la
     * va a tocar varias veces antes de que el SGO programe la jornada siguiente.
     */
    it('no informa nada nuevo', async () => {
      expect(await uc.execute(SESION, SUCURSAL)).toBeNull();
    });

    /*
     * Lo que de verdad importa: NO se escribe. Persistir acá reescribiría la
     * muestra que el operador está usando con la misma preparación, y con un
     * conteo en curso eso es pisarle el trabajo.
     */
    it('y no toca la base', async () => {
      await uc.execute(SESION, SUCURSAL);

      expect(persistir).not.toHaveBeenCalled();
    });
  });

  describe('la muestra es desconocida', () => {
    it('inserta y devuelve el conteo nuevo', async () => {
      // null la primera vez —no existe— y el id del evento recién creado después.
      getEventoIdPorCodigo.and.returnValues(Promise.resolve(null), Promise.resolve(30));

      const asignacion = await uc.execute(SESION, SUCURSAL);

      expect(persistir).toHaveBeenCalled();
      expect(asignacion).toEqual({ eventoId: 30, nombre: 'RADIOS', fechaProgramada: '2026-08-28' });
    });

    /*
     * Se persiste con los datos YA descargados. Si en vez de eso se llamara al
     * execute() de la sincronización, la preparación completa —productos,
     * muestra, zonas— se bajaría dos veces por cada consulta.
     */
    it('reutiliza la descarga en vez de bajarla otra vez', async () => {
      await uc.execute(SESION, SUCURSAL);

      expect(descargar).toHaveBeenCalledTimes(1);
      expect(persistir).toHaveBeenCalledWith(SESION, jasmine.anything());
    });

    /*
     * El trabajo ya quedó escrito. Devolver null porque no se pudo releer el
     * evento haría que la pantalla dijera "no hay nada nuevo" justo después de
     * haber insertado una jornada, y el operador no la buscaría.
     */
    it('si no puede releer el evento, igual informa la asignación', async () => {
      getEventoIdPorCodigo.and.resolveTo(null);

      expect((await uc.execute(SESION, SUCURSAL))?.nombre).toBe('RADIOS');
    });
  });

  /*
   * Sin muestra no hay trabajo que tomar, y escribir igual pisaría lo que la
   * PDA ya tiene con una preparación incompleta. El operador puede volver a
   * consultar; no puede deshacer una muestra sobreescrita.
   */
  describe('la preparación no trae muestra', () => {
    beforeEach(() => descargar.and.resolveTo(preparacion(null)));

    it('no informa nada y no escribe', async () => {
      expect(await uc.execute(SESION, SUCURSAL)).toBeNull();
      expect(persistir).not.toHaveBeenCalled();
    });
  });

  it('rechaza una tienda inválida antes de consultar', async () => {
    await expectAsync(uc.execute(SESION, 0)).toBeRejectedWithError('Tienda inválida');

    expect(descargar).not.toHaveBeenCalled();
  });
});
