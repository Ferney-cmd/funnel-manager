"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getInbox, listProjects } from "@/lib/agent/taskOps";
import { PRIORITY_COLORS } from "@/lib/constants";
import type { Profile } from "@/lib/profiles";
import { INBOX_NAME } from "./QuickTaskModal";
import {
  listTemplates, createTemplate, deleteTemplate, applyTemplate, importModuleTasks,
  type Template, type TemplateItem, type TemplateScope,
} from "@/lib/templateOps";

interface ProjectRow { id: string; name: string; parent_project_id: string | null; }
interface ModuleRow { id: string; title: string; icon: string | null; }
type Priority = keyof typeof PRIORITY_COLORS;

interface TemplatesModalProps {
  me: Profile;
  onClose: () => void;
  onApplied: () => void;
}

export function TemplatesModal({ me, onClose, onApplied }: TemplatesModalProps) {
  const supabase = createClient();
  const [tab, setTab] = useState<"apply" | "create">("apply");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Destino (aplicar)
  const [dTipo, setDTipo] = useState<"personal" | "project">("personal");
  const [dProjectId, setDProjectId] = useState("");
  const [dModules, setDModules] = useState<ModuleRow[]>([]);
  const [dModuleId, setDModuleId] = useState("");

  // Crear
  const [cName, setCName] = useState("");
  const [cScope, setCScope] = useState<TemplateScope>("shared");
  const [cItems, setCItems] = useState<TemplateItem[]>([{ text: "", priority: "normal", offset_days: null }]);
  const [iProjectId, setIProjectId] = useState("");
  const [iModules, setIModules] = useState<ModuleRow[]>([]);
  const [iModuleId, setIModuleId] = useState("");

  const loadTpls = useCallback(async () => { setTemplates(await listTemplates()); }, []);

  useEffect(() => {
    (async () => {
      try {
        const rows = await listProjects(supabase, me.id);
        setProjects((rows as ProjectRow[]).filter((p) => p.name !== INBOX_NAME));
      } catch { /* noop */ }
      await loadTpls();
    })();
  }, [me.id, supabase, loadTpls]);

  const loadModules = useCallback(async (pid: string): Promise<ModuleRow[]> => {
    if (!pid) return [];
    const { data } = await supabase.from("funnel_nodes").select("id, title, icon").eq("project_id", pid).order("position_x");
    return (data ?? []) as ModuleRow[];
  }, [supabase]);

  useEffect(() => {
    if (!dProjectId) { setDModules([]); setDModuleId(""); return; }
    loadModules(dProjectId).then((m) => { setDModules(m); setDModuleId(m[0]?.id ?? ""); });
  }, [dProjectId, loadModules]);

  useEffect(() => {
    if (!iProjectId) { setIModules([]); setIModuleId(""); return; }
    loadModules(iProjectId).then((m) => { setIModules(m); setIModuleId(m[0]?.id ?? ""); });
  }, [iProjectId, loadModules]);

  async function resolveDest(): Promise<{ nodeId: string; projectId: string } | { error: string }> {
    if (dTipo === "personal") {
      const inbox = await getInbox(supabase, me.id);
      if ("error" in inbox) return { error: inbox.error };
      return { nodeId: inbox.nodeId, projectId: inbox.projectId };
    }
    if (!dProjectId || !dModuleId) return { error: "Elige proyecto y módulo destino." };
    return { nodeId: dModuleId, projectId: dProjectId };
  }

  async function handleApply(t: Template) {
    setBusy(true); setError(null); setMsg(null);
    const dest = await resolveDest();
    if ("error" in dest) { setError(dest.error); setBusy(false); return; }
    const r = await applyTemplate(t.id, dest, me.id);
    if ("error" in r) { setError(r.error); setBusy(false); return; }
    setMsg(`✅ Se agregaron ${r.count} tarea(s) de "${t.name}".`);
    setBusy(false);
    onApplied();
  }

  async function handleImport() {
    if (!iModuleId) return;
    setBusy(true); setError(null);
    const items = await importModuleTasks(iModuleId);
    setBusy(false);
    if (!items.length) { setError("Ese módulo no tiene tareas para importar."); return; }
    setCItems(items);
    if (!cName) {
      const p = projects.find((x) => x.id === iProjectId);
      const mod = iModules.find((x) => x.id === iModuleId);
      setCName(`${p?.name ?? ""} · ${mod?.title ?? "Checklist"}`.trim());
    }
  }

  async function handleCreate() {
    setBusy(true); setError(null); setMsg(null);
    const r = await createTemplate(cName, cScope, cItems, me.id);
    if ("error" in r) { setError(r.error); setBusy(false); return; }
    setMsg("✅ Plantilla guardada.");
    setCName(""); setCItems([{ text: "", priority: "normal", offset_days: null }]);
    await loadTpls();
    setBusy(false);
    setTab("apply");
  }

  async function handleDelete(t: Template) {
    if (!window.confirm(`¿Eliminar la plantilla "${t.name}"?`)) return;
    setBusy(true);
    const r = await deleteTemplate(t.id);
    setBusy(false);
    if ("error" in r) { setError(r.error); return; }
    await loadTpls();
  }

  const setItem = (i: number, patch: Partial<TemplateItem>) =>
    setCItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const addItem = () => setCItems((prev) => [...prev, { text: "", priority: "normal", offset_days: null }]);
  const removeItem = (i: number) => setCItems((prev) => prev.filter((_, idx) => idx !== i));

  const projectOptions = (
    <>
      <option value="">Selecciona…</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.parent_project_id ? "↳ " : ""}{p.name}</option>
      ))}
    </>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Plantillas de tareas</div>
            <div className="modal-subtitle">Reutiliza checklists (ej. lanzamiento de webinar) en cualquier proyecto</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="tpl-tabs">
          <button className={`tpl-tab ${tab === "apply" ? "active" : ""}`} onClick={() => { setTab("apply"); setError(null); setMsg(null); }}>Aplicar</button>
          <button className={`tpl-tab ${tab === "create" ? "active" : ""}`} onClick={() => { setTab("create"); setError(null); setMsg(null); }}>Crear / Gestionar</button>
        </div>

        {error && <div className="modal-section" style={{ color: "#E24B4A", fontSize: 12.5, paddingTop: 10, paddingBottom: 10 }}>⚠ {error}</div>}
        {msg && <div className="modal-section" style={{ color: "#10B981", fontSize: 12.5, paddingTop: 10, paddingBottom: 10 }}>{msg}</div>}

        {tab === "apply" ? (
          <>
            <div className="modal-section">
              <div className="modal-section-label">¿Dónde crear las tareas?</div>
              <div className="qt-toggle">
                <button className={`qt-toggle-btn ${dTipo === "personal" ? "active" : ""}`} onClick={() => setDTipo("personal")}>🏠 Personal</button>
                <button className={`qt-toggle-btn ${dTipo === "project" ? "active" : ""}`} onClick={() => setDTipo("project")}>📁 De un proyecto</button>
              </div>
              {dTipo === "project" && (
                <div className="qt-fields">
                  <label className="qt-field"><span>Cliente / Proyecto</span>
                    <select className="modal-input" value={dProjectId} onChange={(e) => setDProjectId(e.target.value)}>{projectOptions}</select>
                  </label>
                  <label className="qt-field"><span>Módulo</span>
                    <select className="modal-input" value={dModuleId} disabled={!dProjectId} onChange={(e) => setDModuleId(e.target.value)}>
                      {dModules.length === 0 ? <option value="">{dProjectId ? "Sin módulos" : "Elige un proyecto"}</option>
                        : dModules.map((m) => <option key={m.id} value={m.id}>{(m.icon || "📦") + " " + m.title}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>

            <div className="modal-section">
              <div className="modal-section-label">Elige una plantilla</div>
              {templates.length === 0 ? (
                <p className="qt-hint">Aún no hay plantillas. Crea una en la pestaña "Crear / Gestionar".</p>
              ) : (
                <div className="tpl-list">
                  {templates.map((t) => (
                    <div key={t.id} className="tpl-row">
                      <div className="tpl-row-info">
                        <span className="tpl-row-name">{t.name}</span>
                        <span className="tpl-row-meta">
                          <span className={`tpl-badge ${t.scope}`}>{t.scope === "shared" ? "Compartida" : "Personal"}</span>
                          <span>{t.itemCount} tarea(s)</span>
                        </span>
                      </div>
                      <button className="tpl-apply-btn" disabled={busy} onClick={() => handleApply(t)}>Aplicar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="modal-section">
              <div className="modal-section-label">Nueva plantilla</div>
              <input className="modal-input" placeholder="Nombre (ej. Lanzamiento webinar)" value={cName} onChange={(e) => setCName(e.target.value)} />
              <div className="qt-toggle" style={{ marginTop: 10 }}>
                <button className={`qt-toggle-btn ${cScope === "shared" ? "active" : ""}`} onClick={() => setCScope("shared")}>👥 Compartida (equipo)</button>
                <button className={`qt-toggle-btn ${cScope === "personal" ? "active" : ""}`} onClick={() => setCScope("personal")}>🔒 Personal</button>
              </div>
            </div>

            <div className="modal-section">
              <div className="modal-section-label">Importar tareas de un módulo (opcional)</div>
              <div className="qt-fields">
                <label className="qt-field"><span>Proyecto</span>
                  <select className="modal-input" value={iProjectId} onChange={(e) => setIProjectId(e.target.value)}>{projectOptions}</select>
                </label>
                <label className="qt-field"><span>Módulo</span>
                  <select className="modal-input" value={iModuleId} disabled={!iProjectId} onChange={(e) => setIModuleId(e.target.value)}>
                    {iModules.length === 0 ? <option value="">{iProjectId ? "Sin módulos" : "Elige un proyecto"}</option>
                      : iModules.map((m) => <option key={m.id} value={m.id}>{(m.icon || "📦") + " " + m.title}</option>)}
                  </select>
                </label>
              </div>
              <button className="tpl-import-btn" disabled={!iModuleId || busy} onClick={handleImport}>↧ Cargar tareas de ese módulo</button>
            </div>

            <div className="modal-section">
              <div className="modal-section-label">Tareas de la plantilla</div>
              {cItems.map((it, i) => (
                <div key={i} className="tpl-item-row">
                  <input className="modal-input" placeholder={`Tarea ${i + 1}`} value={it.text} onChange={(e) => setItem(i, { text: e.target.value })} />
                  <select className="modal-input tpl-item-prio" value={it.priority} onChange={(e) => setItem(i, { priority: e.target.value })}>
                    {(Object.keys(PRIORITY_COLORS) as Priority[]).map((k) => <option key={k} value={k}>{PRIORITY_COLORS[k].label}</option>)}
                  </select>
                  <button className="tpl-item-del" onClick={() => removeItem(i)} disabled={cItems.length === 1}>✕</button>
                </div>
              ))}
              <button className="tpl-additem-btn" onClick={addItem}>+ Agregar tarea</button>
            </div>

            <div className="modal-section">
              <div className="modal-section-label">Mis plantillas</div>
              {templates.filter((t) => t.created_by === me.id).length === 0 ? (
                <p className="qt-hint">No has creado plantillas todavía.</p>
              ) : (
                <div className="tpl-list">
                  {templates.filter((t) => t.created_by === me.id).map((t) => (
                    <div key={t.id} className="tpl-row">
                      <div className="tpl-row-info">
                        <span className="tpl-row-name">{t.name}</span>
                        <span className="tpl-row-meta"><span className={`tpl-badge ${t.scope}`}>{t.scope === "shared" ? "Compartida" : "Personal"}</span><span>{t.itemCount} tarea(s)</span></span>
                      </div>
                      <button className="tpl-del-btn" disabled={busy} onClick={() => handleDelete(t)}>🗑</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Cerrar</button>
          {tab === "create" && (
            <button className="modal-btn-primary" onClick={handleCreate} disabled={busy}>
              {busy ? "Guardando…" : "Guardar plantilla"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
