import {Api, State} from 'istate';

export type StateTuple<T> = [T, Api<T>];
export type StateLike<T> = State<T> | StateTuple<T>;

export function useValue(states: StateLike<any>[]): any[];
export function useValue<T>(state: StateLike<T>): T;

export function useLoadable<T, U extends Promise<T>>(
  state: StateLike<U>,
): Loadable<T>;
export function useLoadable(states: StateLike<any>[]): Loadable<any>[];

export interface Loadable<T> {
  state: 'loading' | 'hasValue' | 'hasError';
  value: T;
  error: Error;
}
