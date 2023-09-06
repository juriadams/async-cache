/**
 * A function used to resolve a cache miss.
 */
type Resolver<K, V> = (
    /**
     * The key of the resource that has been requested.
     */
    key: K
) => Promise<V | undefined>;

/**
 * A function used to revalidate an item inside the cache.
 * @param key The key of the resource that has been requested.
 */
type Revalidator<K, V> = (
    /**
     * The key of the resource that has been requested.
     */
    key: K
) => Promise<V | undefined>;

interface CacheOptions<K, V> {
    /**
     * The time to live (TTL) of items in the cache in milliseconds. If an item
     * is older than this, it will be purged from the cache and retrievals
     * will return `undefined`.
     */
    ttl: number;

    /**
     * The maximum number of items to store in the cache. If the cache is full,
     * the least recently used item will be purged from the cache and retrievals
     * will return `undefined`.
     *
     * This option should be used as otherwise, the cache might grow indefinitely.
     */
    maxSize?: number;

    /**
     * If set to `true`, the `ttl` of an item will be reset every time it is
     * retrieved from the cache.
     */
    resetTtlOnGet?: boolean;

    /**
     * If set to `true`, the value of the given key will be revalidated every
     * time it is retrieved from the cache.
     */
    revalidateOnGet?: boolean;

    /**
     * If given, this function is used to resolve items for cache misses.
     *
     * ```
     * const cache = new Cache<string, string>({
     *     resolve: async (key) => fetch(`https://api.acme.co/${key}`);
     * });
     * ```
     *
     * If an array of functions is given, they will be called in order until
     * a value is returned.
     *
     * ```
     * const cache = new Cache<string, string>({
     *    resolve: [
     *       async (key) => KV.get(key),
     *       async (key) => fetch(`https://api.acme.co/${key}`),
     *    ]
     * });
     * ```
     *
     * If all functions return `undefined`, the cache miss will be handled
     * gracefully and `undefined` will be returned.
     *
     * This is useful when caching third party API calls where you always
     * expect a value to be returned.
     */
    resolve?: Resolver<K, V> | Array<Resolver<K, V>>;

    /**
     * If given, this function is used to revalidate items either every time
     * they have been retrieved from the cache (`revalidateOnGet = true`) or
     * when `Cache.revalidate` is called.
     *
     * ```
     * const cache = new Cache<string, string>({
     *    revalidate: async (key) => fetch(`https://api.acme.co/${key}`);
     * });
     * ```
     *
     * If an array of functions is given, they will be called in order until
     * a value is returned.
     *
     * ```
     * const cache = new Cache<string, string>({
     *   revalidate: [
     *      async (key) => KV.get(key),
     *      async (key) => fetch(`https://api.acme.co/${key}`),
     *   ]
     * });
     * ```
     *
     * While revalidation is pending, stale data is returned.
     *
     * If all functions return `undefined`, the item will be evicted from the
     * the cache as it does no longer exist or is invalid.
     *
     * This is useful when using a cache with a long TTL, but you want to verify
     * the validity of the cached values after they are retrieved.
     */
    revalidate?: Revalidator<K, V> | Array<Revalidator<K, V>>;
}

interface CacheItem<V> {
    start: number;
    ttl: number;
    value: V;
}

interface RevalidateOptions<K, V> {
    /**
     * See `CacheOptions.revalidate`.
     *
     * Useful when the `revalidate` function has one ore more dependencies
     * that are not available when constructing the cache.
     */
    revalidate: CacheOptions<K, V>["revalidate"];
}

interface ResolveOptions<K, V> {
    /**
     * See `CacheOptions.resolve`.
     *
     * Useful when the `resolve` function has one ore more dependencies
     * that are not available when constructing the cache.
     */
    resolve: CacheOptions<K, V>["resolve"];
}

export class Cache<K, V> {
    private readonly cache = new Map<K, CacheItem<V>>();

    public readonly ttl: CacheOptions<K, V>["ttl"];
    public readonly maxSize: CacheOptions<K, V>["maxSize"];
    public readonly resetTtlOnGet: CacheOptions<K, V>["resetTtlOnGet"];
    public readonly revalidateOnGet: CacheOptions<K, V>["revalidateOnGet"];

    private readonly resolvers = new Array<Resolver<K, V>>();
    private readonly revalidators = new Array<Revalidator<K, V>>();

    /**
     * The number of items currently inside the cache. This includes items
     * past their TTL.
     */
    public get size() {
        return this.cache.size;
    }

    constructor(options: CacheOptions<K, V>) {
        this.ttl = options.ttl;
        this.maxSize = options.maxSize;
        this.resetTtlOnGet = options.resetTtlOnGet;
        this.revalidateOnGet = options.revalidateOnGet;

        if (options.resolve) {
            if (Array.isArray(options.resolve))
                this.resolvers.push(...options.resolve);
            else this.resolvers.push(options.resolve);
        }

        if (options.revalidate) {
            if (Array.isArray(options.revalidate))
                this.revalidators.push(...options.revalidate);
            else this.revalidators.push(options.revalidate);
        }
    }

    /**
     * If called, revalidates the value of the given key using either the
     * `revalidate` function(s) provided in the constructor or the one(s)
     * passed to this function.
     *
     * ```
     * const cache = new Cache<string, string>({
     *  revalidate: async (key) => fetch(`https://api.acme.co/${key}`),
     * });
     *
     * await cache.revalidate("foo");
     * ```
     *
     * @param key They key of the value to revalidate.
     * @param options Options for revalidation, see `RevalidateOptions`.
     */
    public readonly revalidate = async (
        key: K,
        options?: RevalidateOptions<K, V>
    ): Promise<void> => {
        const revalidators = options?.revalidate
            ? Array.isArray(options.revalidate)
                ? options.revalidate
                : [options.revalidate]
            : this.revalidators;

        if (!revalidators.length)
            throw new Error(
                "When calling `Cache.revalidate`, at least one `revalidate` function must be provided in the constructor or passed when calling `Cache.revalidate`."
            );

        let value: V | undefined = undefined;
        for (const revalidator of revalidators) {
            value = await revalidator(key);
            if (value) break;
        }

        // If a value was returned, update the cache.
        if (value) this.set(key, value);

        // If no value was returned, delete the item from the cache.
        if (!value) this.delete(key);
    };

    /**
     * Set or overwrite a cached value by its key.
     * @param key The key under which to store the value.
     * @param value The value to store.
     * @returns `CacheItem` containing the stored value.
     */
    public readonly set = (key: K, value: V) => {
        // If a `maxSize` is set and the cache is full, delete all items
        // past their TTL and insert the value.
        if (this.maxSize && this.cache.size >= this.maxSize) {
            // This is the most compute friendly solution. For identifying
            // the single last recently used item, we would need to iterate
            // through the map anyway. Like this, we free up even more items
            // that would be evicted on the next `cache.set` call.
            let lru: [K, CacheItem<V>] | undefined = undefined;
            for (const [key, item] of this.cache.entries()) {
                if (!lru || item.start < lru[1].start) lru = [key, item];

                if (item.start + item.ttl < new Date().getTime())
                    this.cache.delete(key);
            }

            if (lru) this.cache.delete(lru[0]);
        }

        const item: CacheItem<V> = {
            start: new Date().getTime(),
            ttl: this.ttl,
            value,
        };

        return this.cache.set(key, item).get(key);
    };

    /**
     * Retrieve a value from the cache by its key.
     *
     * If the cache is missed and the `resolve` function is provided, the value
     * will be resolved via the provded function and stored inside the cache.
     *
     * @param key The key of the value to retrieve.
     * @param options Options for revalidation, see `ResolveOptions`.
     * @returns The resolved value or undefined.
     */
    public readonly get = async (key: K, options?: ResolveOptions<K, V>) => {
        let hit: CacheItem<V> | undefined = undefined;
        hit = this.cache.get(key);

        // Purge the item from cache if its TTL has expired.
        if (hit && hit.start + hit.ttl < new Date().getTime()) {
            this.delete(key);
            hit = undefined;
        }

        const resolvers = options?.resolve
            ? Array.isArray(options.resolve)
                ? options.resolve
                : [options.resolve]
            : this.resolvers;

        // If the cache is missed and one or more `resolve` functions are
        // provided, resolve the value and store it inside the cache.
        if (!hit && resolvers.length) {
            for (const resolver of resolvers) {
                const value = await resolver(key);
                if (value) {
                    hit = this.set(key, value);
                    break;
                }
            }
        }

        if (hit && this.resetTtlOnGet) {
            this.set(key, hit.value);
        }

        // If the cache is hit and `revalidateOnGet` is set, revalidate the
        // value. Values resolved by a `resolve` function are not revalidated
        // as they are assumed to be fresh.
        if (hit && this.revalidateOnGet && !resolvers.length) {
            // We are not using `await` here because we don't want to delay
            // the response while the cache is being revalidated.
            //
            // IMPORTANT: When running inside a worker, the thread might be
            // terminated before the revalidation is complete. In this case,
            // use an implementation of `waitUntil` to ensure the revalidation.
            this.revalidate(key);
        }

        return hit?.value || undefined;
    };

    /**
     * Delete a value from the cache by its key.
     * @param key The key of the value to delete.
     * @returns `void`.
     */
    public readonly delete = (key: K): void => {
        this.cache.delete(key);
    };
}

export default Cache;
