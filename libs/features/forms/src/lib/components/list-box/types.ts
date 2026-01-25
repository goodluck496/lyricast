export interface IUiLyriListItem<Entity = object> {
  title: string;
  searchKey: string;

  baseEntity: Entity;
  index?: number;
}

export interface IUiLyriItemInList<Entity = object> {
  title: string;
  searchKey: string;

  baseEntity: Entity;
  index?: number;
}

export enum ListBoxTemplates {
  ITEM = 'item',
}
