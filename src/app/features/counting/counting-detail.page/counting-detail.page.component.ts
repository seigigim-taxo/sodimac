import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonMenuButton, IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar, ViewWillEnter } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, cloudUploadOutline, createOutline, trashOutline } from 'ionicons/icons';
import { CountingFacade } from '../../../state/counting/counting.facade';
import { CountingSession } from '../../../domain/counting/models/counting-session.model';
import { ZONES, Zone } from '../../../shared/data/zones';
import { ScanComponent } from '../../../shared/components/scan/scan.component';
import { getStatusBadgeClass, getStatusLabel, formatDate } from '../../../shared/utils/counting-status.utils';

@Component({
  selector: 'app-counting-detail.page',
  templateUrl: './counting-detail.page.component.html',
  imports: [
    ScanComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class CountingDetailPageComponent implements ViewWillEnter {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private countingFacade = inject(CountingFacade);

  session = signal<CountingSession | null>(null);
  isLoading = signal(true);
  isSyncing = signal(false);
  isDeleting = signal(false);

  zones: Zone[] = ZONES;

  isEditing = signal(false);
  editTag = signal('');
  editZone = signal<Zone | null>(null);

  getStatusBadgeClass = getStatusBadgeClass;
  getStatusLabel = getStatusLabel;
  formatDate = formatDate;

  constructor() {
    addIcons({ arrowBackOutline, cloudUploadOutline, createOutline, trashOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (id) {
      try {
        const session = await this.countingFacade.getById(id);
        this.session.set(session);
      } catch (err) {
        console.error('[CountingDetailPage] Failed to load session:', err);
        this.session.set(null);
      }
    }
    this.isLoading.set(false);
  }

  goBack(): void {
    this.router.navigate(['/counting-list']);
  }

  async continueCounting(): Promise<void> {
    const s = this.session();
    if (!s) return;
    this.router.navigate(['/counting', s.id]);
  }

  async syncSession(): Promise<void> {
    const s = this.session();
    if (!s) return;

    const alert = await this.alertCtrl.create({
      header: 'Sincronizar',
      message: '¿Enviar este conteo al servidor?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Sincronizar',
          handler: async () => {
            try {
              this.isSyncing.set(true);
              await this.countingFacade.sync(s.id);
              const updated = await this.countingFacade.getById(s.id);
              this.session.set(updated);
            } catch (err) {
              console.error('[CountingDetailPage] sync failed:', err);
            } finally {
              this.isSyncing.set(false);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async deleteSession(): Promise<void> {
    const s = this.session();
    if (!s) return;

    const alert = await this.alertCtrl.create({
      header: 'Eliminar',
      message: '¿Eliminar este conteo? Esta acción no se puede deshacer.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            try {
              this.isDeleting.set(true);
              await this.countingFacade.remove(s.id);
            } catch (err) {
              console.error('[CountingDetailPage] delete failed:', err);
            } finally {
              this.isDeleting.set(false);
              this.router.navigate(['/counting-list']);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async reopenSession(): Promise<void> {
    const s = this.session();
    if (!s) return;

    const alert = await this.alertCtrl.create({
      header: 'Reabrir',
      message: '¿Reabrir este conteo para continuar contando?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Reabrir',
          handler: async () => {
            try {
              await this.countingFacade.reopen(s.id);
              const updated = await this.countingFacade.getById(s.id);
              this.session.set(updated);
              this.router.navigate(['/counting', s.id]);
            } catch (err) {
              console.error('[CountingDetailPage] reopen failed:', err);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  startEditing(): void {
    const s = this.session();
    if (!s) return;
    this.editTag.set(s.tag);
    const zone = this.zones.find((z) => z.name === s.zone) ?? null;
    this.editZone.set(zone);
    this.isEditing.set(true);
  }

  cancelEditing(): void {
    this.isEditing.set(false);
  }

  onTagScan(value: string): void {
    this.editTag.set(value);
  }

  onZoneChange(event: Event): void {
    const select = event.target as HTMLIonSelectElement;
    const value = Number(select.value);
    if (isNaN(value)) return;
    const zone = this.zones.find((z) => z.id === value);
    if (zone) this.editZone.set(zone);
  }

  async saveEdit(): Promise<void> {
    const s = this.session();
    if (!s) return;

    const newTag = this.editTag();
    const newZone = this.editZone();
    if (!newTag || !newZone) return;

    const alert = await this.alertCtrl.create({
      header: 'Guardar cambios',
      message: `Tag: ${s.tag} → ${newTag}\nZona: ${s.zone} → ${newZone.name}`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: async () => {
            try {
              await this.countingFacade.updateSessionMetadata(s.id, newTag, newZone.name);
              const updated = await this.countingFacade.getById(s.id);
              this.session.set(updated);
              this.isEditing.set(false);
            } catch (err) {
              console.error('[CountingDetailPage] saveEdit failed:', err);
            }
          },
        },
      ],
    });
    await alert.present();
  }
}
