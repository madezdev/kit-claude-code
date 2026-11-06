# Estrategia de GitHub, PRs y despliegues

Es la estrategia por defecto del kit, para cualquier proyecto. Los agentes la aplican desde `CLAUDE.global.md`, el agente **git** y `/feature`.

Acá `develop` es la rama de integración y `main` la de producción. Si el proyecto usa otros nombres, trabaja sin algún ambiente (por ejemplo, sin stage) o resuelve algo distinto (por ejemplo, hotfix con PR a `develop`), lo declara en su CLAUDE.md, y **manda lo del proyecto**. Si no tiene `develop`, la rama de integración es la por defecto.

Cada funcionalidad se desarrolla en una rama y se integra mediante un único PR por repositorio. Todos los avances, ajustes, pruebas y correcciones de revisión se agregan como commits a ese mismo PR.

El PR se mergea a `develop` cuando la funcionalidad está completa, revisada y lista para validarse en QA.

## 1. Cuándo crear un PR

| Caso | Rama de origen | Destino | Regla |
|---|---|---|---|
| Funcionalidad | `feat/<ticket>-<nombre>`, desde `develop` | `develop` | Un PR por funcionalidad |
| Bug no urgente | `fix/<ticket>-<nombre>`, desde `develop` | `develop` | Un PR por corrección independiente |
| Release | `release/<version>`, desde un commit aprobado de `develop` | `main` | Un PR por versión; se valida en stage |
| Incidente en producción | `hotfix/<ticket>-<nombre>`, desde `main` | `main` | Un PR urgente, acotado al incidente |

Sin número de ticket, el nombre va solo: `feat/<nombre>`.

**No se abre otro PR por cada avance ni por cada corrección de una funcionalidad cuyo PR sigue abierto.** Esos cambios pertenecen a la misma rama y al mismo PR.

Si el PR ya fue mergeado y aparece un defecto, corresponde un nuevo PR de fix.

Las funcionalidades demasiado grandes deben dividirse antes de implementarlas en entregas completas y verificables. "Un PR por funcionalidad" no significa acumular cambios sin límite.

## 2. Ciclo de una funcionalidad

1. Definir alcance y criterios de aceptación.
2. Crear `feat/*` desde `develop` y abrir un PR en borrador.
3. Agregar todos los commits a ese PR. Su preview se actualiza durante el desarrollo.
4. Cuando esté completo, solicitar revisión con pruebas y evidencia.
5. Resolver observaciones dentro del mismo PR.
6. Mergear a `develop` y desplegar en QA.
7. Validar la funcionalidad junto con el resto del sistema.

**Completo para mergear a QA** significa que el desarrollo y sus pruebas están terminados. La aprobación funcional en QA ocurre después del despliegue.

## 3. Ambientes y ramas

| Ambiente | Código desplegado | Propósito | Despliegue propuesto |
|---|---|---|---|
| Local | Rama de trabajo | Desarrollo | Local |
| Preview | Último commit del PR | Revisar el cambio antes del merge | Automático |
| QA | `develop` | Validación funcional e integración | Automático después del merge |
| Stage | `release/<version>` | Validar la versión candidata completa | Al crear o actualizar la candidata |
| Producción | Release aprobada e integrada en `main` | Uso real | Con aprobación explícita |

**Stage es un ambiente; no necesita una rama permanente `stage`.** Se alimenta de una rama temporal de release para mantener estable la candidata mientras `develop` continúa avanzando.

## 4. Cómo sale una release

1. Seleccionar un commit de `develop` validado en QA.
2. Crear `release/<version>` y abrir un único PR hacia `main`.
3. Desplegar esa candidata en stage.
4. Validar los recorridos críticos, migraciones y configuración.
5. Si aparecen defectos, corregirlos en la release y volver a validar. No incorporar funcionalidades nuevas.
6. Con stage aprobado, mergear el PR a `main`, etiquetar la versión y ejecutar el despliegue autorizado a producción.
7. Verificar producción y reintegrar las correcciones de la release en `develop`.

Una release puede incluir varias funcionalidades y fixes. **No se crea otro PR de promoción por cada funcionalidad.**

Producción debe recibir el código validado en stage. Se promueven los mismos artefactos cuando sea posible; si la configuración exige recompilar, se conserva el código aprobado y se verifica el resultado.

## 5. Hotfixes

1. Crear `hotfix/*` desde `main`, que debe contener la última versión liberada.
2. Implementar únicamente la corrección del incidente.
3. Abrir el PR hacia `main`, ejecutar las comprobaciones y validar la candidata en stage.
4. Mergear, etiquetar una versión de parche y desplegar a producción.
5. Incorporar inmediatamente la corrección a `develop` y a cualquier release activa.

**Un hotfix no está cerrado hasta que la corrección también está integrada en las líneas de trabajo vigentes.**

`main` debe contener todas las releases y hotfixes publicados. La versión efectivamente desplegada se identifica por su etiqueta y registro de despliegue: un merge exitoso no garantiza un despliegue exitoso.

## 6. Infraestructura por ambiente

- **QA:** servicios separados de producción, con el despliegue del frontend y del backend automatizado desde `develop` y trazabilidad de versiones.
- **Preview:** puede usar el backend compartido de QA si el cambio es compatible. Si el PR modifica el backend y necesita probar su propia versión, requiere un backend de preview o un entorno temporal.
- **Stage:** frontend, backend, base de datos, caché y almacenamiento independientes, con una configuración representativa de producción e integraciones externas de prueba.
- **Servicios auxiliares** (caché, colas, Redis…): QA puede prescindir de alguno si se acepta esa limitación; stage debe validar los comportamientos que dependen de ellos.
- **Producción:** servicios y credenciales exclusivos. Todos los despliegues registran versión, resultado y responsable.

Un preview de frontend conectado al backend de QA **no valida los cambios de backend de ese PR**.

## 7. Requisitos para mergear y desplegar

Todo PR debe indicar:

- Qué problema resuelve y cuál es su alcance.
- Criterios de aceptación y evidencia de pruebas.
- Cambios de configuración, datos o migraciones.
- Riesgos relevantes y procedimiento de reversión, cuando corresponda.

Proteger `develop` y `main`: sin pushes directos, con revisión y comprobaciones obligatorias. Los commits nuevos deben pasar nuevamente las comprobaciones correspondientes.

Las migraciones deben ser compatibles con la transición entre versiones. Una reversión del código no revierte automáticamente los cambios de datos.

Si falla un despliegue, se detiene la promoción, se recupera el servicio y se registra qué versión quedó activa.

## 8. Qué hacen los agentes y qué hace el humano

| Agentes | Humano |
|---|---|
| Crear la rama desde la base que corresponde y commitear | Aprobar el alcance y el plan |
| Abrir el PR y sumarle los commits de avances y correcciones | Revisar y mergear los PRs |
| Preparar `release/<version>` y su PR desde el commit que elige el humano, y corregir en ella lo que falle en stage | Elegir el commit de `develop` que sale y validar en QA y en stage |
| Hacer el hotfix y los PRs que lo reintegran en `develop` y en la release activa | Etiquetar la versión |
| Dejar listos los comandos de etiqueta y de despliegue | Desplegar a producción y registrar el despliegue |

El hook `guardia.js` bloquea igual el push a las ramas protegidas, los merges y los despliegues.

**Con sesiones cortas:** `/feature` parte una funcionalidad grande en entregas de un PR cada una, y cada sesión trabaja una. El agente abre el PR cuando la entrega pasó la gate y las revisiones (en borrador si queda algo pendiente), porque el hook pre-PR revisa lo commiteado; desde ahí, cada push actualiza el PR y su preview. Las correcciones de la revisión se hacen en otra sesión, sobre la misma rama: no abren otro PR.
