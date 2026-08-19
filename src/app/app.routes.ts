import { Routes } from '@angular/router';
import { authGuard } from './state/auth/guards/auth.guard';
import { operatorGuard } from './state/auth/guards/operator.guard';
import { analystGuard } from './state/auth/guards/analyst.guard';
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
    path: 'analyst-dashboard',
    loadComponent: () => import('./features/analyst/dashboard/analyst-dashboard.page').then((m) => m.AnalystDashboardPage),
    canActivate: [authGuard, analystGuard],
  },
  {
    path: 'home',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
    canActivate: [authGuard, operatorGuard, noSesionActivaGuard],
  },
  {
    path: 'tags-resumen',
    loadComponent: () => import('./features/counting/tags-resumen.page/tags-resumen.page.component').then((m) => m.TagsResumenPageComponent),
    canActivate: [authGuard, operatorGuard],
  },
  {
    path: 'counting-tag',
    loadComponent: () => import('./features/counting/tag-zona.page/tag-zona.page.component').then((m) => m.TagZonaPageComponent),
    canActivate: [authGuard, operatorGuard, eventoSeleccionadoGuard, pdaBloqueadaGuard],
  },
  {
    path: 'counting',
    loadComponent: () => import('./features/counting/counting.page/counting.page.component').then((m) => m.CountingPageComponent),
    canActivate: [authGuard, operatorGuard, eventoSeleccionadoGuard, tagEnSesionGuard, pdaBloqueadaGuard],
  },
  {
    path: 'counting/:sessionId',
    loadComponent: () => import('./features/counting/counting.page/counting.page.component').then((m) => m.CountingPageComponent),
    canActivate: [authGuard],
  },
  {
    path: 'counting-list',
    loadComponent: () => import('./features/counting/counting-list.page/counting-list.page.component').then((m) => m.CountingListPageComponent),
    canActivate: [authGuard],
  },
  {
    path: 'counting-detail/:id',
    loadComponent: () => import('./features/counting/counting-detail.page/counting-detail.page.component').then((m) => m.CountingDetailPageComponent),
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
