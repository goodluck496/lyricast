export interface IUiLyriListItem<Entity = object> {
  title: string;
  searchKey: string;

  baseEntity: Entity;
}

export interface IUiLyriItemInList<Entity = object> {
  title: string;
  searchKey: string;

  baseEntity: Entity;
}

export enum ListBoxTemplates {
  ITEM = 'item',
}
