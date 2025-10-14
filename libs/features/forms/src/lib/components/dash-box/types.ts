
export interface IUiLyriDashItem<Entity = object> {
  title: string;
  searchKey: string;

  baseEntity: Entity;
}


export enum DashBoxTemplates {
  ITEM = 'item',
}
