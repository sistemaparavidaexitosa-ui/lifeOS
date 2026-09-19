"use client";

/**
 * La vuelta al centro (D-166).
 *
 * ABAJO Y CENTRADO, no en una esquina: a la derecha se solapa con el botón de
 * enviar del rail del chat en pantallas anchas, y a la izquierda con el menú
 * lateral. En el medio no estorba a nada y se alcanza con el pulgar.
 */
export default function BotonCentro({ onClick }: { onClick: () => void }) {
  return (
    <button className="rit-boton-centro" onClick={onClick} aria-label="Abrir el centro">
      Centro
    </button>
  );
}
