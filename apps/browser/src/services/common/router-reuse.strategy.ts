import {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
  RouteReuseStrategy,
} from '@angular/router';

export class CustomReuseStrategy implements RouteReuseStrategy {
  storedRoutes: { [key: string]: DetachedRouteHandle } = {};

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    // Определяет, нужно ли сохранять состояние страницы
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
    if (
      !route.routeConfig ||
      !this.storedRoutes[this.getKey(route)]
    ) {
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
