import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Project } from "@/lib/types"

interface SearchModalProps {
  projects: Project[]
  onClose: () => void
  onOpenProject: (projectId: string, view?: string) => void
}

interface SearchResult {
  type: "project" | "task"
  id: string
  title: string
  subtitle: string
  projectId: string
  projectName: string
}

export default function SearchModal({ projects, onClose, onOpenProject }: SearchModalProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const supabase = createClient()

    try {
      const [projectsRes, tasksRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, description")
          .ilike("name", `%${q}%`)
          .limit(5),
        supabase
          .from("node_tasks")
          .select("id, text, project_id, projects(name)")
          .ilike("text", `%${q}%`)
          .eq("done", false)
          .limit(10),
      ])

      const projectResults: SearchResult[] = (projectsRes.data ?? []).map((p: { id: string; name: string; description: string | null }) => ({
        type: "project" as const,
        id: p.id,
        title: p.name,
        subtitle: p.description ?? "",
        projectId: p.id,
        projectName: p.name,
      }))

      const taskResults: SearchResult[] = (tasksRes.data ?? []).map((t) => {
        // Supabase returns the related projects row as an array or single object
        const proj = Array.isArray(t.projects) ? t.projects[0] : t.projects
        return {
          type: "task" as const,
          id: t.id as string,
          title: t.text as string,
          subtitle: (proj as { name: string } | null)?.name ?? "",
          projectId: t.project_id as string,
          projectName: (proj as { name: string } | null)?.name ?? "",
        }
      })

      setResults([...projectResults, ...taskResults])
      setSelected(0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(() => {
      search(query)
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, search])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
        return
      }

      if (results.length === 0) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelected((prev) => (prev + 1) % results.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelected((prev) => (prev - 1 + results.length) % results.length)
      } else if (e.key === "Enter") {
        e.preventDefault()
        const result = results[selected]
        if (result) {
          onOpenProject(result.projectId, result.type === "project" ? "canvas" : "board")
          onClose()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [results, selected, onClose, onOpenProject])

  const handleResultClick = (result: SearchResult) => {
    onOpenProject(result.projectId, result.type === "project" ? "canvas" : "board")
    onClose()
  }

  const getIcon = (type: "project" | "task") => {
    if (type === "project") return "📁"
    return "○"
  }

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Buscar tareas, proyectos..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        {loading && (
          <div className="search-loading">Buscando...</div>
        )}

        {!loading && results.length > 0 && (
          <ul className="search-results">
            {results.map((result, index) => (
              <li
                key={`${result.type}-${result.id}`}
                className={`search-result-item${index === selected ? " selected" : ""}`}
                onClick={() => handleResultClick(result)}
                onMouseEnter={() => setSelected(index)}
              >
                <span className="search-result-icon">{getIcon(result.type)}</span>
                <span className="search-result-content">
                  <span className="search-result-title">{result.title}</span>
                  {result.subtitle && (
                    <span className="search-result-subtitle">{result.subtitle}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {query.trim().length >= 2 && !loading && results.length === 0 && (
          <div className="search-empty">
            No se encontraron resultados para &apos;{query}&apos;
          </div>
        )}

        <div className="search-footer">
          ↑↓ navegar · Enter abrir · Esc cerrar
        </div>
      </div>
    </div>
  )
}
