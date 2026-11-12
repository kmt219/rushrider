import Landing from "./components/Landing";
import Ride from "./components/Ride";
import TrackDetail from "./components/TrackDetail";
import { DEFAULT_CHAIN_GQL } from "./lib/chains";
import { createHardenedClient } from "./lib/wsClient";
import type { StreamClient } from "./lib/wsClient";
import type { OHLCVCandle, TimeframeId, Track } from "./types";
import { useEffect, useMemo, useRef, useState } from "react";

interface AppProps {
    apiKey: string;
    streamUrl: string;
}

type Screen =
    | { name: "home" }
    | { name: "detail"; track: Track }
    | { name: "ride"; track: Track; timeframe: TimeframeId; candles: OHLCVCandle[]; smooth: boolean };

export default function App({ apiKey, streamUrl }: AppProps) {
    const [screen, setScreen] = useState<Screen>({ name: "home" });
    const [chainGql, setChainGql] = useState<string>(() => {
        try {
            return localStorage.getItem("rushrider:chain") ?? DEFAULT_CHAIN_GQL;
        } catch {
            return DEFAULT_CHAIN_GQL;
        }
    });

    // One hardened graphql-ws client for the whole app lifetime.
    const clientRef = useRef<StreamClient | null>(null);
    const client = useMemo(() => {
        clientRef.current?.dispose();
        clientRef.current = createHardenedClient(streamUrl, apiKey, "RUSHRIDER");
        return clientRef.current;
    }, [apiKey, streamUrl]);

    useEffect(() => {
        return () => {
            clientRef.current?.dispose();
            clientRef.current = null;
        };
    }, []);

    const selectChain = (gql: string) => {
        setChainGql(gql);
        try {
            localStorage.setItem("rushrider:chain", gql);
        } catch {
            /* ignore */
        }
    };

    if (screen.name === "ride") {
        return (
            <Ride
                track={screen.track}
                timeframe={screen.timeframe}
                candles={screen.candles}
                smooth={screen.smooth}
                onExit={() => setScreen({ name: "detail", track: screen.track })}
            />
        );
    }

    if (screen.name === "detail") {
        return (
            <TrackDetail
                client={client}
                track={screen.track}
                onHome={() => setScreen({ name: "home" })}
                onRide={(timeframe, candles, smooth) =>
                    setScreen({ name: "ride", track: screen.track, timeframe, candles, smooth })
                }
            />
        );
    }

    return (
        <Landing
            client={client}
            chainGql={chainGql}
            onSelectChain={selectChain}
            onSelectTrack={(track) => setScreen({ name: "detail", track })}
        />
    );
}
