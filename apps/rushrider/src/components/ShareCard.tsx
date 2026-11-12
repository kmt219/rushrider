/**
 * ShareCard — renders a 1200×630 result card to canvas and offers Copy Image,
 * Share on X, and Copy Link. Shown from the crash/finish overlay.
 */
import type { Badge } from "../game/achievements";
import type { RideSummary } from "../game/engine";
import type { TimeframeId, Track } from "../types";
import { useEffect, useRef, useState } from "react";

interface ShareCardProps {
    track: Track;
    timeframe: TimeframeId;
    summary: RideSummary;
    badges: Badge[];
    closes: number[];
    onClose: () => void;
}

const SHARE_URL = "https://goldrush.dev";

function fmtTimer(s: number): string {
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

function drawCard(
    canvas: HTMLCanvasElement,
    track: Track,
    timeframe: TimeframeId,
    summary: RideSummary,
    badges: Badge[],
    closes: number[]
) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }
    const W = 1200;
    const H = 630;
    const accent = "#00d084";
    const up = summary.finished || closes[closes.length - 1]! >= closes[0]!;

    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, W, H);

    // Faint grid
    ctx.strokeStyle = "rgba(242,242,242,0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
    }
    for (let y = 0; y < H; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    // Sparkline of the ridden track across the lower third
    if (closes.length >= 2) {
        const min = Math.min(...closes);
        const max = Math.max(...closes);
        const range = max - min || 1;
        const top = 380;
        const h = 200;
        ctx.beginPath();
        closes.forEach((c, i) => {
            const x = (i / (closes.length - 1)) * W;
            const y = top + (1 - (c - min) / range) * h;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.strokeStyle = up ? accent : "#ef4444";
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Wordmark
    ctx.font = "800 34px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#f2f2f2";
    ctx.fillText("RUSH", 60, 90);
    ctx.fillStyle = accent;
    ctx.fillText("RIDER", 60 + ctx.measureText("RUSH").width, 90);

    // Ticker + timeframe
    ctx.font = "800 92px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#f2f2f2";
    ctx.fillText(track.symbol, 60, 210);
    ctx.font = "500 30px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#888888";
    ctx.fillText(`${track.name} · ${timeframe}`, 60, 252);

    // Score
    ctx.font = "800 130px 'JetBrains Mono', monospace";
    ctx.fillStyle = accent;
    ctx.fillText(summary.score.toLocaleString("en-US"), 60, 380);
    ctx.font = "500 28px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#888888";
    const scoreW = ctx.measureText(summary.score.toLocaleString("en-US")).width;
    ctx.font = "800 130px 'JetBrains Mono', monospace";
    const bigW = ctx.measureText(summary.score.toLocaleString("en-US")).width;
    ctx.font = "500 28px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#888888";
    ctx.fillText("PTS", 60 + bigW + 16, 380);
    void scoreW;

    // Stat line
    ctx.font = "500 24px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#f2f2f2";
    const stats = [
        summary.finished ? "FINISHED" : "CRASHED",
        `${summary.flips} flips`,
        `${summary.maxAirTime.toFixed(1)}s air`,
        `${summary.milestones}/3 checkpoints`,
        fmtTimer(summary.elapsed),
    ];
    ctx.fillText(stats.join("   ·   "), 62, 440);

    // Badges
    ctx.font = "700 22px 'JetBrains Mono', monospace";
    let bx = 62;
    const by = 510;
    if (badges.length === 0) {
        ctx.fillStyle = "#888888";
        ctx.fillText("NO BADGES — RIDE AGAIN", bx, by + 22);
    } else {
        for (const b of badges.slice(0, 5)) {
            const label = `${b.icon} ${b.label}`;
            const w = ctx.measureText(label).width + 28;
            ctx.fillStyle = "rgba(0,208,132,0.15)";
            ctx.fillRect(bx, by, w, 40);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, w, 40);
            ctx.fillStyle = "#f2f2f2";
            ctx.fillText(label, bx + 14, by + 27);
            bx += w + 14;
        }
    }

    // Footer
    ctx.font = "600 22px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#888888";
    ctx.fillText("POWERED BY ", 60, 600);
    const pw = ctx.measureText("POWERED BY ").width;
    ctx.fillStyle = accent;
    ctx.fillText("GOLDRUSH", 60 + pw, 600);
    ctx.fillStyle = "#888888";
    ctx.textAlign = "right";
    ctx.fillText("ride any chart · stonkrider-style", W - 60, 600);
    ctx.textAlign = "left";
}

export default function ShareCard({ track, timeframe, summary, badges, closes, onClose }: ShareCardProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState<string | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            drawCard(canvas, track, timeframe, summary, badges, closes);
        }
    }, [track, timeframe, summary, badges, closes]);

    const shareText =
        `I scored ${summary.score.toLocaleString("en-US")} pts riding the $${track.symbol} chart on RUSH RIDER 🏍️📈` +
        (badges.length ? ` — ${badges.map((b) => b.label).join(", ")}` : "") +
        `\nRide any crypto chart, powered by GoldRush.`;

    const copyImage = async () => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        try {
            const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
            if (!blob) {
                throw new Error("no blob");
            }
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            setStatus("IMAGE COPIED");
        } catch {
            // Fallback: trigger a download.
            const a = document.createElement("a");
            a.href = canvas.toDataURL("image/png");
            a.download = `rushrider-${track.symbol}-${summary.score}.png`;
            a.click();
            setStatus("IMAGE DOWNLOADED");
        }
    };

    const shareOnX = () => {
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(SHARE_URL)}`;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(SHARE_URL);
            setStatus("LINK COPIED");
        } catch {
            setStatus("COPY FAILED");
        }
    };

    return (
        <div className="share-overlay" onClick={onClose}>
            <div className="share-modal" onClick={(e) => e.stopPropagation()}>
                <canvas ref={canvasRef} width={1200} height={630} className="share-canvas" />
                <div className="share-actions">
                    <button className="share-btn primary" onClick={copyImage}>
                        COPY IMAGE
                    </button>
                    <button className="share-btn" onClick={shareOnX}>
                        SHARE ON X
                    </button>
                    <button className="share-btn" onClick={copyLink}>
                        COPY LINK
                    </button>
                    <button className="share-btn ghost" onClick={onClose}>
                        CLOSE
                    </button>
                </div>
                {status ? <div className="share-status">{status}</div> : null}
            </div>
        </div>
    );
}
