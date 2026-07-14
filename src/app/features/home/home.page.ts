import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { ThemeFacade } from '../../state/theme/theme.facade';

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
    IonTitle,
    IonToolbar,
  ],
})
export class HomePage {
  private router = inject(Router);
  private location = inject(Location);
  private theme = inject(ThemeFacade);

  isDark = this.theme.isDark;

  store = {
    name: 'Sodimac Homecenter',
    code: 'S-123',
    address: 'Av. Siempre Viva 742',
    city: 'Santiago',
  };

  constructor() {
    addIcons({ arrowBackOutline });
  }

  goBack(): void {
    this.location.back();
  }

  continue(): void {
    this.router.navigate(['/events']);
  }

  async toggleTheme(): Promise<void> {
    await this.theme.toggle();
  }
}
