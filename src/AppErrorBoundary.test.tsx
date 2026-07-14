import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { STORAGE_KEY } from "./appCore";

afterEach(cleanup);

function Boom(): never {
  throw new Error("kaboom");
}

describe("AppErrorBoundary", () => {
  it("renders children when there is no error", () => {
    const { getByText } = render(
      <AppErrorBoundary>
        <div>healthy</div>
      </AppErrorBoundary>,
    );
    expect(getByText("healthy")).toBeDefined();
  });

  it("renders the recovery UI when a child throws during render", () => {
    // Silence the expected console.error from componentDidCatch.
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { getByRole } = render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    const alert = getByRole("alert");
    expect(alert.textContent).toContain("Something went wrong");
    spy.mockRestore();
  });

  it("reset button clears the persisted state key then reloads", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ any: "data" }));

    const reloadMock = vi.fn();
    const original = window.location;
    // jsdom's window.location.reload is not a spy target by default; replace it.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload: reloadMock },
    });

    const { getByText } = render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    fireEvent.click(getByText("Reset app data / Đặt lại dữ liệu"));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(reloadMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
    spy.mockRestore();
  });

  it("reload button reloads without clearing storage", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ any: "data" }));

    const reloadMock = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload: reloadMock },
    });

    const { getByText } = render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    fireEvent.click(getByText("Reload / Tải lại"));

    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(reloadMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
    window.localStorage.clear();
    spy.mockRestore();
  });
});
