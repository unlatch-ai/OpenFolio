"use client";

import { useState, useEffect } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api";

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface TagManagerProps {
  entityType: "person" | "company";
  entityId: string;
  initialTags: Tag[];
  onTagsChange?: (tags: Tag[]) => void;
}

export function TagManager({
  entityType,
  entityId,
  initialTags,
  onTagsChange,
}: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (dropdownOpen) {
      apiFetch("/api/tags")
        .then((res) => res.json())
        .then((json) => setAllTags(json.data || []))
        .catch(() => {});
    }
  }, [dropdownOpen]);

  const addTag = async (tagId: string) => {
    setLoading(true);
    try {
      const basePath =
        entityType === "person"
          ? `/api/people/${entityId}/tags`
          : `/api/companies/${entityId}/tags`;

      const res = await apiFetch(basePath, {
        method: "POST",
        body: JSON.stringify({ tag_id: tagId }),
      });

      if (res.ok) {
        const tag = allTags.find((t) => t.id === tagId);
        if (tag && !tags.some((t) => t.id === tagId)) {
          const updated = [...tags, tag];
          setTags(updated);
          onTagsChange?.(updated);
        }
      }
    } finally {
      setLoading(false);
      setDropdownOpen(false);
    }
  };

  const removeTag = async (tagId: string) => {
    setLoading(true);
    try {
      const basePath =
        entityType === "person"
          ? `/api/people/${entityId}/tags`
          : `/api/companies/${entityId}/tags`;

      const res = await apiFetch(basePath, {
        method: "DELETE",
        body: JSON.stringify({ tag_id: tagId }),
      });

      if (res.ok) {
        const updated = tags.filter((t) => t.id !== tagId);
        setTags(updated);
        onTagsChange?.(updated);
      }
    } finally {
      setLoading(false);
    }
  };

  const createAndAddTag = async () => {
    if (!newTagName.trim()) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/tags", {
        method: "POST",
        body: JSON.stringify({ name: newTagName.trim() }),
      });

      if (res.ok) {
        const json = await res.json();
        const newTag = json.data;
        if (newTag) {
          await addTag(newTag.id);
          setAllTags((prev) => [...prev, newTag]);
        }
      }
    } finally {
      setNewTagName("");
      setLoading(false);
    }
  };

  const availableTags = allTags.filter(
    (at) => !tags.some((t) => t.id === at.id)
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge
            key={tag.id}
            variant="secondary"
            className="text-xs pr-1"
            style={
              tag.color
                ? {
                    backgroundColor: `${tag.color}20`,
                    color: tag.color,
                    borderColor: `${tag.color}40`,
                  }
                : undefined
            }
          >
            {tag.name}
            <button
              onClick={() => removeTag(tag.id)}
              className="ml-1 hover:bg-black/10 rounded-full p-0.5"
              disabled={loading}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-full"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {availableTags.map((tag) => (
              <DropdownMenuItem
                key={tag.id}
                onClick={() => addTag(tag.id)}
              >
                {tag.color && (
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-2"
                    style={{ backgroundColor: tag.color }}
                  />
                )}
                {tag.name}
              </DropdownMenuItem>
            ))}
            {availableTags.length > 0 && <DropdownMenuSeparator />}
            <div className="px-2 py-1.5">
              <div className="flex gap-1">
                <Input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="New tag..."
                  className="h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createAndAddTag();
                    }
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    createAndAddTag();
                  }}
                  disabled={!newTagName.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
