import { Component, type ErrorInfo, type ReactNode } from "react";
import { STORAGE_KEY } from "../appCore";
import { recordDiagnostic } from "../diagnostics";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level error boundary. A broken imported/persisted config (or any render
 * crash) would otherwise leave the user staring at a white screen with no way
 * out. This catches render errors and offers two recovery paths: a plain reload,
 * and a "reset app data" that clears the persisted state key before reloading.
 *
 * It intentionally sits OUTSIDE the i18n provider so it can catch errors thrown
 * inside the provider too. Class components cannot use the useTranslation hook
 * and the provider may not be mounted at this level, so the recovery UI uses
 * hardcoded English + Vietnamese text rather than i18n lookups.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordDiagnostic({
      component: "app",
      code: "APP_RENDER_CRASH",
      severity: "error",
    });
    // Keep development console context local. The support bundle records only
    // the stable event code above and never serializes this exception/stack.
    console.error("App crashed:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage access errors (e.g. privacy mode) and reload anyway.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="app-error-boundary" role="alert">
        <div className="app-error-boundary-card">
          <h1>Something went wrong / Đã xảy ra lỗi</h1>
          <p>
            The app hit an unexpected error. Try reloading. If it keeps happening,
            reset the app data (this clears saved workspaces, panes, and tabs).
          </p>
          <p>
            Ứng dụng gặp lỗi không mong muốn. Hãy thử tải lại. Nếu vẫn lỗi, hãy đặt
            lại dữ liệu ứng dụng (thao tác này xóa workspace, pane và tab đã lưu).
          </p>
          <div className="app-error-boundary-actions">
            <button type="button" onClick={this.handleReload}>
              Reload / Tải lại
            </button>
            <button
              type="button"
              className="danger"
              onClick={this.handleReset}
            >
              Reset app data / Đặt lại dữ liệu
            </button>
          </div>
        </div>
      </div>
    );
  }
}
