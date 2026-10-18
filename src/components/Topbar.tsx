"use client";

import { IconMenu } from "./icons";
import { Avatar } from "./ui";

/**
 * La barra superior del rediseño: el menú (solo Configuración), el título de
 * la pantalla y la campana. Vidrio sobre el fondo, sin borde: las pestañas de
 * la sección, debajo, ponen la línea.
 */
export default function Topbar({
  title,
  userName,
  bell,
  onMenuClick
}: {
  title: React.ReactNode;
  userName: string;
  /** La bandeja de menciones, ya cargada por el layout. */
  bell?: React.ReactNode;
  onMenuClick: () => void;
}) {
  return (
    <header className="nx-topbar">
      <button className="nx-icono-btn" onClick={onMenuClick} aria-label="Abrir menú">
        <IconMenu width={20} height={20} />
      </button>
      <h1 className="nx-topbar-titulo" suppressHydrationWarning>
        {title}
      </h1>
      <div className="flex-1" />
      {bell}
      <Avatar name={userName} size={30} />
    </header>
  );
}
