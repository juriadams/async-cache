import { describe, it, expect } from "vitest";

import Cache from "../src";

describe("basic operations", () => {
    it("should write and read a value", async () => {
        const cache = new Cache<string, string>({
            ttl: 1000,
        });

        cache.set("foo", "bar");

        const value = await cache.get("foo");

        expect(value).toBe("bar");
    });

    it("should return the correct cache size", async () => {
        const cache = new Cache<string, string>({
            ttl: 1000,
        });

        cache.set("foo", "bar");
        expect(cache.size).toBe(1);

        cache.set("baz", "qux");
        expect(cache.size).toBe(2);
    });
});

describe("ttl", () => {
    it("should delete a value after its ttl", async () => {
        const cache = new Cache<string, string>({
            ttl: 5,
        });

        cache.set("foo", "bar");

        await new Promise((resolve) => setTimeout(resolve, 10));

        const value = await cache.get("foo");

        expect(value).toBeUndefined();
    });

    it("should reset the ttl of a value upon retrieval", async () => {
        const cache = new Cache<string, string>({
            ttl: 20,
            resetTtlOnGet: true,
        });

        cache.set("foo", "bar");

        await new Promise((resolve) => setTimeout(resolve, 10));

        // This `get` should reset the ttl.
        await cache.get("foo");

        // After a total of 25ms, the value should still be in the cache.
        await new Promise((resolve) => setTimeout(resolve, 15));

        const value = await cache.get("foo");

        expect(value).toBe("bar");
    });
});

describe("maximum size", () => {
    it("should respect the maximum size", async () => {
        const cache = new Cache<string, string>({
            ttl: 1000 * 10,
            maxSize: 3,
        });

        cache.set("1", "foo");
        cache.set("2", "bar");
        cache.set("3", "baz");

        expect(cache.size).toBe(3);

        cache.set("4", "qux");

        expect(cache.size).toBe(3);

        // Make sure the item added first was removed.
        expect(await cache.get("1")).toBeUndefined();
    });

    it("should evict all items past their ttl", async () => {
        const cache = new Cache<string, string>({
            ttl: 5,
            maxSize: 3,
        });

        cache.set("1", "foo");
        cache.set("2", "bar");
        cache.set("3", "baz");

        expect(cache.size).toBe(3);

        await new Promise((resolve) => setTimeout(resolve, 10));

        cache.set("4", "qux");

        // Make sure all items past their ttl were removed.
        expect(cache.size).toBe(1);
        expect(await cache.get("4")).toBe("qux");
    });
});

describe("resolving", () => {
    it("should resolve a missed value", async () => {
        const cache = new Cache<string, string>({
            ttl: 1000,
            resolve: async () => "bar",
        });

        const value = await cache.get("foo");

        expect(value).toBe("bar");
    });
});

describe("revalidation", () => {
    it("should resolve a missed value", async () => {
        const cache = new Cache<string, string>({
            ttl: 1000,
            revalidate: async () => "baz",
            revalidateOnGet: true,
        });

        cache.set("foo", "bar");

        expect(await cache.get("foo")).toBe("bar");

        // Wait for the asynchronous revalidation to complete.
        await new Promise((resolve) => setTimeout(resolve, 10));

        // After retrieving the value once, it should be revalidated and now
        // return the new value.
        expect(await cache.get("foo")).toBe("baz");
    });

    it("should delete values failing revalidation", async () => {
        const cache = new Cache<string, string>({
            ttl: 1000,
            revalidate: async () => undefined,
            revalidateOnGet: true,
        });

        cache.set("foo", "bar");

        expect(await cache.get("foo")).toBe("bar");

        // Wait for the asynchronous revalidation to complete.
        await new Promise((resolve) => setTimeout(resolve, 10));

        // After retrieving the value once, it should be revalidated and cleared
        // from the cache.
        expect(await cache.get("foo")).toBeUndefined();
    });

    it("should throw an error if no `revalidate` function is passed", async () => {
        const cache = new Cache<string, string>({
            ttl: 1000,
        });

        cache.set("foo", "bar");

        try {
            await cache.revalidate("foo");

            // Wait for the revalidation attempt to fail.
            await new Promise((resolve) => setTimeout(resolve, 10));
        } catch (error) {
            expect(error.message).toBe(
                "When calling `Cache.revalidate`, a `revalidate` function must be provided in the constructor."
            );
        }
    });
});
