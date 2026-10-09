import { EstadoConteo } from '../../../domain/conteo/models/estado-conteo.model';
import { EstadoEnvioTag } from '../../../domain/sincronizacion/models/estado-envio-tag.model';

/*
 * Cómo se rotula un TAG en la tarjeta del resumen.
 *
 * Un TAG finalizado todavía no está sincronizado, pero "pendiente" no siempre
 * es cierto: si el envío salió y no se supo qué pasó, el servidor puede tenerlo,
 * y decirle "pendiente" al operador lo invita a volver a contarlo. Por eso el
 * rótulo mira también lo que se sabe del envío (`bloqueo`, que solo trae los
 * estados que impiden tocar el TAG: 'EN_DUDA' y 'ENVIADO').
 */
export interface EtiquetaTag {
  texto: string;
  icono: string;
  tono: 'warning' | 'success';
}

export function etiquetaTag(estado: EstadoConteo, bloqueo: EstadoEnvioTag | null): EtiquetaTag {
  if (estado === 'EN_CURSO') return { texto: 'En curso', icono: 'time-outline', tono: 'warning' };
  if (estado === 'SINCRONIZADO') return { texto: 'Sincronizado', icono: 'cloud-done-outline', tono: 'success' };

  // FINALIZADO
  if (bloqueo === 'EN_DUDA') return { texto: 'Sin confirmar', icono: 'help-circle-outline', tono: 'warning' };
  if (bloqueo === 'ENVIADO') return { texto: 'Enviado', icono: 'cloud-done-outline', tono: 'success' };
  return { texto: 'Pendiente de sincronizar', icono: 'cloud-upload-outline', tono: 'warning' };
}
