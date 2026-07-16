import { SampleSku } from '../../event/models/sample-sku.model';

export interface CountedItem {
  sku: SampleSku;
  quantity: number;
}
