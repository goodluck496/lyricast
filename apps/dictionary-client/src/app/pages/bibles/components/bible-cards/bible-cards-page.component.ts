import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { CardModule } from 'primeng/card';
import { BadgeModule } from 'primeng/badge';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { BibleRegistryItemDto } from '@lyri-cast/entities';
import { BiblesDictionaryApiService } from '@lyri-cast/shared-browser/data-access/dictionaries';
import { ImportBibleDialogComponent } from '../import-bible-dialog/import-bible-dialog.component';
import { AuthOverlayService } from '../../../../auth/auth-overlay.service';
import { take } from 'rxjs';

@Component({
  standalone: true,
  selector: 'lyri-bible-cards-page',
  imports: [
    CommonModule,
    DialogModule,
    CardModule,
    BadgeModule,
    SkeletonModule,
    TooltipModule,
    ImportBibleDialogComponent,
  ],
  templateUrl: './bible-cards-page.component.html',
  styleUrl: './bible-cards-page.component.scss',
})
export class BibleCardsPageComponent implements OnInit {
  private readonly api = inject(BiblesDictionaryApiService);
  private readonly router = inject(Router);
  private readonly authOverlay = inject(AuthOverlayService);

  bibles: BibleRegistryItemDto[] = [];
  isLoading = true;
  importDialogVisible = false;

  ngOnInit(): void {
    this.loadBibles();
  }

  openBible(item: BibleRegistryItemDto): void {
    this.router.navigate(['/bibles', item.id]);
  }

  openImportDialog(): void {
    this.importDialogVisible = true;
  }

  closeImportDialog(): void {
    this.importDialogVisible = false;
  }

  handleImportCompleted(): void {
    this.importDialogVisible = false;
    this.loadBibles();
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  private loadBibles(): void {
    this.isLoading = true;
    this.api.getRegistry().subscribe({
      next: (res) => {
        this.bibles = res.items ?? [];
        this.isLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.authOverlay
            .openAndWaitForToken()
            .pipe(take(1))
            .subscribe({
              next: () => this.loadBibles(),
              error: () => (this.isLoading = false),
              complete: () => (this.isLoading = false),
            });
          return;
        }
        this.isLoading = false;
      },
    });
  }
}
