import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";

let tauriRuntime = false;
vi.mock("./appCore", async () => {
  const actual = await vi.importActual<typeof import("./appCore")>("./appCore");
  return {
    ...actual,
    isTauriRuntime: () => tauriRuntime,
  };
});

import { SettingsModal, type SettingsModalProps } from "./components/SettingsModal";

beforeEach(() => {
  tauriRuntime = false;
});
afterEach(cleanup);

function defaultProps(overrides: Partial<SettingsModalProps> = {}): SettingsModalProps {
  return {
    open: true,
    onClose: vi.fn(),
    theme: "light",
    onThemeChange: vi.fn(),
    updateStatus: { kind: "idle" },
    onCheckForUpdates: vi.fn(),
    onDownloadAndInstall: vi.fn(),
    onOpenReleasePage: vi.fn(),
    backupBusy: "idle",
    onExportConfig: vi.fn(),
    onImportConfig: vi.fn(),
    onExportFullBackup: vi.fn(),
    onRestoreFullBackup: vi.fn(),
    onExportSupportBundle: vi.fn(),
    onOpenSupportIssue: vi.fn(),
    onOpenKnownIssues: vi.fn(),
    onShowOnboarding: vi.fn(),
    ...overrides,
  };
}

describe("SettingsModal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(<SettingsModal {...defaultProps({ open: false })} />);
    expect(container.children).toHaveLength(0);
  });

  it("renders title and version", () => {
    render(<SettingsModal {...defaultProps()} />);
    expect(screen.getByText("Settings")).toBeDefined();
    // Version label appears in two places (update section + footer)
    expect(screen.getAllByText(/^v\d/).length).toBeGreaterThan(0);
  });

  it("calls onClose when close button is clicked", () => {
    const props = defaultProps();
    render(<SettingsModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const props = defaultProps();
    const { container } = render(<SettingsModal {...props} />);
    const backdrop = container.querySelector(".modal-backdrop")!;
    fireEvent.mouseDown(backdrop, { target: backdrop, currentTarget: backdrop });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("highlights the active theme button", () => {
    render(<SettingsModal {...defaultProps({ theme: "dark" })} />);
    const dark = screen.getByRole("button", { name: /Tối/ });
    expect(dark.className).toContain("active");
    const light = screen.getByRole("button", { name: /Sáng/ });
    expect(light.className).not.toContain("active");
  });

  it("calls onThemeChange when theme button is clicked", () => {
    const props = defaultProps({ theme: "light" });
    render(<SettingsModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Tối/ }));
    expect(props.onThemeChange).toHaveBeenCalledWith("dark");
  });

  it("calls onThemeChange('light') when Sáng button is clicked", () => {
    const props = defaultProps({ theme: "dark" });
    render(<SettingsModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Sáng/ }));
    expect(props.onThemeChange).toHaveBeenCalledWith("light");
  });

  it("does NOT call onClose when mousedown originates inside the settings card", () => {
    const props = defaultProps();
    const { container } = render(<SettingsModal {...props} />);
    const card = container.querySelector(".modal-card.settings-card")!;
    fireEvent.mouseDown(card);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("disables the full-backup buttons in non-Tauri runtime", () => {
    const props = defaultProps();
    render(<SettingsModal {...props} />);
    const exportBtn = screen.getByRole("button", { name: /Full backup/ }) as HTMLButtonElement;
    const restoreBtn = screen.getByRole("button", { name: /Khôi phục từ backup/ }) as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
    expect(restoreBtn.disabled).toBe(true);
    expect(exportBtn.title).toBe("Chỉ chạy trong app desktop");
    expect(restoreBtn.title).toBe("Chỉ chạy trong app desktop");
  });

  it("requires explicit privacy consent before enabling full backup in Tauri runtime", () => {
    tauriRuntime = true;
    const props = defaultProps();
    render(<SettingsModal {...props} />);
    const exportBtn = screen.getByRole("button", { name: /Full backup/ }) as HTMLButtonElement;
    const restoreBtn = screen.getByRole("button", { name: /Khôi phục từ backup/ }) as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
    expect(restoreBtn.disabled).toBe(false);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(exportBtn.disabled).toBe(false);
    expect(exportBtn.hasAttribute("title")).toBe(false);
    expect(restoreBtn.hasAttribute("title")).toBe(false);
  });

  it("disables config buttons while backupBusy != 'idle'", () => {
    const props = defaultProps({ backupBusy: "exporting" });
    render(<SettingsModal {...props} />);
    expect((screen.getByRole("button", { name: /Xuất cấu hình/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Nhập cấu hình/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows 'Kiểm tra cập nhật' button when status is idle and triggers callback", () => {
    const props = defaultProps();
    render(<SettingsModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Kiểm tra cập nhật/ }));
    expect(props.onCheckForUpdates).toHaveBeenCalledTimes(1);
  });

  it("shows checking text when updateStatus is checking", () => {
    render(<SettingsModal {...defaultProps({ updateStatus: { kind: "checking" } })} />);
    expect(screen.getByText("Đang kiểm tra…")).toBeDefined();
  });

  it("shows current-version notice when updateStatus is current", () => {
    render(<SettingsModal {...defaultProps({ updateStatus: { kind: "current" } })} />);
    expect(screen.getByText(/Chưa có bản cập nhật mới hoặc bạn đã ở phiên bản mới nhất/)).toBeDefined();
  });

  it("shows release link when updateStatus is available and triggers onOpenReleasePage", () => {
    const props = defaultProps({
      updateStatus: { kind: "available", latest: "9.9.9", releaseUrl: "https://r" },
    });
    render(<SettingsModal {...props} />);
    expect(screen.getByText(/v9\.9\.9/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Mở trang tải/ }));
    expect(props.onOpenReleasePage).toHaveBeenCalledWith("https://r");
  });

  it("shows 'Download & install' and triggers onDownloadAndInstall in Tauri runtime", () => {
    tauriRuntime = true;
    const props = defaultProps({
      updateStatus: { kind: "available", latest: "9.9.9", releaseUrl: "https://r" },
    });
    render(<SettingsModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Tải & cài đặt/ }));
    expect(props.onDownloadAndInstall).toHaveBeenCalledTimes(1);
    expect(props.onOpenReleasePage).not.toHaveBeenCalled();
  });

  it("shows download progress when updateStatus is downloading", () => {
    render(
      <SettingsModal
        {...defaultProps({ updateStatus: { kind: "downloading", latest: "9.9.9", progress: 42 } })}
      />,
    );
    expect(screen.getByText(/42%/)).toBeDefined();
    expect(screen.getByText("Đang tải…")).toBeDefined();
  });

  it("shows installing notice when updateStatus is installing", () => {
    render(
      <SettingsModal {...defaultProps({ updateStatus: { kind: "installing", latest: "9.9.9" } })} />,
    );
    expect(screen.getByText("Đang cài đặt…")).toBeDefined();
  });

  it("shows restarting notice when updateStatus is readyToInstall", () => {
    render(
      <SettingsModal
        {...defaultProps({ updateStatus: { kind: "readyToInstall", latest: "9.9.9" } })}
      />,
    );
    expect(screen.getByText("Đang khởi động lại…")).toBeDefined();
  });

  it("shows error message when updateStatus is error", () => {
    render(
      <SettingsModal {...defaultProps({ updateStatus: { kind: "error", message: "boom" } })} />,
    );
    expect(screen.getByText("boom")).toBeDefined();
  });

  it("triggers export and import config callbacks", () => {
    const props = defaultProps();
    render(<SettingsModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Xuất cấu hình/ }));
    expect(props.onExportConfig).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Nhập cấu hình/ }));
    expect(props.onImportConfig).toHaveBeenCalledTimes(1);
  });

  it("disables backup buttons while busy", () => {
    render(<SettingsModal {...defaultProps({ backupBusy: "exporting" })} />);
    const exportBtn = screen.getByRole("button", {
      name: /Xuất cấu hình/,
    }) as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
  });

  it("disables full-backup buttons in browser runtime", () => {
    render(<SettingsModal {...defaultProps()} />);
    const fullBackup = screen.getByRole("button", {
      name: /Full backup/,
    }) as HTMLButtonElement;
    const restore = screen.getByRole("button", {
      name: /Khôi phục từ backup/,
    }) as HTMLButtonElement;
    expect(fullBackup.disabled).toBe(true);
    expect(restore.disabled).toBe(true);
  });

  it("footer GitHub link opens through onOpenReleasePage", () => {
    const props = defaultProps();
    render(<SettingsModal {...props} />);

    expect(screen.queryByRole("link", { name: "Website" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "GitHub" }));

    expect(props.onOpenReleasePage).toHaveBeenCalledTimes(1);
    const calls = (props.onOpenReleasePage as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toMatch(/github\.com/i);
  });

  it("routes support, known-issues, and onboarding actions", () => {
    const props = defaultProps();
    render(<SettingsModal {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Báo lỗi" }));
    fireEvent.click(screen.getByRole("button", { name: "Các lỗi đã biết" }));
    fireEvent.click(screen.getByRole("button", { name: "Mở lại hướng dẫn" }));

    expect(props.onOpenSupportIssue).toHaveBeenCalledTimes(1);
    expect(props.onOpenKnownIssues).toHaveBeenCalledTimes(1);
    expect(props.onShowOnboarding).toHaveBeenCalledTimes(1);
  });
});
