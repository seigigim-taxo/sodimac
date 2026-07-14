import { Routes } from '@angular/router';
import { authGuard } from './core/auth/guards/auth.guard';

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
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];
