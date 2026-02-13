"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { DevtoolsPanel, useAIDevtools } from "@ai-sdk-tools/devtools";

const DEVTOOLS_POSITION_KEY = "openfolio-devtools-position";

type Position = { x: number; y: number };

function loadStoredPosition(): Position {
  if (typeof window === "undefined") return { x: 24, y: 80 };
  try {
    const raw = window.localStorage.getItem(DEVTOOLS_POSITION_KEY);
    if (!raw) return { x: 24, y: 80 };
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.x === "number" &&
      typeof parsed?.y === "number"
    ) {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // Ignore storage errors and fall back to defaults
  }
  return { x: 24, y: 80 };
}

function useDraggable(enabled: boolean) {
  const [position, setPosition] = useState<Position>(() => loadStoredPosition());
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    try {
      window.localStorage.setItem(
        DEVTOOLS_POSITION_KEY,
        JSON.stringify(position)
      );
    } catch {
      // Ignore storage errors
    }
  }, [enabled, position]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    event.preventDefault();
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || !dragStateRef.current) return;
    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;
    setPosition({
      x: Math.max(0, dragStateRef.current.originX + deltaX),
      y: Math.max(0, dragStateRef.current.originY + deltaY),
    });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    position,
    bind: enabled
      ? { onPointerDown, onPointerMove, onPointerUp }
      : {},
  };
}

export function PlanDebugTools() {
  const isDev = process.env.NODE_ENV === "development";
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<"bottom" | "right">(
    "bottom"
  );

  const canShow = isDev;

  const { events, isCapturing, clearEvents, toggleCapturing } = useAIDevtools({
    enabled: canShow,
    maxEvents: 1000,
    streamCapture: {
      enabled: true,
      endpoints: ["/api/agent"],
      autoConnect: true,
    },
  });

  const config = useMemo(
    () => ({
      enabled: true,
      maxEvents: 1000,
      position: panelPosition,
      height: 320,
      width: 500,
      streamCapture: {
        enabled: true,
        endpoint: "/api/agent",
        autoConnect: true,
      },
    }),
    [panelPosition]
  );

  const { position, bind } = useDraggable(false);
  if (!canShow) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-4 right-4 z-[999999] rounded-full bg-black text-white border border-zinc-700 shadow-lg px-3 py-2 text-xs font-medium hover:bg-zinc-900"
      >
        Debug {events.length > 0 ? `(${events.length})` : ""}
      </button>

      {isOpen && (
        <DevtoolsPanel
          events={events}
          isCapturing={isCapturing}
          onToggleCapturing={toggleCapturing}
          onClearEvents={clearEvents}
          onClose={() => setIsOpen(false)}
          onTogglePosition={() =>
            setPanelPosition((prev) => (prev === "bottom" ? "right" : "bottom"))
          }
          config={config}
        />
      )}
    </>
  );
}
