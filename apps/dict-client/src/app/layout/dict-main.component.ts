import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgFor, NgIf } from '@angular/common';

export type DictMenuItem = {
  label: string;
  icon?: string;
  routerLink: any[];
  disabled?: boolean;
  visible?: boolean;
};

@Component({
  selector: 'lyri-dict-main',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './dict-main.component.html',
  styleUrl: './dict-main.component.scss',
})
export class DictMainComponent {
  pages: DictMenuItem[] = [
    {
      routerLink: ['./', 'songs'],
      label: 'Песни',
      visible: true,
    },
  ];
}
