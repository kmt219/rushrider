import { useState, useEffect } from "react";

type Channel = "Bloomberg" | "CNBC" | "CNN" | "Al Jazeera";

const CHANNELS: { key: Channel; youtubeId: string }[] = [
    { key: "Bloomberg", youtubeId: "iEpJwprxDdk" },
    { key: "CNBC", youtubeId: "9NyxcX3rhQs" },
    { key: "CNN", youtubeId: "w_Ma8oQLmSM" },
    { key: "Al Jazeera", youtubeId: "gCNeDWCI0vo" },
];

export function LiveTV() {
    const [channel, setChannel] = useState<Channel>("Bloomberg");
    const [playing, setPlaying] = useState(false);

    const activeChannel = CHANNELS.find((ch) => ch.key === channel)!;

    useEffect(() => {
        setPlaying(false);
    }, [channel]);

    return (
        <div className="live-tv">
            <div className="live-tv-header">
                <div className="live-tv-title">
                    <span className="live-tv-dot" />
                    LIVE
                </div>
                <div className="live-tv-tabs">
                    {CHANNELS.map((ch) => (
                        <button
                            key={ch.key}
                            className={`live-tv-tab ${channel === ch.key ? "live-tv-tab--active" : ""}`}
                            onClick={() => setChannel(ch.key)}
                        >
                            {ch.key}
                        </button>
                    ))}
                </div>
            </div>
            <div className="live-tv-viewport">
                {playing ? (
                    <iframe
                        className="live-tv-iframe"
                        src={`https://www.youtube.com/embed/${activeChannel.youtubeId}?autoplay=1&mute=1`}
                        allow="autoplay; encrypted-media"
                        allowFullScreen
                        title={activeChannel.key}
                    />
                ) : (
                    <button
                        className="live-tv-play-overlay"
                        onClick={() => setPlaying(true)}
                        aria-label={`Play ${activeChannel.key} live stream`}
                    >
                        <div className="live-tv-play-icon">▶</div>
                        <div className="live-tv-play-label">{activeChannel.key} — Click to play</div>
                    </button>
                )}
            </div>
        </div>
    );
}
