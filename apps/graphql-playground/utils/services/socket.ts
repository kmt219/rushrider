import { Client, createClient } from "graphql-ws";

export class SocketClient {
    private static client: Client | null = null;
    private static connected = false;

    private static reconnectAttempts = 0;
    private static maxReconnectAttempts = 5;

    private constructor() {}

    public static getClient(apiKey: string): Client {
        if (!SocketClient.client || !SocketClient.connected) {
            SocketClient.connect(apiKey);
        }
        return SocketClient.client!;
    }

    private static connect(apiKey: string): void {
        if (SocketClient.client) return;

        SocketClient.client = createClient({
            url: `wss://${process.env.NEXT_PUBLIC_WSS_BASE_URL}/graphql`,
            shouldRetry: () => SocketClient.reconnectAttempts < SocketClient.maxReconnectAttempts,
            connectionParams: {
                GOLDRUSH_API_KEY: apiKey,
            },
            on: {
                connecting: () => {
                    console.info("⏳ WebSocket Connection Established Connecting!");
                },
                opened: () => {
                    console.info("✅ WebSocket Connection Established Successfully!");
                    SocketClient.reconnectAttempts = 0;
                    SocketClient.connected = true;
                },
                closed: () => {
                    console.info("❌ WebSocket Connection Closed");
                    SocketClient.connected = false;
                },
                error: (err) => {
                    console.error("⚠️ WebSocket Connection Error:", err);
                    SocketClient.connected = false;
                },
            },
        });
    }

    public static get isConnected(): boolean {
        return SocketClient.connected;
    }

    public static disconnect(): void {
        if (!SocketClient.client) return;

        SocketClient.client.dispose();
        SocketClient.client = null;
        SocketClient.connected = false;
    }
}
