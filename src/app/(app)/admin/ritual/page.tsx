import { Card } from "@/components/ui";
import { loadRitualPolicy } from "@/lib/data/ritual";
import RitualPolicyForm from "./RitualPolicyForm";

// El panel del arranque guiado (D-165).
//
// SEGMENTO ESTÁTICO JUNTO A `/admin/[kind]`, y no colisionan: `TEMPLATE_KINDS`
// es project | routine | habit, y en Next un segmento estático gana a uno
// dinámico. Se deja escrito para que nadie «arregle» la ruta dinámica metiendo
// «ritual» en la lista de tipos de plantilla.
//
// La puerta (404 a quien no es admin) la pone `admin/layout.tsx`, que envuelve
// esta página igual que al catálogo.
//
// NO HAY ESTADÍSTICAS DE USO AQUÍ, y no es un olvido: `ritual_runs` es privada
// por persona (0068), y ser administrador de plataforma es un privilegio de
// CONTENIDO, no de datos — hay una prueba pgTAP que lo fija. Un panel que
// contara quién omite el ritual abriría justo esa puerta.

export const metadata = { title: "Arranque guiado · Administración · Life OS" };

export default async function AdminRitualPage() {
  const policy = await loadRitualPolicy();

  return (
    <>
      {/* Tarjeta normal y no `hero`: sobre el degradado morado, el texto
          atenuado de la explicación no se leía. */}
      <Card>
        <h2 className="font-bold mb-1">Arranque guiado</h2>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          La secuencia que conduce la primera sesión del día. Lo que se decide aquí vale para <b>todos</b>; cada persona
          puede apagar partes desde su Configuración, pero nunca encender algo que esté apagado aquí. El contenido no se
          escribe en este panel: sale de las rutinas, el brief de identidad, las tareas y el dinero de cada quien.
        </p>
      </Card>
      <Card>
        <RitualPolicyForm policy={policy} />
      </Card>
    </>
  );
}
