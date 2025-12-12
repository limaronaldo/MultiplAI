import * as React from "react";

export interface SlideOutPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

const ANIMATION_DURATION_MS = 200;

export function SlideOutPanel({
  isOpen,
  onClose,
  children,
  title,
}: SlideOutPanelProps) {
  const [isRendered, setIsRendered] = React.useState(isOpen);

  React.useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      return;
    }

    if (!isRendered) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsRendered(false);
    }, ANIMATION_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, isRendered]);

  React.useEffect(() => {
    if (!isRendered) {
      return;
    }

    if (typeof document === "undefined") {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isRendered]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isRendered) {
    return null;
  }

  return (
    <>
      <div className="sop-root" aria-hidden={!isOpen}>
        <div
          className={`sop-backdrop ${isOpen ? "sop-backdrop--open" : ""}`}
          onClick={onClose}
        />
        <div
          className={`sop-panel ${isOpen ? "sop-panel--open" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={title ?? "Panel"}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <div className="sop-header">
            <div className="sop-title">{title}</div>
            <button
              type="button"
              className="sop-close"
              onClick={onClose}
              aria-label="Close panel"
            >
              ×
            </button>
          </div>
          <div className="sop-content">{children}</div>
        </div>
      </div>

      <style>
        {`
          .sop-root {
            position: fixed;
            inset: 0;
            z-index: 50;
          }

          .sop-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            opacity: 0;
            transition: opacity ${ANIMATION_DURATION_MS}ms ease;
            z-index: 50;
          }

          .sop-backdrop--open {
            opacity: 1;
          }

          .sop-panel {
            position: absolute;
            top: 0;
            right: 0;
            height: 100%;
            width: 600px;
            max-width: 100vw;
            background: #ffffff;
            box-shadow: -12px 0 24px rgba(0, 0, 0, 0.18);
            transform: translateX(100%);
            transition: transform ${ANIMATION_DURATION_MS}ms ease;
            z-index: 60;
            display: flex;
            flex-direction: column;
          }

          .sop-panel--open {
            transform: translateX(0);
          }

          .sop-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 16px;
            border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          }

          .sop-title {
            font-size: 16px;
            font-weight: 600;
            line-height: 1.2;
          }

          .sop-close {
            appearance: none;
            border: 0;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font-size: 24px;
            line-height: 1;
            padding: 4px 8px;
          }

          .sop-content {
            flex: 1;
            overflow: auto;
            padding: 16px;
          }

          @media (max-width: 768px) {
            .sop-panel {
              width: 100vw;
            }
          }
        `}
      </style>
    </>
  );
}

export default SlideOutPanel;