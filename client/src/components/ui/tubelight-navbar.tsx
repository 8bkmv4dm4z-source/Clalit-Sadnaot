"use client";

import React from "react";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface NavItem {
  name: string;
  url: string;
  icon: LucideIcon;
  onClick?: () => void;
  active?: (pathname: string) => boolean;
}

interface NavBarProps {
  items: NavItem[];
  className?: string;
}

export function NavBar({ items, className }: NavBarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div dir="rtl" className={cn("z-50", className)}>
      <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-1 py-1 shadow-sm backdrop-blur">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.active
            ? item.active(location.pathname)
            : location.pathname === item.url;

          return (
            <button
              key={`${item.name}-${item.url}`}
              onClick={() => {
                item.onClick?.();
                navigate(item.url);
              }}
              className={cn(
                "relative cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors md:px-6",
                "text-slate-700 hover:text-slate-900",
                isActive && "bg-slate-100 text-slate-900"
              )}
            >
              <span className="hidden md:inline">{item.name}</span>
              <span className="md:hidden">
                <Icon size={18} strokeWidth={2.2} />
              </span>
              {isActive && (
                <motion.div
                  layoutId="lamp"
                  className="absolute inset-0 -z-10 w-full rounded-full bg-slate-500/5"
                  initial={false}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                  }}
                >
                  <div className="absolute -top-2 left-1/2 h-1 w-8 -translate-x-1/2 rounded-t-full bg-slate-700">
                    <div className="absolute -left-2 -top-2 h-6 w-12 rounded-full bg-slate-500/20 blur-md" />
                    <div className="absolute -top-1 h-6 w-8 rounded-full bg-slate-500/20 blur-md" />
                    <div className="absolute left-2 top-0 h-4 w-4 rounded-full bg-slate-500/20 blur-sm" />
                  </div>
                </motion.div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
