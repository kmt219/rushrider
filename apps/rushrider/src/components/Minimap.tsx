/** Tiny canvas minimap — whole track polyline + rider position dot. */
import type { Terrain } from "../lib/terrain";
import { useEffect, useRef } from "react";

interface MinimapProps {
    terrain: Terrain;
    /** rider x position in world coords */
    riderX: number;
    riderY: number;
}

const W = 190;
const H = 64;

export default function Minimap({ terrain, riderX, riderY }: MinimapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) {
            return;
        }
        const pts = terrain.points;
        const x0 = pts[0]!.x;
        const x1 = pts[pts.length - 1]!.x;
        const spanX = x1 - x0 || 1;
        const spanY = terrain.maxY - terrain.minY || 1;
        const pad = 8;
        const sx = (x: number) => pad + ((x - x0) / spanX) * (W - pad * 2);
        const sy = (y: number) => pad + ((y - terrain.minY) / spanY) * (H - pad * 2);

        ctx.clearRect(0, 0, W, H);
        ctx.strokeStyle = "rgba(242,242,242,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx(pts[0]!.x), sy(pts[0]!.y));
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(sx(pts[i]!.x), sy(pts[i]!.y));
        }
        ctx.stroke();

        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(
            sx(Math.max(x0, Math.min(x1, riderX))),
            sy(Math.max(terrain.minY, Math.min(terrain.maxY, riderY))),
            3.5,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }, [terrain, riderX, riderY]);

    return <canvas ref={canvasRef} width={W} height={H} className="minimap" />;
}
