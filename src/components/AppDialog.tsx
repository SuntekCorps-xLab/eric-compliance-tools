import { useEffect, useRef, type ReactNode } from 'react';

interface AppDialogProps {
  open: boolean;
  labelledBy: string;
  wide?: boolean;
  children: ReactNode;
  onClose: () => void;
}

export function AppDialog({ open, labelledBy, wide = false, children, onClose }: AppDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={wide ? 'dialog-wide' : undefined}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
