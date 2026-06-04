# 🎯 CLON DE LA VISTA "LISTA" DE ASANA — para FunnelManager
### Spec visual + funcional para Claude Code

> **Objetivo:** que la pestaña de tareas (la "Lista"/Dashboard) de FunnelManager se vea y funcione
> **lo más parecida posible a Asana**, con TODAS sus opciones para agregar usuarios, tareas,
> textos, proyectos, fechas, etc.
>
> **Importante — qué NO clonar:** la barra lateral izquierda de Asana (Inicio, Bandeja de entrada,
> Personas, Equipos) NO se replica. FunnelManager ya tiene su propio Sidebar. Clonamos **solo el
> panel central**: cabecera del proyecto + pestañas de vista + barra de herramientas + la lista de
> tareas con secciones + el panel de detalle de tarea.
>
> **Dónde encaja:** este documento es el detalle fino de la vista Lista dentro del
> `ROADMAP_MAESTRO` (es la versión "Asana-grade" de `BoardView`). Debe respetar los **Principios
> no negociables** del roadmap: una sola fuente de verdad, mutaciones por handler central,
> reconciliación realtime por id y uso de **tokens de tema** (claro/oscuro), nunca colores fijos.

---

## 1. Mapeo de conceptos Asana → FunnelManager

| Asana | FunnelManager (tu esquema) |
|---|---|
| Proyecto | `projects` |
| **Sección** (To-Do, Review, Completed) | **Módulo** = `funnel_nodes` (ya funcionan como secciones) |
| Tarea | `node_tasks` |
| Responsable (1 persona) | `assigned_to` / `task_assignees` (multi, según Fase 1) |
| Colaboradores / seguidores | `task_followers` |
| Fecha de entrega (+ rango) | `due_date` (+ `start_date`) |
| Campos personalizados | `custom_fields` + `custom_field_values` |
| Subtareas | `parent_task_id` |
| Dependencias | `task_dependencies` |
| Comentarios + actividad | `task_comments` + `activity_log` |
| Adjuntos | `attachments` |
| Multi-proyecto (una tarea en varios proyectos) | avanzado — ver §7 |

---

## 2. Anatomía visual (región por región)

Reconstruye exactamente este layout en el panel central. Dimensiones aproximadas de Asana.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [A] A | Eucalyptus ▾  ☆   ◷ Configurar el estado        [avatares] [Unirme] [⚙]│  ← CABECERA PROYECTO
├──────────────────────────────────────────────────────────────────────────────┤
│ Resumen · Lista · Tablero · Gantt · Panel · Calendario · Flujo · Mensajes · +  │  ← PESTAÑAS DE VISTA
├──────────────────────────────────────────────────────────────────────────────┤
│ [+ Agregar tarea ▾]                       Filtrar · Ordenar · Agrupar · Opciones│  ← BARRA HERRAMIENTAS
├──────────────────────────────────────────────────────────────────────────────┤
│ Nombre                          │ Responsable │ Fecha de entrega │ [+ columna]  │  ← ENCABEZADO COLUMNAS
├──────────────────────────────────────────────────────────────────────────────┤
│ ▾ To-Do                                                                  ⋮⋮     │  ← SECCIÓN (colapsable)
│   ◯ Eucalyptus Creatives + UTM Parameters    (ju) juanseb…   5 may               │  ← FILA TAREA
│   ◯ Check Eucalyptus Creatives               (ju) juanseb…   28 abr              │
│   + Agregar tarea…                                                               │
│ ▾ Review                                                                         │
│   ◯ Prepare product creatives  💬2           (ju) juanseb…   15 abr              │
│ ▾ Completed                                                                      │
│   ✓ Do end of the month report 💬1           (ju) juanseb…   7 abr  (tachado)    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Cabecera del proyecto
- Icono de color del proyecto + **nombre editable** con chevron ▾ (menú del proyecto).
- ☆ favorito.
- "◷ Configurar el estado" → estado del proyecto (On track / At risk / Off track).
- A la derecha: **avatares apilados** de miembros + botón "Unirme/Invitar" + "Personalizar" (⚙).

### 2.2 Pestañas de vista (sub-navegación del proyecto)
`Resumen · Lista · Tablero · Gantt · Panel · Calendario · Flujo de trabajo · Mensajes · Archivos · +`
- La pestaña activa ("Lista") va subrayada con el color de acento.
- En FunnelManager estas pestañas pueden mapear a tus vistas: Lista, Tablero=**Kanban**,
  Gantt=**Cronograma**, Panel=**Dashboard/Resumen**, Calendario, etc. (Tú ya las tienes en el
  Sidebar; decide si las repites aquí como sub-tabs del proyecto o solo dejas "Lista".)

### 2.3 Barra de herramientas
- Izquierda: **"+ Agregar tarea"** (botón split: el ▾ abre opciones de creación).
- Derecha: **Filtrar · Ordenar · Agrupar · Opciones** (cada uno abre un popover).

### 2.4 Encabezado de columnas
- `Nombre` (fija, ancha) · `Responsable` · `Fecha de entrega` · **[+]** para añadir columnas
  (campos personalizados). Columnas redimensionables, ocultables y reordenables.

### 2.5 Secciones (= módulos)
- Chevron ▾ para **colapsar/expandir**, nombre de sección (editable), **handle de arrastre ⋮⋮**
  visible al hover, y "+ Agregar tarea…" al final de cada sección.
- (Opcional Asana) contador de tareas por sección.

### 2.6 Fila de tarea (lo más importante para "verse igual")
- **Círculo de completar** a la izquierda: gris → al marcar, se llena de **verde con check** y la
  tarea queda **tenue/tachada**.
- **Nombre** editable inline (clic = editar en sitio).
- Ícono de **comentarios** con contador (💬2) si tiene.
- **Responsable:** avatar pequeño + nombre truncado. Vacío = avatar punteado "asignar".
- **Fecha de entrega:** texto tipo "5 may"; vacío = guion tenue que aparece al hover.
- Al **hover**: aparece handle de arrastre ⋮⋮ y acciones rápidas.
- Filas **densas** (≈36–40px), divisores finos, fondo en hover sutil.

### 2.7 Panel de detalle (slide-in derecho, ≈40% ancho)
Se abre al hacer clic en una fila. De arriba a abajo (ver Image 2 de Asana):
- Botón **"Finalizada"** (marcar completada) + avatares colaboradores **+** · Compartir · 👍 ·
  copiar link 🔗 · expandir ⛶ · más ⋯ · cerrar ✕.
- Aviso de visibilidad: "Esta tarea es visible para sus colaboradores" / "Hacer público".
- **Título** grande editable.
- **Responsable** (avatar + nombre, badge "Invitado" si aplica, ✕ para quitar).
- **Fecha de entrega** (calendario, rango opcional, ✕).
- **Proyectos (n) +** → en qué proyectos vive la tarea, con su sección (multi-homing, §7).
- **Campos personalizados** (o "No hay campos personalizados en este proyecto").
- **Descripción** (texto enriquecido, placeholder "¿De qué se trata esta tarea?").
- **Subtareas +** (lista anidada con responsable/fecha propios).
- **Adjuntos +**.
- **Comentarios / Toda la actividad** (tabs) + caja "Agregar un comentario" + log de actividad
  ("X creó esta tarea · fecha").

---

## 3. TODO lo que se puede HACER en la vista Lista (checklist funcional completo)

### Agregar / crear (lo que pediste: usuarios, tareas, textos, proyectos)
- [ ] **Agregar tarea** de 3 formas: botón "+ Agregar tarea", "Agregar tarea…" inline por sección,
      y crear con Enter al final de una fila.
- [ ] **Agregar texto:** nombre de tarea, **descripción** enriquecida, **comentarios**, nombres de
      sección/proyecto — todo editable inline.
- [ ] **Agregar/asignar usuarios:** asignar responsable (escribiendo nombre/email), **invitar por
      email** si no existe (badge "Invitado"), agregar **colaboradores/seguidores**.
- [ ] **Agregar sección** (= módulo) y renombrar/reordenar/colapsar.
- [ ] **Agregar columna** = campo personalizado (texto, número, select, multi-select, fecha,
      persona, checkbox).
- [ ] **Agregar a proyecto:** vincular la tarea a uno o varios proyectos (multi-homing, §7).
- [ ] **Agregar subtareas** y **adjuntos**.
- [ ] **Agregar fecha** (entrega y/o rango inicio–fin), prioridad, etiquetas.

### Editar / gestionar
- [ ] **Edición inline** de cualquier celda (nombre, responsable, fecha, campos).
- [ ] **Marcar completada** (círculo → verde, tarea tenue).
- [ ] **Drag & drop** para reordenar tareas dentro de una sección y **mover entre secciones**
      (usa `dnd-kit`); también arrastrar secciones para reordenarlas.
- [ ] **Selección múltiple** (shift/clic) + **acciones masivas**: asignar, fijar fecha, mover de
      sección, completar, eliminar, agregar a proyecto, etiquetar.
- [ ] **Subtareas** con responsable/fecha propios; **dependencias** (bloquea / bloqueado por).
- [ ] Menú de tarea (⋯): duplicar, copiar link, marcar como hito, convertir en proyecto, eliminar.

### Ver / organizar
- [ ] **Filtrar** (por responsable, fecha, estado, completadas, campos).
- [ ] **Ordenar** (fecha, prioridad, alfabético, fecha de creación).
- [ ] **Agrupar por** (sección, responsable, fecha, prioridad, campo personalizado).
- [ ] **Opciones**: alto de fila, mostrar/ocultar subtareas y completadas, columnas visibles.
- [ ] **Guardar la vista** (filtro+orden+agrupación) → tus `saved_views`.

### Colaboración (tiempo real)
- [ ] **Comentarios + @menciones**, reacciones, **log de actividad**.
- [ ] **Realtime:** cambios de otros aparecen en vivo (reconciliación por id del roadmap).
- [ ] Notificación al responsable/colaboradores.

### Extra (avanzado / fases posteriores)
- [ ] Búsqueda, atajos de teclado, plantillas de tarea, reglas/automatización.

---

## 4. Componentes React a construir (sugerencia)

```
ListView/
  ProjectHeader.tsx        ← nombre, estado, avatares, invitar, personalizar
  ViewTabs.tsx             ← Resumen/Lista/Tablero/Gantt/Panel/Calendario… (sub-tabs del proyecto)
  ListToolbar.tsx          ← + Agregar tarea | Filtrar · Ordenar · Agrupar · Opciones
  ColumnHeader.tsx         ← columnas redimensionables/ocultables + añadir campo
  TaskSection.tsx          ← módulo colapsable + drag handle + agregar tarea
  TaskRow.tsx              ← círculo, nombre inline, comentarios, responsable, fecha, hover
  AssigneePicker.tsx       ← lista miembros del proyecto + invitar por email (gateado por canEdit)
  DatePicker.tsx           ← fecha única o rango
  FilterPopover.tsx / SortPopover.tsx / GroupPopover.tsx / OptionsPopover.tsx
  BulkActionsBar.tsx       ← barra inferior al seleccionar varias tareas
TaskDetailPanel/            ← (ya tienes uno; ampliarlo al estilo Asana)
  Header, AssigneeField, DateField, ProjectsField, CustomFields,
  Description, Subtasks, Attachments, CommentsTab/ActivityTab
```
Todos leen del **store único** (`AppShell`/`ProjectDataProvider`) y mutan vía los handlers
centrales (`addTask`, `updateTask`, `toggleTask`, `moveTask`, `assignTask`, `addComment`…).

---

## 5. Fidelidad visual (cómo lograr el "se ve igual que Asana", con TU tema)

- **Densidad:** filas ≈36–40px, tipografía ~13–14px, mucho aire horizontal, divisores de 1px muy
  sutiles (`var(--border)`).
- **Círculo de completar:** contorno gris (`var(--text-muted)`) → al completar, relleno
  `var(--success)` con check blanco; la fila completada baja opacidad (~0.55) y tacha el nombre.
- **Hover de fila:** fondo `var(--surface-2)`, aparición de handle ⋮⋮ y de placeholders (fecha, asignar).
- **Responsable:** avatar circular ~22px con iniciales + nombre truncado; sin asignar = círculo
  punteado.
- **Secciones:** título en seminegrita, chevron de colapso animado, "+ Agregar tarea…" en tono tenue.
- **Panel de detalle:** se desliza desde la derecha, ~40% del ancho (responsive: full-width en
  móvil), sombra/borde de separación, scroll independiente.
- **Tema:** TODO con variables CSS (Fase 6). Asana "claro" ≈ tu tema claro; respeta también el oscuro.
- **Microinteracciones:** transiciones suaves al colapsar, al abrir panel, al completar (no bruscas).

> Usa las capturas de Asana que ya tienes como referencia pixel a pixel para espaciados y jerarquía.

---

## 6. Datos e integración con el roadmap

- Esta vista es la materialización "Asana-grade" de la pestaza Lista; se apoya en lo que crean las
  fundaciones del roadmap: `task_statuses`, `start_date`, `task_assignees`, `custom_fields`,
  `parent_task_id`, `task_dependencies`, `attachments`, `saved_views`, `activity_log`.
- **No dupliques fetch:** lee el array `tasks`/`nodes` del store y agrúpalo por sección.
- **Métricas/conteos** (tareas por sección, % ) → derivados con `useMemo`, nunca guardados.

---

## 7. Multi-homing (una tarea en varios proyectos) — decisión necesaria
Asana permite que **una misma tarea viva en varios proyectos** (campo "Proyectos (n)" del panel).
Tu esquema actual ata `node_task` a un solo `funnel_node`/proyecto. Opciones:
- **MVP:** una tarea = un proyecto/sección (oculta o simplifica el campo "Proyectos"). Más simple.
- **Completo:** tabla puente `task_projects(task_id, project_id, section_id)` para multi-homing real.
→ Recomendación: **MVP de un proyecto ahora**, y dejar multi-homing para una fase posterior, porque
toca el modelo y el realtime. Decídelo antes de construir el panel de detalle.

---

## 8. Criterios de aceptación
- La pestaña Lista se ve como Asana: secciones colapsables, filas densas con círculo de completar,
  responsable con avatar, fecha, comentarios, y panel de detalle deslizante.
- Puedo **agregar tareas** (3 formas), **texto** (nombre, descripción, comentarios), **usuarios**
  (asignar + invitar por email), **secciones**, **columnas/campos** y **fechas** sin recargar.
- **Filtrar / Ordenar / Agrupar / Opciones** funcionan y se pueden **guardar como vista**.
- **Drag & drop** reordena y mueve entre secciones; **selección múltiple** hace acciones masivas.
- Todo en **tiempo real** y consistente con Embudo/Resumen (misma fuente de verdad).
- Funciona en **tema claro y oscuro** sin colores fijos.
- NO aparece la barra lateral de Asana (se usa el Sidebar propio de FunnelManager).

---

## 9. Nota sobre tus otras vistas (las de las flechas)
Portafolio, Carga equipo, Kanban, Cronograma y Roles hoy "se ven casi iguales" porque están sin
construir (placeholders). Se desarrollan en las **Fases 8–10 del ROADMAP_MAESTRO**:
- **Kanban** (Fase 8), **Cronograma/Timeline** (Fase 9), **Portafolio + Carga del equipo** (Fase 10).
- **Roles** ya existe como concepto; conéctala a `task_statuses`/roles del proyecto.
Todas deben leer la **misma fuente de datos** que esta Lista — son vistas distintas del mismo dato.

---

## 10. INSTRUCCIÓN INICIAL PARA CLAUDE CODE (cópiala)

> "Vamos a reconstruir la pestaña de tareas de FunnelManager para que sea **visual y
> funcionalmente como la vista Lista de Asana**, usando las capturas de Asana como referencia.
> Lee este documento y respeta el ROADMAP_MAESTRO y la ARQUITECTURA (fuente única de verdad,
> mutaciones por handler central, realtime por id, tokens de tema).
>
> Reglas: (1) **NO** clones la barra lateral de Asana; usa el Sidebar propio de la app. (2) Clona
> solo el panel central: cabecera de proyecto + sub-tabs de vista + barra Filtrar/Ordenar/Agrupar/
> Opciones + lista con secciones colapsables + panel de detalle deslizante. (3) Implementa TODAS
> las acciones de agregar: tareas (3 formas), texto (nombre/descripción/comentarios), usuarios
> (asignar + invitar por email), secciones, columnas/campos y fechas. (4) Edición inline,
> drag & drop con dnd-kit, selección múltiple con acciones masivas. (5) Todo en tema claro y oscuro.
>
> Empieza proponiéndome el **árbol de componentes** y un primer render del layout (cabecera +
> tabs + toolbar + una sección con filas y el círculo de completar), sin lógica todavía. Cuando lo
> apruebe, vamos celda por celda (responsable, fecha, inline edit), luego el panel de detalle, y al
> final filtros/orden/agrupación y acciones masivas. Cambios pequeños; dime qué archivos tocas."

---

## 11. Para afinar (responde y ajusto el spec)
1. ¿Quieres las **sub-pestañas de vista** (Resumen/Lista/Tablero/Gantt…) dentro del proyecto, o
   prefieres navegar entre vistas solo desde tu Sidebar actual?
2. **Multi-homing** (§7): ¿MVP de un proyecto por tarea, o multi-proyecto real desde ya?
3. ¿Las secciones serán **siempre = módulos** del embudo, o quieres permitir secciones de lista
   independientes del canvas?
4. ¿Campos personalizados (columnas extra) entran en esta fase o después?
