import { TestBed } from '@angular/core/testing';
import { EnvioEnCursoService } from '../sincronizacion/envio-en-curso.service';
import { ContextoAgendaZonificacionService } from './contexto-agenda-zonificacion.service';
import { EliminarRangoUseCase } from './eliminar-rango.use-case';
import { claveCandado } from './enviar-zonificacion.use-case';
import { GuardarRangoUseCase } from './guardar-rango.use-case';
import { AGENDA, Entorno, crearEntorno, sembrarEstado } from './zonificacion-pruebas';

describe('EliminarRangoUseCase', () => {
  let e: Entorno;
  let uc: EliminarRangoUseCase;
  let guardar: GuardarRangoUseCase;

  beforeEach(async () => {
    e = await crearEntorno();
    uc = TestBed.inject(EliminarRangoUseCase);
    guardar = TestBed.inject(GuardarRangoUseCase);
  });

  afterEach(() => e.db.cerrar());

  const nuevo = (desde = 1135, hasta = 1140) =>
    guardar.execute({ agenda: AGENDA, idRango: null, codigoZona: 'ALTILLO', tagDesde: desde, tagHasta: hasta, referenciaUbicacion: null });
  const vista = async () => (await TestBed.inject(ContextoAgendaZonificacionService).cargar(AGENDA.idAgenda)).vista;

  it('un rango del servidor: se manda su eliminación con el id del servidor', async () => {
    const r = await uc.execute(AGENDA, 758);

    expect(r).toEqual({ ok: true });
    const [op] = await e.local.listarPendientes(AGENDA.idAgenda);
    expect(op).toEqual(jasmine.objectContaining({ tipo: 'ELIMINAR_RANGO', datos: { id_zonificacion_det: 758 } }));
    expect(e.enviar.execute).toHaveBeenCalledWith({ idAgenda: AGENDA.idAgenda });
  });

  it('el rango eliminado desaparece de la vista de inmediato', async () => {
    await uc.execute(AGENDA, 758);
    expect((await vista()).rangos.some((r) => r.id === 758)).toBeFalse();
  });

  it('un rango nuevo que no salió: se quita de la cola y no se manda nada al servidor', async () => {
    await nuevo();
    const id = (await vista()).rangos.find((r) => r.pendiente)!.id;
    e.enviar.execute.calls.reset();

    const r = await uc.execute(AGENDA, id);

    expect(r).toEqual({ ok: true });
    expect(await e.local.contarPendientes()).toBe(0);
    expect(e.enviar.execute).not.toHaveBeenCalled();
    expect((await vista()).rangos.some((x) => x.pendiente)).toBeFalse();
  });

  it('un rango del servidor con una edición pendiente: se descarta la edición y se manda la eliminación', async () => {
    await guardar.execute({ agenda: AGENDA, idRango: 758, codigoZona: 'ALTILLO', tagDesde: 1128, tagHasta: 1131, referenciaUbicacion: 'nueva' });

    const r = await uc.execute(AGENDA, 758);

    expect(r).toEqual({ ok: true });
    const cola = await e.local.listarPendientes(AGENDA.idAgenda);
    expect(cola.map((o) => o.tipo)).toEqual(['ELIMINAR_RANGO']);
    expect(cola[0].datos).toEqual({ id_zonificacion_det: 758 });
  });

  it('un rango que no existe', async () => {
    expect(await uc.execute(AGENDA, 99999)).toEqual({ ok: false, codigo: 'RANGO_NO_ENCONTRADO', data: { id_zonificacion_det: 99999 } });
    expect(await e.local.contarPendientes()).toBe(0);
  });

  it('con la zonificación confirmada no se elimina', async () => {
    await sembrarEstado(e, (s) => ({ ...s, zonificacion: { ...s.zonificacion, estado: 'CONFIRMADA' } }));
    const r = await uc.execute(AGENDA, 758);
    expect(!r.ok && r.codigo).toBe('ZONIFICACION_CONFIRMADA');
    expect(await e.local.contarPendientes()).toBe(0);
  });

  it('agenda de solo lectura', async () => {
    await sembrarEstado(e, (s) => ({ ...s, agenda: { ...s.agenda, soloLectura: true } }));
    expect(await uc.execute(AGENDA, 758)).toEqual({ ok: false, codigo: 'AGENDA_SOLO_LECTURA', data: {} });
  });

  it('si el rango pendiente se está enviando justo ahora, no se toca', async () => {
    await nuevo();
    const id = (await vista()).rangos.find((r) => r.pendiente)!.id;
    TestBed.inject(EnvioEnCursoService).tomar(claveCandado(AGENDA.idAgenda));

    expect(await uc.execute(AGENDA, id)).toEqual({ ok: false, codigo: 'RANGO_EN_ENVIO', data: {} });
    expect(await e.local.contarPendientes()).toBe(1);
  });
});
