import { useState } from "react";
import { useTranslation } from "../i18n";
import type {
  AlertDialogOptions,
  ConfirmDialogOptions,
  TextPromptState,
} from "../types/dialogs";

export type TextPromptModalProps = {
  prompt: TextPromptState | null;
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function TextPromptModal({
  prompt,
  value,
  onValueChange,
  onClose,
  onSubmit,
}: TextPromptModalProps) {
  const { t } = useTranslation();

  if (!prompt) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <h3 className="modal-title">{prompt.title}</h3>
        <input
          autoFocus
          className="modal-input"
          value={value}
          placeholder={prompt.placeholder}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
        />
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="modal-btn primary">
            {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

export type ConfirmDialogProps = {
  dialog: ConfirmDialogOptions | null;
  onClose: () => void;
};

export function ConfirmDialog({ dialog, onClose }: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [isConfirming, setIsConfirming] = useState(false);

  if (!dialog) return null;

  const handleConfirm = async () => {
    if (isConfirming) return;

    setIsConfirming(true);
    try {
      await dialog.onConfirm();
    } catch (error) {
      console.error("confirm dialog action failed", error);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <h3 className="modal-title">{dialog.title}</h3>
        <p className="modal-message">{dialog.message}</p>
        <div className="modal-actions">
          {!dialog.hideCancel && (
            <button
              type="button"
              className="modal-btn"
              onClick={onClose}
              disabled={isConfirming}
            >
              {dialog.cancelLabel ?? t("common.cancel")}
            </button>
          )}
          <button
            type="button"
            className={dialog.danger ? "modal-btn danger" : "modal-btn primary"}
            onClick={() => void handleConfirm()}
            disabled={isConfirming}
          >
            {dialog.confirmLabel ?? t("common.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}

export type AlertDialogProps = {
  dialog: AlertDialogOptions | null;
  onClose: () => void;
};

export function AlertDialog({ dialog, onClose }: AlertDialogProps) {
  const { t } = useTranslation();

  if (!dialog) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <h3 className="modal-title">{dialog.title}</h3>
        <p className="modal-message">{dialog.message}</p>
        <div className="modal-actions">
          <button type="button" className="modal-btn primary" onClick={onClose}>
            {dialog.confirmLabel ?? t("common.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
