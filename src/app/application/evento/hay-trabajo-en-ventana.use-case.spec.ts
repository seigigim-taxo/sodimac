import { TestBed } from '@angular/core/testing';
import { HayTrabajoEnVentanaUseCase } from './hay-trabajo-en-ventana.use-case';
import { EVENTO_REPOSITORY_TOKEN, EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { SUCURSAL_REPOSITORY_TOKEN, SucursalRepository } from '../../domain/sucursal/repositories/sucursal.repository';
import { Evento } from '../../domain/evento/models/evento.model';
import { Sucursal } from '../../domain/sucursal/models/sucursal.model';
import { hoySql, manianaSql } from '../../shared/utils/fecha.utils';

/*
 * De esto depende que al cambiar el día se cierre la sesión o no. Equivocarse
 * hacia el "false" manda al login a un operador que tenía el trabajo del día
 * bajado en la PDA, y volver a entrar exige señal.
 *
 * Las fechas van calculadas, no fijas: un literal deja el spec verde hoy y roto
 * mañana.
 */
const ayer = (): string => {
  const f = new Date();
  f.setDate(f.getDate() - 1);
  return hoySql(f);
};

const SUCURSAL: Sucursal = { id: 1, codigoTienda: '4724', nombre: 'HC BIOBIO' } as Sucursal;
const OTRA_SUCURSAL: Sucursal = { id: 2, codigoTienda: '4066', nombre: 'Otra' } as Sucursal;

const evento = (fechaProgramada: string, estado: Evento['estado'] = 'ABIERTO'): Evento => ({
  id: 1, sucursalId: 1, nombre: 'Inventario',
  fechaProgramada, fechaEjecucion: null, estado,
  fechaRegistro: `${fechaProgramada} 08:00:00`,
});

describe('HayTrabajoEnVentanaUseCase', () => {
  let useCase: HayTrabajoEnVentanaUseCase;
  let sucursalRepo: jasmine.SpyObj<SucursalRepository>;
  let eventoRepo: jasmine.SpyObj<EventoRepository>;

  beforeEach(() => {
    sucursalRepo = jasmine.createSpyObj('SucursalRepository', ['getByUsuario', 'getIdPorCodigo']);
    eventoRepo   = jasmine.createSpyObj('EventoRepository', ['getBySucursal']);

    sucursalRepo.getByUsuario.and.resolveTo([SUCURSAL]);
    eventoRepo.getBySucursal.and.resolveTo([]);

    TestBed.configureTestingModule({
      providers: [
        HayTrabajoEnVentanaUseCase,
        { provide: SUCURSAL_REPOSITORY_TOKEN, useValue: sucursalRepo },
        { provide: EVENTO_REPOSITORY_TOKEN,   useValue: eventoRepo },
      ],
    });
    useCase = TestBed.inject(HayTrabajoEnVentanaUseCase);
  });

  it('hay trabajo con un evento abierto de hoy', async () => {
    eventoRepo.getBySucursal.and.resolveTo([evento(hoySql())]);

    expect(await useCase.execute(7)).toBeTrue();
  });

  it('hay trabajo con un evento abierto de mañana', async () => {
    eventoRepo.getBySucursal.and.resolveTo([evento(manianaSql())]);

    expect(await useCase.execute(7)).toBeTrue();
  });

  /*
   * El caso central: el operador preparó ayer, cruzó la medianoche y la jornada
   * de hoy ya estaba bajada. NO hay que cerrarle la sesión.
   */
  it('el evento de ayer no cuenta, pero el de hoy que vino con él sí', async () => {
    eventoRepo.getBySucursal.and.resolveTo([evento(ayer()), evento(hoySql())]);

    expect(await useCase.execute(7)).toBeTrue();
  });

  /*
   * El caso del operador de una sola jornada: al cambiar el día, lo único
   * bajado es lo que fue "hoy" ayer, y eso ya quedó fuera de la ventana. Tiene
   * que dar false para que el cierre de sesión normal siga aplicando —
   * exactamente el comportamiento de antes de esta rama.
   */
  it('no hay trabajo si lo único que queda es de ayer', async () => {
    eventoRepo.getBySucursal.and.resolveTo([evento(ayer())]);

    expect(await useCase.execute(7)).toBeFalse();
  });

  it('no hay trabajo sin eventos', async () => {
    expect(await useCase.execute(7)).toBeFalse();
  });

  it('no hay trabajo sin tiendas', async () => {
    sucursalRepo.getByUsuario.and.resolveTo([]);

    expect(await useCase.execute(7)).toBeFalse();
  });

  describe('estados que no sirven', () => {
    // Un evento terminado o cerrado no es trabajo pendiente: no se puede contar.
    it('un evento de hoy EN_ANALISIS no cuenta', async () => {
      eventoRepo.getBySucursal.and.resolveTo([evento(hoySql(), 'EN_ANALISIS')]);

      expect(await useCase.execute(7)).toBeFalse();
    });

    it('un evento de hoy CERRADO no cuenta', async () => {
      eventoRepo.getBySucursal.and.resolveTo([evento(hoySql(), 'CERRADO')]);

      expect(await useCase.execute(7)).toBeFalse();
    });
  });

  /*
   * Al operador se lo asigna por jornada, no por local: la jornada de hoy puede
   * ser en otra tienda. Mirar solo la primera lo dejaría afuera.
   */
  it('encuentra el trabajo aunque esté en la segunda tienda', async () => {
    sucursalRepo.getByUsuario.and.resolveTo([SUCURSAL, OTRA_SUCURSAL]);
    eventoRepo.getBySucursal.and.callFake(async (id: number) =>
      id === OTRA_SUCURSAL.id ? [evento(hoySql())] : []
    );

    expect(await useCase.execute(7)).toBeTrue();
  });
});
