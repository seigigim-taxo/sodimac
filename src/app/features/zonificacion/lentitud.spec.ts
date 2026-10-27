import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UMBRAL_LENTO_MS, senalLentitud } from './lentitud';

describe('senalLentitud', () => {
  let cargando: ReturnType<typeof signal<boolean>>;
  let lento: () => boolean;

  beforeEach(() => {
    jasmine.clock().install();
    cargando = signal(false);
    lento = runInInjectionContext(TestBed.inject(Injector), () => senalLentitud(cargando));
    TestBed.tick();
  });

  afterEach(() => jasmine.clock().uninstall());

  const avanzar = (ms: number) => {
    jasmine.clock().tick(ms);
    TestBed.tick();
  };

  it('sin nada cargando no avisa', () => {
    avanzar(UMBRAL_LENTO_MS * 3);
    expect(lento()).toBeFalse();
  });

  it('una carga corta no avisa', () => {
    cargando.set(true);
    TestBed.tick();
    avanzar(UMBRAL_LENTO_MS - 1);
    expect(lento()).toBeFalse();
  });

  it('pasado el umbral, avisa', () => {
    cargando.set(true);
    TestBed.tick();
    avanzar(UMBRAL_LENTO_MS);
    expect(lento()).toBeTrue();
  });

  it('al terminar de cargar, el aviso se apaga solo', () => {
    cargando.set(true);
    TestBed.tick();
    avanzar(UMBRAL_LENTO_MS);

    cargando.set(false);
    TestBed.tick();

    expect(lento()).toBeFalse();
  });

  it('una carga que termina a tiempo cancela el aviso: no se enciende después', () => {
    cargando.set(true);
    TestBed.tick();
    avanzar(UMBRAL_LENTO_MS - 100);
    cargando.set(false);
    TestBed.tick();

    avanzar(1000);

    expect(lento()).toBeFalse();
  });

  it('cada carga nueva vuelve a contar desde cero', () => {
    cargando.set(true);
    TestBed.tick();
    avanzar(UMBRAL_LENTO_MS);
    cargando.set(false);
    TestBed.tick();

    cargando.set(true);
    TestBed.tick();
    avanzar(UMBRAL_LENTO_MS - 1);

    expect(lento()).toBeFalse();
  });
});
