import type { SVGProps } from "react";

// Icones inline (traco 1.75, grade 24) para nao trazer biblioteca so por uma dezena de simbolos.
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  rules: "M4 6h10M4 12h16M4 18h7M18 4v4M14 6h8M15 16v4M11 18h8",
  menu: "M4 7h16M4 12h16M4 17h16",
  x: "M6 6l12 12M18 6 6 18",
  sun: "M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  left: "M15 18l-6-6 6-6",
  right: "M9 18l6-6-6-6",
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M19 12l-7 7-7-7",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  hand: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  bank: "M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  check: "M5 12.5l4.5 4.5L19 7",
  alert: "M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  file: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5",
  refresh: "M20 11a8 8 0 0 0-14.8-4M4 4v4h4M4 13a8 8 0 0 0 14.8 4M20 20v-4h-4",
  send: "M4 12 20 4l-6 16-3-7z",
  plus: "M12 5v14M5 12h14",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  card: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h3",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14.5h.01",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  // categorias
  food: "M7 3v6a2.5 2.5 0 0 0 5 0V3M9.5 11.5V21M17 3c-2 1.5-3 3.5-3 6.5V13h3v8",
  cart: "M3 4h2l2.5 11h11L21 7H6.5M9.5 20h.01M17.5 20h.01",
  car: "M4 16l2-6h12l2 6M3 16h18v4h-2.5v-2h-13v2H3zM7.5 13h.01M16.5 13h.01",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  book: "M4 4h6a2.5 2.5 0 0 1 2.5 2.5V20A2 2 0 0 0 10.5 18H4zM20 4h-6a2.5 2.5 0 0 0-2.5 2.5V20a2 2 0 0 1 2-2H20z",
  cap: "M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6",
  film: "M4 5h16v14H4zM4 9h16M4 15h16M8 5v14M16 5v14",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  plane: "M21 15.5v-2l-8-5V4a1.5 1.5 0 0 0-3 0v4.5l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-6z",
  tag: "M20 13 13 20a1.5 1.5 0 0 1-2 0l-7-7V4h9l7 7a1.5 1.5 0 0 1 0 2zM8 8h.01",
  receipt: "M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21zM9 8h6M9 12h6",
  swap: "M4 7h13M14 4l3 3-3 3M20 17H7M10 14l-3 3 3 3",
  smile: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
  question: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8M12 17h.01",
  briefcase: "M3 8h18v12H3zM8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 13h18",
  coins: "M9 7.5c0-1.4 2.7-2.5 6-2.5s6 1.1 6 2.5S18.3 10 15 10s-6-1.1-6-2.5zM9 7.5v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4M3 12.5c0 1.4 2.7 2.5 6 2.5M3 12.5v4c0 1.4 2.7 2.5 6 2.5 1.2 0 2.3-.1 3.2-.4",
  bitcoin: "M9 4v16M12 4v2M12 18v2M9 6h5a3 3 0 0 1 0 6H9M9 12h6a3 3 0 0 1 0 6H9",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}
