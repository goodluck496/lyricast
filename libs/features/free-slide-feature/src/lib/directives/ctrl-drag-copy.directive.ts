import { Directive, HostListener } from '@angular/core';

@Directive({
  selector: '[lyriCtrlDragCopy]',
  standalone: true,
})
export class CtrlDragCopyDirective {
  private ctrl = false;

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Control') this.ctrl = true;
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent) {
    if (e.key === 'Control') this.ctrl = false;
  }

  isCtrlPressed() {
    return this.ctrl;
  }
}
