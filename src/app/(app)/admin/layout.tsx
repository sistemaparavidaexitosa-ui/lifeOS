import { notFound } from "next/navigation";
import Link from "next/link";
import { isPlatformAdmin } from "@/lib/data/templates";

// La puerta del panel.
//
// 404 Y NO REDIRECT, a diferencia del resto de la aplicación. Un redirect a
// /home contesta «esto existe, pero no es para ti»; un 404 no contesta nada. La
// ruta no está enlazada en ningún sitio salvo en Configuración y solo para
// quien la puede usar, así que lo consistente es que, para todos los demás,
// sencillamente no exista.
//
// No es la única defensa —la RLS de 0044 rechaza cualquier escritura de quien
// no es admin, y las acciones lo vuelven a comprobar—, es la primera.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isPlatformAdmin())) notFound();

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        <Link href="/admin">Administración</Link> · catálogo de plantillas
      </div>
      {children}
    </div>
  );
}
