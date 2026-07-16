import { CountedItem } from '../models/counted-item.model';

export function calculateCountingTotals(items: CountedItem[]): {
  totalItems: number;
  totalQuantity: number;
} {
  return {
    totalItems: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}
