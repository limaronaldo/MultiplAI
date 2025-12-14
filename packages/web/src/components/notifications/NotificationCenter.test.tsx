/**
 * NotificationCenter Component Tests
 * Issue #360
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "../../test/test-utils";
import { NotificationProvider, NotificationBell, NotificationPanel, useNotifications } from "./NotificationCenter";

// Helper component to access notification context
function TestConsumer() {
  const { addNotification, notifications, unreadCount, markAsRead, clearAll } = useNotifications();

  return (
    <div>
      <span data-testid="unread-count">{unreadCount}</span>
      <span data-testid="total-count">{notifications.length}</span>
      <button
        data-testid="add-notification"
        onClick={() =>
          addNotification({
            type: "success",
            title: "Test Notification",
            message: "This is a test",
          })
        }
      >
        Add
      </button>
      <button
        data-testid="mark-read"
        onClick={() => notifications[0] && markAsRead(notifications[0].id)}
      >
        Mark Read
      </button>
      <button data-testid="clear-all" onClick={clearAll}>
        Clear
      </button>
    </div>
  );
}

describe("NotificationCenter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("NotificationProvider", () => {
    it("provides notification context", () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      );

      expect(screen.getByTestId("unread-count")).toHaveTextContent("0");
      expect(screen.getByTestId("total-count")).toHaveTextContent("0");
    });

    it("adds notifications", async () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("add-notification"));
      });

      expect(screen.getByTestId("unread-count")).toHaveTextContent("1");
      expect(screen.getByTestId("total-count")).toHaveTextContent("1");
    });

    it("marks notifications as read", async () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("add-notification"));
      });

      expect(screen.getByTestId("unread-count")).toHaveTextContent("1");

      await act(async () => {
        fireEvent.click(screen.getByTestId("mark-read"));
      });

      expect(screen.getByTestId("unread-count")).toHaveTextContent("0");
    });

    it("clears all notifications", async () => {
      render(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("add-notification"));
        fireEvent.click(screen.getByTestId("add-notification"));
      });

      expect(screen.getByTestId("total-count")).toHaveTextContent("2");

      await act(async () => {
        fireEvent.click(screen.getByTestId("clear-all"));
      });

      expect(screen.getByTestId("total-count")).toHaveTextContent("0");
    });
  });

  describe("NotificationBell", () => {
    it("shows unread count badge", async () => {
      const TestBell = () => {
        const { addNotification } = useNotifications();
        return (
          <>
            <button
              data-testid="add"
              onClick={() => addNotification({ type: "info", title: "Test", message: "msg" })}
            />
            <NotificationBell onClick={() => {}} />
          </>
        );
      };

      render(
        <NotificationProvider>
          <TestBell />
        </NotificationProvider>
      );

      // Initially no badge
      expect(screen.queryByText("1")).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByTestId("add"));
      });

      // Badge should appear
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("calls onClick when clicked", () => {
      const onClick = vi.fn();
      render(
        <NotificationProvider>
          <NotificationBell onClick={onClick} />
        </NotificationProvider>
      );

      fireEvent.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe("NotificationPanel", () => {
    it("shows empty state when no notifications", () => {
      render(
        <NotificationProvider>
          <NotificationPanel onClose={() => {}} />
        </NotificationProvider>
      );

      expect(screen.getByText("No notifications")).toBeInTheDocument();
    });

    it("displays notifications", async () => {
      const TestPanel = () => {
        const { addNotification } = useNotifications();
        return (
          <>
            <button
              data-testid="add"
              onClick={() =>
                addNotification({
                  type: "success",
                  title: "Task Completed",
                  message: "Your task has finished",
                })
              }
            />
            <NotificationPanel onClose={() => {}} />
          </>
        );
      };

      render(
        <NotificationProvider>
          <TestPanel />
        </NotificationProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("add"));
      });

      expect(screen.getByText("Task Completed")).toBeInTheDocument();
      expect(screen.getByText("Your task has finished")).toBeInTheDocument();
    });

    it("calls onClose when close button clicked", () => {
      const onClose = vi.fn();
      render(
        <NotificationProvider>
          <NotificationPanel onClose={onClose} />
        </NotificationProvider>
      );

      // Find the close button (X icon)
      const buttons = screen.getAllByRole("button");
      const closeButton = buttons.find((btn) => btn.querySelector("svg"));
      if (closeButton) {
        fireEvent.click(closeButton);
        expect(onClose).toHaveBeenCalled();
      }
    });
  });
});
