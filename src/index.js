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
      const loadable = value.loadable;
      switch (loadable.state) {
        case 'loading':
          promises.push(value);
          break;
        case 'hasValue':
          return loadable.value;
        case 'hasError':
          throw loadable.error;
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

export function useLoadable(states) {
  return useStates(
    states,
    (value, {prevValues, rerender, unsubscribes}, index) => {
      if (value && typeof value.then === 'function') {
        const loadable = value.loadable;
        // if the promise is still loading
        if (loadable.state === 'loading') {
          // we should re-render the component once promise is done
          unsubscribes.push(
            loadable.subscribe(() => {
              // do nothing if current value has been changed since last render
              if (prevValues[index] !== value) {
                return;
              }
              rerender();
            }),
          );
        }
        return loadable;
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
      if (
        context.states.length === context.nextValues.length &&
        context.states.every(
          (state, index) => state.get() === context.nextValues[index],
        )
      ) {
        return;
      }

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
