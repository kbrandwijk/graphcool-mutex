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
const { Mutex } = require('@agartha/graphcool-mutex')
```

Initialize the mutex, passing in your subscription host, `graphcool-lib` api and `projectId`.
```js
const mutex = new Mutex('subscriptions.graph.cool', api, projectId)
```

Use the following syntax to acquire a Mutex lock:
```js
await mutex.acquire('__MUTEX_NAME__')
```

Use the following syntax to release the lock:
```js
mutex.release('__MUTEX_NAME__')
```
