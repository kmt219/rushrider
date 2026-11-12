import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

interface CityTime {
    city: string;
    tz: string;
    abbr: string;
}

const CITIES: CityTime[] = [
    { city: "Vancouver", tz: "America/Vancouver", abbr: "PST" },
    { city: "New York", tz: "America/New_York", abbr: "EST" },
    { city: "London", tz: "Europe/London", abbr: "GMT" },
    { city: "Dubai", tz: "Asia/Dubai", abbr: "GST" },
    { city: "Mumbai", tz: "Asia/Kolkata", abbr: "IST" },
    { city: "Hong Kong", tz: "Asia/Hong_Kong", abbr: "HKT" },
];

function formatTime(tz: string): string {
    return new Date().toLocaleTimeString("en-US", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function isMarketOpen(tz: string): boolean {
    const now = new Date();
    const hour = parseInt(now.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false }));
    const day = new Date(now.toLocaleString("en-US", { timeZone: tz })).getDay();
    return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

export function WorldClock() {
    const [, setTick] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 10_000);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="sidebar-panel">
            <div className="sidebar-panel-header">
                <Clock size={11} />
                <span>World Clock</span>
            </div>
            <div className="world-clock-grid">
                {CITIES.map((c) => {
                    const open = isMarketOpen(c.tz);
                    return (
                        <div key={c.city} className="world-clock-row">
                            <div className="world-clock-city">
                                <span
                                    className={`world-clock-dot ${open ? "world-clock-dot--open" : "world-clock-dot--closed"}`}
                                />
                                {c.city}
                            </div>
                            <div className="world-clock-time">{formatTime(c.tz)}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
