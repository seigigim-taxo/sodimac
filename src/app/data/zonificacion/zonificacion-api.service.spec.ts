import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/http/api.service';
import { environment } from '../../../environments/environment';
import { IdentidadOperador, SolicitudOperacion, TipoOperacionZonificacion } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { ZonificacionApiService } from './zonificacion-api.service';
import { RespuestaZonificacionInvalida } from './zonificacion.parser';
import { AGENDAS_V1_DATA, CATALOGO_V1_DATA, ESTADO_V1_DATA, GUARDAR_APLICADA_V1_DATA } from './zonificacion.fixtures';

/*
 * Lo que se prueba acá es lo que el WS espera recibir: el archivo de cada
 * operación, los nombres de los campos del contrato y que el mismo envío lleve
 * siempre el mismo operacion_uid. Las respuestas ya las cubre el parser.
 */
const IDENTIDAD: IdentidadOperador = {
  operadorLogin: 'operador1@prueba.local',
  operadorRut: '99800002-5',
  pdaCodigo: 'cacbf30019d8d95a',
  versionApp: '1.0.17',
};

const solicitud = (tipo: TipoOperacionZonificacion, datos: Record<string, unknown> = {}): SolicitudOperacion => ({
  operacionUid: '6f1c2a9e-3b7d-4c55-9a10-0d2f7e8b1a01',
  tipo,
  idAgenda: 2092,
  numeroAgenda: 'AG-20260909-4081-01',
  datos,
  fechaHoraLocal: '2026-09-09 10:42:05',
  identidad: IDENTIDAD,
});

describe('ZonificacionApiService', () => {
  let api: jasmine.SpyObj<ApiService>;
  let servicio: ZonificacionApiService;
  const sufijo = environment.zonificacionSufijo;
  const ruta = (archivo: string) => `${environment.zonificacionPath}/${archivo}${sufijo}.php`;

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['get', 'post']);
    TestBed.configureTestingModule({
      providers: [ZonificacionApiService, { provide: ApiService, useValue: api }],
    });
    servicio = TestBed.inject(ZonificacionApiService);
  });

  it('el catálogo se pide con GET, sin parámetros, y se lee', async () => {
    api.get.and.resolveTo(CATALOGO_V1_DATA as never);

    const c = await servicio.obtenerCatalogo();

    expect(api.get).toHaveBeenCalledOnceWith(ruta('catalogo'), undefined, { timeoutMs: 20_000 });
    expect(c.zonas.length).toBe(5);
  });

  it('la lista de agendas va por POST con la identidad y SIN agenda', async () => {
    api.post.and.resolveTo(AGENDAS_V1_DATA as never);

    const l = await servicio.listarAgendas(IDENTIDAD);

    expect(api.post).toHaveBeenCalledOnceWith(
      ruta('agendas'),
      { operador_login: 'operador1@prueba.local', operador_rut: '99800002-5', pda_codigo: 'cacbf30019d8d95a', version_app: '1.0.17' },
      { timeoutMs: 20_000 },
    );
    expect(l.agendas.length).toBe(2);
  });

  it('el estado pide la agenda por número e id, más la identidad', async () => {
    api.post.and.resolveTo(ESTADO_V1_DATA as never);

    const e = await servicio.obtenerEstado(IDENTIDAD, 2092, 'AG-20260909-4081-01');

    expect(api.post.calls.mostRecent().args[0]).toBe(ruta('estado'));
    expect(api.post.calls.mostRecent().args[1]).toEqual({
      operador_login: 'operador1@prueba.local',
      operador_rut: '99800002-5',
      pda_codigo: 'cacbf30019d8d95a',
      version_app: '1.0.17',
      numero_agenda: 'AG-20260909-4081-01',
      id_agenda: 2092,
    });
    expect(e.agenda.idAgenda).toBe(2092);
  });

  describe('enviar', () => {
    beforeEach(() => api.post.and.resolveTo(GUARDAR_APLICADA_V1_DATA as never));

    it('cada operación va a su archivo del WS', async () => {
      const esperado: Record<TipoOperacionZonificacion, string> = {
        GUARDAR_RANGO: 'rango-guardar',
        ELIMINAR_RANGO: 'rango-eliminar',
        ANULAR_TAG: 'tag-anular',
        CONFIRMAR: 'confirmar',
        REABRIR: 'reabrir',
      };
      for (const [tipo, archivo] of Object.entries(esperado)) {
        api.post.calls.reset();
        await servicio.enviar(solicitud(tipo as TipoOperacionZonificacion));
        expect(api.post.calls.mostRecent().args[0]).toBe(ruta(archivo));
      }
    });

    it('arma el cuerpo con los nombres del contrato', async () => {
      const datos = { id_zonificacion_det: null, codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140, referencia_ubicacion: 'P49' };

      await servicio.enviar(solicitud('GUARDAR_RANGO', datos));

      expect(api.post.calls.mostRecent().args[1]).toEqual({
        operacion_uid: '6f1c2a9e-3b7d-4c55-9a10-0d2f7e8b1a01',
        numero_agenda: 'AG-20260909-4081-01',
        id_agenda: 2092,
        operador_login: 'operador1@prueba.local',
        operador_rut: '99800002-5',
        pda_codigo: 'cacbf30019d8d95a',
        version_app: '1.0.17',
        fecha_hora_local: '2026-09-09 10:42:05',
        datos,
      });
    });

    it('un reintento manda exactamente el mismo cuerpo (mismo uid y mismo contenido)', async () => {
      const s = solicitud('GUARDAR_RANGO', { codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140 });

      await servicio.enviar(s);
      await servicio.enviar(s);

      const [primero, segundo] = api.post.calls.allArgs().map((a) => a[1]);
      expect(segundo).toEqual(primero);
    });

    it('confirmar y reabrir mandan datos vacíos, no los omiten', async () => {
      await servicio.enviar(solicitud('CONFIRMAR'));
      expect((api.post.calls.mostRecent().args[1] as { datos: unknown }).datos).toEqual({});
    });

    it('devuelve el resultado leído', async () => {
      const r = await servicio.enviar(solicitud('GUARDAR_RANGO'));
      expect(r.resultado).toBe('APLICADA');
      expect(r.idZonificacionDet).toBe(764);
    });

    it('una respuesta ilegible lanza RespuestaZonificacionInvalida (la operación se reintenta, no se descarta)', async () => {
      api.post.and.resolveTo({ resultado: 'RARO' } as never);
      await expectAsync(servicio.enviar(solicitud('CONFIRMAR'))).toBeRejectedWithError(RespuestaZonificacionInvalida);
    });

    it('los errores del servidor suben tal cual, con su código', async () => {
      const error = new Error('RANGO_CRUZADO');
      api.post.and.rejectWith(error);
      await expectAsync(servicio.enviar(solicitud('GUARDAR_RANGO'))).toBeRejectedWith(error);
    });
  });
});
