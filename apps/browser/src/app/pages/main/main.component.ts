import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { TabViewModule } from 'primeng/tabview';

import { MenuItem, PrimeTemplate } from 'primeng/api';
import { TabMenuModule } from 'primeng/tabmenu';
import { Pages, PageTitlesMap } from '@lyri-cast/common-browser';
import { HttpClient } from '@angular/common/http';
import { BASE_API_TOKEN } from '@lyri-cast/common';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { catchError, first, Observable, of, switchMap, timer } from 'rxjs';

@Component({
  selector: 'lyri-main-page',
  standalone: true,
  imports: [
    RouterOutlet,
    TabViewModule,
    PrimeTemplate,
    TabMenuModule,
    ProgressSpinnerModule,
  ],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainComponent implements OnInit {
  cdr = inject(ChangeDetectorRef);
  route = inject(ActivatedRoute);
  http = inject(HttpClient);
  BASE_API_TOKEN = inject(BASE_API_TOKEN);

  activePage?: MenuItem;

  pages: MenuItem[] = [
    {
      routerLink: ['./', Pages.BIBLE_FEATURE, Pages.BIBLE],
      label: PageTitlesMap.get(Pages.BIBLE) || Pages.BIBLE,
    },
    {
      routerLink: ['./', Pages.SONGS_FEATURE, Pages.SONGS],
      label: PageTitlesMap.get(Pages.SONGS) || Pages.SONGS,
    },
    {
      routerLink: ['./', Pages.PROGRAMS],
      label: PageTitlesMap.get(Pages.PROGRAMS) || Pages.PROGRAMS,
    },
    {
      routerLink: ['./', Pages.SETTINGS],
      label: PageTitlesMap.get(Pages.SETTINGS) || Pages.SETTINGS,
    },
    {
      routerLink: ['./', Pages.TEST],
      label: PageTitlesMap.get(Pages.TEST) || Pages.TEST,
    },
  ];

  backendReady = false;

  ngOnInit() {
    this.cdr.detectChanges();

    this.repeatCheckBackend().subscribe((res) => {
      this.backendReady = !!res;
      if (this.backendReady) {
        this.cdr.detectChanges();
      }
    });
  }

  getBackendReady(): Observable<boolean | null> {
    return this.http
      .get<boolean>(`${this.BASE_API_TOKEN}/ready`)
      .pipe(catchError(() => of(null)));
  }

  repeatCheckBackend(): Observable<boolean | null> {
    return timer(0, 2000).pipe(
      // Запускаем немедленно, затем каждые 2 секунды
      switchMap(() => this.getBackendReady()),
      first((response) => !!response) // Останавливаем на успешном ответе
    );
  }
}
