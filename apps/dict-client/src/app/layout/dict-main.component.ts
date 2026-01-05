import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LyriIconName, SvgIconComponent } from '@lyri-cast/svg-icons';

export type DictMenuItem = {
  label: string;
  icon?: LyriIconName;
  routerLink: any[];
  disabled?: boolean;
  visible?: boolean;
};

@Component({
  selector: 'lyri-dict-main',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SvgIconComponent],
  templateUrl: './dict-main.component.html',
  styleUrl: './dict-main.component.scss',
})
export class DictMainComponent {
  pages: DictMenuItem[] = [
    {
      routerLink: ['./', 'songs'],
      label: 'Песни',
      icon: 'song_lyrics',
      visible: true,
    },
  ];
}
