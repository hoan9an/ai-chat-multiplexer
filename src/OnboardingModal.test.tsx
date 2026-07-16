import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingModal } from "./components/OnboardingModal";

afterEach(cleanup);

describe("OnboardingModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <OnboardingModal open={false} onApplyTemplate={vi.fn()} onSkip={vi.fn()} />,
    );
    expect(container.children).toHaveLength(0);
  });

  it("applies the selected template and supports skip/dismiss", () => {
    const onApplyTemplate = vi.fn();
    const onSkip = vi.fn();
    render(
      <OnboardingModal open onApplyTemplate={onApplyTemplate} onSkip={onSkip} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /So sánh 3 AI/ }));
    expect(onApplyTemplate).toHaveBeenCalledWith("compare-three", "So sánh 3 AI");
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua" }));
    fireEvent.click(screen.getByRole("button", { name: "Đóng hướng dẫn" }));
    expect(onSkip).toHaveBeenCalledTimes(2);
  });
});
