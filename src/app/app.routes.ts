import { Routes } from '@angular/router';
import { authGuard } from './state/auth/guards/auth.guard';
import { noSesionActivaGuard } from './state/conteo/guards/no-sesion-activa.guard';
import { eventoSeleccionadoGuard } from './state/evento/guards/evento-seleccionado.guard';
import { tagEnSesionGuard } from './state/conteo/guards/tag-en-sesion.guard';
import { pdaBloqueadaGuard } from './state/conteo/guards/pda-bloqueada.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'sync-loading',
    loadComponent: () => import('./features/sync-loading/sync-loading.page').then((m) => m.SyncLoadingPageComponent),
    canActivate: [authGuard],
  },
  {
    path: 'home',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
    canActivate: [authGuard, noSesionActivaGuard],
  },
  {
    path: 'counting-tag',
    loadComponent: () => import('./features/counting/tag-zona.page/tag-zona.page.component').then((m) => m.TagZonaPageComponent),
    canActivate: [authGuard, eventoSeleccionadoGuard, pdaBloqueadaGuard],
  },
  {
    path: 'counting',
    loadComponent: () => import('./features/counting/counting.page/counting.page.component').then((m) => m.CountingPageComponent),
    canActivate: [authGuard, eventoSeleccionadoGuard, tagEnSesionGuard, pdaBloqueadaGuard],
  },
  {
    // Sin eventoSeleccionadoGuard a propósito: "Cerrar tienda" debe poder
    // llegar aquí incluso si el operador nunca llegó a seleccionar un
    // evento (ej. no hay eventos disponibles hoy).
    // Sin pdaBloqueadaGuard: tags-resumen es de solo lectura cuando evento = EN_ANALISIS.
    path: 'tags-resumen',
    loadComponent: () => import('./features/counting/tags-resumen.page/tags-resumen.page.component').then((m) => m.TagsResumenPageComponent),
    canActivate: [authGuard],
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
