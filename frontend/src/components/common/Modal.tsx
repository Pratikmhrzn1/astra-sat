import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/common/Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children, size = 'md', footer }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-wrap fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-scrim absolute inset-0 bg-ink/[.36] backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'modal-panel relative bg-white rounded-[20px] shadow-[0_4px_12px_rgba(11,11,14,0.06),0_24px_64px_rgba(11,11,14,0.18)] w-full flex flex-col max-h-[90vh]',
          {
            'max-w-sm': size === 'sm',
            'max-w-lg': size === 'md',
            'max-w-2xl': size === 'lg',
          }
        )}
      >
        <div className="flex items-center justify-between gap-4 pl-6 pr-4 pt-5 pb-3 shrink-0">
          <h2 className="text-[19px] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 rounded-full text-ink/[.62] bg-ink/5 hover:bg-ink/[.09] hover:text-ink transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>
        <div className="px-6 pt-1 pb-5 overflow-y-auto flex-1 text-[15px] leading-relaxed">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-border-soft shrink-0 flex justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-body">{message}</p>
    </Modal>
  );
}
