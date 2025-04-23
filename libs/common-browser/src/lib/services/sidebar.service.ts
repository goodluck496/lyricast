import { Injectable, Injector, Provider, Type } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ComponentType } from '@angular/cdk/portal';

@Injectable({ providedIn: 'root' })
export class SidebarService<Data = unknown> {
  private _component = new BehaviorSubject<ComponentType<any> | null>(null);
  private _data = new BehaviorSubject<Data | null>(null);
  private _providers: (Provider | Type<any>)[] = [];
  private _injector = new BehaviorSubject<Injector | null>(null)

  injector$ = this._injector.asObservable();
  component$ = this._component.asObservable();
  data$ = this._data.asObservable();

  setComponent(
    component: ComponentType<any>,
    injector: Injector,
  ) {
    this._component.next(component);
    this._injector.next(injector);
  }

  updateData(data: Data): void {
    this._data.next(data);
  }

  clear() {
    this._component.next(null);
    this._injector.next(null);
  }
}
