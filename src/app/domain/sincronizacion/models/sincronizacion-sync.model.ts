import { TagFinalizadoPayload } from './tag-finalizado.model';

export type PerfilSync = 'OPERADOR' | 'ANALISTA_CLIENTE';
export type EstadoSync = 'PENDIENTE' | 'ENVIADO' | 'ERROR';

export interface SincronizacionSync {
  id: number;
  eventoId: number | null;
  pdaId: number | null;
  tipo: 'DESCARGA_A_PDA' | 'CARGA_DESDE_PDA';
  operacion: 'PREPARACION' | 'TAG_FINALIZADO' | null;
  perfil: PerfilSync | null;
  iteracion: number | null;
  conteoId: number | null;
  ubicacionId: number | null;
  operadorId: number | null;
  cargaUid: string | null;
  payloadJson: string | null;
  estado: EstadoSync;
  error: string | null;
  intentos: number;
  fechaHora: string;
  fechaUltimoIntento: string | null;
  fechaEnvio: string | null;
  registrosProcesados: number | null;
}

export interface GuardarSyncTagInput {
  eventoId: number;
  pdaId: number;
  iteracion: number;
  perfil: PerfilSync;
  conteoId: number | null;
  ubicacionId: number | null;
  operadorId: number;
  cargaUid: string;
  payload: TagFinalizadoPayload;
}
