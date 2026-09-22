import { Component, StrictMode, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AnnotationOverlay } from "./annotations/annotation-overlay.js";
import { discoverStories } from "./discovery.js";
import { storyGlobs } from "./story-globs.generated.js";
import "./target-styles.generated.js";
import "./viewer.css";

const modules = discoverStories(storyGlobs);

function useHashRoute(): string {
  const [route, setRoute] = useState(
    () => decodeURIComponent(window.location.hash.slice(1)),
  );
  useEffect(() => {
    const onChange = () =>
      setRoute(decodeURIComponent(window.location.hash.slice(1)));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

function pascalToSpaced(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

class StoryErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div data-story-error="true" style={{ color: "#111111", fontSize: 12, fontWeight: 600 }}>
          Error: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

function Catalog() {
  const groups = new Map<string, typeof modules>();
  for (const m of modules) {
    const list = groups.get(m.group) ?? [];
    list.push(m);
    groups.set(m.group, list);
  }

  return (
    <div className="page">
      <h1>{modules.length} stories</h1>
      {[...groups.entries()].map(([group, items]) => (
        <section key={group}>
          <h2>{group}</h2>
          <ul>
            {items.map((m) => (
              <li key={m.title}>
                <a href={`#${encodeURIComponent(m.title)}`}>
                  {m.title}
                  <span className="meta">
                    {m.variants.length} variant
                    {m.variants.length !== 1 ? "s" : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ComponentPage({ module: mod }: { module: (typeof modules)[0] }) {
  const storyRootRef = useRef<HTMLDivElement>(null);
  const [storyRootReady, setStoryRootReady] = useState(false);

  useEffect(() => {
    setStoryRootReady(true);
  }, []);

  return (
    <div className="page">
      <a href="#" className="back">&larr; All stories</a>
      <h1>{mod.title}</h1>
      <div className="stories" ref={storyRootRef}>
        {mod.variants.map((v) => (
          <section key={v.name} className="demo-section" data-variant={v.name}>
            <h2 className="demo-section-title">{pascalToSpaced(v.name)}</h2>
            <StoryErrorBoundary>
              <v.render />
            </StoryErrorBoundary>
          </section>
        ))}
      </div>
      {storyRootReady && storyRootRef.current && (
        <AnnotationOverlay
          story={mod.title}
          variant={mod.variants[0]?.name ?? ""}
          storyRoot={storyRootRef.current}
        />
      )}
    </div>
  );
}

function App() {
  const route = useHashRoute();
  const activeModule = route
    ? modules.find((m) => m.title === route)
    : undefined;
  return activeModule ? (
    <ComponentPage module={activeModule} />
  ) : (
    <Catalog />
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
