"use client";

import type { Node } from "reactflow";
import type { FunnelNodeData, Project } from "@/lib/types";

interface DocsViewProps {
  project:      Project | undefined;
  nodes:        Node<FunnelNodeData>[];
  onSelectView: (view: string) => void;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function FileCard({ url, type, name, author, date }: {
  url: string; type: string; name: string; author: string; date: string;
}) {
  const isImage = type.startsWith("image/");
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="docs-file-card"
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="docs-file-thumb" />
      ) : (
        <div className="docs-file-icon">
          {type.includes("pdf") ? "📄" : type.includes("word") || type.includes("document") ? "📝" : "📎"}
        </div>
      )}
      <div className="docs-file-meta">
        <div className="docs-file-name">{name}</div>
        <div className="docs-file-info">{author} · {fmtDate(date)}</div>
      </div>
    </a>
  );
}

export function DocsView({ project, nodes, onSelectView }: DocsViewProps) {
  if (!project) {
    return (
      <div className="view-placeholder">
        <span style={{ fontSize: 32 }}>⊟</span>
        <p>Selecciona un proyecto para ver los archivos</p>
      </div>
    );
  }

  // Collect all messages with files, grouped by node
  const sections = nodes
    .map((n) => ({
      nodeId:    n.id,
      nodeTitle: n.data.title,
      nodeIcon:  n.data.icon,
      files: n.data.messages.filter((m) => !!m.fileUrl),
    }))
    .filter((s) => s.files.length > 0);

  const totalFiles = sections.reduce((acc, s) => acc + s.files.length, 0);

  return (
    <div className="docs-view">
      <div className="view-back-bar">
        <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
        <span className="view-back-title">Archivos · {project.name}</span>
      </div>
      <div className="docs-header">
        <div className="docs-header-title">Archivos · {project.name}</div>
        <div className="docs-header-sub">{totalFiles} archivo{totalFiles !== 1 ? "s" : ""} en {sections.length} módulo{sections.length !== 1 ? "s" : ""}</div>
      </div>

      {sections.length === 0 ? (
        <div className="docs-empty">
          <span style={{ fontSize: 40 }}>📁</span>
          <p>No hay archivos subidos aún.</p>
          <p style={{ fontSize: 12, color: "var(--text3)" }}>
            Sube archivos desde el chat de cada módulo usando el botón 📎 o pegando una imagen con Ctrl+V.
          </p>
        </div>
      ) : (
        sections.map((s) => (
          <div key={s.nodeId} className="docs-section">
            <div className="docs-section-header">
              <span style={{ fontSize: 16 }}>{s.nodeIcon}</span>
              <span className="docs-section-title">{s.nodeTitle}</span>
              <span className="docs-section-count">{s.files.length} archivo{s.files.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="docs-file-grid">
              {s.files.map((f) => (
                <FileCard
                  key={f.id}
                  url={f.fileUrl!}
                  type={f.fileType ?? "application/octet-stream"}
                  name={f.text}
                  author={f.userName}
                  date={f.createdAt}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
