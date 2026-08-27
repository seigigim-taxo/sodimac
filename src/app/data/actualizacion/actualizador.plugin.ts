import { registerPlugin } from '@capacitor/core';

/*
 * Puente al plugin nativo. Ver ActualizadorPlugin.java.
 *
 * El nombre tiene que coincidir exactamente con el de @CapacitorPlugin del
 * lado Java: si no coincide, la llamada falla recién en tiempo de ejecución y
 * en el equipo, no al compilar.
 */
export interface ActualizadorPlugin {
  puedeInstalar(): Promise<{ valor: boolean }>;
  abrirAjustesInstalacion(): Promise<void>;
  instalar(options: { ruta: string }): Promise<void>;
  hash(options: { ruta: string }): Promise<{ valor: string }>;
}

export const Actualizador = registerPlugin<ActualizadorPlugin>('Actualizador');
