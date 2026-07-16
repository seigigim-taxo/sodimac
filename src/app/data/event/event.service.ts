import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../core/http/api.service';
import { InventoryEvent } from '../../domain/event/models/event.model';

interface EventApiRecord {
  id: number;
  folio: string;
  fecha_programada: string;
  fecha_ejecucion: string | null;
  categoria: string;
  estado: string;
  codigo_sodimac: string;
  sucursal: string;
  coord_nombres: string;
  coord_apellidos: string;
  analista_nombres: string;
  analista_apellidos: string;
}

@Injectable({ providedIn: 'root' })
export class EventService {
  private api = inject(ApiService);

  getEventsByStore(storeId: number): Observable<InventoryEvent[]> {
    return this.api.get<EventApiRecord[]>('eventos/index.php', { sucursal_id: storeId }).pipe(
      map((records) =>
        records.map((record) => ({
          id: record.id,
          folio: record.folio,
          scheduledDate: record.fecha_programada,
          executionDate: record.fecha_ejecucion,
          category: record.categoria,
          status: record.estado,
          storeCode: record.codigo_sodimac,
          storeName: record.sucursal,
          coordinatorName: `${record.coord_nombres} ${record.coord_apellidos}`,
          analystName: `${record.analista_nombres} ${record.analista_apellidos}`,
        }))
      )
    );
  }
}
