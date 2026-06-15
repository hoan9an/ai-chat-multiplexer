import { IconCheck, IconDownload, IconX } from "../Icons";
import { useTranslation } from "../i18n";
import type { DownloadToast } from "../appCore";

type Props = {
  open: boolean;
  items: DownloadToast[];
  onClose: () => void;
  onClearAll: () => void;
  onOpenFile: (path: string) => void;
  onRevealFolder: (path: string) => void;
};

export function DownloadsPanel({
  open,
  items,
  onClose,
  onClearAll,
  onOpenFile,
  onRevealFolder,
}: Props) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="downloads-panel" role="dialog" aria-label={t("downloads.title")}>
      <header className="downloads-panel-header">
        <h3 className="modal-title">{t("downloads.title")}</h3>
        <div className="downloads-panel-actions">
          {items.length > 0 && (
            <button
              type="button"
              className="modal-btn"
              onClick={onClearAll}
              title={t("downloads.clearListTitle")}
            >
              {t("downloads.clearAll")}
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <IconX size={14} />
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="downloads-empty">{t("downloads.empty")}</div>
      ) : (
        <ul className="downloads-list">
          {[...items]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((item) => (
              <li key={item.id} className={`downloads-item downloads-item-${item.status}`}>
                <div className="downloads-item-icon" aria-hidden="true">
                  {item.status === "downloading" ? (
                    <IconDownload size={14} />
                  ) : item.status === "success" ? (
                    <IconCheck size={14} />
                  ) : (
                    <IconX size={14} />
                  )}
                </div>
                <div className="downloads-item-body">
                  <div className="downloads-item-name" title={item.path ?? item.fileName}>
                    {item.fileName}
                  </div>
                  <div className="downloads-item-meta">
                    {item.status === "downloading" && (
                      <>
                        <span className="downloads-progress">
                          <span className="downloads-progress-bar" />
                        </span>
                        <span className="downloads-status downloading">{t("downloads.downloading")}</span>
                      </>
                    )}
                    {item.status === "success" && (
                      <span className="downloads-status success">{t("downloads.completed")}</span>
                    )}
                    {item.status === "error" && (
                      <span className="downloads-status error">{t("downloads.error")}</span>
                    )}
                    {item.status === "cancelled" && (
                      <span className="downloads-status">{t("downloads.cancelled")}</span>
                    )}
                  </div>
                  {item.status === "success" && item.path && (
                    <div className="downloads-item-actions">
                      <button
                        type="button"
                        className="download-toast-link"
                        onClick={() => onOpenFile(item.path!)}
                      >
                        {t("downloads.openFile")}
                      </button>
                      <span className="download-toast-sep">·</span>
                      <button
                        type="button"
                        className="download-toast-link"
                        onClick={() => onRevealFolder(item.path!)}
                      >
                        {t("downloads.openFolder")}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
