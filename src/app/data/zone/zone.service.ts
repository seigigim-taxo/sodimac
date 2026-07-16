import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../core/http/api.service';
import { Zone } from '../../domain/zone/models/zone.model';

interface ZoneApiRecord {
  id: number;
  zona_id: number;
  codigo: string;
  zona_nombre: string;
  tipo: string;
  tipo_descripcion: string;
}

@Injectable({ providedIn: 'root' })
export class ZoneService {
  private api = inject(ApiService);

  getZonesByEventAndOperator(eventId: number, operatorId: number): Observable<Zone[]> {
    return this.api
      .get<ZoneApiRecord[]>('asignaciones-zona/index.php', { evento_id: eventId, operador_id: operatorId })
      .pipe(
        map((records) =>
          records.map((record) => ({
            id: record.id,
            zoneId: record.zona_id,
            code: record.codigo,
            name: record.zona_nombre,
            type: record.tipo,
            typeDescription: record.tipo_descripcion,
          }))
        )
      );
  }
}
