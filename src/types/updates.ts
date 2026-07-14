export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; latest: string; releaseUrl: string }
  | { kind: "downloading"; latest: string; progress: number }
  | { kind: "installing"; latest: string }
  | { kind: "readyToInstall"; latest: string }
  | { kind: "current" }
  | { kind: "error"; message: string };

export type BackupBusy = "idle" | "exporting" | "importing";
