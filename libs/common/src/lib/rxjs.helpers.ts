import {filter, Observable, OperatorFunction, take} from 'rxjs';

export const IsDefined = <T>(input: T | null | undefined): input is T =>
  input !== null && input !== undefined;

/**
 * @description Пайп для фильтрации null и undefined и приведения типа результата к T (без null и undefined)
 * @param Observable<T | null | undefined>
 * @returns Observable<T>
 */
export function filterEmpty<T>(): OperatorFunction<T | undefined | null, T> {
  return filter<T | undefined | null, T>(IsDefined);
}


/**
 * Функция для получения текущего значения в observable
 * @param source$
 */
export function snapshot<T>(source$: Observable<T>): T {
  let result: T;

  source$.pipe(take(1)).subscribe(_result => (result = _result));

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return result;
}
