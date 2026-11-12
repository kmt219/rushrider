/**
 * render.ts — retro Canvas 2D renderer. Draws the glowing terrain line, the
 * wireframe bike + stick rider, grid backdrop, and floating trick callouts.
 */
import { terrainYAt } from "../lib/terrain";
import type { Terrain } from "../lib/terrain";
import type { BikeSnapshot } from "./engine";

export interface Callout {
    label: string;
    points: number;
    x: number;
    y: number;
    age: number; // seconds
}

export interface RenderTheme {
    bg: string;
    grid: string;
    terrain: string;
    terrainFill: string;
    bike: string;
    tire: string;
    rider: string;
    helmet: string;
    text: string;
    callout: string;
}

export const DEFAULT_THEME: RenderTheme = {
    bg: "#111111",
    grid: "rgba(242, 242, 242, 0.045)",
    terrain: "#00d084",
    terrainFill: "rgba(0, 208, 132, 0.07)",
    bike: "#d4d4d4",
    tire: "#2b2b2b",
    rider: "#ececec",
    helmet: "#e74c3c",
    text: "#f2f2f2",
    callout: "#3da9fc",
};

export interface Camera {
    x: number;
    y: number;
}

export function updateCamera(camera: Camera, bike: BikeSnapshot, width: number, height: number, dt: number): void {
    const targetX = bike.chassis.x - width * 0.38;
    const targetY = bike.chassis.y - height * 0.52;
    const k = 1 - Math.pow(0.0015, dt);
    camera.x += (targetX - camera.x) * k;
    camera.y += (targetY - camera.y) * k;
}

function drawWheel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    angle: number,
    rim: string,
    tire: string
) {
    // Knobby tire — thick dark ring.
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = tire;
    ctx.stroke();
    // Rim.
    ctx.beginPath();
    ctx.arc(x, y, r - 4, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rim;
    ctx.stroke();
    // Spokes rotate with the wheel so speed reads visually.
    ctx.lineWidth = 1;
    ctx.strokeStyle = rim;
    for (let s = 0; s < 6; s++) {
        const a = angle + (s * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4));
        ctx.stroke();
    }
    // Hub.
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();
}

export function drawFrame(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    camera: Camera,
    terrain: Terrain,
    bike: BikeSnapshot,
    callouts: Callout[],
    theme: RenderTheme,
    trackUp: boolean
): void {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);

    // ── Retro grid ──
    const gridSize = 90;
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    const gx0 = Math.floor(camera.x / gridSize) * gridSize;
    const gy0 = Math.floor(camera.y / gridSize) * gridSize;
    ctx.beginPath();
    for (let gx = gx0; gx < camera.x + width + gridSize; gx += gridSize) {
        ctx.moveTo(gx - camera.x, 0);
        ctx.lineTo(gx - camera.x, height);
    }
    for (let gy = gy0; gy < camera.y + height + gridSize; gy += gridSize) {
        ctx.moveTo(0, gy - camera.y);
        ctx.lineTo(width, gy - camera.y);
    }
    ctx.stroke();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // ── Terrain: fill below, then glowing line ──
    // Cull to the visible window — tracks can be 2,000+ segments and a glowing
    // stroke over all of them every frame would tank FPS. Points are sorted by x.
    const pts = terrain.points;
    const terrainColor = trackUp ? theme.terrain : "#ef4444";
    const left = camera.x - 120;
    const right = camera.x + width + 120;
    let i0 = 0;
    while (i0 < pts.length - 1 && pts[i0 + 1]!.x < left) {
        i0++;
    }
    let i1 = pts.length - 1;
    while (i1 > 0 && pts[i1 - 1]!.x > right) {
        i1--;
    }

    const fillBottom = terrain.maxY + 2_000;
    ctx.beginPath();
    ctx.moveTo(pts[i0]!.x, pts[i0]!.y);
    for (let i = i0 + 1; i <= i1; i++) {
        ctx.lineTo(pts[i]!.x, pts[i]!.y);
    }
    ctx.lineTo(pts[i1]!.x, fillBottom);
    ctx.lineTo(pts[i0]!.x, fillBottom);
    ctx.closePath();
    ctx.fillStyle = theme.terrainFill;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(pts[i0]!.x, pts[i0]!.y);
    for (let i = i0 + 1; i <= i1; i++) {
        ctx.lineTo(pts[i]!.x, pts[i]!.y);
    }
    ctx.strokeStyle = terrainColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = terrainColor;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── START marker + finish flag ──
    ctx.fillStyle = theme.text;
    ctx.font = "12px 'JetBrains Mono', monospace";
    ctx.fillText("START", terrain.chartStartX - 18, terrain.startY - 16);

    const endY = pts[pts.length - 1]!.y;
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(terrain.finishX, endY);
    ctx.lineTo(terrain.finishX, endY - 56);
    ctx.stroke();
    ctx.fillStyle = terrainColor;
    ctx.fillRect(terrain.finishX, endY - 56, 30, 18);

    // ── Milestone checkpoints (equally spaced) — only the visible ones ──
    ctx.font = "11px 'JetBrains Mono', monospace";
    terrain.milestones.forEach((mx, i) => {
        if (mx < left || mx > right) {
            return;
        }
        const my = terrainYAt(terrain, mx);
        ctx.strokeStyle = "rgba(245, 158, 11, 0.7)"; // warning amber
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx, my - 70);
        ctx.stroke();
        ctx.setLineDash([]);
        // pennant
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.moveTo(mx, my - 70);
        ctx.lineTo(mx + 22, my - 64);
        ctx.lineTo(mx, my - 58);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#06140e";
        ctx.fillText(`${i + 1}`, mx + 5, my - 61);
    });

    // ── Bike ──
    const { rearWheel, frontWheel, chassis, head } = bike;

    // Local→world transform in the chassis frame: f = forward (toward front
    // wheel), u = up (away from ground when upright). Canvas y grows down.
    const cos = Math.cos(chassis.angle);
    const sin = Math.sin(chassis.angle);
    const cx = chassis.x;
    const cy = chassis.y;
    const P = (f: number, u: number) => ({ x: cx + f * cos + u * sin, y: cy + f * sin - u * cos });

    // Key body points.
    const steer = P(26, 9); // steering head (top of fork)
    const peg = P(-4, -10); // foot peg / lower engine
    const tail = P(-22, 3); // rear of seat / tail
    const seatBack = P(-12, 11);
    const tankFront = P(8, 11);
    const bar = P(33, 19); // handlebar grip

    // Wheels first so the frame overlaps them cleanly.
    drawWheel(ctx, rearWheel.x, rearWheel.y, 20, rearWheel.angle, theme.bike, theme.tire);
    drawWheel(ctx, frontWheel.x, frontWheel.y, 20, frontWheel.angle, theme.bike, theme.tire);

    // Swingarm + lower frame + fork (metal).
    ctx.strokeStyle = theme.bike;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(rearWheel.x, rearWheel.y);
    ctx.lineTo(peg.x, peg.y);
    ctx.lineTo(steer.x, steer.y);
    ctx.lineTo(frontWheel.x, frontWheel.y);
    ctx.stroke();

    // Frame triangle (red accent).
    ctx.strokeStyle = theme.helmet;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(peg.x, peg.y);
    ctx.lineTo(seatBack.x, seatBack.y);
    ctx.lineTo(steer.x, steer.y);
    ctx.stroke();

    // Seat + tank as one thick rounded bar.
    ctx.strokeStyle = theme.helmet;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(tankFront.x, tankFront.y);
    ctx.stroke();
    ctx.lineCap = "butt";

    // Handlebar riser.
    ctx.strokeStyle = theme.bike;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(steer.x, steer.y);
    ctx.lineTo(bar.x, bar.y);
    ctx.stroke();

    // ── Rider ──
    const hip = P(-6, 13);
    const knee = P(8, 4);
    const shoulder = { x: head.x + (hip.x - head.x) * 0.32, y: head.y + (hip.y - head.y) * 0.32 };
    ctx.strokeStyle = theme.rider;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y); // torso
    ctx.lineTo(head.x, head.y);
    ctx.moveTo(shoulder.x, shoulder.y); // arm to bar
    ctx.lineTo(bar.x, bar.y);
    ctx.moveTo(hip.x, hip.y); // bent leg to peg
    ctx.lineTo(knee.x, knee.y);
    ctx.lineTo(peg.x, peg.y);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";

    // Helmet + forward visor.
    ctx.fillStyle = theme.helmet;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(chassis.angle);
    ctx.fillStyle = "#141414";
    ctx.fillRect(1, -3.5, 7, 4);
    ctx.restore();

    // ── Floating callouts ──
    ctx.font = "bold 20px 'JetBrains Mono', monospace";
    for (const c of callouts) {
        const alpha = Math.max(0, 1 - c.age / 1.6);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.callout;
        ctx.fillText(`${c.label} +${c.points}`, c.x, c.y - c.age * 40);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
}
