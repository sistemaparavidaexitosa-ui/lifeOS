"""Los motores: perfil, identidad, afirmaciones y visualización."""

import pytest

from manifestation import affirmation_engine, identity_engine, profile_builder
from manifestation import visualization_engine as viz
from manifestation.manifestation_models import Area, FactRef, GoalRef, StylePreferences, TraitRef

from .factories import contexto, preferencia

# --- PERFIL ----------------------------------------------------------------


def test_los_rasgos_se_ordenan_por_donde_duele():
    p = profile_builder.build(contexto(), "u1")
    assert [t.id for t in p.traits] == ["t1", "t2", "t3"]
    # El que no tiene datos va al final: no es que vaya bien, es que no se sabe.
    assert p.traits[-1].completion30 is None


def test_sin_dias_suficientes_no_llega_ninguna_preferencia():
    # LifeOS ya dice `enough: False`; aquí se respeta sin discutir.
    c = contexto(style=StylePreferences(n=6, enough=False, note="Llevo 6 días.", preferences=[preferencia()]))
    assert profile_builder.build(c, "u1").style == []


def test_las_preferencias_de_confianza_baja_se_descartan():
    c = contexto(
        style=StylePreferences(
            n=20,
            enough=True,
            preferences=[preferencia(confianza="baja"), preferencia(etiqueta="escena", valor="logro", confianza="alta")],
        )
    )
    estilo = profile_builder.build(c, "u1").style
    assert [p.valor for p in estilo] == ["logro"]


def test_un_perfil_pobre_se_reconoce_como_tal():
    c = contexto(traits=[], goals=[], facts=[])
    assert profile_builder.build(c, "u1").es_perfil_pobre is True


# --- IDENTIDAD --------------------------------------------------------------


def test_el_area_de_foco_es_donde_hay_algo_vivo_y_va_peor():
    # t1 (Personal) al 42 %, t2 (Finanzas) al 78 %. La meta viva está en
    # Finanzas, así que gana Finanzas pese a ir mejor: en Personal no hay nada
    # en marcha que empujar.
    n = identity_engine.compose(profile_builder.build(contexto(), "u1"))
    assert n.focus_area is Area.FINANZAS


def test_sin_metas_el_foco_es_simplemente_el_area_mas_floja():
    c = contexto(goals=[])
    n = identity_engine.compose(profile_builder.build(c, "u1"))
    assert n.focus_area is Area.PERSONAL


def test_el_foco_siempre_es_un_area_de_las_siete():
    for c in (contexto(), contexto(goals=[]), contexto(traits=[], goals=[])):
        n = identity_engine.compose(profile_builder.build(c, "u1"))
        assert n.focus_area is None or n.focus_area in set(Area)


def test_el_retrato_del_presente_usa_cifras_y_no_adjetivos():
    n = identity_engine.compose(profile_builder.build(contexto(), "u1"))
    assert "42 %" in n.current
    assert "sin hábitos vinculados" in n.current


def test_solo_se_pueden_citar_los_hechos_que_existen():
    n = identity_engine.compose(profile_builder.build(contexto(), "u1"))
    assert n.citable_facts == ["habits.streak.h1", "growth.goal.g1", "habits.weak.h2"]


# --- AFIRMACIONES -----------------------------------------------------------


def test_con_perfil_pobre_se_piden_diez_y_no_veinte():
    # Inventar veinte afirmaciones personales sobre alguien de quien no se sabe
    # nada es la fábrica de frases de taza que todo esto intenta evitar.
    c = contexto(traits=[], goals=[], facts=[])
    slate = affirmation_engine.plan(profile_builder.build(c, "u1"))
    assert slate.total == 10


def test_con_material_de_sobra_se_sube_sin_pasar_del_tope():
    muchos = [TraitRef(id=f"t{i}", name=f"Rasgo {i}", area="Carrera", completion30=50) for i in range(10)]
    hechos = [FactRef(id=f"f{i}", label=f"hecho {i}") for i in range(10)]
    metas = [GoalRef(title=f"Meta {i}", area="Salud", progressPct=10) for i in range(5)]
    slate = affirmation_engine.plan(profile_builder.build(contexto(traits=muchos, goals=metas, facts=hechos), "u1"))
    assert slate.total == 20


def test_ninguna_categoria_acapara_el_brief():
    slate = affirmation_engine.plan(profile_builder.build(contexto(), "u1"))
    tope = max(1, int(slate.total * affirmation_engine.MAX_PROPORCION_CATEGORIA))
    assert slate.reparto, "debería haber reparto"
    for categoria, n in slate.reparto.items():
        assert n <= tope, f"{categoria} se lleva {n} de {slate.total}"


def test_el_reparto_suma_el_total_pedido():
    slate = affirmation_engine.plan(profile_builder.build(contexto(), "u1"))
    assert sum(slate.reparto.values()) == slate.total


def test_el_jaccard_es_el_mismo_que_en_typescript():
    assert affirmation_engine.similitud("Cumplo lo que me prometo", "cumplo lo que prometo") == 1.0
    assert affirmation_engine.similitud("Ahorro para mi libertad", "Entreno cada mañana") == 0.0


def test_refine_descarta_repetidas_y_atribuidas_y_rasgos_inventados():
    entrada = [
        {"texto": "Cumplo lo que me prometo aunque nadie mire", "rasgoId": "t1", "categoria": "Disciplina"},
        {"texto": "Cumplo lo que prometo aunque nadie me mire", "rasgoId": "t1"},  # repetida entre sí
        {"texto": "El éxito es un hábito. — James Clear", "rasgoId": "t1"},  # atribuida
        {"texto": "Mi dinero trabaja mientras duermo", "rasgoId": "fantasma"},  # rasgo inventado
    ]
    r = affirmation_engine.refine(entrada, previas=[], rasgos_validos={"t1", "t2"}, maximo=20)
    textos = [a["texto"] for a in r.aceptadas]
    assert textos == ["Cumplo lo que me prometo aunque nadie mire", "Mi dinero trabaja mientras duermo"]
    assert r.aceptadas[1]["rasgoId"] == "", "un rasgo que no existe se cae"
    assert any("nombra a un autor" in p for p in r.problemas)


def test_refine_compara_contra_lo_escrito_dias_antes():
    r = affirmation_engine.refine(
        [{"texto": "Cumplo lo que me prometo aunque nadie me mire", "rasgoId": ""}],
        previas=["Cumplo lo que me prometo, aunque nadie mire"],
        rasgos_validos=set(),
        maximo=20,
    )
    assert r.aceptadas == []


@pytest.mark.parametrize("texto", ["Como enseña Joe Dispenza, el cuerpo aprende", "La constancia gana. — Robin Sharma"])
def test_dispenza_y_los_demas_se_detectan(texto):
    assert affirmation_engine.cita_atribuida(texto) is True


# --- VISUALIZACIÓN ----------------------------------------------------------


def nueve_pasos(segundos=35):
    return [{"texto": f"Paso {i}: algo concreto está pasando.", "segundos": segundos} for i in range(9)]


def test_los_nueve_tiempos_son_obligatorios():
    r = viz.validate(nueve_pasos()[:8], min_segundos=240, max_segundos=420, max_pasos=12)
    assert not r.ok
    assert any("el arco son 9" in p for p in r.problemas)


def test_nueve_pasos_pasan_y_el_reloj_se_ajusta_al_rango():
    r = viz.validate(nueve_pasos(20), min_segundos=240, max_segundos=420, max_pasos=12)
    assert r.ok
    assert len(r.pasos) == 9
    assert 240 <= sum(p["segundos"] for p in r.pasos) <= 420


def test_una_escena_larguisima_se_reescala_sin_perder_pasos():
    r = viz.validate(nueve_pasos(120), min_segundos=240, max_segundos=420, max_pasos=12)
    assert len(r.pasos) == 9, "reescalar no es recortar"
    assert sum(p["segundos"] for p in r.pasos) == 420


def test_imagina_que_se_rechaza_porque_describe_en_vez_de_vivir():
    pasos = nueve_pasos()
    pasos[2] = {"texto": "Imagina que estás en tu oficina.", "segundos": 40}
    r = viz.validate(pasos, min_segundos=240, max_segundos=420, max_pasos=12)
    assert not r.ok
    assert any("en vez de vivirla" in p for p in r.problemas)


def test_el_arco_esta_completo_y_en_orden():
    assert [b[0] for b in viz.BEATS] == [
        "respiracion",
        "calma",
        "escena",
        "sensaciones",
        "conversaciones",
        "resultados",
        "emocion",
        "gratitud",
        "regreso",
    ]
    assert 240 <= sum(b[2] for b in viz.BEATS) <= 420
