import {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
  RouteReuseStrategy,
} from '@angular/router';
import { Pages } from '@lyri-cast/common-browser';

export class CustomReuseStrategy implements RouteReuseStrategy {
  storedRoutes: { [key: string]: DetachedRouteHandle } = {};

  clearAll(): void {
    this.storedRoutes = {};
  }

  clearByPathContains(pathPart: string): void {
    const keys = Object.keys(this.storedRoutes);
    for (const key of keys) {
      if (key.includes(pathPart)) {
        delete this.storedRoutes[key];
      }
    }
  }

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    // Определяет, нужно ли сохранять состояние страницы
    if (route.routeConfig?.path?.includes(Pages.CASTING)) {
      return false;
    }
    return true; // Определите логику для конкретных страниц
  }

  getKey(route: ActivatedRouteSnapshot): string {
    return (route.routeConfig?.path || '') + route.component?.name;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle): void {
    // Сохраняем страницу
    this.storedRoutes[this.getKey(route)] = handle;
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    // Определяет, нужно ли восстанавливать сохранённую страницу
    return !!this.storedRoutes[this.getKey(route)];
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    // Восстанавливаем сохранённую страницу
    if (!route.routeConfig || !this.storedRoutes[this.getKey(route)]) {
      return null;
    }
    return this.storedRoutes[this.getKey(route)];
  }

  shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    curr: ActivatedRouteSnapshot
  ): boolean {
    // Определяем, нужно ли использовать существующий маршрут
    return future.routeConfig === curr.routeConfig;
  }
}
