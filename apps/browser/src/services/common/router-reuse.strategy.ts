import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

export class CustomReuseStrategy implements RouteReuseStrategy {

  storedRoutes: { [key: string]: DetachedRouteHandle } = {};

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    // Определяет, нужно ли сохранять состояние страницы
    return true; // Определите логику для конкретных страниц
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle): void {
    // Сохраняем страницу
    this.storedRoutes[route.routeConfig?.path || ''] = handle;
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    // Определяет, нужно ли восстанавливать сохранённую страницу
    return !!this.storedRoutes[route.routeConfig?.path || ''];
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    // Восстанавливаем сохранённую страницу
    if (!route.routeConfig || !this.storedRoutes[route.routeConfig.path || '']) {
      return null;
    }
    return this.storedRoutes[route.routeConfig.path || ''];
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    // Определяем, нужно ли использовать существующий маршрут
    return future.routeConfig === curr.routeConfig;
  }
}
