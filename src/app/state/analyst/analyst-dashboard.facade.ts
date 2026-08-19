import { Injectable, inject, signal, computed } from '@angular/core';
import { ContextoAnalista, KpisAnalista, FilaAnalista, RegistroAnalista } from '../../domain/sincronizacion/models/preparacion.model';
import { ApiService } from '../../core/http/api.service';
import { AuthFacade } from '../auth/auth.facade';
import { PdaFacade } from '../pda/pda.facade';
import { TagFinalizadoPayload } from '../../domain/sincronizacion/models/tag-finalizado.model';

@Injectable({ providedIn: 'root' })
export class AnalystDashboardFacade {
  private api = inject(ApiService);
  private auth = inject(AuthFacade);
  private pda = inject(PdaFacade);

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
  ): Promise<boolean> {
    const session = this.auth.session();
    const ctx = this.contextoSignal();
    if (!session || !ctx) return false;

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

    const exito = await this.enviarTagFinalizado(fila, tagCodigo, ubicacionCodigo, zonaNombre, cantidadAnalista);
    if (!exito) return false;

    this.registrosSignal.update(prev =>
      prev.map(r =>
        r.filaSku === registro.filaSku &&
        r.tagCodigo === registro.tagCodigo &&
        r.fechaHora === registro.fechaHora
          ? { ...r, estado: 'ENVIADO' as const }
          : r
      )
    );
    return true;
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
  ): Promise<boolean> {
    const session = this.auth.session();
    const ctx = this.contextoSignal();
    if (!session || !ctx) return false;

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    const cargaUid = `${ctx.codigoTienda}-ITER2-${tagCodigo}-${this.pda.pdaId() ?? 'PDA'}-${now.getTime()}`;

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
      id_agenda: null,
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

    try {
      await this.api.post('sincronizaciones/tag-finalizado.php', payload);
      return true;
    } catch {
      return false;
    }
  }
}
