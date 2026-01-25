import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type OnboardingHelpContext = 'bible' | 'songs';

@Injectable({ providedIn: 'root' })
export class OnboardingHelpService {
  private readonly helpRequestedSubject = new Subject<OnboardingHelpContext>();

  readonly helpRequested$ = this.helpRequestedSubject.asObservable();

  requestHelp(context: OnboardingHelpContext): void {
    this.helpRequestedSubject.next(context);
  }
}
