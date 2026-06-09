-- =============================================================================
-- migration_notification_triggers.sql
-- FunnelManager — Triggers de notificaciones automáticas
--
-- Crea triggers en node_tasks y task_comments para insertar filas en la tabla
-- notifications cada vez que:
--   1. Se asigna (o reasigna) una tarea a un usuario.
--   2. Se publica un comentario en una tarea que tiene un asignado distinto
--      al comentador.
--
-- Idempotente: se puede ejecutar varias veces sin efectos secundarios.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. TRIGGER: notify_task_assignment
--    Dispara cuando OLD.assigned_to IS DISTINCT FROM NEW.assigned_to en node_tasks
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS fn_notify_task_assignment() CASCADE;

CREATE OR REPLACE FUNCTION fn_notify_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Solo actuar cuando hay un nuevo asignado
    IF NEW.assigned_to IS NULL THEN
        RETURN NEW;
    END IF;

    -- Evitar duplicados: no insertar si ya existe una notificación de
    -- asignación para el mismo usuario/tarea en los últimos 5 segundos.
    IF EXISTS (
        SELECT 1
        FROM notifications
        WHERE user_id   = NEW.assigned_to
          AND task_id   = NEW.id
          AND type      = 'assignment'
          AND created_at > NOW() - INTERVAL '5 seconds'
    ) THEN
        RETURN NEW;
    END IF;

    INSERT INTO notifications (
        user_id,
        type,
        title,
        body,
        project_id,
        task_id,
        actor_id,
        read,
        created_at
    ) VALUES (
        NEW.assigned_to,
        'assignment',
        'Te asignaron una tarea',
        COALESCE(NEW.text, ''),
        NEW.project_id,
        NEW.id,
        NULL,           -- actor desconocido a nivel de trigger de BD
        FALSE,
        NOW()
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_task_assignment ON node_tasks;

CREATE TRIGGER notify_task_assignment
    AFTER UPDATE ON node_tasks
    FOR EACH ROW
    WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
    EXECUTE FUNCTION fn_notify_task_assignment();


-- -----------------------------------------------------------------------------
-- 2. TRIGGER: notify_task_comment
--    Dispara cuando se inserta una fila en task_comments
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS fn_notify_task_comment() CASCADE;

CREATE OR REPLACE FUNCTION fn_notify_task_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assigned_to  UUID;
    v_project_id   UUID;
BEGIN
    -- Obtener el asignado y el proyecto de la tarea comentada
    SELECT assigned_to, project_id
      INTO v_assigned_to, v_project_id
      FROM node_tasks
     WHERE id = NEW.task_id;

    -- No notificar si la tarea no tiene asignado
    IF v_assigned_to IS NULL THEN
        RETURN NEW;
    END IF;

    -- No notificar si el asignado es el mismo que hace el comentario
    IF v_assigned_to = NEW.user_id THEN
        RETURN NEW;
    END IF;

    INSERT INTO notifications (
        user_id,
        type,
        title,
        body,
        project_id,
        task_id,
        actor_id,
        read,
        created_at
    ) VALUES (
        v_assigned_to,
        'comment',
        'Nuevo comentario en tu tarea',
        LEFT(COALESCE(NEW.text, ''), 100),
        v_project_id,
        NEW.task_id,
        NEW.user_id,
        FALSE,
        NOW()
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_task_comment ON task_comments;

CREATE TRIGGER notify_task_comment
    AFTER INSERT ON task_comments
    FOR EACH ROW
    EXECUTE FUNCTION fn_notify_task_comment();
