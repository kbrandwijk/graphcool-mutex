# graphcool-mutex

Mutex helper library for Graphcool

## Installation

Using this library requires a Type on your Graphcool project with the following schema:

```graphql
type Mutex implements Node {
  id: ID! @isUnique
  name: String! @isUnique
}
```

## Usage

Import the library into your Graphcool function.
```js
const { withMutex } = require('@agartha/graphcool-mutex')
```

Wrap your `graphcool-lib` initialization with `withMutex`
```js
const graphcool = await withMutex(fromEvent(event))
```

Optionally, you can specify your project region manually, to avoid the async call:
```js
const graphcool = withMutex(fromEvent(event), 'EU_WEST_1')
```

Use the following syntax to acquire a Mutex lock:
```js
await graphcool.mutex.acquire('__MUTEX_NAME__')
```

Use the following syntax to release the lock:
```js
graphcool.mutex.release('__MUTEX_NAME__')
```
