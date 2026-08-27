import { TestBed } from '@angular/core/testing';
import { BuscarNuevoConteoUseCase } from './buscar-nuevo-conteo.use-case';
import { SincronizarDatosInicialesUseCase } from '../sincronizacion/sincronizar-datos-iniciales.use-case';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { Session } from '../../domain/auth/models/session.model';

/*
 * La decisión de INSERTAR O NO, y de QUÉ TIENDA es el conteo.
 *
 * Es lo único que este caso de uso agrega, y es donde se juegan las tres formas
 * de romperlo: dejar al operador esperando un conteo que sí llegó, pisarle la
 * muestra que está usando con una preparación que era la misma de antes, o
 * insertar el conteo nuevo y devolver la tienda equivocada — que lo deja viendo
 * "tienes un conteo nuevo" sin ninguna tarjeta que seleccionar.
 *
 * La identidad es el codigo_muestra, la misma que usa resolverEvento para
 * decidir a qué evento cuelga la muestra. Con dos claves distintas —se había
 * planteado id_agenda— las dos decisiones pueden discrepar.
 */

const SESION: Session = { operadorId: 1, rutNormalizado: '12345678', correo: 'op@sodimac.cl' } as Session;

function preparacion(codigoMuestra: string | null, codigoTienda: string | null = '4066') {
  return {
    evento:  { fechaProgramada: '2026-08-28' },
    tiendas: codigoTienda === null ? [] : [{ codigoTienda }],
    muestra: codigoMuestra === null ? null : {
      codigoMuestra, nombreMuestra: 'RADIOS', idAgenda: 1644, numeroAgenda: 'AG-01', detalles: [],
    },
  } as never;
}

describe('BuscarNuevoConteoUseCase', () => {
  let uc: BuscarNuevoConteoUseCase;
  let descargar: jasmine.Spy;
  let persistir: jasmine.Spy;
  let getEventoIdPorCodigo: jasmine.Spy;
  let getIdPorCodigo: jasmine.Spy;

  beforeEach(() => {
    descargar = jasmine.createSpy('descargar').and.resolveTo(preparacion('MUE-NUEVA'));
    persistir = jasmine.createSpy('persistir').and.resolveTo({ usuario: {}, analista: null });
    getEventoIdPorCodigo = jasmine.createSpy('getEventoIdPorCodigo').and.resolveTo(null);
    getIdPorCodigo = jasmine.createSpy('getIdPorCodigo').and.resolveTo(4);

    TestBed.configureTestingModule({
      providers: [
        BuscarNuevoConteoUseCase,
        { provide: SincronizarDatosInicialesUseCase, useValue: { descargar, persistir } },
        { provide: MUESTRA_REPOSITORY_TOKEN,  useValue: { getEventoIdPorCodigo } },
        { provide: SUCURSAL_REPOSITORY_TOKEN, useValue: { getIdPorCodigo } },
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
      expect(await uc.execute(SESION)).toBeNull();
    });

    /*
     * Lo que de verdad importa: NO se escribe. Persistir acá reescribiría la
     * muestra que el operador está usando con la misma preparación, y con un
     * conteo en curso eso es pisarle el trabajo.
     */
    it('y no toca la base', async () => {
      await uc.execute(SESION);

      expect(persistir).not.toHaveBeenCalled();
    });
  });

  describe('la muestra es desconocida', () => {
    it('inserta y devuelve el conteo nuevo con su tienda', async () => {
      // null la primera vez —no existe— y el id del evento recién creado después.
      getEventoIdPorCodigo.and.returnValues(Promise.resolve(null), Promise.resolve(30));

      const asignacion = await uc.execute(SESION);

      expect(persistir).toHaveBeenCalled();
      expect(asignacion).toEqual({
        eventoId: 30, sucursalId: 4, nombre: 'RADIOS', fechaProgramada: '2026-08-28',
      });
    });

    /*
     * Se persiste con los datos YA descargados. Si en vez de eso se llamara al
     * execute() de la sincronización, la preparación completa —productos,
     * muestra, zonas— se bajaría dos veces por cada consulta.
     */
    it('reutiliza la descarga en vez de bajarla otra vez', async () => {
      await uc.execute(SESION);

      expect(descargar).toHaveBeenCalledTimes(1);
      expect(persistir).toHaveBeenCalledWith(SESION, jasmine.anything());
    });
  });

  /*
   * EL CASO QUE ROMPIÓ EN TERRENO.
   *
   * Al operador se lo asignan por jornada, no por local, así que el conteo
   * siguiente puede ser en otra tienda. La sucursal tiene que salir de la
   * PREPARACIÓN y no de la que el operador tiene abierta: con la abierta, la
   * pantalla recargaba los eventos del local viejo y el conteo recién insertado
   * no aparecía — el aviso lo nombraba y no había tarjeta que seleccionar.
   */
  describe('el conteo nuevo es de otra tienda', () => {
    it('compara y devuelve la tienda de la preparación', async () => {
      descargar.and.resolveTo(preparacion('MUE-OTRA-TIENDA', '4088'));
      getIdPorCodigo.and.resolveTo(9);
      getEventoIdPorCodigo.and.returnValues(Promise.resolve(null), Promise.resolve(31));

      const asignacion = await uc.execute(SESION);

      expect(getIdPorCodigo).toHaveBeenCalledWith('4088');
      expect(getEventoIdPorCodigo).toHaveBeenCalledWith('MUE-OTRA-TIENDA', 9);
      expect(asignacion?.sucursalId).toBe(9);
    });

    /*
     * Tienda que la PDA nunca vio: la muestra tampoco puede existir, así que es
     * trabajo nuevo sin necesidad de comparar. Persistir es justamente lo que
     * crea la tienda, por eso su id se relee después.
     */
    it('si la tienda no existe localmente, persiste igual', async () => {
      getIdPorCodigo.and.returnValues(Promise.resolve(null), Promise.resolve(15));

      const asignacion = await uc.execute(SESION);

      expect(persistir).toHaveBeenCalled();
      expect(asignacion?.sucursalId).toBe(15);
    });
  });

  /*
   * Sin muestra o sin tienda no hay trabajo que tomar, y escribir igual pisaría
   * lo que la PDA ya tiene con una preparación incompleta. El operador puede
   * volver a consultar; no puede deshacer una muestra sobreescrita.
   */
  describe('preparación incompleta', () => {
    it('sin muestra, no informa nada y no escribe', async () => {
      descargar.and.resolveTo(preparacion(null));

      expect(await uc.execute(SESION)).toBeNull();
      expect(persistir).not.toHaveBeenCalled();
    });

    it('sin tienda, tampoco', async () => {
      descargar.and.resolveTo(preparacion('MUE-NUEVA', null));

      expect(await uc.execute(SESION)).toBeNull();
      expect(persistir).not.toHaveBeenCalled();
    });
  });
});
