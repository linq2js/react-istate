# react-istate

A React hooks for [istate](https://github.com/linq2js/istate)

## Using Suspense with async state

```jsx harmony
import {Suspense} from 'react';
import istate from 'istate';
import {useValue} from 'react-istate';
const ProfileState = istate(async () => {
  const profile = await LoadProfile();
  return profile;
});

const ProfileComponent = () => {
  const profile = useValue(ProfileState);
  return <div>{profile.name}</div>;
};

const ProfilePage = () => (
  <Suspense fallback={<Spinner />}>
    <ProfileComponent />
  </Suspense>
);
```

## Using loadable logic with async state

```jsx harmony
import {Suspense} from 'react';
import istate from 'istate';
import {Spinner} from 'ui-lib';
import {useLoadable} from 'react-istate';
const ProfileState = istate(async () => {
  const profile = await LoadProfile();
  return profile;
});

const ProfilePage = () => {
  const {state, value} = useLoadable(ProfileState);
  if (state === 'loading') {
    return <Spinner />;
  }
  return <div>{value.name}</div>;
};
```
