/**
 * Responsive Mobile Layout Components
 * Issue #356
 */

import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { Menu, X, ChevronLeft } from "lucide-react";
import clsx from "clsx";

// Breakpoint definitions
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

// Hook to detect screen size
export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("lg");
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setWidth(w);

      if (w < BREAKPOINTS.sm) {
        setBreakpoint("sm");
      } else if (w < BREAKPOINTS.md) {
        setBreakpoint("md");
      } else if (w < BREAKPOINTS.lg) {
        setBreakpoint("lg");
      } else if (w < BREAKPOINTS.xl) {
        setBreakpoint("xl");
      } else {
        setBreakpoint("2xl");
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return {
    breakpoint,
    width,
    isMobile: width < BREAKPOINTS.md,
    isTablet: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isDesktop: width >= BREAKPOINTS.lg,
  };
}

// Mobile sidebar context
interface MobileSidebarContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const MobileSidebarContext = createContext<MobileSidebarContextType | undefined>(undefined);

export function useMobileSidebar() {
  const context = useContext(MobileSidebarContext);
  if (!context) {
    throw new Error("useMobileSidebar must be used within MobileSidebarProvider");
  }
  return context;
}

export function MobileSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const { isMobile } = useBreakpoint();

  // Close sidebar when switching to desktop
  useEffect(() => {
    if (!isMobile) {
      setIsOpen(false);
    }
  }, [isMobile]);

  // Close sidebar on route change
  useEffect(() => {
    const handleRouteChange = () => setIsOpen(false);
    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  return (
    <MobileSidebarContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen((prev) => !prev),
      }}
    >
      {children}
    </MobileSidebarContext.Provider>
  );
}

// Mobile header with hamburger menu
export function MobileHeader({
  title,
  showBack,
  onBack,
  actions,
}: {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { toggle } = useMobileSidebar();

  return (
    <header
      className={clsx(
        "sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b md:hidden",
        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
      )}
    >
      <div className="flex items-center gap-3">
        {showBack ? (
          <button
            onClick={onBack}
            className={clsx("p-2 -ml-2 rounded-lg", isDark ? "hover:bg-gray-800" : "hover:bg-gray-100")}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={toggle}
            className={clsx("p-2 -ml-2 rounded-lg", isDark ? "hover:bg-gray-800" : "hover:bg-gray-100")}
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <h1 className={clsx("font-semibold truncate", isDark ? "text-white" : "text-gray-900")}>
          {title}
        </h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

// Mobile sidebar overlay
export function MobileSidebar({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { isOpen, close } = useMobileSidebar();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={close} />

      {/* Sidebar */}
      <div
        className={clsx(
          "absolute inset-y-0 left-0 w-72 max-w-[80vw] transform transition-transform",
          isDark ? "bg-gray-900" : "bg-white",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-800">
          <span className={clsx("font-semibold", isDark ? "text-white" : "text-gray-900")}>
            AutoDev
          </span>
          <button
            onClick={close}
            className={clsx("p-2 rounded-lg", isDark ? "hover:bg-gray-800" : "hover:bg-gray-100")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100vh-3.5rem)]">{children}</div>
      </div>
    </div>
  );
}

// Responsive container that adapts padding
export function ResponsiveContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("px-4 sm:px-6 lg:px-8 py-4 sm:py-6", className)}>
      {children}
    </div>
  );
}

// Responsive grid that changes columns based on screen size
export function ResponsiveGrid({
  children,
  className,
  cols = { sm: 1, md: 2, lg: 3, xl: 4 },
}: {
  children: ReactNode;
  className?: string;
  cols?: Partial<Record<Breakpoint, number>>;
}) {
  const colClasses = [
    cols.sm && `grid-cols-${cols.sm}`,
    cols.md && `md:grid-cols-${cols.md}`,
    cols.lg && `lg:grid-cols-${cols.lg}`,
    cols.xl && `xl:grid-cols-${cols.xl}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={clsx("grid gap-4 sm:gap-6", colClasses, className)}>
      {children}
    </div>
  );
}

// Responsive table that becomes cards on mobile
export function ResponsiveTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyField,
  onRowClick,
  emptyMessage = "No data",
}: {
  data: T[];
  columns: {
    key: string;
    label: string;
    render?: (value: unknown, item: T) => ReactNode;
    hideOnMobile?: boolean;
  }[];
  keyField: string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { isMobile } = useBreakpoint();

  if (data.length === 0) {
    return (
      <div className={clsx("p-8 text-center rounded-lg border", isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
        <p className={isDark ? "text-gray-400" : "text-gray-500"}>{emptyMessage}</p>
      </div>
    );
  }

  // Mobile card view
  if (isMobile) {
    return (
      <div className="space-y-3">
        {data.map((item) => (
          <div
            key={String(item[keyField])}
            onClick={() => onRowClick?.(item)}
            className={clsx(
              "p-4 rounded-lg border",
              isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
              onRowClick && "cursor-pointer active:bg-gray-700/50"
            )}
          >
            {columns
              .filter((col) => !col.hideOnMobile)
              .map((col) => (
                <div key={col.key} className="flex justify-between py-1">
                  <span className={clsx("text-sm", isDark ? "text-gray-400" : "text-gray-500")}>
                    {col.label}
                  </span>
                  <span className={clsx("text-sm font-medium", isDark ? "text-white" : "text-gray-900")}>
                    {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? "-")}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>
    );
  }

  // Desktop table view
  return (
    <div className={clsx("rounded-lg border overflow-hidden", isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className={isDark ? "bg-gray-900/50" : "bg-gray-50"}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={clsx(
                    "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider",
                    isDark ? "text-gray-400" : "text-gray-500"
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {data.map((item) => (
              <tr
                key={String(item[keyField])}
                onClick={() => onRowClick?.(item)}
                className={clsx(
                  isDark ? "hover:bg-gray-700/50" : "hover:bg-gray-50",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={clsx("px-4 py-3 text-sm", isDark ? "text-gray-300" : "text-gray-700")}>
                    {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? "-")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Bottom navigation for mobile
export function MobileBottomNav({
  items,
  activeItem,
  onItemClick,
}: {
  items: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  activeItem: string;
  onItemClick: (id: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <nav
      className={clsx(
        "fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-16 border-t md:hidden safe-area-inset-bottom",
        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
      )}
    >
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onItemClick(id)}
          className={clsx(
            "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
            activeItem === id
              ? "text-blue-500"
              : isDark
              ? "text-gray-400 active:text-gray-300"
              : "text-gray-500 active:text-gray-700"
          )}
        >
          <Icon className="w-5 h-5" />
          <span className="text-xs">{label}</span>
        </button>
      ))}
    </nav>
  );
}
