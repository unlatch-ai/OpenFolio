"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type PlanItemType = "person" | "company" | "interaction";

export type PlanItem = {
  type: PlanItemType;
  id: string;
  name?: string;
};

type PlanSelectionContextValue = {
  selectedItem: PlanItem | null;
  pinnedItems: PlanItem[];
  selectItem: (item: PlanItem) => void;
  clearSelection: () => void;
  togglePin: (item: PlanItem) => void;
  isPinned: (item: PlanItem) => boolean;
  updateItem: (item: PlanItem) => void;
};

const PlanSelectionContext = createContext<PlanSelectionContextValue | null>(null);

const makeKey = (item: PlanItem) => `${item.type}:${item.id}`;
const STORAGE_KEY = "of-plan-pins";

function readPinnedFromStorage(): PlanItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        type: item.type,
        id: item.id,
        name: item.name,
      }))
      .filter((item) =>
        item.type === "person" || item.type === "company" || item.type === "interaction"
      )
      .filter((item) => typeof item.id === "string");
  } catch {
    return [];
  }
}

function writePinnedToStorage(items: PlanItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage errors
  }
}

export function PlanSelectionProvider({
  children,
  onSelectItem,
}: {
  children: ReactNode;
  onSelectItem?: (item: PlanItem) => void;
}) {
  const [selectedItem, setSelectedItem] = useState<PlanItem | null>(null);
  const [pinnedItems, setPinnedItems] = useState<PlanItem[]>(() =>
    readPinnedFromStorage()
  );

  useEffect(() => {
    writePinnedToStorage(pinnedItems);
  }, [pinnedItems]);

  const selectItem = useCallback(
    (item: PlanItem) => {
      setSelectedItem((prev) => (prev ? { ...prev, ...item } : item));
      onSelectItem?.(item);
    },
    [onSelectItem]
  );

  const clearSelection = useCallback(() => {
    setSelectedItem(null);
  }, []);

  const togglePin = useCallback((item: PlanItem) => {
    setPinnedItems((prev) => {
      const key = makeKey(item);
      const exists = prev.some((pinned) => makeKey(pinned) === key);
      if (exists) {
        return prev.filter((pinned) => makeKey(pinned) !== key);
      }
      return [...prev, item];
    });
  }, []);

  const isPinned = useCallback(
    (item: PlanItem) => pinnedItems.some((pinned) => makeKey(pinned) === makeKey(item)),
    [pinnedItems]
  );

  const updateItem = useCallback((item: PlanItem) => {
    setSelectedItem((prev) => {
      if (!prev || makeKey(prev) !== makeKey(item)) return prev;
      return { ...prev, ...item };
    });
    setPinnedItems((prev) =>
      prev.map((pinned) => (makeKey(pinned) === makeKey(item) ? { ...pinned, ...item } : pinned))
    );
  }, []);

  const value = useMemo(
    () => ({
      selectedItem,
      pinnedItems,
      selectItem,
      clearSelection,
      togglePin,
      isPinned,
      updateItem,
    }),
    [selectedItem, pinnedItems, selectItem, clearSelection, togglePin, isPinned, updateItem]
  );

  return (
    <PlanSelectionContext.Provider value={value}>
      {children}
    </PlanSelectionContext.Provider>
  );
}

export function usePlanSelection() {
  return useContext(PlanSelectionContext);
}
