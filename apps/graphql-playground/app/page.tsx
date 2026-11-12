"use client";

import { Hero } from "@/components/hero";
import { Suspense } from "react";

export default function Home() {
    return (
        <Suspense>
            <Hero />
        </Suspense>
    );
}
