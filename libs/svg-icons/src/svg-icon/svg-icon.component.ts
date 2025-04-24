import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Inject,
  Input,
  Optional,
} from '@angular/core';
import { IconsService } from '../icons.service';
import { LyriIconName } from '../lyri-icons/lyri-svg-icon.model';

@Component({
  selector: 'lyri-icon',
  template: ` <ng-content></ng-content> `,
  styleUrls: ['./svg-icon.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgIconComponent {
  private svgIcon?: SVGElement;

  constructor(
    private readonly element: ElementRef,
    private readonly iconService: IconsService,
    @Optional() @Inject(DOCUMENT) private readonly document: Document
  ) {}

  @Input()
  public set name(iconName: LyriIconName | string) {
    if (this.svgIcon) {
      this.element.nativeElement.removeChild(this.svgIcon);
    }

    const svgData = this.iconService.getIcon(iconName as LyriIconName);
    if(!svgData) {
      console.log(`icon "${iconName}" not found`);
      return
    }

    this.svgIcon = this.svgElementFromString(svgData);
    this.element.nativeElement.appendChild(this.svgIcon);
  }

  private svgElementFromString(svgContent: string): SVGElement {
    const div = this.document.createElement('DIV');

    div.innerHTML = svgContent;

    return (
      div.querySelector('svg') ||
      this.document.createElementNS('http://www.w3.org/2000/svg', 'path')
    );
  }
}
