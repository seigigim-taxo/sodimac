import { CountedItem } from './counted-item.model';

export type CountingStatus = 'in-progress' | 'finalized';

export interface CountingSession {
  id: string;
  tag: string;
  zone: string;
  status: CountingStatus;
  synced: boolean;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
  items: CountedItem[];
  totalItems: number;
  totalQuantity: number;
}
