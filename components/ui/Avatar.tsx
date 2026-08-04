import React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function getInitials(name: string): string {
  const parts = String(name || "?").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] || "?").toUpperCase();
}

export function getAvatarColorClass(name: string): string {
  const hues = ["a", "b", "c", "d", "e"];
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i) * (i + 1)) % hues.length;
  }
  return `user-avatar--${hues[h]}`;
}

export default function Avatar({ name, size = "md", className }: AvatarProps) {
  const sizeClass = size === "sm" ? "sm" : size === "lg" ? "lg" : "";
  const colorClass = getAvatarColorClass(name);
  
  return (
    <span className={cn("user-avatar", sizeClass, colorClass, className)}>
      {getInitials(name)}
    </span>
  );
}
