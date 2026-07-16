import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { ScanComponent } from 'src/app/shared/components/scan/scan.component';

import { ZoneSelectPageComponent } from './zone-select.page.component';
import { AuthFacade } from '../../state/auth/auth.facade';
import { EventFacade } from '../../state/event/event.facade';
import { StoreFacade } from '../../state/store/store.facade';
import { ZoneFacade } from '../../state/zone/zone.facade';

describe('ZoneSelectPageComponent', () => {
  let component: ZoneSelectPageComponent;
  let fixture: ComponentFixture<ZoneSelectPageComponent>;

  beforeEach(waitForAsync(() => {
    const authSpy = jasmine.createSpyObj(
      'AuthFacade',
      [],
      {
        session: signal({ token: 'abc', userId: 1, name: 'Usuario', rut: '12345678-5' }),
      }
    );

    const eventSpy = jasmine.createSpyObj(
      'EventFacade',
      [],
      {
        currentEvent: signal({ id: 1, folio: 'DEMO-001', scheduledDate: '2026-07-16', executionDate: null, category: 'GENERAL', status: 'ABIERTO', storeCode: '4011', storeName: 'Sodimac La Florida', coordinatorName: 'Ana Rojas', analystName: 'Luis Soto' }),
      }
    );

    const storeSpy = jasmine.createSpyObj(
      'StoreFacade',
      [],
      {
        currentStore: signal({ id: 1, code: '4011', name: 'Sodimac La Florida', type: 'HIPER', zone: 'STGO', address: 'Av. La Florida', city: 'La Florida', region: 'RM' }),
      }
    );

    const zoneSpy = jasmine.createSpyObj(
      'ZoneFacade',
      ['loadZones', 'selectZone', 'confirmTag'],
      {
        zones: signal([]),
        selectedZone: signal(null),
        tagConfirmed: signal(false),
        tagValue: signal(''),
        loading: signal(false),
        error: signal(null),
        hasZones: signal(false),
        noZones: signal(false),
        canContinue: signal(false),
      }
    );

    TestBed.configureTestingModule({
      imports: [
        ZoneSelectPageComponent,
        ScanComponent,
        IonicModule.forRoot(),
        IonButton,
        IonButtons,
        IonContent,
        IonHeader,
        IonIcon,
        IonMenuButton,
        IonSelect,
        IonSelectOption,
        IonSpinner,
        IonTitle,
        IonToolbar,
      ],
      providers: [
        provideRouter([]),
        { provide: AuthFacade, useValue: authSpy },
        { provide: EventFacade, useValue: eventSpy },
        { provide: StoreFacade, useValue: storeSpy },
        { provide: ZoneFacade, useValue: zoneSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ZoneSelectPageComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load zones on view will enter', () => {
    component.ionViewWillEnter();
    const zoneFacade = TestBed.inject(ZoneFacade) as jasmine.SpyObj<ZoneFacade>;
    expect(zoneFacade.loadZones).toHaveBeenCalledWith(1, 1);
  });
});
