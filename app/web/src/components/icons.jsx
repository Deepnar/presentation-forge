/** Shared inline stroke icons — one consistent set beats an icon dependency.
 *  Stroke 1.8 throughout; the GitHub mark is a filled silhouette by convention. */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function ChevronLeft(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
export function ChevronRight(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
export function ChevronDown(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
export function PanelLeftClose(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m13 8 3 4-3 4" />
    </svg>
  );
}
export function PanelLeftOpen(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m14 8 3 4-3 4" />
    </svg>
  );
}
export function PanelLeft(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}
export function LayersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 14 9 5 9-5" />
    </svg>
  );
}
export function PaletteIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="M12 21a9 9 0 1 1 9-9c0 1.7-1.3 3-3 3h-1.5a2 2 0 0 0-1.4 3.4A2 2 0 0 1 12 21Z" />
      <circle cx="7.5" cy="11.5" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16.5" cy="11.5" r="1" />
    </svg>
  );
}
export function IdIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2" /><path d="M5.5 16.5c.7-1.6 2-2.4 3.5-2.4s2.8.8 3.5 2.4M15 10h3.5M15 13.5h3.5" />
    </svg>
  );
}
export function DocIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}
export function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}
export function SparkleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4Z" />
    </svg>
  );
}
export function SlidersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h13M21 18h-1" />
      <circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="18.5" cy="18" r="2" />
    </svg>
  );
}
export function UpArrowIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="M12 19V5m0 0-6 6m6-6 6 6" />
    </svg>
  );
}
export function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function DownloadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
    </svg>
  );
}
export function ChatIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props} {...stroke}>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5Z" />
    </svg>
  );
}
export function GithubIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props} aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.14c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 2.87-.39c.97 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12v3.14c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}
