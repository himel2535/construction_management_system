import React from "react";
import { cn } from "@/lib/utils";

interface TypePillProps {
  type?: "government" | "private" | string;
  className?: string;
}

export function TypePill({ type = "private", className }: TypePillProps) {
  const t = String(type).toLowerCase();
  const isGov = t === "government" || t === "government_civil";
  return (
    <span className={cn("cust-type-pill", isGov ? "cust-type-pill--government" : "cust-type-pill--private", className)}>
      {isGov ? "Government" : "Private"}
    </span>
  );
}

interface HealthPillProps {
  health?: "on_track" | "at_risk" | "delayed" | string;
  label?: string;
  className?: string;
}

export function HealthPill({ health = "on_track", label, className }: HealthPillProps) {
  const key = String(health).toLowerCase();
  const pillKey = key === "on_track" || key === "on-track" ? "on_track" : key === "at_risk" || key === "at-risk" ? "at_risk" : "delayed";
  
  const displayLabel = label || (pillKey === "on_track" ? "On-track" : pillKey === "at_risk" ? "At-risk" : "Delayed");

  return (
    <span className={cn("dash-health-pill", `dash-health-pill--${pillKey}`, className)}>
      <i className="dash-health-dot" aria-hidden="true" />
      {displayLabel}
    </span>
  );
}

interface StatusChipProps {
  status?: string;
  className?: string;
}

export function StatusChip({ status = "ongoing", className }: StatusChipProps) {
  const key = String(status).toLowerCase();
  return (
    <span className={cn("status-chip", `status-chip--${key}`, className)}>
      {status}
    </span>
  );
}
