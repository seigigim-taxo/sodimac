import { Injectable, inject, signal, computed } from '@angular/core';
import { ContextoAnalista, KpisAnalista, FilaAnalista, RegistroAnalista, ValidacionBloqueAnalista } from '../../domain/sincronizacion/models/preparacion.model';
import { AuthFacade } from '../auth/auth.facade';
import { PdaFacade } from '../pda/pda.facade';
import { TagFinalizadoPayload } from '../../domain/sincronizacion/models/tag-finalizado.model';
import { SincronizarTagFinalizadoUseCase } from '../../application/sincronizacion/sincronizar-tag-finalizado.use-case';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { VALIDACION_REPOSITORY_TOKEN } from '../../domain/validacion/repositories/validacion.repository';

@Injectable({ providedIn: 'root' })
export class AnalystDashboardFacade {
  private auth = inject(AuthFacade);
  private pda = inject(PdaFacade);
  private syncTag = inject(SincronizarTagFinalizadoUseCase);
  private sucursalRepo = inject(SUCURSAL_REPOSITORY_TOKEN);
  private eventoRepo = inject(EVENTO_REPOSITORY_TOKEN);
  private validacionRepo = inject(VALIDACION_REPOSITORY_TOKEN);

  private contextoSignal = signal<ContextoAnalista | null>(null);
  private kpisSignal = signal<KpisAnalista | null>(null);
  private filasSignal = signal<FilaAnalista[]>([]);
  private registrosSignal = signal<RegistroAnalista[]>([]);
  private altillosSignal = signal<ValidacionBloqueAnalista | null>(null);
  private puntoVentaSignal = signal<ValidacionBloqueAnalista | null>(null);

  readonly contexto = this.contextoSignal.asReadonly();
  readonly kpis = this.kpisSignal.asReadonly();
  readonly filas = this.filasSignal.asReadonly();
  readonly registros = this.registrosSignal.asReadonly();
  readonly altillos = this.altillosSignal.asReadonly();
  readonly puntoVenta = this.puntoVentaSignal.asReadonly();

  readonly registrosPendientes = computed(() => this.registrosSignal().filter(r => r.estado === 'PENDIENTE'));
  readonly registrosEnviados = computed(() => this.registrosSignal().filter(r => r.estado === 'ENVIADO'));
  readonly registrosConError = computed(() => this.registrosSignal().filter(r => r.estado === 'ERROR'));

  cargarDatos(contexto: ContextoAnalista, kpis: KpisAnalista, filas: FilaAnalista[]): void {
    this.contextoSignal.set(contexto);
    this.kpisSignal.set(kpis);
    this.filasSignal.set(filas);
  }

  async registrarConteo(
    fila: FilaAnalista,
    tagCodigo: string,
    ubicacionCodigo: string,
    zonaNombre: string,
    cantidadAnalista: number
  ): Promise<{ ok: boolean; error?: string }> {
    const session = this.auth.session();
    const ctx = this.contextoSignal();
    if (!session || !ctx) return { ok: false, error: 'Sesión o contexto no disponible' };

    const registro: RegistroAnalista = {
      filaSku: fila.sku,
      tagCodigo,
      ubicacionCodigo,
      zonaNombre,
      cantidadAnalista,
      estado: 'PENDIENTE',
      fechaHora: new Date().toISOString(),
    };

    this.registrosSignal.update(prev => [...prev, registro]);

    const resultado = await this.enviarTagFinalizado(fila, tagCodigo, ubicacionCodigo, zonaNombre, cantidadAnalista);

    if (resultado.ok) {
      this.registrosSignal.update(prev =>
        prev.map(r =>
          r.filaSku === registro.filaSku &&
          r.tagCodigo === registro.tagCodigo &&
          r.fechaHora === registro.fechaHora
            ? { ...r, estado: 'ENVIADO' as const }
            : r
        )
      );
      return { ok: true };
    }

    this.registrosSignal.update(prev =>
      prev.map(r =>
        r.filaSku === registro.filaSku &&
        r.tagCodigo === registro.tagCodigo &&
        r.fechaHora === registro.fechaHora
          ? { ...r, estado: 'ERROR' as const, error: resultado.error }
          : r
      )
    );
    return { ok: false, error: resultado.error };
  }

  limpiar(): void {
    this.contextoSignal.set(null);
    this.kpisSignal.set(null);
    this.filasSignal.set([]);
    this.registrosSignal.set([]);
    this.altillosSignal.set(null);
    this.puntoVentaSignal.set(null);
  }

  async cargarAltillosDesdeLocal(): Promise<void> {
    try {
      const altillos = await this.validacionRepo.getBloqueActivoPorTipo('ALTILLOS');
      this.altillosSignal.set(altillos);
    } catch (err) {
      console.error('[AnalystDashboardFacade] Error al cargar Altillos desde local:', err);
    }
  }

  async cargarPuntoVentaDesdeLocal(): Promise<void> {
    try {
      const puntoVenta = await this.validacionRepo.getBloqueActivoPorTipo('PUNTO_VENTA');
      this.puntoVentaSignal.set(puntoVenta);
    } catch (err) {
      console.error('[AnalystDashboardFacade] Error al cargar Punto de Venta desde local:', err);
    }
  }

  private async enviarTagFinalizado(
    fila: FilaAnalista,
    tagCodigo: string,
    ubicacionCodigo: string,
    zonaNombre: string,
    cantidadAnalista: number
  ): Promise<{ ok: boolean; error?: string }> {
    const session = this.auth.session();
    const ctx = this.contextoSignal();
    if (!session || !ctx) return { ok: false, error: 'Sesión o contexto no disponible' };

    const eventoId = await this.resolverEventoId(ctx);
    if (!eventoId) {
      return { ok: false, error: 'No se encontró evento local para esta jornada. Sincroniza datos antes de registrar conteos.' };
    }

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    const cargaUid = this.generarCargaUid(ctx, tagCodigo, now);

    const payload: TagFinalizadoPayload = {
      carga_uid: cargaUid,
      codigo_tienda: ctx.codigoTienda,
      fecha_programada: ctx.fechaJornada,
      iteracion: 2,
      tag_codigo: tagCodigo,
      zona_nombre: zonaNombre,
      zona_descripcion: null,
      operador_rut: session.rutNormalizado,
      operador_login: session.correo,
      pda_codigo: String(this.pda.pdaId() ?? 'PDA'),
      codigo_muestra: ctx.codigoMuestra,
      id_agenda: ctx.idAgenda,
      numero_agenda: ctx.numeroAgenda,
      ubicacion_codigo: ubicacionCodigo,
      detalles: [
        {
          detalle_uid: `${cargaUid}-DET-1`,
          codigo_lectura: fila.codigoBarras || fila.sku,
          sku: fila.sku,
          codigo_barras: fila.codigoBarras,
          descripcion: fila.descripcion,
          stock_sistema: fila.stockSistema,
          cantidad_fisica: cantidadAnalista,
          fecha_hora: ts,
        },
      ],
    };

    const resultado = await this.syncTag.execute({
      eventoId,
      pdaId: this.pda.pdaId() ?? 0,
      iteracion: 2,
      perfil: 'ANALISTA_CLIENTE',
      conteoId: null,
      ubicacionId: null,
      operadorId: session.operadorId,
      cargaUid,
      payload,
    });

    return resultado.ok
      ? { ok: true }
      : { ok: false, error: resultado.error };
  }

  private async resolverEventoId(ctx: ContextoAnalista): Promise<number | null> {
    const sucursalId = await this.sucursalRepo.getIdPorCodigo(ctx.codigoTienda);
    if (!sucursalId) return null;

    const eventos = await this.eventoRepo.getBySucursal(sucursalId);
    const evento = eventos.find(e => e.fechaProgramada === ctx.fechaJornada);
    return evento?.id ?? null;
  }

  private generarCargaUid(ctx: ContextoAnalista, tagCodigo: string, now: Date): string {
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
    const zona = tagCodigo ?? 'SINZONA';
    const pda = String(this.pda.pdaId() ?? 'PDA');
    return `${ctx.codigoTienda}-${ctx.fechaJornada}-AN-ITER2-${zona}-${zona}-${pda}-${ts}`;
  }
}
