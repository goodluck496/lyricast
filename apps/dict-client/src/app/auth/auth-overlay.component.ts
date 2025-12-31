import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthOverlayService } from './auth-overlay.service';

@Component({
  selector: 'app-auth-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-overlay.component.html',
  styleUrls: ['./auth-overlay.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthOverlayComponent {
  private readonly authOverlayService = inject(AuthOverlayService)
  email = '';

  readonly isVisible$ = this.authOverlayService.isVisible$;

  onSubmit(): void {
    void this.authOverlayService.submitEmail(this.email);
  }

  onCancel(): void {
    this.authOverlayService.cancel();
  }
}
