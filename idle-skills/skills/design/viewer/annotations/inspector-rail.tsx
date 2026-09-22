import type { Picker } from "./use-picker.js";
import type { Annotation } from "./types.js";

interface InspectorRailProps {
  picker: Picker;
  round: number;
  annotations: Annotation[];
  note: string;
  onNoteChange(v: string): void;
  onSave(): void;
  saving: boolean;
  error: string | null;
  onNewIteration(): void;
  collapsed: boolean;
  onToggleCollapsed(): void;
  armButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export function InspectorRail({
  picker,
  round,
  annotations,
  note,
  onNoteChange,
  onSave,
  saving,
  error,
  onNewIteration,
  collapsed,
  onToggleCollapsed,
  armButtonRef,
}: InspectorRailProps) {
  return (
    <aside className={`anno-rail${collapsed ? " anno-rail--collapsed" : ""}`}>
      <div className="anno-rail-head">
        <button
          className="anno-rail-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
        >
          {collapsed ? "›" : "‹"}
        </button>
        <button
          ref={armButtonRef}
          className={`anno-arm${picker.armed ? " anno-arm--on" : ""}`}
          onClick={() => (picker.armed ? picker.disarm() : picker.arm())}
        >
          {picker.armed ? "Stop" : "Select"}
        </button>
        {!collapsed && (
          <span className="anno-round">
            Round {round} · {annotations.length} note{annotations.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {!collapsed && (
        <>
          {picker.selected ? (
            <div className="anno-rail-section">
              <nav className="anno-crumbs">
                {picker.crumbs.map((crumb, i) => (
                  <span className="anno-crumb-wrap" key={crumb.key}>
                    {i > 0 && <span className="anno-crumb-sep">{"›"}</span>}
                    <button
                      className={`anno-crumb${crumb.isCurrent ? " anno-crumb--on" : ""}`}
                      onClick={() => picker.selectCrumb(crumb.el)}
                    >
                      {crumb.label}
                    </button>
                  </span>
                ))}
              </nav>
              <div className="anno-target">
                <span className="anno-target-component">
                  {picker.selected.target.component}
                </span>
                {" · "}
                <span className="anno-target-element">
                  {picker.selected.target.element}
                </span>
              </div>
              <textarea
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="Add a note…"
                autoFocus
              />
              {error && <div className="anno-error">{error}</div>}
              <div className="anno-comment-actions">
                <button
                  className="anno-save"
                  disabled={saving || !note.trim()}
                  onClick={onSave}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="anno-cancel" onClick={picker.clearSelection}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="anno-rail-hint">
              {picker.armed
                ? "Hover the canvas — click an element to comment."
                : "Press Select, then hover + click any element."}
            </div>
          )}

          <div className="anno-rail-notes">
            <div className="anno-section-label">
              <span>Notes · Round {round}</span>
              <button className="anno-iterate" onClick={onNewIteration}>
                New iteration
              </button>
            </div>
            {annotations.length === 0 ? (
              <div className="anno-notes-empty">No notes yet.</div>
            ) : (
              <div className="anno-notes">
                {annotations.map((a) => (
                  <button
                    key={a.id}
                    className="anno-note-row"
                    onMouseEnter={() => picker.beginReHighlight(a)}
                    onMouseLeave={() => picker.endReHighlight()}
                  >
                    <span className="anno-note-comp">{a.target.component} · {a.target.element}</span>
                    <span className="anno-note-text">{a.note}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
