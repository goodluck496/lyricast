import {
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  OnInit,
  output,
} from '@angular/core';
import { debounceTime, filter, fromEvent } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Directive({
  selector: '[lyriDblClick]',
  standalone: true,
})
export class DblClickDirective implements OnInit {
  destroyRef = inject(DestroyRef);
  el = inject(ElementRef);

  dblClick = output<MouseEvent>(); // Эмиттер для события двойного клика

  ngOnInit(): void {
    const click$ = fromEvent<MouseEvent>(this.el.nativeElement, 'click'); // Подписываемся на клики

    const dblClick$ = click$.pipe(
      takeUntilDestroyed(this.destroyRef),
      debounceTime(250),
      filter((event) => event.detail === 2) // Проверяем, что это двойной клик
    );

    dblClick$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this.dblClick.emit(event);
    });
  }
}
