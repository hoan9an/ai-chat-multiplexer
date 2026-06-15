import { IconCheck, IconDownload, IconX } from "../Icons";
import type { DownloadToast } from "../appCore";
import { useTranslation } from "../i18n";

type Props = {
  toasts: DownloadToast[];
  onDismiss: (id: string) => void;
  onOpenFile: (path: string) => void;
  onRevealFolder: (path: string) => void;
};

export function DownloadToastStack({ toasts, onDismiss, onOpenFile, onRevealFolder }: Props) {
  const { t } = useTranslation();

  if (toasts.length === 0) return null;

  return (
    <div className="download-toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`download-toast download-toast-${toast.status}`}>
          <div className="download-toast-icon" aria-hidden="true">
            {toast.status === "downloading" ? (
              <IconDownload size={14} />
            ) : toast.status === "success" ? (
              <IconCheck size={14} />
            ) : (
              <IconX size={14} />
            )}
          </div>
          <div className="download-toast-body">
            <div className="download-toast-title">
              {toast.status === "downloading"
                ? t("toast.downloading")
                : toast.status === "success"
                  ? t("toast.success")
                  : t("toast.error")}
            </div>
            <div className="download-toast-name" title={toast.path ?? toast.fileName}>
              {toast.fileName}
            </div>
            {toast.status === "success" && toast.path && (
              <div className="download-toast-actions">
                <button
                  type="button"
                  className="download-toast-link"
                  onClick={() => onOpenFile(toast.path!)}
                >
                  {t("downloads.openFile")}
                </button>
                <span className="download-toast-sep">·</span>
                <button
                  type="button"
                  className="download-toast-link"
                  onClick={() => onRevealFolder(toast.path!)}
                >
                  {t("downloads.openFolder")}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="download-toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label={t("common.close")}
          >
            <IconX size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
