import { Injectable, inject } from '@angular/core';
import { RESPALDO_REPOSITORY_TOKEN } from '../../domain/respaldo/repositories/respaldo.repository';
import { RespaldoCreado } from '../../domain/respaldo/models/respaldo-creado.model';

@Injectable({ providedIn: 'root' })
export class RespaldarBaseUseCase {
  private respaldoRepo = inject(RESPALDO_REPOSITORY_TOKEN);

  execute(): Promise<RespaldoCreado> {
    return this.respaldoRepo.respaldarBaseLocal();
  }
}
