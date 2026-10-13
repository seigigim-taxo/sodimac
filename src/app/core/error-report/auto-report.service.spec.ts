import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AutoReportService } from './auto-report.service';
import { AuthFacade } from '../../state/auth/auth.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { SqliteConnectionService } from '../database/sqlite-connection.service';

/*
 * El dedupe es la pieza que hace sostenible el reporte automático: sin él,
 * un endpoint caído que un servicio de fondo reintenta cada pocos segundos
 * escribe cientos de filas idénticas en el equipo.
 */
describe('AutoReportService — reporte automático', () => {
  let service: AutoReportService;
  let db: { query: jasmine.Spy; run: jasmine.Spy };

  beforeEach(() => {
    db = {
      query: jasmine.createSpy('query').and.resolveTo({ values: [] }),
      run: jasmine.createSpy('run').and.resolveTo({}),
    };

    TestBed.configureTestingModule({
      providers: [
        AutoReportService,
        { provide: AuthFacade, useValue: { session: () => null } },
        { provide: SucursalFacade, useValue: { currentStore: () => null } },
        { provide: SqliteConnectionService, useValue: { getConnection: () => Promise.resolve(db) } },
        { provide: Router, useValue: { url: '/home' } },
      ],
    });

    service = TestBed.inject(AutoReportService);
    spyOn(service, 'captureScreenshot').and.resolveTo('cap.jpg');
    spyOn(service, 'gatherMetadata').and.resolveTo({ rut: 'x' } as never);
  });

  it('guarda el reporte con contexto, tipo AUTOMATICO y screenshot', async () => {
    await service.reportar('POST x', 'HTTP 500');

    expect(db.run).toHaveBeenCalledTimes(1);
    const [sql, params] = db.run.calls.mostRecent().args as [string, unknown[]];
    expect(sql).toContain('INSERT INTO sod_error_report');
    expect(params).toContain('[Auto][POST x] HTTP 500');
    expect(params).toContain('AUTOMATICO');
    expect(params).toContain('cap.jpg');
  });

  it('omite el reporte si el mismo detalle ya se reportó en la ventana', async () => {
    db.query.and.resolveTo({ values: [{ 1: 1 }] });

    await service.reportar('POST x', 'HTTP 500');

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('la consulta de dedupe incluye la ventana de 10 minutos', async () => {
    await service.reportar('POST x', 'HTTP 500');

    const [sql, params] = db.query.calls.mostRecent().args as [string, unknown[]];
    expect(sql).toContain("datetime('now', ?)");
    expect(params).toContain('[Auto][POST x] HTTP 500');
    expect(params).toContain('-10 minutes');
  });

  it('un fallo al guardar nunca se propaga al llamador', async () => {
    spyOn(console, 'error');
    db.run.and.rejectWith(new Error('disco lleno'));

    await expectAsync(service.reportar('POST x', 'HTTP 500')).toBeResolved();
    expect(console.error).toHaveBeenCalled();
  });

  it('un fallo al capturar la pantalla no impide guardar el reporte', async () => {
    (service.captureScreenshot as jasmine.Spy).and.rejectWith(new Error('sin permiso'));

    await service.reportar('POST x', 'HTTP 500');

    const [, params] = db.run.calls.mostRecent().args as [string, unknown[]];
    expect(params).toContain(''); // screenshotPath vacío, el reporte igual se guarda
  });
});
