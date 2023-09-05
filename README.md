# `async-cache`

[`@juriadams/async-cache`](https://npmjs.com/package/@juriadams/async-cache) is an efficient caching utility with asynchronous capabilities for third-party retrieval and revalidation. It is particularly useful when caching third-party API calls where you always expect a value to be returned.

### Key Features

-   **Time to live (TTL)**: An item in the cache older than this TTL will be purged, and retrievals will return `undefined`.
-   **TTL Reset**: The TTL of an item can be reset every time it is retrieved from cache.
-   **Revalidation**: The value of a key can be revalidated every time it's retrieved from the cache. While being revalidated, stale data is returned.
-   **Resolving Cache Misses**: For cache misses, a custom `resolve` function resolves and stores items in cache.

## Basic Usage

```ts
import Cache from "@juriadams/async-cache";

const cache = new Cache({
    // 10 seconds TTL.
    ttl: 1000 * 10,

    // Reset TTL back to 10 seconds after retrieving.
    resetTtlOnGet: true,

    // Revalidate items every time they have been retrieved.
    revalidateOnGet: true,

    // If the cache is missed, resolve the item and store it.
    resolve: async (key) => {
        // Implementation for resolving data using key goes here.
        // For instance, an API call fetching a user record (slow).
    },

    // Revalidate an item either manually `cache.revalidate(key)` or after
    // every retrieval (options.revalidateOnGet: true).
    revalidate: async (key) => {
        // Implementation for resolving data using key goes here.
        // For instance, an API call checking if the `updatedAt` timestamp
        // of the cached record matches (slightly faster, but still slow).
    },
});

// Adding new data to the cache.
cache.set("@juri", { name: "Juri", permissions: ["read", "write"] });

// Get cached data (resolved from memory).
const juri = await cache.get("@juri");

// Get uncached data (resolved through `resolve` function).
const leo = await cache.get("@leo");

// Delete data from the cache.
cache.delete("@juri");
cache.delete("@leo");
```

This code initializes a `new Cache()` with some options including a TTL, whether to reset TTL and revalidate on getting data, and the custom resolve/revalidate functions. Then, it demonstrates how to set, get, and delete data from the cache.

## Installation

```sh
npm i @juriadams/async-cache
```

## Contributing

If you want to contribute to this project, please fork the repository, make your changes, and create a pull request. We welcome contributions from the community.

Please note that we ensure 100 % test coverage.
