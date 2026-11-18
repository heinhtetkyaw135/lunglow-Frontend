import React from 'react';
import { useLunglowData } from '../../hooks/useLunglowData';

export function ToastBanner() {
  const { toastMessage, toastTone = 'success', showToast } = useLunglowData();
  if (!toastMessage) return null;
  const isError = toastTone === 'error';
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`fixed top-5 right-5 z-50 font-semibold text-sm sm:text-base px-5 py-3 rounded-full shadow-[0_12px_32px_rgba(0,0,0,0.35)] border flex items-center gap-3 animate-toast-in ${
        isError
          ? 'bg-[#D64545] text-white border-white/30 shadow-[0_12px_32px_rgba(214,69,69,0.45)]'
          : 'bg-[#5FB032] text-black border-white/40 shadow-[0_12px_32px_rgba(95,176,50,0.45)]'
      }`}
    >
      <span className={`w-2.5 h-2.5 rounded-full ${isError ? 'bg-white' : 'bg-black'} animate-ping shrink-0`} />
      <span>{toastMessage}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => showToast('')}
        className={`ml-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition ${
          isError ? 'bg-black/25 hover:bg-black/40' : 'bg-black/15 hover:bg-black/25'
        }`}
      >
        ✕
      </button>
    </div>
  );
}
