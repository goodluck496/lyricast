import { filter, OperatorFunction } from 'rxjs';

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
