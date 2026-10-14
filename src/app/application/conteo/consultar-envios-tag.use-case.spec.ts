import { TestBed } from '@angular/core/testing';
import { ConsultarEnviosTagUseCase, clavePorTag } from './consultar-envios-tag.use-case';
import { SINCRONIZACION_REPOSITORY_TOKEN, SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';
import { EstadoEnvioTag } from '../../domain/sincronizacion/models/estado-envio-tag.model';

const resumen = (ubicacionId: number, estado: EstadoConteo = 'FINALIZADO'): ConteoResumen => ({
  conteoId: 3, eventoId: 1, ubicacionId, operadorId: 7, pdaId: 2, estado, tag: String(ubicacionId),
  zonaCodigo: 'Z', zonaNombre: 'Z', totalProductos: 1, totalUnidades: 1, iteracion: 1,
  fechaUltima: '2026-10-05 10:00:00',
});

describe('ConsultarEnviosTagUseCase', () => {
  let useCase: ConsultarEnviosTagUseCase;
  let repo: jasmine.SpyObj<SincronizacionRepository>;
  let porUbicacion: Record<number, EstadoEnvioTag>;

  beforeEach(() => {
    porUbicacion = {};
    repo = jasmine.createSpyObj('SincronizacionRepository', ['estadoEnvioTag']);
    repo.estadoEnvioTag.and.callFake(async (_c: number, u: number) =>
      ({ estado: porUbicacion[u] ?? 'SIN_ENVIO', cargaUid: null, detalle: null }));

    spyOn(console, 'error');
    TestBed.configureTestingModule({
      providers: [ConsultarEnviosTagUseCase, { provide: SINCRONIZACION_REPOSITORY_TOKEN, useValue: repo }],
    });
    useCase = TestBed.inject(ConsultarEnviosTagUseCase);
  });

  it('marca como bloqueados los ENVIADO y los EN_DUDA, con su estado', async () => {
    porUbicacion = { 1: 'ENVIADO', 2: 'EN_DUDA' };

    const r = await useCase.execute([resumen(1), resumen(2)]);

    expect(r.get(clavePorTag(resumen(1)))).toBe('ENVIADO');
    expect(r.get(clavePorTag(resumen(2)))).toBe('EN_DUDA');
  });

  it('no marca los que se pueden editar (sin envío o envío que no llegó)', async () => {
    porUbicacion = { 1: 'SIN_ENVIO', 2: 'NO_RECIBIDO' };

    const r = await useCase.execute([resumen(1), resumen(2)]);

    expect(r.size).toBe(0);
  });

  it('solo consulta los FINALIZADOS', async () => {
    await useCase.execute([resumen(1, 'EN_CURSO'), resumen(2, 'SINCRONIZADO'), resumen(3, 'FINALIZADO')]);

    expect(repo.estadoEnvioTag).toHaveBeenCalledOnceWith(3, 3);
  });

  it('un TAG que no se pudo consultar no se da por bloqueado, y no frena a los demás', async () => {
    porUbicacion = { 2: 'ENVIADO' };
    repo.estadoEnvioTag.and.callFake(async (_c: number, u: number) => {
      if (u === 1) throw new Error('disco');
      return { estado: porUbicacion[u] ?? 'SIN_ENVIO', cargaUid: null, detalle: null };
    });

    const r = await useCase.execute([resumen(1), resumen(2)]);

    expect(r.has(clavePorTag(resumen(1)))).toBeFalse();
    expect(r.get(clavePorTag(resumen(2)))).toBe('ENVIADO');
  });
});
