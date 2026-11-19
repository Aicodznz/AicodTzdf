import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error.',
    };
  }

  override componentDidCatch(error: Error): void {
    console.error('OILCOM ErrorBoundary caught:', error);
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed.error) {
          friendly = `${parsed.error} (${parsed.operationType || 'op'} · ${parsed.path || 'db'})`;
        }
      } catch {
        // plain string message
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f6f7f6] dark:bg-[#090e0b] p-6">
          <div className="max-w-lg w-full rounded-2xl border border-neutral-200 dark:border-emerald-950 bg-white dark:bg-[#121b16] p-8 shadow-sm">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
              Hitilafu ya Mfumo / System Error
            </h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 px-5 py-2.5 rounded-xl bg-[#F5B800] hover:bg-[#e0a800] text-[#0b120e] font-semibold text-sm transition-colors cursor-pointer"
            >
              Pakia Upya / Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
