import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** Stroke icons on the 24 px grid used by the mockups. */
function Svg({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SelectIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3l13 7-6 2-2.5 6z" />
  </Svg>
);
export const PenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 4c-7 1-12 6-14 13l-2 3 3-2c7-2 12-7 13-14z" />
    <path d="M8.5 15.5l5-5" />
  </Svg>
);
export const BrushIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 3l2 2-9 9-2-2z" />
    <path d="M9.5 13.5c-3 0-5 1.8-5 4.5 0 1-1 2.5-2 2.5 4 1 8 0 8.5-3.5" />
  </Svg>
);
export const LineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19L19 5" />
  </Svg>
);
export const ArrowIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19L19 5M10 5h9v9" />
  </Svg>
);
export const BoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="14" rx="1.5" />
  </Svg>
);
export const CircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
  </Svg>
);
export const TextIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 7V4h14v3M12 4v16M9 20h6" />
  </Svg>
);
export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M21 16l-5-5-9 8" />
  </Svg>
);
export const EraserIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 20h11M4.5 15.5l9-10 6.5 6-8.5 8.5H8.5z" />
    <path d="M9 11l6 5.5" />
  </Svg>
);
export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 010 12h-3" />
  </Svg>
);
export const RedoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 000 12h3" />
  </Svg>
);
export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  </Svg>
);
export const PaletteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 100 18c1.1 0 2-.9 2-2 0-1.2-1-1.6-1-2.6 0-.9.8-1.4 1.8-1.4H17a4 4 0 004-4c0-4.4-4-8-9-8z" />
    <circle cx="7.5" cy="11.5" r="1" />
    <circle cx="10" cy="7.5" r="1" />
    <circle cx="15" cy="7.5" r="1" />
  </Svg>
);
export const ImportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 16v4h16v-4" />
  </Svg>
);
export const HandIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 19l5-14 5 14M5 14h6" />
    <path d="M14 17c2-1 2.5-4 4.5-4 1.5 0 1 3 2.5 3" />
  </Svg>
);
export const ExportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V3M7 8l5-5 5 5" />
    <path d="M4 16v4h16v-4" />
  </Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);
export const FolderIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 012-2h5l2 2.5h7a2 2 0 012 2V17a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
  </Svg>
);
export const GripIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={3}>
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
  </Svg>
);
export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 4l4 4L9 19H5v-4z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
);
export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M15.5 5.5V5a1.5 1.5 0 00-1.5-1.5H5A1.5 1.5 0 003.5 5v9A1.5 1.5 0 005 15.5h.5" />
  </Svg>
);
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h16M9.5 6.5V5a1 1 0 011-1h3a1 1 0 011 1v1.5" />
    <path d="M6 6.5l1 12.5a1.5 1.5 0 001.5 1.4h7a1.5 1.5 0 001.5-1.4L18 6.5M10 10.5v6M14 10.5v6" />
  </Svg>
);
export const PagesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="3" width="13" height="15.5" rx="1.5" />
    <path d="M3.5 6.5v12a2.5 2.5 0 002.5 2.5h9.5M9.5 7.5h6M9.5 11h6M9.5 14.5h3.5" />
  </Svg>
);
export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 3.5l5.5 5.5-6 1.2-4.8 4.8-1.2-1.2 1.2-4.8L3.5 14.5l6-11z" />
    <path d="M3.5 20.5l6.5-6.5" />
  </Svg>
);
export const LinesIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.6}>
    <path d="M3 7h18M3 12h18M3 17h18" />
    <path d="M5 3v18" strokeOpacity={0.4} />
  </Svg>
);
export const RestIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
  </Svg>
);

/** The app mark: a d20, in gilt. */
export function NotebookMark() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--gilt)"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l9 5v10l-9 5-9-5V7z" />
      <path d="M12 6l5 9H7z" />
      <path d="M3 7l4 8M21 7l-4 8M7 15l5 7 5-7M12 2v4" />
    </svg>
  );
}
