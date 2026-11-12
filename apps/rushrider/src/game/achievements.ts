/**
 * achievements.ts — pure badge logic. Given a RideSummary, return the badges
 * earned this ride. Used on the finish/crash overlay and the shareable card.
 */
import type { RideSummary } from "./engine";

export interface Badge {
    id: string;
    label: string;
    icon: string; // single emoji/char drawn on the card
    desc: string;
}

const ALL_BADGES: Array<{ badge: Badge; earned: (s: RideSummary) => boolean }> = [
    {
        badge: { id: "finisher", label: "FINISHER", icon: "🏁", desc: "Reached the finish flag" },
        earned: (s) => s.finished,
    },
    {
        badge: { id: "checkpoints", label: "TRAILBLAZER", icon: "🚩", desc: "Cleared all 3 checkpoints" },
        earned: (s) => s.milestones >= 3,
    },
    {
        badge: { id: "flipper", label: "FLIP MASTER", icon: "🤸", desc: "Landed a flip" },
        earned: (s) => s.flips >= 1,
    },
    {
        badge: { id: "bigair", label: "BIG AIR", icon: "🪂", desc: "2s+ airtime" },
        earned: (s) => s.maxAirTime >= 2,
    },
    {
        badge: { id: "highroller", label: "HIGH ROLLER", icon: "💎", desc: "2,000+ points" },
        earned: (s) => s.score >= 2000,
    },
    {
        badge: { id: "moonshot", label: "MOONSHOT", icon: "🚀", desc: "5,000+ points" },
        earned: (s) => s.score >= 5000,
    },
];

export function earnedBadges(summary: RideSummary): Badge[] {
    return ALL_BADGES.filter((b) => b.earned(summary)).map((b) => b.badge);
}
