import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  Params,
} from '@angular/router';
import { combineLatest, map, Observable } from 'rxjs';

export abstract class RouteParamsReducerHelper {
  /**
   * Собирает все параметры по роуту, его родителям и детям, в один объект Params. Асинхронный метод.
   * @param route {ActivatedRoute} роут, по которому необходимо собрать параметры
   */
  public static reduce(route: ActivatedRoute): Observable<Params> {
    const paramsArray = [route.params];

    let parent = route.parent;

    while (parent) {
      paramsArray.push(parent.params);
      parent = parent.parent;
    }

    let firstChild = route.firstChild;

    while (firstChild) {
      paramsArray.push(firstChild.params);
      firstChild = firstChild.firstChild;
    }

    return combineLatest(paramsArray).pipe(
      map(arrayOfParams => arrayOfParams.reduceRight((res, current) => ({ ...res, ...current }), {}))
    );
  }

  /**
   * Собирает все параметры по роуту, его родителям и детям, в один объект Params. Синхронный метод.
   * @param route {ActivatedRoute} роут, по которому необходимо собрать параметры
   */
  public static reduceSnapshot(route: ActivatedRouteSnapshot): Params {
    const paramsArray = [route.params];

    let parent = route.parent;

    while (parent) {
      paramsArray.push(parent.params);
      parent = parent.parent;
    }

    let firstChild = route.firstChild;

    while (firstChild) {
      paramsArray.push(firstChild.params);
      firstChild = firstChild.firstChild;
    }

    return paramsArray.reduceRight((res, current) => ({ ...res, ...current }), {});
  }
}
