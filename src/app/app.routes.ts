import { Routes } from '@angular/router';
import { authGuard } from './state/auth/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
    canActivate: [authGuard],
  },
  {
    path: 'events',
    loadComponent: () => import('./features/events/events.page.component').then((m) => m.EventsPageComponent),
    canActivate: [authGuard],
  },
  {
    path: 'zone-select',
    loadComponent: () => import('./features/zone-select/zone-select.page.component').then((m) => m.ZoneSelectPageComponent),
    canActivate: [authGuard],
  },
  {
    path: 'counting',
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
