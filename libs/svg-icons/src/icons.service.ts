import { Injectable } from '@angular/core';
import { LyriIcon, LyriIconName } from './index';

const ICON_IMPORTERS: Record<LyriIconName, () => Promise<LyriIcon | any>> = {
  bible: () => import('./lyri-icons/lyri-bible.icon'),
  control: () => import('./lyri-icons/lyri-control.icon'),
  song_lyrics: () => import('./lyri-icons/lyri-song-lyrics.icon'),
  storyboard: () => import('./lyri-icons/lyri-storyboard.icon'),
};

@Injectable({ providedIn: 'root' })
export class IconsService {
  private registry = new Map<string, string>();

  async registerIcons(icons: LyriIcon[]): Promise<void> {
    console.log('registerIcons', icons);
    const imports = icons.map((icon) =>{
      // return import(`@lyri-cast/svg-icons/lyri-icons/lyri-${name}.icon.ts`).then(
      // return import(`libs/svg-icons/src/lyri-icons/lyri-${name}.icon`).then(
      //   (module) => {
      //     this.registry.set(name, module[`icon${toPascalCase(name)}`]);
      //   }
      // )

      return ICON_IMPORTERS[icon.name];
    });
    await Promise.all(imports).then((e) => {
      e.forEach((entry) => {
        entry().then(v => {
          const data: LyriIcon = Object.values(v)[0] as LyriIcon;
          this.registry.set(data.name, data.data);
          console.log('icon?',Object.values(v))
        });
      })
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
