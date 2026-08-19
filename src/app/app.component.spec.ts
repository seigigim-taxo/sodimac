import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AppComponent } from './app.component';
<<<<<<< HEAD
import { AuthRepository } from './domain/auth/repositories/auth.repository';
=======
import { AuthFacade } from './state/auth/auth.facade';
import { ThemeFacade } from './state/theme/theme.facade';
import { DATABASE_REPOSITORY_TOKEN } from './domain/database/repositories/database.repository';
>>>>>>> feat/modo-analista-maqueta

describe('AppComponent', () => {
  it('should create the app', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
<<<<<<< HEAD
        { provide: AuthRepository, useValue: { login: () => {} } },
=======
        { provide: AuthFacade, useValue: { session: signal(null), logout: jasmine.createSpy('logout') } },
        { provide: ThemeFacade, useValue: { isDark: signal(false), toggle: jasmine.createSpy('toggle') } },
        { provide: DATABASE_REPOSITORY_TOKEN, useValue: { initialize: jasmine.createSpy('initialize'), resetLocalDatabase: jasmine.createSpy('resetLocalDatabase') } },
        { provide: 'AlertController', useValue: { create: jasmine.createSpy('create').and.returnValue(Promise.resolve({ present: jasmine.createSpy('present') })) } },
>>>>>>> feat/modo-analista-maqueta
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
