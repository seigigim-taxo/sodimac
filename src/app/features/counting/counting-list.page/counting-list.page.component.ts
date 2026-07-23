import { Component } from '@angular/core';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonBackButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-counting-list',
  templateUrl: './counting-list.page.component.html',
  standalone: true,
  imports: [IonButtons, IonContent, IonHeader, IonBackButton, IonTitle, IonToolbar],
})
export class CountingListPageComponent {}
