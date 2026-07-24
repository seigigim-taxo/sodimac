import { Injectable, inject, signal } from '@angular/core';
import { RegisterPdaUseCase } from '../../application/pda/register-pda.use-case';
import { Pda } from '../../domain/pda/models/pda.model';
export type { Pda };

@Injectable({ providedIn: 'root' })
export class PdaFacade {
  private registerPda = inject(RegisterPdaUseCase);

  private pdaSignal = signal<Pda | null>(null);

  readonly pda   = this.pdaSignal.asReadonly();
  readonly pdaId = () => this.pdaSignal()?.id ?? null;

  async init(): Promise<void> {
    const pda = await this.registerPda.execute();
    this.pdaSignal.set(pda);
  }
}
