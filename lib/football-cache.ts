import { redis } from "@/lib/redis";

export type FootballCacheEnvelope<T> = {
  value: T;
  updatedAt: string;
  freshUntil: number;
  staleUntil: number;
};

export type FootballCacheState<T> =
  | {
      status: "miss";
      value: null;
    }
  | {
      status: "fresh";
      value: FootballCacheEnvelope<T>;
    }
  | {
      status: "stale";
      value: FootballCacheEnvelope<T>;
    };

export async function readFootballCache<T>(
  key: string,
): Promise<FootballCacheState<T>> {
  if (!redis) {
    return { status: "miss", value: null };
  }

  try {
    const cached = await redis.get<FootballCacheEnvelope<T>>(key);

    if (!cached) {
      return { status: "miss", value: null };
    }

    if (cached.freshUntil > Date.now()) {
      return { status: "fresh", value: cached };
    }

    if (cached.staleUntil > Date.now()) {
      return { status: "stale", value: cached };
    }

    return { status: "miss", value: null };
  } catch (error) {
    console.error("Football cache read failed:", error);
    return { status: "miss", value: null };
  }
}

export async function writeFootballCache<T>(
  key: string,
  value: T,
  freshForMs: number,
  staleForMs: number,
) {
  if (!redis) {
    return null;
  }

  const now = Date.now();
  const envelope: FootballCacheEnvelope<T> = {
    value,
    updatedAt: new Date(now).toISOString(),
    freshUntil: now + freshForMs,
    staleUntil: now + staleForMs,
  };

  try {
    await redis.set(key, envelope, {
      ex: Math.ceil(staleForMs / 1000),
    });

    return envelope;
  } catch (error) {
    console.error("Football cache write failed:", error);
    return null;
  }
}

export async function acquireFootballRefreshLock(
  key: string,
  lockForSeconds = 20,
) {
  if (!redis) {
    return true;
  }

  try {
    const result = await redis.set(key, "1", {
      nx: true,
      ex: lockForSeconds,
    });

    return result === "OK";
  } catch (error) {
    console.error("Football cache lock failed:", error);
    return true;
  }
}

export async function releaseFootballRefreshLock(key: string) {
  if (!redis) {
    return;
  }

  try {
    await redis.del(key);
  } catch (error) {
    console.error("Football cache unlock failed:", error);
  }
}