import { InjectionToken } from '@angular/core';
import { GuardarSyncTagInput, GuardarSyncValidacionInput, GuardarSyncVersionReportInput, SincronizacionSync } from '../models/sincronizacion-sync.model';
import { EnvioTag } from '../models/estado-envio-tag.model';

export interface SincronizacionRepository {
  /* Registra en sod_sincronizacion una carga (CARGA_DESDE_PDA) de un conteo. */
  registrarCarga(eventoId: number, pdaId: number, registrosProcesados: number): Promise<void>;

  /* Cola offline de payloads tag-finalizado.php pendientes de envío. */
  guardarSyncTag(input: GuardarSyncTagInput): Promise<void>;
  /*
   * Pendientes que todavía se pueden enviar: solo los del día en curso. Un
   * conteo que no alcanzó a subir en su jornada se da por perdido y no se manda
   * después.
   */
  listarPendientes(): Promise<SincronizacionSync[]>;
  marcarEnviado(cargaUid: string, registrosProcesados: number): Promise<void>;
  /*
   * El servidor lo tiene, pero con otro contenido que la PDA (por ejemplo, un
   * TAG que se siguió editando después de un envío cuya respuesta se perdió).
   * Cuenta como enviado, y deja anotado en qué difiere.
   */
  marcarEnviadoConDiferencias(cargaUid: string, registrosProcesados: number, diferencias: string): Promise<void>;
  /*
   * Un intento que FALLÓ CON CERTEZA: la solicitud no salió, o el servidor la
   * rechazó sin guardar nada. El TAG sigue siendo editable.
   */
  marcarError(cargaUid: string, error: string): Promise<void>;
  /*
   * Un intento que salió y NO volvió con una respuesta completa. El servidor
   * pudo haber guardado el TAG; la fila queda PENDIENTE (en duda) hasta
   * averiguarlo, y mientras tanto el TAG no se puede tocar.
   */
  marcarSinRespuesta(cargaUid: string, error: string): Promise<void>;
  /*
   * Borra los envíos fallidos (ERROR) de TAGs que ya no existen en la PDA: el
   * operador los descartó y sus lecturas se borraron, pero la fila de la cola
   * quedó. Reenviarla mandaría al servidor datos que se descartaron a propósito.
   *
   * Nunca toca un envío recibido (ENVIADO) ni uno en duda (PENDIENTE): son la
   * constancia de lo que el servidor tiene o pudo haber recibido.
   */
  limpiarEnviosHuerfanos(): Promise<void>;
  /*
   * Envíos que el servidor YA tiene (ENVIADO) pero cuyo TAG sigue FINALIZADO en la
   * PDA, porque la marca local se perdió. Solo lectura.
   */
  listarEnviadosPorSanar(): Promise<SincronizacionSync[]>;
  /*
   * Qué se sabe del envío de un TAG. De esto depende si se puede editar,
   * borrar o reabrir. Ver estado-envio-tag.model.ts.
   */
  estadoEnvioTag(conteoId: number, ubicacionId: number): Promise<EnvioTag>;
  /*
   * La fila completa de un envío —con el payload tal como quedó guardado—, o null
   * si no existe. Lo que el servidor recibió, o pudo recibir, es ESE payload,
   * aunque las filas del conteo hayan cambiado después.
   */
  obtenerEnvio(cargaUid: string): Promise<SincronizacionSync | null>;

  /* Cola offline de payloads validacion-analista.php pendientes de envío. */
  guardarSyncValidacion(input: GuardarSyncValidacionInput): Promise<void>;

  /* Cola offline de payloads reporte-version.php pendientes de envío. */
  guardarSyncVersionReport(input: GuardarSyncVersionReportInput): Promise<void>;
}

export const SINCRONIZACION_REPOSITORY_TOKEN = new InjectionToken<SincronizacionRepository>('SincronizacionRepository');
