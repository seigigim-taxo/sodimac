import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { IonInput } from '@ionic/angular/standalone';
import { Keyboard } from '@capacitor/keyboard';

import { ScanComponent } from './scan.component';

describe('ScanComponent', () => {
  let component: ScanComponent;
  let fixture: ComponentFixture<ScanComponent>;

  beforeEach(async () => {
    // Mock Keyboard plugin for web environment
    spyOn(Keyboard, 'hide').and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [ScanComponent, ReactiveFormsModule, IonInput]
    }).compileComponents();

    fixture = TestBed.createComponent(ScanComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
