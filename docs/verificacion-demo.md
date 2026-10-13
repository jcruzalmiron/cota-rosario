# Verificación local de la mejora

Fecha: 13 de octubre de 2026. Windows, Node 22.23.1, Next 16.3.8. Rama `codex/cota-demo-mejoras` sobre `0093adc`.

## Comandos ejecutados

| Control | Resultado |
| --- | --- |
| `npm run build` | Correcto. Vecinos, Operaciones, Predicciones y APIs dinámicas; guía estática. |
| `npm run typecheck` | Correcto. |
| `npm run lint` | Correcto. |
| `npm test` | 18 pruebas, 18 correctas. |
| YAML de los dos workflows | Sintaxis correcta con PyYAML BaseLoader. No se ejecutó GitHub Actions. |
| `node --check` en los dos scripts de lluvia histórica modificados | Correcto. No se reconstruyeron sus archivos remotos. |
| `git diff --check` | Correcto. |
| `npm audit --omit=dev` | 0 vulnerabilidades reportadas. |
| `npm audit` completo | 5 avisos altos en la cadena de herramientas de desarrollo: braces → micromatch → fast-glob → plugin/config de ESLint de Next. |

Los avisos de desarrollo quedaron pendientes: el remedio automático ofrecía bajar `eslint-config-next` a 14.2.35, cambiando la línea de herramientas de este proyecto Next 16. No se aplicó ese cambio de versión mayor sin evaluar su compatibilidad. Se actualizaron Next y su configuración de ESLint de 16.3.6 a 16.3.8, sharp de 0.35.4 a 0.35.5 y source-map-js dentro de su rango.

## HTTP de la compilación final

Servidor local standalone en `127.0.0.1:3201`, con assets copiados al directorio standalone. Se consultaron las cinco APIs de lectura:

- Estado, indicadores, predicciones, recomendaciones y reportes: HTTP 200 y `cache-control: no-store` en la consulta de verificación.
- Estado, indicadores y predicciones: misma lectura de Rosario, 3,31 m.
- Predicciones: días consecutivos del 13 al 19 de octubre de 2026.
- Probabilidades diarias de anegamiento: `null`, sin porcentajes derivados de la adaptación mensual.
- Reportes públicos: sin claves internas de confirmación.

Son observaciones de esa consulta, no resultados permanentes ni una validación de exactitud de las fuentes.

## Navegador

Revisión de Vecinos, Operaciones, Predicciones y guía en escritorio; revisión de Vecinos y Predicciones a 390 × 844 px.

- Se distingue el aviso de demo, la consulta y la fecha de las fuentes.
- El simulador a 7 m cambió las áreas al color crítico; Restablecer recuperó el color de la consulta.
- Se creó un único aporte ficticio mediante «Usar el centro visible del mapa», marcado «PRUEBA LOCAL DE DEMO · no representa un evento real». Se guardó en el almacenamiento local ignorado por Git, sin enviar aportes al sitio publicado. La confirmación mostró «Confirmado» y deshabilitó el botón.
- La guía abre directamente en el alcance mediante su enlace; incluye los siete pasos de construcción informados por el equipo.
- El panel móvil se despliega; el ancho total de Predicciones quedó en 390 px, con desplazamiento horizontal dentro de la tabla de 404 px, sin desbordamiento de la página.

Las capturas y respuestas HTTP se conservaron como artefactos locales de revisión, fuera del repositorio.

## Límites de la verificación

No se midió precisión hidrológica, calibración de probabilidades ni cobertura real de eventos. No se probó el deploy en EasyPanel ni la imagen Docker. La renovación larga del INA agotó el tiempo de espera durante la primera revisión: se amplió el tiempo sólo para esa consulta de fondo y se agregó una pausa de cinco minutos entre intentos. La interfaz puede continuar con el snapshot fusionado con lecturas recientes; la renovación remota requiere seguimiento.

Persistencia probada en un único proceso. La escritura con múltiples instancias, la moderación, la confiabilidad de cabeceras IP detrás del proxy y la identidad de quienes confirman quedan pendientes. El sitio publicado conserva la versión anterior hasta que se publique esta rama.
