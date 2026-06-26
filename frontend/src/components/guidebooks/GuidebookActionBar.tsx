'use client';

interface GuidebookActionBarProps {
  onComingSoon: (label: string) => void;
}

const LEFT_ACTIONS = ['Approve', 'Edit', 'Delete'];
const RIGHT_ACTIONS = ['Download PDF', 'Print', 'Share', 'Version History'];

/** Bottom action bar — all buttons are visual placeholders this milestone. */
export default function GuidebookActionBar({ onComingSoon }: GuidebookActionBarProps) {
  return (
    <div className="gb-actionbar">
      <div className="gb-actionbar-group">
        {LEFT_ACTIONS.map((label) => (
          <button
            key={label}
            type="button"
            className="wl-btn"
            title={label}
            onClick={() => onComingSoon(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="gb-actionbar-group">
        {RIGHT_ACTIONS.map((label) => (
          <button
            key={label}
            type="button"
            className="wl-btn"
            title={label}
            onClick={() => onComingSoon(label)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="wl-btn wl-btn-primary"
          title="Open Care Entry"
          onClick={() => onComingSoon('Open Care Entry')}
        >
          Open Care Entry
        </button>
      </div>
    </div>
  );
}
