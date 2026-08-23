// Set de íconos ligero (SVG inline, sin dependencias nuevas de npm — F1/D-008:
// este proyecto mantiene deliberadamente cero paquetes de íconos de terceros).
// Estilo "stroke" 1.8px, 20x20 viewBox, hereda color con currentColor para
// integrarse con los chips/estados de color de la sidebar y el tablero.

import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

function base(children: React.ReactNode, props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) =>
  base(
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </>,
    p
  );

export const IconReports = (p: IconProps) =>
  base(
    <>
      <path d="M4 19h16" />
      <rect x="6" y="11" width="3" height="7" rx="0.5" />
      <rect x="11" y="7" width="3" height="11" rx="0.5" />
      <rect x="16" y="3" width="3" height="15" rx="0.5" />
    </>,
    p
  );

export const IconBoard = (p: IconProps) =>
  base(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M8 4v16M13 9h6M13 13h6M13 17h4" />
    </>,
    p
  );

export const IconEisenhower = (p: IconProps) =>
  base(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M12 3v18M3 12h18" />
    </>,
    p
  );

export const IconPlanning = (p: IconProps) =>
  base(
    <>
      <path d="M9 3.5 3 6v12l6-2.5 6 2.5 6-2.5V5l-6 2.5-6-2.5Z" />
      <path d="M9 3.5v12M15 5.5v12" />
    </>,
    p
  );

export const IconTime = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>,
    p
  );

export const IconHabits = (p: IconProps) =>
  base(
    <>
      <path d="M6.5 3h11A1.5 1.5 0 0 1 19 4.5v15.7a.6.6 0 0 1-.9.5L12 18l-6.1 2.7a.6.6 0 0 1-.9-.5V4.5A1.5 1.5 0 0 1 6.5 3Z" />
    </>,
    p
  );

export const IconWorkspaces = (p: IconProps) =>
  base(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3 2.5-5.2 5.5-5.2S14.5 17 14.5 20" />
      <circle cx="17" cy="8.5" r="2.4" />
      <path d="M15.4 14.4c2.6.3 4.6 2.3 4.6 5" />
    </>,
    p
  );

export const IconMoney = (p: IconProps) =>
  base(
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 6v-.5A2.5 2.5 0 0 1 8.5 3h9" />
    </>,
    p
  );

export const IconBudget = (p: IconProps) =>
  base(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7 9h10M7 13h6M7 17h4" />
    </>,
    p
  );

export const IconInvestments = (p: IconProps) =>
  base(
    <>
      <path d="M4 19h16" />
      <path d="m5 15 5-5 3.5 3.5L20 6" />
      <path d="M15.5 6H20v4.5" />
    </>,
    p
  );

export const IconSavings = (p: IconProps) =>
  base(
    <>
      <path d="M4 12c0-4.5 3.5-8 8-8s8 3.5 8 8-3.5 8-8 8" />
      <path d="M4 12c0 2 .8 3.7 2.1 5M9 4.6C6.1 5.7 4 8.6 4 12" />
      <path d="M12 8v4l2.5 2" />
    </>,
    p
  );

export const IconDebt = (p: IconProps) =>
  base(
    <>
      <path d="M7 4h8l3 3v13H7z" />
      <path d="M15 4v3h3" />
      <path d="M9.5 13.5c0-1 .9-1.7 2-1.7s2 .6 2 1.5-1 1.4-2 1.5-2 .6-2 1.5 1 1.5 2 1.5 2-.7 2-1.7" />
      <path d="M11.5 10.8v1M11.5 18.2v1" />
    </>,
    p
  );

export const IconCashback = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12.5c0-1.1 1-2 2.4-2s2.4.7 2.4 1.8-1.2 1.7-2.4 1.7-2.4.7-2.4 1.8 1.1 1.8 2.4 1.8 2.4-.9 2.4-2" />
      <path d="M11.4 9v1M11.4 16.8v1" />
    </>,
    p
  );

export const IconWealth = (p: IconProps) =>
  base(
    <>
      <path d="M3 20 8.5 9 12 15l3-5 6 10" />
    </>,
    p
  );

export const IconGoals = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </>,
    p
  );

export const IconHousehold = (p: IconProps) =>
  base(
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </>,
    p
  );

export const IconSettings = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.7-1.3-1.7-3-2 .6a7.7 7.7 0 0 0-2.6-1.5L14.5 3h-3l-.3 2.3a7.7 7.7 0 0 0-2.6 1.5l-2-.6-1.7 3 1.7 1.3a7.6 7.6 0 0 0 0 3L4.9 14.8l1.7 3 2-.6a7.7 7.7 0 0 0 2.6 1.5L11.5 21h3l.3-2.3a7.7 7.7 0 0 0 2.6-1.5l2 .6 1.7-3Z" />
    </>,
    p
  );

export const IconChevronRight = (p: IconProps) => base(<path d="m9 6 6 6-6 6" />, p);
export const IconChevronDown = (p: IconProps) => base(<path d="m6 9 6 6 6-6" />, p);
export const IconPlus = (p: IconProps) => base(<path d="M12 5v14M5 12h14" />, p);
export const IconComment = (p: IconProps) =>
  base(<path d="M4 5h16v11H9l-5 4V5Z" />, p);
export const IconUser = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.3 3.1-5.8 7-5.8s7 2.5 7 5.8" />
    </>,
    p
  );
export const IconCalendar = (p: IconProps) =>
  base(
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
    </>,
    p
  );
export const IconMenu = (p: IconProps) => base(<path d="M4 6h16M4 12h16M4 18h16" />, p);
export const IconClose = (p: IconProps) => base(<path d="M6 6l12 12M18 6 6 18" />, p);
export const IconLogout = (p: IconProps) =>
  base(
    <>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M15 16l4-4-4-4M19 12H9" />
    </>,
    p
  );
export const IconSparkles = (p: IconProps) =>
  base(
    <>
      <path d="M12 3v4M12 17v4M4 12h4M16 12h4M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
    </>,
    p
  );
export const IconTrash = (p: IconProps) =>
  base(
    <>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </>,
    p
  );

export const IconDevelopment = (p: IconProps) =>
  base(
    <>
      <path d="M12 3v18" />
      <path d="M5 8l7-5 7 5" />
      <path d="M5 16l7 5 7-5" />
    </>,
    p
  );

export const IconPersonalGoals = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" />
    </>,
    p
  );

export const IconRoutines = (p: IconProps) =>
  base(
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l3 2" />
    </>,
    p
  );

export const IconLibrary = (p: IconProps) =>
  base(
    <>
      <path d="M4 5v14" />
      <path d="M8 4h9a2 2 0 0 1 2 2v13H8z" />
      <path d="M8 9h8" />
    </>,
    p
  );

export const NAV_ICONS = {
  home: IconHome,
  reports: IconReports,
  board: IconBoard,
  eisenhower: IconEisenhower,
  planning: IconPlanning,
  time: IconTime,
  habits: IconHabits,
  workspaces: IconWorkspaces,
  money: IconMoney,
  budget: IconBudget,
  investments: IconInvestments,
  savings: IconSavings,
  debt: IconDebt,
  cashback: IconCashback,
  wealth: IconWealth,
  goals: IconGoals,
  household: IconHousehold,
  settings: IconSettings,
  development: IconDevelopment,
  personalGoals: IconPersonalGoals,
  routines: IconRoutines,
  library: IconLibrary
} as const;

export type NavIconKey = keyof typeof NAV_ICONS;
