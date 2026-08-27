import { Injectable, inject, signal, computed } from '@angular/core';
import { ContextoAnalista, KpisAnalista, FilaAnalista, RegistroAnalista } from '../../domain/sincronizacion/models/preparacion.model';
import { AuthFacade } from '../auth/auth.facade';
import { PdaFacade } from '../pda/pda.facade';
import { TagFinalizadoPayload, detalleUid } from '../../domain/sincronizacion/models/tag-finalizado.model';
import { SincronizarTagFinalizadoUseCase } from '../../application/sincronizacion/sincronizar-tag-finalizado.use-case';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { ahoraSqlMs } from '../../shared/utils/fecha.utils';

@Injectable({ providedIn: 'root' })
export class AnalystDashboardFacade {
  private auth = inject(AuthFacade);
  private pda = inject(PdaFacade);
  private syncTag = inject(SincronizarTagFinalizadoUseCase);
  private sucursalRepo = inject(SUCURSAL_REPOSITORY_TOKEN);
  private eventoRepo = inject(EVENTO_REPOSITORY_TOKEN);

  private contextoSignal = signal<ContextoAnalista | null>(null);
  private kpisSignal = signal<KpisAnalista | null>(null);
  private filasSignal = signal<FilaAnalista[]>([]);
  private registrosSignal = signal<RegistroAnalista[]>([]);

  readonly contexto = this.contextoSignal.asReadonly();
  readonly kpis = this.kpisSignal.asReadonly();
  readonly filas = this.filasSignal.asReadonly();
  readonly registros = this.registrosSignal.asReadonly();

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
    const ts = ahoraSqlMs(now);
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
          // El analista manda un producto por carga, así que el id de línea es
          // siempre 1; el formato se comparte con el operador para que ambos se
          // lean igual en la tabla del SGO.
          detalle_uid: detalleUid(cargaUid, 1, ts),
          codigo_lectura: fila.codigoBarras || fila.sku,
          sku: fila.sku,
          codigo_barras: fila.codigoBarras,
          descripcion: fila.descripcion,
          stock_sistema: fila.stockSistema,
          cantidad_fisica: cantidadAnalista,
          fecha_hora: ts,
          /*
           * El analista no escanea: elige la fila en el dashboard y tipea la
           * cantidad. La captura es manual por definición, no hay heurística
           * que aplicar acá.
           */
          lecturas: [
            {
              codigo_lectura: fila.codigoBarras || fila.sku,
              medio_captura: 'MANUAL' as const,
              cantidad: cantidadAnalista,
            },
          ],
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
