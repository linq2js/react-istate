import {useEffect, useState, useRef} from 'react';

export function useValue(states) {
  const promises = [];
  const result = useStates(states, (value) => {
    // is promise like
    if (value && typeof value.then === 'function') {
      enableLoadableLogic(value);
      switch (value.__loadable.state) {
        case 'loading':
          promises.push(value);
          break;
        case 'hasValue':
          return value.__loadable.value;
        case 'hasError':
          throw value.__loadable.error;
      }
    }
    return value;
  });
  if (promises.length) {
    throw Promise.all(promises);
  }
  return result;
}

function enableLoadableLogic(promise) {
  if (promise.__loadable) {
    return;
  }
  const listeners = new Set();
  let sameThread = true;
  promise.__loadable = {
    state: 'loading',
    value: undefined,
  };
  promise.__onDone = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  promise
    .then(
      (payload) => {
        promise.__loadable = {
          state: 'hasValue',
          value: payload,
        };
      },
      (error) => {
        promise.__loadable = {
          state: 'error',
          error,
        };
      },
    )
    .finally(() => {
      if (!sameThread) {
        for (const listener of listeners) {
          listener();
        }
      }
    });
  sameThread = false;
}

export function useLoadable(states) {
  return useStates(
    states,
    (value, {prevValues, rerender, unsubscribes}, index) => {
      if (value && typeof value.then === 'function') {
        enableLoadableLogic(value);
        // if the promise is still loading
        if (value.__loadable.state === 'loading') {
          // we should re-render the component once promise is done
          unsubscribes.push(
            value.__onDone(() => {
              // do nothing if current value has been changed since last render
              if (prevValues[index] !== value) {
                return;
              }
              rerender();
            }),
          );
        }
        return value.__loadable;
      }

      return {
        state: 'hasValue',
        value,
      };
    },
  );
}

function isStateApi(value) {
  return Array.isArray(value) && value[1] && value[1].type === 'api';
}

function useStates(states, valueTransform) {
  let isMultiple = true;
  // is state func
  if (typeof states === 'function' && states.type === 'state') {
    states = [states];
    isMultiple = false;
  }
  // is state tuple
  else if (isStateApi(states)) {
    states = [states];
    isMultiple = false;
  } else if (!Array.isArray(states)) {
    throw new Error('Invalid state input');
  }
  const [, rerender] = useState(undefined);
  const contextRef = useRef({});

  Object.assign(contextRef.current, {
    apis: [],
    prevValues: contextRef.current.nextValues,
    unsubscribes: [],
    nextValues: [],
    rerender() {
      rerender({});
    },
  });

  if (!contextRef.current.prevValues) {
    contextRef.current.prevValues = contextRef.current.nextValues;
  }

  const values = states.map((state, index) => {
    const [value, api] = isStateApi(state) ? state : state();
    contextRef.current.apis.push(api);
    contextRef.current.nextValues[index] = value;
    return valueTransform(value, contextRef.current, index);
  });

  useEffect(() => {
    contextRef.current.apis.forEach((api) => {
      contextRef.current.unsubscribes.push(
        api.subscribe(contextRef.current.rerender),
      );
    });
    return () =>
      contextRef.current.unsubscribes.forEach((unsubscribe) => unsubscribe());
  });

  return isMultiple ? values : values[0];
}
