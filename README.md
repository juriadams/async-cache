# `async-cache`

[`@juriadams/async-cache`](https://npmjs.com/package/@juriadams/async-cache) is an efficient caching utility with asynchronous capabilities for third-party retrieval and revalidation. It is particularly useful when caching third-party API calls where you always expect a value to be returned.

### Key Features

-   **Time to live (TTL)**: An item in the cache older than this TTL will be evicted, and retrievals will return `undefined`.
-   **TTL Reset**: The TTL of an item can be reset every time it is retrieved from cache.
-   **Revalidation**: The value of a key can be revalidated every time it's retrieved from the cache. While revalidation is pending, stale data is returned.
-   **Layered Revalidation**: One or more function can be passed to revalidate a value. Useful when having a separate caching layer (such as KV).
-   **Resolving Cache Misses**: For cache misses, a custom `resolve` function resolves and stores items in cache.
-   **Layered Resolving**: Same as for revalidation, multiple functions can be passed to resolve a value. This way, you can first check faster sources for your data before falling back to the slowest.

## Basic Example

```ts
import Cache from "@juriadams/async-cache";

const cache = new Cache({
    ttl: 1000 * 10,
    maxSize: 5,

    // Custom resolving for cache misses.
    resolve: [async (key) => KV.get(key), async (key) => S3.get(key)]

    // Custom revalidation.
    revalidate: [async (key) => KV.get(key)],
    revalidateOnGet: true,
});

cache.set("@leo", { permissions: ["read", "write"] });

// Resolved from memory (fast).
await cache.get("@leo");

// First resolved by checking KV (somewhat slow), then S3 (slow).
await cache.get("@juri");

// Subsequent retrievals are returned from memory (fast).
// As `revalidateOnGet` is set, the item is revalidated in the background.
await cache.get("@juri");

// Manually evict items from the cache.
cache.delete("@leo");
cache.delete("@juri");
```

This code initializes a `new Cache()` with some options including a TTL, whether to revalidate entries upon retrieval, and the custom resolve/revalidate functions. Then, it demonstrates how to set, get, and delete data from the cache.

For more minimal examples covering all possible cases, please refer to the [test suite](/tests/index.test.ts).

## Installation

```sh
npm i @juriadams/async-cache
```

## API

Detailed API specifications are a subject to follow.

## Contributing

If you want to contribute to this project, please fork the repository, make your changes, and create a pull request. We welcome contributions from the community.

Please note that we ensure 100 % test coverage.
