import { useState } from "react";
import { IconAlertTriangle, IconCheck, IconInfo, IconX } from "../Icons";
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

  const handleCancel = async () => {
    if (isConfirming && dialog.onCancelWhileBusy) {
      await dialog.onCancelWhileBusy();
      return;
    }
    onClose();
  };

  return (
    <div
      className="modal-backdrop notification-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) void handleCancel();
      }}
    >
      <div
        className={
          dialog.danger
            ? "modal-card notification-card danger"
            : "modal-card notification-card confirm"
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className="notification-heading">
          <span
            className={dialog.danger ? "notification-icon danger" : "notification-icon confirm"}
            aria-hidden="true"
          >
            {dialog.danger ? <IconAlertTriangle size={18} /> : <IconCheck size={18} />}
          </span>
          <div className="notification-copy">
            <h3 id="confirm-dialog-title" className="modal-title">
              {dialog.title}
            </h3>
            <p id="confirm-dialog-message" className="modal-message">
              {dialog.message}
            </p>
          </div>
        </div>
        {dialog.details && (
          <pre className="modal-details" aria-label={dialog.title}>
            {dialog.details}
          </pre>
        )}
        <div className="modal-actions">
          {!dialog.hideCancel && (
            <button
              type="button"
              className="modal-btn"
              onClick={() => void handleCancel()}
              disabled={isConfirming && !dialog.onCancelWhileBusy}
              autoFocus={Boolean(dialog.danger)}
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
            {isConfirming && dialog.busyLabel
              ? dialog.busyLabel
              : dialog.confirmLabel ?? t("common.ok")}
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
      className="modal-backdrop notification-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card notification-card info"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-message"
      >
        <div className="notification-heading">
          <span className="notification-icon info" aria-hidden="true">
            <IconInfo size={18} />
          </span>
          <div className="notification-copy">
            <h3 id="alert-dialog-title" className="modal-title">
              {dialog.title}
            </h3>
            <p id="alert-dialog-message" className="modal-message">
              {dialog.message}
            </p>
          </div>
          <button
            type="button"
            className="notification-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <IconX size={14} />
          </button>
        </div>
        <div className="modal-actions notification-actions">
          <button
            type="button"
            className="modal-btn primary"
            onClick={onClose}
            autoFocus
          >
            {dialog.confirmLabel ?? t("common.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
