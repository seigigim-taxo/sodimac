import { InjectionToken } from '@angular/core';
import { Pda } from '../models/pda.model';

export interface PdaRepository {
  register(): Promise<Pda>;
}

export const PDA_REPOSITORY_TOKEN = new InjectionToken<PdaRepository>('PdaRepository');
