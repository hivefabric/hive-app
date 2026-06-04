# Shared Components

These components use only `--color-*` and `--radius-*` CSS variables, which are aliased
in honeycomb-ui/src/styles.css. Any component here can be copied as-is into honeycomb-ui.

## Components

### CopyBlock
Copyable code/command block with a copy-to-clipboard button and optional label.

Props: `text: string`, `label?: string`

### MetricBar
Horizontal progress bar with a label and percentage value. Color-codes by threshold:
green below 70%, amber 70–89%, red 90%+.

Props: `label: string`, `value?: number | null`

### StatusBadge
Online/offline badge with a colored dot indicator.

Props: `online: boolean`

### formatRelative
Formats an ISO timestamp as a relative human-readable string (e.g. "3m ago", "2h ago").

Export: `formatRelative(iso: string): string`

### NodeCard
Full node card for displaying a comb/compute node: status badge, CPU/memory/battery
metric bars, hardware details, capability URN tags, cell list, and last-seen timestamp.
Clicking the card opens the detail modal.

Props: `node: CombNode`, `onClick?: () => void`

Imports from `./MetricBar`, `./StatusBadge`, `./formatRelative`.

## Using in honeycomb-ui

These components use only `--color-*` and `--radius-*` CSS variables.
honeycomb-ui has aliases for these variables (see src/styles.css :root).
To use: copy the .tsx file to honeycomb-ui/src/shared/ and update imports.

For NodeCard specifically, update the type from `CombNode` (hive-app) to `NodeView`
(honeycomb-ui's equivalent type in src/types.ts). The field shapes are compatible.
