# Propuesta: voluntariado de implementadores de IA para el cuartel

Borrador para conversar con jefatura del cuartel y Fundación D. Corte: 4 de noviembre de 2026. Todo lo que figura como propuesta o supuesto está para validar; no hay acuerdos firmados.

## Qué se propone

Que personas formadas como implementadoras de IA en la capacitación de la Bolsa de Comercio devuelvan horas trabajando en las herramientas del cuartel (`guardia/` y Cota). El trabajo se organiza en paquetes cerrados (ver [paquetes-voluntariado.md](paquetes-voluntariado.md)) y no depende de una persona en particular.

En la reunión se mencionó una cantidad de implementadores formados. Ese número es un antecedente y no se usa para planificar: primero hay que medir cuántas personas se anotan y cuántas horas sostienen.

## Lo que el voluntariado hace y no hace

| Hace | No hace |
|---|---|
| Código, pruebas y documentación sobre el entorno local con datos ficticios. | Acceder a la operación real, a Bravo/Brau ni a la base del cuartel. |
| Adaptadores apagados por defecto (transcriptor, extracción, canales). | Activar adaptadores ni conectar servicios externos. |
| Propuestas de mejora a partir de lo que relevó el cuartel. | Definir reglas operativas (bloqueos, avisos, umbrales): eso lo decide guardia. |
| Material de capacitación para el uso de las herramientas. | Ver denuncias, informes a Fiscalía ni datos personales. |

El acceso a datos reales queda en manos de personal del cuartel autorizado por función. Si en algún momento un voluntario necesita ver material reservado, se trata como alta de acceso separada, con acuerdo de confidencialidad y aprobación de jefatura.

## Roles

| Rol | Quién | Qué hace |
|---|---|---|
| Referente del cuartel | A designar por jefatura | Prioriza paquetes, valida que el resultado sirve en guardia, aprueba el paso a prueba. |
| Mantenedor por componente | A designar (mínimo dos por componente) | Revisa e integra aportes, cuida pruebas y seguridad, documenta el traspaso. |
| Coordinación de voluntariado | A designar por Fundación D | Convoca, asigna paquetes, sigue el avance y da de baja paquetes abandonados. |
| Implementador | Personas de la capacitación | Toma un paquete, lo entrega con pruebas y lo presenta. |

Componentes iniciales: mesa de radio y portón (O2–O4), bitácora e informes (B1/B3), métricas (O5), CRM (A1), Cota (C1).

## Cómo funciona un paquete

1. Coordinación publica el paquete con alcance, criterio de aceptación y dependencias.
2. Una persona (o una pareja) lo toma con un plazo propuesto. Si no hay avance en ese plazo, el paquete vuelve a quedar libre.
3. Trabaja en rama propia, con `npm test`, `npm run typecheck` y `npm run build` en verde.
4. Un mantenedor revisa. Ningún aporte se integra sin esa revisión.
5. El referente del cuartel confirma que el resultado responde a lo pedido antes de cualquier prueba en guardia.

## Continuidad

- Dos mantenedores por componente, para que la salida de una persona no frene el trabajo.
- Cada paquete deja documentación suficiente para que otra persona lo retome.
- Los secretos y accesos de producción no dependen de voluntarios.
- Traspaso documentado cuando un mantenedor deja el rol.

## Piloto propuesto

Duración y cupos a definir con Fundación D y el cuartel. Esquema sugerido:

| Etapa | Contenido | Salida |
|---|---|---|
| Arranque | Presentación del cuartel y de las herramientas; entorno local funcionando en la máquina de cada persona. | Lista de inscriptos con disponibilidad declarada. |
| Primera ronda | Paquetes sin dependencias externas (por ejemplo, mejoras de UI y pruebas). | Paquetes entregados y revisados. |
| Revisión | Encuentro con referente del cuartel y mantenedores. | Qué sirvió, qué no, horas reales sostenidas. |
| Segunda ronda | Paquetes que dependen de insumos ya obtenidos (plantilla de informe, definiciones de métricas). | Decisión de continuar, ampliar o cerrar. |

Indicadores del piloto: paquetes tomados, entregados y abandonados; tiempo de revisión; horas declaradas por persona; cuántos aportes llegaron a prueba en guardia.

## Puntos a validar

1. Con el cuartel: quién es el referente, qué componentes priorizar y si hay interés en que voluntarios participen de recorridos de relevamiento (siempre sin datos reales).
2. Con Fundación D: quién coordina, cómo se convoca, si se reconocen horas o se emite constancia, y qué acuerdo firma cada participante.
3. Con la capacitación de la Bolsa de Comercio: si este trabajo puede contar como práctica y en qué condiciones.
4. Con ambos: mantenedores con continuidad (personal estable, no rotativo) y política de acceso si algún paquete llega a necesitar datos reales.
5. Licencia del código y de los aportes antes de recibir contribuciones externas.
