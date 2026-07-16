import { Injectable } from '@angular/core';
import { SampleSku } from '../../domain/event/models/sample-sku.model';
import { SampleSkuRepository } from '../../domain/event/repositories/sample-sku.repository';

@Injectable({ providedIn: 'root' })
export class MockSampleSkuRepository extends SampleSkuRepository {
  private readonly skus: SampleSku[] = [
    { code: 'AF000037001' },
    { code: 'AF000037002' },
    { code: 'AF000037003' },
    { code: 'AF000037004' },
    { code: 'AF000037005' },
    { code: 'AF000037006' },
    { code: 'AF000037007' },
    { code: 'AF000037008' },
    { code: 'AF000037009' },
    { code: 'AF000037010' },
    { code: 'AF000037011' },
    { code: 'AF000037012' },
  ];

  getSampleSkus(): SampleSku[] {
    return this.skus;
  }
}
