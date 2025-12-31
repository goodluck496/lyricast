import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthOverlayComponent } from './auth/auth-overlay.component';

@Component({
  imports: [RouterModule, AuthOverlayComponent],
  selector: 'lyri-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {}
