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
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { EventsPageComponent } from './events.page.component';
import { EventFacade } from '../../state/event/event.facade';
import { StoreFacade } from '../../state/store/store.facade';

describe('EventsPageComponent', () => {
  let component: EventsPageComponent;
  let fixture: ComponentFixture<EventsPageComponent>;

  beforeEach(waitForAsync(() => {
    const storeSpy = jasmine.createSpyObj(
      'StoreFacade',
      [],
      {
        currentStore: signal({ id: 1, code: '4011', name: 'Sodimac La Florida', type: 'HIPER', zone: 'STGO', address: 'Av. La Florida', city: 'La Florida', region: 'RM' }),
      }
    );

    const eventSpy = jasmine.createSpyObj(
      'EventFacade',
      ['loadEvents', 'selectEvent'],
      {
        events: signal([]),
        selectedEvent: signal(null),
        currentEvent: signal(null),
        loading: signal(false),
        error: signal(null),
        hasEvents: signal(false),
        noEvents: signal(false),
      }
    );

    TestBed.configureTestingModule({
      imports: [
        EventsPageComponent,
        IonicModule.forRoot(),
        IonButton,
        IonButtons,
        IonContent,
        IonHeader,
        IonIcon,
        IonMenuButton,
        IonSpinner,
        IonTitle,
        IonToolbar,
      ],
      providers: [
        provideRouter([]),
        { provide: StoreFacade, useValue: storeSpy },
        { provide: EventFacade, useValue: eventSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventsPageComponent);
    component = fixture.componentInstance;
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load events when store exists on view will enter', () => {
    component.ionViewWillEnter();
    const eventFacade = TestBed.inject(EventFacade) as jasmine.SpyObj<EventFacade>;
    expect(eventFacade.loadEvents).toHaveBeenCalledWith(1);
  });
});
