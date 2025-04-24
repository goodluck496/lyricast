import { MenuItem as MenuItemPrime } from 'primeng/api/menuitem';
import { LyriIconName } from '@lyri-cast/svg-icons';

export type MenuItem = MenuItemPrime & {
  icon: LyriIconName
};
