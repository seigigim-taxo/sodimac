import { TestBed } from '@angular/core/testing';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_SCHEMA_SQL } from '../../core/database/sodimac.schema';
import { SqliteZonificacionRepository } from '../../data/zonificacion/zonificacion-local.repository';
import { CATALOGO_V1_DATA, ESTADO_V1_DATA } from '../../data/zonificacion/zonificacion.fixtures';
import { parsearCatalogo, parsearRespuestaEstado } from '../../data/zonificacion/zonificacion.parser';
import { CatalogoZonificacion } from '../../domain/zonificacion/models/catalogo-zonificacion.model';
import { EstadoAgenda } from '../../domain/zonificacion/models/estado-agenda.model';
import { IdentidadOperador } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { ZONIFICACION_API_REPOSITORY_TOKEN, ZonificacionApiRepository } from '../../domain/zonificacion/repositories/zonificacion-api.repository';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { ConexionFalsa, crearConexionEnMemoria } from '../../../testing/sqlite-en-memoria';
import { EnviarZonificacionUseCase } from './enviar-zonificacion.use-case';
import { IdentidadZonificacionService } from './identidad-zonificacion.service';
import { AgendaRef } from './resultado-accion';

/*
 * Armado común de las specs de los casos de uso de zonificación: SQLite real en
 * memoria para el repositorio local, el cliente del WS y el envío reemplazados
 * por dobles. Solo se usa desde specs.
 */
export const AGENDA: AgendaRef = { idAgenda: 2092, numeroAgenda: 'AG-20260909-4081-01' };

export const IDENTIDAD: IdentidadOperador = {
  operadorLogin: 'operador1@prueba.local',
  operadorRut: '99800002-5',
  pdaCodigo: 'cacbf30019d8d95a',
  versionApp: '1.0.17',
};

export interface Entorno {
  db: ConexionFalsa;
  local: SqliteZonificacionRepository;
  api: jasmine.SpyObj<ZonificacionApiRepository>;
  enviar: jasmine.SpyObj<EnviarZonificacionUseCase>;
  identidad: jasmine.SpyObj<IdentidadZonificacionService>;
  /* Estado del servidor sembrado: agenda 2092, BORRADOR, rangos 758 (1128-1131) y 761 (1132-1134), entre otros. */
  estado: EstadoAgenda;
  catalogo: CatalogoZonificacion;
}

export interface OpcionesEntorno {
  /* false: no se siembra el catálogo ni el estado (para probar "nunca se descargó"). */
  sembrar?: boolean;
}

export async function crearEntorno(opciones: OpcionesEntorno = {}): Promise<Entorno> {
  const db = await crearConexionEnMemoria(SODIMAC_SCHEMA_SQL);

  const api = jasmine.createSpyObj<ZonificacionApiRepository>('ZonificacionApi', ['obtenerCatalogo', 'listarAgendas', 'obtenerEstado', 'enviar']);
  const enviar = jasmine.createSpyObj<EnviarZonificacionUseCase>('EnviarZonificacion', ['execute']);
  enviar.execute.and.resolveTo({ enviadas: 0, rechazadas: 0, reintentables: 0, cortadoPorRed: false });
  const identidad = jasmine.createSpyObj<IdentidadZonificacionService>('Identidad', ['obtener']);
  identidad.obtener.and.resolveTo(IDENTIDAD);

  TestBed.configureTestingModule({
    providers: [
      SqliteZonificacionRepository,
      SqliteConnectionService,
      { provide: ZONIFICACION_API_REPOSITORY_TOKEN, useValue: api },
      { provide: ZONIFICACION_LOCAL_REPOSITORY_TOKEN, useExisting: SqliteZonificacionRepository },
      { provide: EnviarZonificacionUseCase, useValue: enviar },
      { provide: IdentidadZonificacionService, useValue: identidad },
    ],
  });
  spyOn(TestBed.inject(SqliteConnectionService), 'getConnection').and.resolveTo(db as never);
  const local = TestBed.inject(SqliteZonificacionRepository);

  const estado = parsearRespuestaEstado(ESTADO_V1_DATA);
  const catalogo = parsearCatalogo(CATALOGO_V1_DATA);
  if (opciones.sembrar !== false) {
    await local.guardarCatalogo(catalogo);
    await local.guardarEstado(estado);
  }
  return { db, local, api, enviar, identidad, estado, catalogo };
}

/* Deja el último estado conocido con los cambios indicados (p. ej. confirmada, solo lectura). */
export async function sembrarEstado(e: Entorno, cambios: (estado: EstadoAgenda) => EstadoAgenda): Promise<void> {
  await e.local.guardarEstado(cambios(e.estado));
}
