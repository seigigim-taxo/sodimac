import { EstadoAgenda } from '../models/estado-agenda.model';
import { OperacionEnCola } from '../models/operacion-zonificacion.model';
import { RangoActivo } from '../models/rango-zonificacion.model';
import { RangoEnVista, TagAnuladoEnVista, VistaZonificacion } from '../models/vista-zonificacion.model';
import { calcularCantidad } from './reglas-zonificacion.utils';

/*
 * Arma lo que ve el operador: el estado del servidor con las operaciones
 * pendientes aplicadas encima, en el orden en que las hizo.
 *
 * Función pura. Las operaciones RECHAZADAS no se aplican (el servidor no las
 * aceptó): solo se listan aparte.
 */
export function aplicarPendientes(estado: EstadoAgenda | null, cola: OperacionEnCola[]): VistaZonificacion {
  const pendientes = cola.filter((o) => o.estado === 'PENDIENTE');
  const rechazadas = cola.filter((o) => o.estado === 'RECHAZADO');

  let rangos: Omit<RangoEnVista, 'cantidad'>[] = (estado?.rangos ?? []).map((r) => ({
    id: r.id,
    idServidor: typeof r.id === 'number' ? r.id : null,
    codigoZona: r.codigoZona,
    nombreZona: r.nombreZona,
    tagDesde: r.tagDesde,
    tagHasta: r.tagHasta,
    referenciaUbicacion: r.referenciaUbicacion,
    pendiente: false,
    operacionUid: null,
  }));
  const tagsAnulados: TagAnuladoEnVista[] = (estado?.tagsAnulados ?? []).map((t) => ({
    numeroTag: t.numeroTag,
    motivo: t.motivo,
    pendiente: false,
  }));
  let efectivo = estado?.zonificacion.estado ?? 'SIN_ZONIFICACION';
  let confirmacionPendiente = false;
  let reaperturaPendiente = false;

  for (const op of pendientes) {
    switch (op.tipo) {
      case 'GUARDAR_RANGO': {
        const idServidor = typeof op.datos['id_zonificacion_det'] === 'number' ? (op.datos['id_zonificacion_det'] as number) : null;
        const nuevo = {
          id: idServidor ?? op.claveRango ?? op.operacionUid,
          idServidor,
          codigoZona: String(op.datos['codigo_zona'] ?? ''),
          nombreZona: nombreDeZona(rangos, String(op.datos['codigo_zona'] ?? '')),
          tagDesde: Number(op.datos['tag_desde']),
          tagHasta: Number(op.datos['tag_hasta']),
          referenciaUbicacion: typeof op.datos['referencia_ubicacion'] === 'string' ? (op.datos['referencia_ubicacion'] as string) : null,
          pendiente: true,
          operacionUid: op.operacionUid,
        };
        // Editar un rango del servidor lo reemplaza; si no existe (o es nuevo), se agrega.
        const i = idServidor === null ? -1 : rangos.findIndex((r) => r.idServidor === idServidor);
        if (i >= 0) {
          rangos = rangos.map((r, k) => (k === i ? nuevo : r));
        } else {
          rangos = [...rangos, nuevo];
        }
        break;
      }
      case 'ELIMINAR_RANGO': {
        const id = op.datos['id_zonificacion_det'];
        rangos = rangos.filter((r) => r.idServidor !== id);
        break;
      }
      case 'ANULAR_TAG': {
        const numeroTag = Number(op.datos['numero_tag']);
        if (!tagsAnulados.some((t) => t.numeroTag === numeroTag)) {
          tagsAnulados.push({ numeroTag, motivo: String(op.datos['motivo'] ?? ''), pendiente: true });
        }
        break;
      }
      case 'CONFIRMAR':
        efectivo = 'CONFIRMADA';
        confirmacionPendiente = true;
        reaperturaPendiente = false;
        break;
      case 'REABRIR':
        efectivo = 'BORRADOR';
        reaperturaPendiente = true;
        confirmacionPendiente = false;
        break;
    }
  }

  // Un rango agregado a una agenda sin zonificar la deja en BORRADOR.
  if (efectivo === 'SIN_ZONIFICACION' && rangos.length > 0) {
    efectivo = 'BORRADOR';
  }

  const anulados = tagsAnulados.map((t) => t.numeroTag);
  return {
    estado: efectivo,
    confirmacionPendiente,
    reaperturaPendiente,
    rangos: rangos.map((r) => ({ ...r, cantidad: calcularCantidad(r.tagDesde, r.tagHasta, anulados) })),
    tagsAnulados,
    pendientes,
    rechazadas,
  };
}

/* Los rangos tal como los necesitan las reglas (cruces y anulaciones). */
export function rangosParaReglas(vista: VistaZonificacion): RangoActivo[] {
  return vista.rangos.map((r) => ({ id: r.id, tagDesde: r.tagDesde, tagHasta: r.tagHasta }));
}

/* El nombre de una zona ya conocida por otros rangos; si no hay, el código (la pantalla lo reemplaza con el catálogo). */
function nombreDeZona(rangos: { codigoZona: string; nombreZona: string }[], codigoZona: string): string {
  return rangos.find((r) => r.codigoZona === codigoZona)?.nombreZona ?? codigoZona;
}
