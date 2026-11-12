// Type shim for d3-force — the package ships CJS without bundled .d.ts in some environments.
// Install @types/d3-force to get full typings; this shim keeps the build green in the interim.
declare module "d3-force" {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function forceSimulation<N = any>(nodes?: N[]): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function forceCenter(x?: number, y?: number): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function forceCollide<N = any>(radius?: number | ((node: N) => number)): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function forceManyBody<N = any>(): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function forceLink<N = any, L = any>(links?: L[]): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export type Simulation<N, L> = any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export type SimulationNodeDatum = any;
}

declare module "d3-polygon" {
    export function polygonHull(points: [number, number][]): [number, number][] | null;
    export function polygonContains(polygon: [number, number][], point: [number, number]): boolean;
    export function polygonArea(polygon: [number, number][]): number;
}
