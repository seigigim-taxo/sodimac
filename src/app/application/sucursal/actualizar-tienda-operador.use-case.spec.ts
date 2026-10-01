import { TestBed } from '@angular/core/testing';
import { ActualizarTiendaOperadorUseCase } from './actualizar-tienda-operador.use-case';
import { SUCURSAL_REPOSITORY_TOKEN, SucursalRepository } from '../../domain/sucursal/repositories/sucursal.repository';
import { DatosPreparacion } from '../../domain/sincronizacion/models/preparacion.model';

const OPERADOR_ID = 7;

function datos(parcial: Partial<DatosPreparacion> = {}): DatosPreparacion {
  return {
    usuario: {
      login: 'op@sodimac.cl', rutNormalizado: '123456785', rut: '12345678',
      nombreCompleto: '', nombres: '', apellidoPaterno: null, apellidoMaterno: null,
      cargo: '', tipoUsuario: 'OPERADOR', esUsuarioCliente: false, autenticado: true,
    },
    tiendas: [{ idTienda: 1, codigoTienda: 'T01', nombreTienda: 'Tienda Uno', zonaOperativa: null }],
    jornadas: [],
    zonas: [],
    analista: null,
    ...parcial,
  };
}

describe('ActualizarTiendaOperadorUseCase', () => {
  let uc: ActualizarTiendaOperadorUseCase;
  let sucursalRepo: jasmine.SpyObj<SucursalRepository>;

  beforeEach(() => {
    sucursalRepo = jasmine.createSpyObj<SucursalRepository>('SucursalRepository', ['getByUsuario', 'guardarDeUsuario', 'getIdPorCodigo']);
    sucursalRepo.guardarDeUsuario.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        ActualizarTiendaOperadorUseCase,
        { provide: SUCURSAL_REPOSITORY_TOKEN, useValue: sucursalRepo },
      ],
    });
    uc = TestBed.inject(ActualizarTiendaOperadorUseCase);
  });

  /*
   * El caso real que esto corrige: el SGO reasigna al operador a otra tienda
   * sin que todavía exista ninguna jornada ni muestra ahí. Antes, nada
   * persistía la tienda nueva porque esa decisión dependía de encontrar una
   * jornada "nueva" — acá se persiste igual, con jornadas: [].
   */
  it('persiste la tienda aunque no haya ninguna jornada', async () => {
    sucursalRepo.getIdPorCodigo.and.resolveTo(9);

    const resultado = await uc.execute(OPERADOR_ID, datos({ jornadas: [] }));

    expect(sucursalRepo.guardarDeUsuario).toHaveBeenCalledWith(OPERADOR_ID, [
      { codigoTienda: 'T01', nombre: 'Tienda Uno', zonaOperativa: null },
    ]);
    expect(resultado).toEqual({ sucursalId: 9, codigoTienda: 'T01', nombreTienda: 'Tienda Uno' });
  });

  it('sin tiendas en la respuesta, no persiste nada y devuelve null', async () => {
    const resultado = await uc.execute(OPERADOR_ID, datos({ tiendas: [] }));

    expect(sucursalRepo.guardarDeUsuario).not.toHaveBeenCalled();
    expect(resultado).toBeNull();
  });

  it('si no logra recuperar el id local tras guardar, devuelve null', async () => {
    sucursalRepo.getIdPorCodigo.and.resolveTo(null);

    const resultado = await uc.execute(OPERADOR_ID, datos());

    expect(resultado).toBeNull();
  });

  it('no decide si es un cambio: eso es responsabilidad de quien llama', async () => {
    sucursalRepo.getIdPorCodigo.and.resolveTo(1);

    const resultado = await uc.execute(OPERADOR_ID, datos());

    expect(resultado).toEqual({ sucursalId: 1, codigoTienda: 'T01', nombreTienda: 'Tienda Uno' });
    expect(Object.keys(resultado ?? {})).not.toContain('cambio');
  });
});
