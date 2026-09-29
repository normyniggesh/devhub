import { useEffect } from 'react';

/**
 * Hook that fires a callback when a click occurs outside the referenced element.
 * Replaces the duplicated mousedown + menuRef.current.contains() pattern
 * found in Project.jsx, Files.jsx, and similar pages.
 *
 * @param {React.RefObject} ref - React ref attached to the element to watch
 * @param {Function} handler - Callback fired on outside click
 * @param {boolean} active - Whether the hook is currently active (default: true)
 */
export function useClickOutside(ref, handler, active = true) {
  useEffect(() => {
    if (!active) return;

    const listener = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        handler(e);
      }
    };

    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler, active]);
}
