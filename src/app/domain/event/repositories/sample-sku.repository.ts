import { SampleSku } from '../models/sample-sku.model';

export abstract class SampleSkuRepository {
  abstract getSampleSkus(): SampleSku[];
}
