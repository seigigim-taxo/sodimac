import { Injectable, inject } from '@angular/core';
import { PDA_REPOSITORY_TOKEN } from '../../domain/pda/repositories/pda.repository';
import { Pda } from '../../domain/pda/models/pda.model';

@Injectable({ providedIn: 'root' })
export class RegisterPdaUseCase {
  private pdaRepo = inject(PDA_REPOSITORY_TOKEN);

  async execute(): Promise<Pda> {
    return this.pdaRepo.register();
  }
}
