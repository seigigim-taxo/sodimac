import { Component, inject, OnInit } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
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
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { AuthFacade } from '../../state/auth/auth.facade';
import { StoreFacade } from '../../state/store/store.facade';
import { ThemeFacade } from '../../state/theme/theme.facade';
import { Store } from '../../domain/store/models/store.model';

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
  private router = inject(Router);
  private theme = inject(ThemeFacade);
  private auth = inject(AuthFacade);
  private storeFacade = inject(StoreFacade);
  private location = inject(Location);

  isDark = this.theme.isDark;

  stores = this.storeFacade.stores;
  selectedStore = this.storeFacade.selectedStore;
  currentStore = this.storeFacade.currentStore;
  loading = this.storeFacade.loading;
  error = this.storeFacade.error;
  hasMultipleStores = this.storeFacade.hasMultipleStores;
  noStores = this.storeFacade.noStores;

  ngOnInit(): void {
    const session = this.auth.session();
    if (session) {
      this.storeFacade.loadStores(session.userId);
    }
  }

  goBack(): void {
    this.location.back();
  }

  selectStore(store: Store): void {
    this.storeFacade.selectStore(store);
  }

  continue(): void {
    if (!this.currentStore()) {
      return;
    }
    this.router.navigate(['/events']);
  }

  async toggleTheme(): Promise<void> {
    await this.theme.toggle();
  }
}
