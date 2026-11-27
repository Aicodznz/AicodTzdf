import React from 'react';

export interface CurvedBottomNavItem<T extends string = string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface CurvedBottomNavProps<T extends string = string> {
  items: CurvedBottomNavItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
}

export function CurvedBottomNav<T extends string = string>({
  items,
  activeId,
  onSelect,
  ariaLabel = 'Mobile Bottom Navigation',
}: CurvedBottomNavProps<T>) {
  const count = Math.max(1, items.length);
  const foundIndex = items.findIndex((item) => item.id === activeId);
  const activeIndex = foundIndex >= 0 ? foundIndex : 0;
  const activeItem = items[activeIndex];
  const shiftPercent = ((activeIndex + 0.5) / count - 0.5) * 100;

  const gridColsClass =
    count === 2
      ? 'grid-cols-2'
      : count === 3
        ? 'grid-cols-3'
        : count === 4
          ? 'grid-cols-4'
          : 'grid-cols-5';

  const ActiveIcon = activeItem?.icon;

  return (
    <nav
      aria-label={ariaLabel}
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 select-none pointer-events-none"
    >
      <div className="relative w-full h-[56px] pointer-events-auto">
        {/* Outer Drop-Shadow Wrapper so shadow hugs both rounded outer corners and the concave notch */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            filter: 'drop-shadow(0 -6px 18px rgba(8, 26, 75, 0.15))',
          }}
        >
          {/* Sliding Concave Notch Background clipped cleanly with rounded-t-[22px] outer side corners */}
          <div className="absolute inset-0 rounded-t-[22px] overflow-hidden">
            <div
              className="absolute inset-0 flex justify-center transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ transform: `translateX(${shiftPercent}%)` }}
            >
              <div className="relative h-[56px] w-[84px] shrink-0">
                {/* Left Solid Bar Wing */}
                <div className="absolute top-0 bottom-0 right-[83px] w-screen bg-white dark:bg-[#0B1326] border-t border-neutral-200/80 dark:border-blue-900/90" />

                {/* Concave Cradle SVG Centerpiece */}
                <svg
                  viewBox="0 0 84 56"
                  width="84"
                  height="56"
                  className="relative z-10 block w-[84px] h-[56px]"
                >
                  <path
                    d="M 0 0 L 2 0 C 18 0, 14 33, 42 33 C 70 33, 66 0, 82 0 L 84 0 L 84 56 L 0 56 Z"
                    className="fill-white dark:fill-[#0B1326]"
                  />
                  <path
                    d="M 0 0.5 L 2 0.5 C 18 0.5, 14 33.5, 42 33.5 C 70 33.5, 66 0.5, 82 0.5 L 84 0.5"
                    fill="none"
                    strokeWidth="1"
                    className="stroke-neutral-200/80 dark:stroke-blue-900/90"
                  />
                </svg>

                {/* Right Solid Bar Wing */}
                <div className="absolute top-0 bottom-0 left-[83px] w-screen bg-white dark:bg-[#0B1326] border-t border-neutral-200/80 dark:border-blue-900/90" />
              </div>
            </div>
          </div>
        </div>

        {/* Elevated Floating Active White Circle */}
        {activeItem && ActiveIcon && (
          <div
            className="absolute inset-x-0 top-0 h-[56px] flex justify-center pointer-events-none z-20 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(${shiftPercent}%)` }}
          >
            <button
              type="button"
              onClick={() => onSelect(activeItem.id)}
              aria-label={activeItem.label}
              className="-mt-[19px] w-11 h-11 rounded-full bg-white dark:bg-[#0E172E] border border-neutral-200/80 dark:border-blue-800/80 shadow-[0_6px_20px_rgba(8,26,75,0.22)] flex items-center justify-center pointer-events-auto cursor-pointer active:scale-95 transition-transform"
            >
              <ActiveIcon className="w-[21px] h-[21px] text-[#081A4B] dark:text-[#F5B800] stroke-[2.2]" />
            </button>
          </div>
        )}

        {/* Interactive Tab Slots */}
        <div className={`relative z-10 grid ${gridColsClass} h-[56px] items-stretch`}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeItem?.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={active ? 'page' : undefined}
                className="relative flex flex-col items-center justify-end pb-1.5 min-h-[44px] min-w-[44px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0B2A6F]"
              >
                <span
                  aria-hidden="true"
                  className={`flex items-center justify-center transition-all duration-200 ${
                    active
                      ? 'opacity-0 scale-75 h-[22px]'
                      : 'opacity-100 scale-100 mb-0.5 text-neutral-400 dark:text-blue-200/55'
                  }`}
                >
                  <Icon className="w-5 h-5 stroke-[1.85]" />
                </span>
                <span
                  className={`text-[10px] leading-none whitespace-nowrap truncate max-w-[92%] px-0.5 transition-colors duration-200 ${
                    active
                      ? 'font-extrabold text-[#D92027] dark:text-[#F5B800]'
                      : 'font-semibold text-neutral-500 dark:text-blue-200/75'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* iOS/Android Safe Area Bottom Fill */}
      <div className="bg-white dark:bg-[#0B1326] h-[env(safe-area-inset-bottom)] pointer-events-auto" />
    </nav>
  );
}
