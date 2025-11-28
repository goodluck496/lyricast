import { LyriIconName } from '@lyri-cast/svg-icons';

export type MenuItem = {
  icon: LyriIconName;
  routerLink: string[];
  label: string;
  visible: boolean;
  disabled?: boolean;
};
