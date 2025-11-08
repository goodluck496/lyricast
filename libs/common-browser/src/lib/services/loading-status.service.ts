import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoadingStatusService {
  public readonly isInitialLoading = signal(true);

  finishInitialLoading() {
    this.isInitialLoading.set(false);
  }
}
