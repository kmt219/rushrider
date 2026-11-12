"use client";

import { SocketClient } from "@/utils/services/socket";
import { createGraphiQLFetcher } from "@graphiql/toolkit";
import { GraphiQL } from "graphiql";
import "graphiql/style.css";
import { print, parse } from "graphql";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export const Giql: React.FC<{ apiKey: string }> = ({ apiKey }) => {
    const searchParams = useSearchParams();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const rawQueryParam = searchParams?.get("query");
    let queryParam: string | null = null;
    if (rawQueryParam) {
        try {
            queryParam = decodeURIComponent(rawQueryParam);
        } catch {
            queryParam = rawQueryParam;
        }
    }
    const readOnlyParam = searchParams?.get("readOnly");
    const fullParam = searchParams?.get("full") === "true";

    const fetcher = createGraphiQLFetcher({
        url: `https://${process.env.NEXT_PUBLIC_WSS_BASE_URL}/graphql`,
        subscriptionUrl: `wss://${process.env.NEXT_PUBLIC_WSS_BASE_URL}/graphql`,
        wsClient: SocketClient.getClient(apiKey),
    });

    useEffect(() => {
        if (fullParam) {
            return;
        }

        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const observer = new MutationObserver(() => {
            // Sidebar
            const sidebar = wrapper.querySelector(".graphiql-sidebar");
            if (sidebar) {
                sidebar.remove();
            }

            // Session Header
            const sessionHeader = wrapper.querySelector(".graphiql-session-header");
            if (sessionHeader) {
                sessionHeader.remove();
            }

            // Sessions
            const sessions = wrapper.querySelector(".graphiql-sessions");
            if (sessions) {
                sessions.setAttribute("style", "margin: 0 !important");
            }

            // Session
            const session = wrapper.querySelector("#graphiql-session");
            if (session) {
                session.setAttribute("style", "padding: 0 !important");
            }

            // Query Editor
            const queryEditor = wrapper.querySelector(".graphiql-query-editor");
            if (queryEditor) {
                queryEditor.setAttribute(
                    "style",
                    "padding: 0 !important; display: flex !important; flex-direction: column !important; height: 100% !important"
                );
            }

            // Toolbar
            const toolbar = wrapper.querySelector(".graphiql-toolbar");
            if (toolbar) {
                toolbar.setAttribute(
                    "style",
                    "display: flex !important; flex-direction: row !important; justify-content: end !important; width: fit-content !important; padding: 4px 8px 4px 0 !important; margin-left: auto !important"
                );

                const buttons = toolbar.querySelectorAll("button");
                for (let i = buttons.length - 1; i > 0; i--) {
                    buttons[i].remove();
                }
            }

            // Editors
            const editors = wrapper.querySelector(".graphiql-editors");
            if (editors) {
                const children = editors.children;
                while (children.length > 1) {
                    editors.removeChild(children[1]);
                }
            }
        });

        observer.observe(wrapper, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [wrapperRef]);

    const handleEditQuery = (newQuery: string) => {
        try {
            const formattedQuery = print(parse(newQuery));
            return formattedQuery;
        } catch (e) {
            return newQuery;
        }
    };

    return (
        <div ref={wrapperRef} className="w-full h-full">
            <GraphiQL
                fetcher={fetcher}
                query={handleEditQuery(
                    queryParam ||
                        "subscription NewPairs {newPairs(chain_name: BASE_MAINNET) {base_token_metadata {contract_address contract_name}}}"
                )}
                isHeadersEditorEnabled={false}
                readOnly={readOnlyParam === "true"}
                defaultTabs={[]}
                defaultEditorToolsVisibility={false}
            />
        </div>
    );
};
