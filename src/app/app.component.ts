import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonApp,
  IonRouterOutlet,
  IonMenu,
  IonMenuToggle,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonButton,
  IonButtons,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline, homeOutline, trashOutline } from 'ionicons/icons';
import { AuthFacade } from './state/auth/auth.facade';
import { ThemeFacade } from './state/theme/theme.facade';
import { DATABASE_REPOSITORY_TOKEN } from './domain/database/repositories/database.repository';
import { formatRutDisplay } from './shared/utils/rut.utils';
import { BuscadorSkuComponent } from './shared/components/buscador-sku/buscador-sku.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [
    BuscadorSkuComponent,
    IonApp,
    IonRouterOutlet,
    IonMenu,
    IonMenuToggle,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonButton,
    IonButtons,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
  ],
})
export class AppComponent {
  private auth     = inject(AuthFacade);
  private theme    = inject(ThemeFacade);
  private router   = inject(Router);
  private location = inject(Location);
  private alertController = inject(AlertController);
  private database = inject(DATABASE_REPOSITORY_TOKEN);

  session          = this.auth.session;
  isDark           = this.theme.isDark;
  formatRutDisplay = formatRutDisplay;

  constructor() {
    addIcons({ arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline, homeOutline, trashOutline });
  }

  goBack(): void {
    this.location.back();
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

  goConteos(): void {
    this.router.navigate(['/tags-resumen']);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }

  async toggleTheme(): Promise<void> {
    await this.theme.toggle();
  }

  async confirmResetLocalDatabase(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Reiniciar base local',
      message: 'Esto borrará toda la base de datos local de esta PDA: usuario, tienda, evento, muestra, productos, zonas y conteos. Luego volverás al login. ¿Confirmas?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Reiniciar',
          role: 'destructive',
          handler: () => { void this.resetLocalDatabase(); },
        },
      ],
    });
    await alert.present();
  }

  private async resetLocalDatabase(): Promise<void> {
    await this.database.resetLocalDatabase();
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
