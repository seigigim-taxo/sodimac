import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../core/http/api.service';
import { Store } from '../../domain/store/models/store.model';

interface StoreApiRecord {
  id: number;
  codigo_sodimac: string;
  nombre: string;
  tipo: string;
  zona_operativa: string;
  direccion: string;
  comuna: string;
  region: string;
}

@Injectable({ providedIn: 'root' })
export class StoreService {
  private api = inject(ApiService);

  getStoresByUser(userId: number): Observable<Store[]> {
    return this.api.get<StoreApiRecord[]>('sucursales/index.php', { user_id: userId }).pipe(
      map((records) =>
        records.map((record) => ({
          id: record.id,
          code: record.codigo_sodimac,
          name: record.nombre,
          type: record.tipo,
          zone: record.zona_operativa,
          address: record.direccion,
          city: record.comuna,
          region: record.region,
        }))
      )
    );
  }
}
