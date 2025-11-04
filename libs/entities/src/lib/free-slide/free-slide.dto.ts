
/**
 * Используем при любом межсервисном взаимодействии
 * например между беком и фронтом
 */
export type SlideDto = {
  id: string;
  name: string;
  /**
   * сериализованный массив нод в слайде
   */
  content: string;
  index: number;

  createdAt: number;

  previewAssetId: string,
  groupId: number,
};

export type PresentationDto = {
  title: string;
  slides: SlideDto[];
};

/*
import { FreeSlide } from './free-slide.types';

export type FreeSlideDto = FreeSlide & {}
*/
