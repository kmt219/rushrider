import { useRef, useEffect, useState } from "react";

interface FlashValueProps {
    value: number;
    children: React.ReactNode;
    className?: string;
}

export function FlashValue({ value, children, className = "" }: FlashValueProps) {
    const prevRef = useRef(value);
    const [flash, setFlash] = useState<"" | "flash-value--up" | "flash-value--down">("");

    useEffect(() => {
        if (prevRef.current !== value) {
            setFlash(value > prevRef.current ? "flash-value--up" : "flash-value--down");
            prevRef.current = value;
            const timer = setTimeout(() => setFlash(""), 600);
            return () => clearTimeout(timer);
        }
    }, [value]);

    return <span className={`flash-value ${flash} ${className}`}>{children}</span>;
}
