import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonButtons,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline } from 'ionicons/icons';
import { AuthFacade } from '../../state/auth/auth.facade';
import { SucursalFacade, Sucursal } from '../../state/store/store.facade';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  standalone: true,
  imports: [
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
})
export class HomePage implements OnInit {
  private router         = inject(Router);
  private auth           = inject(AuthFacade);
  private sucursalFacade = inject(SucursalFacade);

  stores             = this.sucursalFacade.stores;
  selectedStore      = this.sucursalFacade.selectedStore;
  currentStore       = this.sucursalFacade.currentStore;
  hasMultipleStores  = this.sucursalFacade.hasMultipleStores;
  noStores           = this.sucursalFacade.noStores;
  loading            = this.sucursalFacade.loading;
  error              = this.sucursalFacade.error;

  constructor() {
    addIcons({ alertCircleOutline });
  }

  ngOnInit(): void {
    const session = this.auth.session();
    if (session) {
      void this.sucursalFacade.loadSucursales(session.operadorId);
    }
  }

  selectSucursal(sucursal: Sucursal): void {
    this.sucursalFacade.selectSucursal(sucursal);
  }

  continue(): void {
    if (!this.currentStore()) return;
    this.router.navigate(['/events']);
  }
}
