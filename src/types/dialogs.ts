export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  hideCancel?: boolean;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export interface AlertDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
}

export interface TextPromptOptions {
  title: string;
  initial?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
}

export interface TextPromptState {
  title: string;
  initial: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
}
