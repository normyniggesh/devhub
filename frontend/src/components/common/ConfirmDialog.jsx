import React from 'react';
import Modal from './Modal';

/**
 * Reusable confirmation dialog.
 * Replaces window.confirm() calls with a styled, consistent DEVHUB modal.
 *
 * @param {boolean} open - Whether the dialog is visible
 * @param {Function} onClose - Called when cancelled
 * @param {Function} onConfirm - Called when confirmed
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message/description
 * @param {string} confirmText - Confirm button label (default: "Delete")
 * @param {string} cancelText - Cancel button label (default: "Cancel")
 * @param {boolean} loading - Whether the confirm action is in progress
 * @param {boolean} danger - Whether this is a destructive action (red styling)
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Delete',
  cancelText = 'Cancel',
  loading = false,
  danger = true
}) {
  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} className="max-w-sm p-6">
      <div className="text-center">
        <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${danger ? 'bg-red-500/10' : 'bg-purple-500/10'}`}>
          <i className={`fa-solid ${danger ? 'fa-triangle-exclamation text-red-400' : 'fa-question text-purple-400'} text-lg`}></i>
        </div>
        <h3 className="text-base font-bold text-white mb-2">{title}</h3>
        <p className="text-xs text-slate-400 mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2 text-slate-300 text-xs font-bold hover:text-white hover:bg-[#1a2333] rounded-lg transition disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition disabled:opacity-50 ${
              danger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-1"></i> : null}
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
