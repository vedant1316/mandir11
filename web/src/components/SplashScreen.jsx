import { useState, useEffect } from 'react';

const SPLASH_KEY = 'mandir11_splash_seen';

export default function SplashScreen({ onFinish }) {
  // Check if splash was already shown in this session
  const [shouldShow, setShouldShow] = useState(() => {
    try {
      return !sessionStorage.getItem(SPLASH_KEY);
    } catch {
      return true;
    }
  });

  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!shouldShow) {
      if (onFinish) onFinish();
      return;
    }

    // Start fade-out at 1400ms
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 1400);

    // Complete transition and remove at 1800ms
    const doneTimer = setTimeout(() => {
      try {
        sessionStorage.setItem(SPLASH_KEY, 'true');
      } catch {
        // Fallback for private mode or storage restrictions
      }
      setShouldShow(false);
      if (onFinish) onFinish();
    }, 1800);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [shouldShow, onFinish]);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(SPLASH_KEY, 'true');
    } catch {
      // Storage fallback
    }
    setFading(true);
    setTimeout(() => {
      setShouldShow(false);
      if (onFinish) onFinish();
    }, 200);
  };

  if (!shouldShow) return null;

  return (
    <div
      id="splash-screen"
      role="banner"
      onClick={handleDismiss}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0B0F19] text-white transition-opacity duration-400 ease-out cursor-pointer select-none ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background ambient lighting */}
      <div className="absolute w-72 h-72 rounded-full bg-brand-500/20 blur-3xl pointer-events-none -translate-y-6 animate-pulse" />

      <div className="relative z-10 flex flex-col items-center text-center px-4 animate-slide-up">
        {/* Logo Badge */}
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-brand-600 to-brand-400 p-[2px] shadow-2xl shadow-brand-500/30 mb-6 group transform hover:scale-105 transition-transform duration-300">
          <div className="w-full h-full bg-surface-900 rounded-[22px] flex items-center justify-center">
            <span className="text-4xl sm:text-5xl transform -translate-y-0.5">🏏</span>
          </div>
        </div>

        {/* Brand Title */}
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-2">
          Mandir <span className="text-brand-400">11</span>
        </h1>

        {/* Creator Attribution */}
        <p className="text-xs sm:text-sm font-semibold tracking-widest uppercase text-gray-400 mt-2.5 flex items-center gap-2">
          <span className="w-4 h-px bg-brand-500/40" />
          Created by Vedant
          <span className="w-4 h-px bg-brand-500/40" />
        </p>

        {/* Subtle loading indicator */}
        <div className="mt-8 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" />
        </div>
      </div>
    </div>
  );
}
