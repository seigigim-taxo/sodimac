import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
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
import { HomePage } from './home.page';
import { AuthFacade } from '../../state/auth/auth.facade';
import { StoreFacade } from '../../state/store/store.facade';
import { ThemeFacade } from '../../state/theme/theme.facade';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    const authSpy = jasmine.createSpyObj(
      'AuthFacade',
      ['logout'],
      {
        session: signal({ token: 'abc', userId: 1, name: 'Usuario', rut: '12345678-5' }),
      }
    );

    const storeSpy = jasmine.createSpyObj(
      'StoreFacade',
      ['loadStores', 'selectStore'],
      {
        stores: signal([]),
        selectedStore: signal(null),
        currentStore: signal(null),
        loading: signal(false),
        error: signal(null),
        hasMultipleStores: signal(false),
        noStores: signal(false),
      }
    );

    const themeSpy = jasmine.createSpyObj(
      'ThemeFacade',
      ['toggle'],
      { isDark: signal(false) }
    );

    await TestBed.configureTestingModule({
      imports: [
        HomePage,
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
        { provide: AuthFacade, useValue: authSpy },
        { provide: StoreFacade, useValue: storeSpy },
        { provide: ThemeFacade, useValue: themeSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load stores on init', () => {
    const storeFacade = TestBed.inject(StoreFacade) as jasmine.SpyObj<StoreFacade>;
    expect(storeFacade.loadStores).toHaveBeenCalledWith(1);
  });
});
