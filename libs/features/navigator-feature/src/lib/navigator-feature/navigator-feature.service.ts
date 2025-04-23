import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Actions } from '@ngrx/effects';

@Injectable()
export class NavigatorFeatureService {
  store = inject(Store);
  actions$ = inject(Actions);


}
