/** localStorage-backed global stat counters shown on the landing page. */
export interface GlobalStats {
    rides: number;
    crashes: number;
    dollars: number;
}

const KEY = "rushrider:stats";
const BEST_KEY = "rushrider:best";

export function loadStats(): GlobalStats {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<GlobalStats>;
            return { rides: parsed.rides ?? 0, crashes: parsed.crashes ?? 0, dollars: parsed.dollars ?? 0 };
        }
    } catch {
        /* ignore */
    }
    return { rides: 0, crashes: 0, dollars: 0 };
}

function save(stats: GlobalStats) {
    try {
        localStorage.setItem(KEY, JSON.stringify(stats));
    } catch {
        /* storage full */
    }
}

export function recordRide(score: number): GlobalStats {
    const stats = loadStats();
    stats.rides += 1;
    stats.dollars += score;
    save(stats);
    return stats;
}

export function recordCrash(score: number): GlobalStats {
    const stats = loadStats();
    stats.crashes += 1;
    stats.dollars += Math.floor(score / 2);
    save(stats);
    return stats;
}

export function bestScoreFor(trackKey: string): number {
    try {
        const raw = localStorage.getItem(BEST_KEY);
        if (raw) {
            const map = JSON.parse(raw) as Record<string, number>;
            return map[trackKey] ?? 0;
        }
    } catch {
        /* ignore */
    }
    return 0;
}

export function recordBestScore(trackKey: string, score: number): boolean {
    const prev = bestScoreFor(trackKey);
    if (score <= prev) {
        return false;
    }
    try {
        const raw = localStorage.getItem(BEST_KEY);
        const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
        map[trackKey] = score;
        localStorage.setItem(BEST_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
    return true;
}
