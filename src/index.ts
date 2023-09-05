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
     * This is useful when caching third party API calls where you always
     * expect a value to be returned.
     *
     * Promise rejections are handled gracefully and will not throw an error.
     * Instead, `undefined` will be returned.
     *
     * @param key The key of the resource to resolve.
     * @returns The value to store in the cache.
     */
    resolve?: (key: K) => Promise<V | undefined>;

    /**
     * If given, this function is called every time an item is retrieved from
     * the cache. If it returns a value, that value is written to the cache.
     *
     * This is useful when using a cache with a long TTL, but you want to verify
     * the validity of the cached value after retrieved.
     *
     * One example would be a cache of user permissions. Here, the first hit
     * would return stale data that is then revalidated in the background.
     * If deemed invalid (`undefined` is returned), the item will be deleted
     * from the cache.
     *
     * Promise rejections are handled gracefully and will not throw an error.
     * Instead, the item will be deleted from the cache.
     *
     * @param key The key of the resource that has been retrieved.
     * @returns The value to write to the cache, or `undefined` to delete the
     * item from the cache.
     */
    revalidate?: (key: K) => Promise<V | undefined>;
}

interface CacheItem<V> {
    start: number;
    ttl: number;
    value: V;
}

export class Cache<K, V> {
    private readonly cache = new Map<K, CacheItem<V>>();

    public readonly ttl: CacheOptions<K, V>["ttl"];
    public readonly maxSize: CacheOptions<K, V>["maxSize"];
    public readonly resetTtlOnGet: CacheOptions<K, V>["resetTtlOnGet"];
    public readonly revalidateOnGet: CacheOptions<K, V>["revalidateOnGet"];

    private readonly resolve: CacheOptions<K, V>["resolve"];
    private readonly revalidateFunction: CacheOptions<K, V>["revalidate"];

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
        this.resolve = options.resolve;
        this.revalidateFunction = options.revalidate;
    }

    public readonly revalidate = async (key: K) => {
        if (!this.revalidateFunction)
            throw new Error(
                "When calling `Cache.revalidate`, a `revalidate` function must be provided in the constructor."
            );

        // TODO: Don't silently handle errors.
        const value = await this.revalidateFunction(key).catch(() => undefined);

        // If a value was returned, update the cache.
        if (value) this.set(key, value);

        // If no value was returned, delete the item from the cache.
        if (!value) this.delete(key);
    };

    /**
     * Set or overwrite value in the cache by its key.
     * @param key The key under which to store the value.
     * @param value The value to store.
     * @returns `CacheItem` containing the stored value.
     */
    public readonly set = (key: K, value: V) => {
        // If a `maxSize` is set and the cache is full, delete all items
        // past their TTL and insert the value.
        console.log(this.cache.size, this.maxSize);
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
     * @returns The resolved value or undefined.
     */
    public readonly get = async (key: K) => {
        let hit: CacheItem<V> | undefined = undefined;
        hit = this.cache.get(key);

        // Purge the item from cache if it's stale.
        if (hit && hit.start + hit.ttl < new Date().getTime()) {
            this.delete(key);
            hit = undefined;
        }

        // If a resolver is provided, use it to fetch the value.
        if (!hit && this.resolve) {
            // TODO: Don't silently handle errors.
            const value = await this.resolve(key).catch(() => undefined);
            if (value) hit = this.set(key, value);
        }

        if (hit && this.resetTtlOnGet) {
            this.set(key, hit.value);
        }

        if (hit && this.revalidateOnGet) {
            // We are not using `await` here because we don't want to block
            // the request while the cache is revalidated.
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
