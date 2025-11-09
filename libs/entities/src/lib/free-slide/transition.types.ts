export type TransitionType = 
  | 'none'
  | 'fade'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'zoomIn'
  | 'zoomOut'
  | 'flipHorizontal'
  | 'flipVertical'
  | 'rotateIn'
  | 'rotateOut'
  | 'dissolve'
  | 'wipeLeft'
  | 'wipeRight'
  | 'wipeUp'
  | 'wipeDown';

export type TransitionEasing = 
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInQuart'
  | 'easeOutQuart'
  | 'easeInOutQuart';

export interface SlideTransition {
  type: TransitionType;
  duration: number; // в миллисекундах
  easing: TransitionEasing;
  delay?: number; // задержка перед началом перехода
}

export interface SlideTransitionConfig {
  id: string;
  name: string;
  transition: SlideTransition;
}

export interface TransitionPreset {
  id: string;
  name: string;
  icon?: string;
  transition: SlideTransition;
}

export const DEFAULT_TRANSITION: SlideTransition = {
  type: 'none',
  duration: 500,
  easing: 'easeInOut',
};

export const TRANSITION_PRESETS: TransitionPreset[] = [
  {
    id: 'none',
    name: 'Без перехода',
    icon: 'ban',
    transition: { type: 'none', duration: 0, easing: 'linear' }
  },
  {
    id: 'fade',
    name: 'Затухание',
    icon: 'circle',
    transition: { type: 'fade', duration: 800, easing: 'easeInOut' }
  },
  {
    id: 'slide-left',
    name: 'Сдвиг влево',
    icon: 'arrow-left',
    transition: { type: 'slideLeft', duration: 600, easing: 'easeInOut' }
  },
  {
    id: 'slide-right',
    name: 'Сдвиг вправо',
    icon: 'arrow-right',
    transition: { type: 'slideRight', duration: 600, easing: 'easeInOut' }
  },
  {
    id: 'slide-up',
    name: 'Сдвиг вверх',
    icon: 'arrow-up',
    transition: { type: 'slideUp', duration: 600, easing: 'easeInOut' }
  },
  {
    id: 'slide-down',
    name: 'Сдвиг вниз',
    icon: 'arrow-down',
    transition: { type: 'slideDown', duration: 600, easing: 'easeInOut' }
  },
  {
    id: 'zoom-in',
    name: 'Приближение',
    icon: 'search-plus',
    transition: { type: 'zoomIn', duration: 700, easing: 'easeOutCubic' }
  },
  {
    id: 'zoom-out',
    name: 'Отдаление',
    icon: 'search-minus',
    transition: { type: 'zoomOut', duration: 700, easing: 'easeInCubic' }
  },
  {
    id: 'flip-horizontal',
    name: 'Переворот по горизонтали',
    icon: 'arrows-alt-h',
    transition: { type: 'flipHorizontal', duration: 800, easing: 'easeInOut' }
  },
  {
    id: 'flip-vertical',
    name: 'Переворот по вертикали',
    icon: 'arrows-alt-v',
    transition: { type: 'flipVertical', duration: 800, easing: 'easeInOut' }
  },
  {
    id: 'rotate-in',
    name: 'Вращение внутрь',
    icon: 'sync',
    transition: { type: 'rotateIn', duration: 900, easing: 'easeInOut' }
  },
  {
    id: 'dissolve',
    name: 'Растворение',
    icon: 'tint',
    transition: { type: 'dissolve', duration: 1000, easing: 'easeInOut' }
  },
  {
    id: 'wipe-left',
    name: 'Вытеснение слева',
    icon: 'chevron-left',
    transition: { type: 'wipeLeft', duration: 500, easing: 'easeOutQuart' }
  },
  {
    id: 'wipe-right',
    name: 'Вытеснение справа',
    icon: 'chevron-right',
    transition: { type: 'wipeRight', duration: 500, easing: 'easeInQuart' }
  },
];
