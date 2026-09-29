import React from 'react';

/**
 * Reusable modal overlay wrapper.
 * Replaces 15+ identical `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm` patterns.
 *
 * @param {boolean} open - Whether the modal is visible
 * @param {Function} onClose - Called when the backdrop is clicked (optional)
 * @param {React.ReactNode} children - Modal content
 * @param {string} className - Additional classes for the content container
 */
export default function Modal({ open, onClose, children, className = '' }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        className={`bg-[#0f1422] border border-[#1f2a44] rounded-2xl shadow-2xl w-full ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
