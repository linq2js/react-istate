import React, {Suspense} from 'react';
import {act, render} from '@testing-library/react';
import istate from 'istate';
import {useLoadable, useValue} from 'react-istate';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const loadingId = 'loading';
const outputId = 'output';
const errorId = 'error';
const loadingDiv = <div data-testid={loadingId} />;
const errorDiv = <div data-testid={errorId} />;
const AsyncValueFactory = async () => {
  await delay(20);
  return 100;
};

test('counter', () => {
  const Count = istate(0);
  const Increase = () => {
    const [count, setCount] = Count();
    setCount(count + 1);
  };
  const App = () => {
    const count = useValue(Count);
    return <div data-testid={outputId}>{count}</div>;
  };

  const {getByTestId} = render(<App />);

  const countDiv = getByTestId(outputId);

  expect(countDiv.innerHTML).toBe('0');

  act(() => {
    Increase();
    Increase();
    Increase();
  });

  expect(countDiv.innerHTML).toBe('3');
});

test('use suspend', async () => {
  const AsyncValue = istate(AsyncValueFactory);
  const App = () => {
    const [value] = useValue([AsyncValue]);
    return <div data-testid={outputId}>{value}</div>;
  };

  const {getByTestId, queryByTestId} = render(
    <Suspense fallback={loadingDiv}>
      <App />
    </Suspense>,
  );
  expect(queryByTestId(loadingId)).toBeTruthy();
  await delay(30);
  expect(queryByTestId(loadingId)).toBeFalsy();
  expect(getByTestId(outputId).innerHTML).toBe('100');
});

test('use loadable logic', async () => {
  const AsyncValue = istate(AsyncValueFactory);
  const App = () => {
    const [loadable] = useLoadable([AsyncValue]);
    if (loadable.state === 'hasError') {
      return errorDiv;
    } else if (loadable.state === 'hasValue') {
      return <div data-testid={outputId}>{loadable.value}</div>;
    }
    return loadingDiv;
  };
  const {getByTestId, queryByTestId} = render(<App />);
  expect(queryByTestId(loadingId)).toBeTruthy();
  await act(() => delay(30));
  expect(queryByTestId(loadingId)).toBeFalsy();
  expect(getByTestId(outputId).innerHTML).toBe('100');
});
