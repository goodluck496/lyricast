import { Injectable } from '@angular/core';
import { LyriIcon, LyriIconName } from './index';

const ICON_IMPORTERS: Record<LyriIconName, () => Promise<LyriIcon | any>> = {
  bible: () => import('./lyri-icons/lyri-bible.icon'),
  control: () => import('./lyri-icons/lyri-control.icon'),
  song_lyrics: () => import('./lyri-icons/lyri-song-lyrics.icon'),
  storyboard: () => import('./lyri-icons/lyri-storyboard.icon'),
  opened_book: () => import('./lyri-icons/lyri-opened-book.icon'),
  song: () => import('./lyri-icons/lyri-song.icon'),
  play: () => import('./lyri-icons/lyri-play.icon'),
  stop: () => import('./lyri-icons/lyri-stop.icon'),
  grid: () => import('./lyri-icons/lyri-grid.icon'),
  bullet_list: () => import('./lyri-icons/lyri-bullet-list.icon'),
};

@Injectable({ providedIn: 'root' })
export class IconsService {
  private registry = new Map<string, string>();

  async registerIcons(icons: LyriIcon[]): Promise<void> {
    const imports = icons.map((icon) => {
      return ICON_IMPORTERS[icon.name];
    });
    await Promise.all(imports).then((e) => {
      e.forEach((entry) => {
        entry().then((v) => {
          const data: LyriIcon = Object.values(v)[0] as LyriIcon;
          this.registry.set(data.name, data.data);
          console.log('reg icon', data.name);
        });
      });
    });
  }

  getIcon(name: LyriIconName): string | undefined {
    return this.registry.get(name);
  }
}

// Преобразует kebab-case в PascalCase (icon-heart → iconHeart)
function toPascalCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
