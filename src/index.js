import {getStateList} from 'istate';
import {
  useEffect,
  useState,
  useRef,
  createContext,
  createElement,
  useContext,
} from 'react';

const freezeContext = createContext(undefined);
const unset = {};

export function Freeze({isFrozen = false, children}) {
  const parentFreeze = useContext(freezeContext);
  const freezeRef = useRef(undefined);
  createFreeze(freezeRef, parentFreeze);
  freezeRef.current.setFrozen(isFrozen);
  useEffect(
    () => () => {
      freezeRef.current.dispose();
    },
    [],
  );
  return createElement(
    freezeContext.Provider,
    {value: freezeRef.current},
    children,
  );
}

function createFreeze(ref, parentFreeze) {
  let freeze = ref.current;
  if (!freeze) {
    const subscriptions = new Set();
    const rerenderFunctions = new Set();
    let enabled = unset;
    let renrenderTimerId;
    ref.current = freeze = {
      isFrozen() {
        return enabled && (!parentFreeze || parentFreeze.isFrozen());
      },
      subscribe(subscription) {
        subscriptions.add(subscription);
        return () => subscriptions.delete(subscription);
      },
      setFrozen(value) {
        if (enabled === unset) {
          enabled = value;
        } else if (enabled !== value) {
          enabled = value;
          for (const subscription of subscriptions) {
            subscription();
          }
        }
      },
      rerenderChild(rerenderFn) {
        clearTimeout(renrenderTimerId);
        rerenderFunctions.add(rerenderFn);
        renrenderTimerId = setTimeout(() => {
          const copyOfRerenderFunctions = Array.from(rerenderFunctions);
          rerenderFunctions.clear();
          copyOfRerenderFunctions.forEach((f) => f());
        }, 0);
      },
      dispose() {
        subscriptions.clear();
        rerenderFunctions.clear();
      },
    };
  }
  return freeze;
}

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
        default:
          break;
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

function useStates(states, valueTransform) {
  const stateList = getStateList(states);
  if (!stateList.valid) {
    throw new Error('Invalid state input');
  }
  const [, rerender] = useState(undefined);
  const contextRef = useRef({});

  Object.assign(contextRef.current, {
    freeze: useContext(freezeContext),
    states: stateList.states,
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

  const values = stateList.states.map((state, index) => {
    const value = state.get();
    contextRef.current.nextValues[index] = value;
    return valueTransform(value, contextRef.current, index);
  });

  useEffect(() => {
    const context = contextRef.current;
    const unsubscribes = context.unsubscribes;
    let isFrozen = false;
    let shouldRerender = false;
    const handleChange = () => {
      if (isFrozen) {
        shouldRerender = true;
        return;
      }
      context.rerender();
    };

    if (context.freeze) {
      const freeze = context.freeze;
      isFrozen = freeze.isFrozen();
      const handleFreezeChange = () => {
        isFrozen = freeze.isFrozen();
        if (!isFrozen && shouldRerender && !context.unmount) {
          shouldRerender = false;
          freeze.rerenderChild(context.rerender);
        }
      };
      unsubscribes.push(freeze.subscribe(handleFreezeChange));
    }

    context.states.forEach((state) => {
      unsubscribes.push(state.subscribe(handleChange));
    });
    return () => {
      context.unmount = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  return stateList.multiple ? values : values[0];
}
