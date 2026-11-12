interface LiqBadgeProps {
    method: "liquidation" | "backstop";
}

export function LiqBadge({ method }: LiqBadgeProps) {
    return (
        <span className={`badge ${method === "backstop" ? "badge--backstop" : "badge--liq"}`}>
            {method === "backstop" ? "BACKSTOP" : "LIQ"}
        </span>
    );
}
