import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AppComponent } from './app.component';
import { AuthFacade } from './state/auth/auth.facade';
import { ThemeFacade } from './state/theme/theme.facade';
import { DATABASE_REPOSITORY_TOKEN } from './domain/database/repositories/database.repository';
import { PdaFacade } from './state/pda/pda.facade';
import { EventoFacade } from './state/evento/evento.facade';
import { ZonaFacade } from './state/zona/zona.facade';
import { ConteoFacade } from './state/conteo/conteo.facade';

// El reinicio de la base es privado (lo dispara el handler del alert); el test
// lo llama directo, que es lo que se quiere verificar.
interface AppComponentInterno {
  resetLocalDatabase(): Promise<void>;
}

describe('AppComponent', () => {
  let database: { initialize: jasmine.Spy; resetLocalDatabase: jasmine.Spy };
  let pda:      { init: jasmine.Spy; pdaId: () => number };
  let evento:   { reset: jasmine.Spy; selectedEvent: ReturnType<typeof signal> };
  let zona:     { reset: jasmine.Spy };
  let conteo:   { reset: jasmine.Spy };
  let auth:     { session: ReturnType<typeof signal>; logout: jasmine.Spy };

  beforeEach(async () => {
    database = { initialize: jasmine.createSpy('initialize'), resetLocalDatabase: jasmine.createSpy('resetLocalDatabase').and.resolveTo(undefined) };
    pda      = { init: jasmine.createSpy('init').and.resolveTo(undefined), pdaId: () => 1 };
    evento   = { reset: jasmine.createSpy('reset'), selectedEvent: signal(null) };
    zona     = { reset: jasmine.createSpy('reset') };
    conteo   = { reset: jasmine.createSpy('reset') };
    auth     = { session: signal(null), logout: jasmine.createSpy('logout').and.resolveTo(undefined) };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: AuthFacade, useValue: auth },
        { provide: ThemeFacade, useValue: { isDark: signal(false), toggle: jasmine.createSpy('toggle') } },
        { provide: DATABASE_REPOSITORY_TOKEN, useValue: database },
        { provide: PdaFacade,    useValue: pda },
        { provide: EventoFacade, useValue: evento },
        { provide: ZonaFacade,   useValue: zona },
        { provide: ConteoFacade, useValue: conteo },
        { provide: 'AlertController', useValue: { create: jasmine.createSpy('create').and.returnValue(Promise.resolve({ present: jasmine.createSpy('present') })) } },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('reiniciar la base local', () => {
    /*
     * La PDA se registra una sola vez en el APP_INITIALIZER: sin volver a
     * registrarla acá, sod_pda queda vacía y el pda_id que sigue en memoria hace
     * fallar el primer INSERT de un conteo con FOREIGN KEY (787).
     */
    it('vuelve a registrar la PDA después de recrear el esquema', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      await (fixture.componentInstance as unknown as AppComponentInterno).resetLocalDatabase();

      expect(pda.init).toHaveBeenCalled();
      expect(database.resetLocalDatabase).toHaveBeenCalledBefore(pda.init);
    });

    it('suelta evento, zona y conteo, que apuntan a filas ya borradas', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      await (fixture.componentInstance as unknown as AppComponentInterno).resetLocalDatabase();

      expect(evento.reset).toHaveBeenCalled();
      expect(zona.reset).toHaveBeenCalled();
      expect(conteo.reset).toHaveBeenCalled();
      expect(auth.logout).toHaveBeenCalled();
    });

    // Si el re-registro falla, el operador no puede quedar atrapado en el menú
    // con la base ya borrada: tiene que llegar al login igual.
    it('llega al logout aunque el re-registro de la PDA falle', async () => {
      pda.init.and.rejectWith(new Error('sin conexión a SQLite'));
      const fixture = TestBed.createComponent(AppComponent);

      await (fixture.componentInstance as unknown as AppComponentInterno).resetLocalDatabase();

      expect(auth.logout).toHaveBeenCalled();
    });
  });
});
