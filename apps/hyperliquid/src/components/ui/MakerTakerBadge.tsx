interface MakerTakerBadgeProps {
    crossed: boolean;
}

export function MakerTakerBadge({ crossed }: MakerTakerBadgeProps) {
    return <span className={`badge ${crossed ? "badge--taker" : "badge--maker"}`}>{crossed ? "TAKER" : "MAKER"}</span>;
}
