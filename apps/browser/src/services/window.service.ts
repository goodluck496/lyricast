import { Injectable } from '@angular/core';
import { Context } from '@lyri-cast/common-electron';

@Injectable({providedIn: 'platform'})
export class WindowService {

  get electronContext(): Context {
    return (window as any).electron as Context;
  }

}
