import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonButton, IonIcon, IonInput, IonSpinner } from '@ionic/angular/standalone';
import { Keyboard } from '@capacitor/keyboard';

import { CountingPageComponent } from './counting.page.component';
import { CountingFacade } from '../../../state/counting/counting.facade';
import { CountingRepository } from '../../../domain/counting/repositories/counting.repository';
import { SampleSkuRepository } from '../../../domain/event/repositories/sample-sku.repository';

const mockCountingRepository = {
  createSession: jasmine.createSpy('createSession').and.returnValue(Promise.resolve()),
  getSessions: jasmine.createSpy('getSessions').and.returnValue(Promise.resolve([])),
  getSession: jasmine.createSpy('getSession').and.returnValue(Promise.resolve(null)),
  updateSession: jasmine.createSpy('updateSession').and.returnValue(Promise.resolve()),
  deleteSession: jasmine.createSpy('deleteSession').and.returnValue(Promise.resolve()),
  markSynced: jasmine.createSpy('markSynced').and.returnValue(Promise.resolve()),
};

const mockCountingFacade = {
  sessions: { asReadonly: () => jasmine.createSpy('sessions').and.returnValue([]) },
  isLoading: { asReadonly: () => jasmine.createSpy('isLoading').and.returnValue(false) },
  reload: jasmine.createSpy('reload').and.returnValue(Promise.resolve()),
  getById: jasmine.createSpy('getById').and.returnValue(Promise.resolve(null)),
  save: jasmine.createSpy('save').and.returnValue(Promise.resolve()),
  finalize: jasmine.createSpy('finalize').and.returnValue(Promise.resolve()),
  init: jasmine.createSpy('init').and.returnValue(Promise.resolve()),
};

describe('CountingPageComponent', () => {
  let component: CountingPageComponent;
  let fixture: ComponentFixture<CountingPageComponent>;

  beforeEach(async () => {
    spyOn(Keyboard, 'hide').and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [
        CountingPageComponent,
        RouterTestingModule,
        IonContent,
        IonHeader,
        IonToolbar,
        IonTitle,
        IonButtons,
        IonMenuButton,
        IonButton,
        IonIcon,
        IonInput,
        IonSpinner,
      ],
      providers: [
        { provide: CountingRepository, useValue: mockCountingRepository },
        { provide: CountingFacade, useValue: mockCountingFacade },
        { provide: SampleSkuRepository, useValue: { getSampleSkus: () => [] } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CountingPageComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
