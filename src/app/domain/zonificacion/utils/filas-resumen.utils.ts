import { EstadoAgenda } from '../models/estado-agenda.model';
import { IdRango } from '../models/rango-zonificacion.model';
import { VistaZonificacion } from '../models/vista-zonificacion.model';

/*
 * Lo que muestra el resumen de una agenda, ya armado: una fila por rango y los
 * totales. La vista (estado + pendientes) manda lo que hay; el último estado del
 * servidor aporta lo que solo el servidor sabe, cuántos TAG de cada rango ya usó
 * el conteo.
 */
export interface FilaRango {
  id: IdRango;
  zona: string;
  /* `1135–1140`, o el TAG solo cuando el rango es de uno. */
  rango: string;
  referencia: string | null;
  cantidad: number;
  /* TAG del rango ya usados por el conteo; null si el rango aún no está en el servidor. */
  usados: number | null;
  pendiente: boolean;
  desbalance: boolean;
}

export function textoRango(desde: number, hasta: number): string {
  return desde === hasta ? String(desde) : `${desde}–${hasta}`;
}

export function filasDeRangos(vista: VistaZonificacion, estado: EstadoAgenda | null): FilaRango[] {
  return vista.rangos.map((r) => {
    // Un rango editado y aún no enviado muestra su contenido nuevo, pero el avance del conteo es el del servidor.
    const delServidor = r.idServidor === null ? undefined : estado?.rangos.find((s) => s.id === r.idServidor);
    return {
      id: r.id,
      zona: r.nombreZona,
      rango: textoRango(r.tagDesde, r.tagHasta),
      referencia: r.referenciaUbicacion && r.referenciaUbicacion.trim() !== '' ? r.referenciaUbicacion : null,
      cantidad: r.cantidad,
      usados: delServidor ? delServidor.qtyUsado : null,
      pendiente: r.pendiente,
      desbalance: delServidor ? delServidor.desbalance : false,
    };
  });
}

export interface TotalesResumen {
  /* TAG zonificados netos: la suma de los rangos menos los TAG anulados dentro. */
  tagsZonificados: number;
  tagsAnulados: number;
}

export function totalesDeResumen(vista: VistaZonificacion): TotalesResumen {
  return {
    tagsZonificados: vista.rangos.reduce((suma, r) => suma + r.cantidad, 0),
    tagsAnulados: vista.tagsAnulados.length,
  };
}
