/**
 * Shared concurrency semaphore — limits concurrent in-flight REST calls to 5.
 * Imported by useHolderConcentration and useWalletCluster.
 */

let _active = 0;
const _queue: Array<() => void> = [];

export async function withSemaphore<T>(fn: () => Promise<T>): Promise<T> {
    if (_active >= 5) {
        await new Promise<void>((resolve) => _queue.push(resolve));
    }
    _active++;
    try {
        return await fn();
    } finally {
        _active--;
        const next = _queue.shift();
        if (next) next();
    }
}
