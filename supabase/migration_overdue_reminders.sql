-- ============================================================
-- fn_remind_overdue() — recordatorios de tareas vencidas
-- Inserta una notificación 'due' al RESPONSABLE por cada tarea
-- vencida y no completada, como máximo una vez por día por tarea.
-- Pensado para ejecutarse a diario desde un cron.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_remind_overdue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO notifications (user_id, type, title, body, project_id, task_id, read, created_at)
  SELECT
    t.assigned_to,
    'due',
    'Tarea vencida sin completar',
    t.text || ' · venció el ' || to_char(t.due_date, 'DD/MM'),
    t.project_id,
    t.id,
    FALSE,
    NOW()
  FROM node_tasks t
  WHERE t.assigned_to IS NOT NULL
    AND t.done = FALSE
    AND t.due_date IS NOT NULL
    AND t.due_date < CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.task_id = t.id
        AND n.user_id = t.assigned_to
        AND n.type = 'due'
        AND n.created_at >= CURRENT_DATE
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
