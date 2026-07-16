import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { CountingPageComponent } from './counting.page.component';

import { ZoneFacade } from 'src/app/state/zone/zone.facade';

class MockZoneFacade {
  selectedZone = () => null;
  tagValue = () => null;
}

describe('CountingPageComponent', () => {
  let component: CountingPageComponent;
  let fixture: ComponentFixture<CountingPageComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [CountingPageComponent, IonicModule.forRoot()],
      providers: [{ provide: ZoneFacade, useClass: MockZoneFacade }],
    }).compileComponents();

    fixture = TestBed.createComponent(CountingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
