import { ChangeDetectionStrategy, Component } from '@angular/core';


@Component({
  selector: 'lyri-empty-state',
  standalone: true,
  imports: [],
  template: ` <ng-content></ng-content>`,
  styles: `:host {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 64px;
    padding: 8px;
    color: darkgrey
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {}
