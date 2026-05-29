# Shared Components

These components use only `--color-*` and `--radius-*` CSS variables, which are aliased
in honeycomb-ui/src/styles.css. Any component here can be copied as-is into honeycomb-ui.

Components:
- `CopyBlock` — copyable code/command block
- `MetricBar` — horizontal progress bar with label and percentage value; color-codes by threshold (green/amber/red)
- `StatusBadge` — online/offline badge with colored dot
- `formatRelative` — formats an ISO timestamp as a relative human-readable string (e.g. "3m ago")
