import { SlideTransition } from './transition.types';

/**
 * Используем при любом фронтовом взаимодействии
 */
export type Slide = {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  index: number;

  previewAssetId: string,
  groupId: number;
  transitionIn?: SlideTransition; // переход при появлении слайда
};

export type Presentation = {
  id: string;
  title: string;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
  slides: Slide[];
};

/*
export type FreeSlide = {
  id: string;
  index: number;
  name: string;

  createdAtTime: number;
  htmlString: string;

  groupId?: string;
  previewAssetId?: string;
}
*/
