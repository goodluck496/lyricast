import { Component, inject } from '@angular/core';
import { NavigationStart, Router, RouterModule } from '@angular/router';
import { AuthOverlayComponent } from './auth/auth-overlay.component';
import { Toast } from 'primeng/toast';
import { ExportNotificationsComponent } from '@lyri-cast/ui-lib';
import { IconsService } from '@lyri-cast/svg-icons';
import { lyriBible } from '@lyri-cast/svg-icons/lyri-icons/lyri-bible.icon';
import { lyriControl } from '@lyri-cast/svg-icons/lyri-icons/lyri-control.icon';
import { lyriStoryboard } from '@lyri-cast/svg-icons/lyri-icons/lyri-storyboard.icon';
import { lyriSongLyrics } from '@lyri-cast/svg-icons/lyri-icons/lyri-song-lyrics.icon';
import { lyriOpenedBook } from '@lyri-cast/svg-icons/lyri-icons/lyri-opened-book.icon';
import { lyriGrid } from '@lyri-cast/svg-icons/lyri-icons/lyri-grid.icon';
import { lyriBulletList } from '@lyri-cast/svg-icons/lyri-icons/lyri-bullet-list.icon';
import { ConfirmationService } from 'primeng/api';
import { filter } from 'rxjs';

@Component({
  imports: [RouterModule, AuthOverlayComponent, Toast, ExportNotificationsComponent],
  selector: 'lyri-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  providers: [ConfirmationService],
})
export class AppComponent {
  private readonly icons = inject(IconsService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly router = inject(Router);

  constructor() {
    this.icons.registerIcons([
      lyriBible,
      lyriControl,
      lyriStoryboard,
      lyriSongLyrics,
      lyriOpenedBook,
      lyriGrid,
      lyriBulletList,
    ]);

    // Закрываем ConfirmPopup при смене маршрута (чтобы не зависали)
    this.router.events
      .pipe(filter((event): event is NavigationStart => event instanceof NavigationStart))
      .subscribe(() => this.confirmation.close());
  }
}
