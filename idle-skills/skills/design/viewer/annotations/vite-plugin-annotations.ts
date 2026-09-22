import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { handleAnnotationRequest } from "./request-handler.js";

export interface AnnotationsPluginOptions {
  dir?: string;
}

export function annotationsPlugin(opts?: AnnotationsPluginOptions): Plugin {
  return {
    name: "annotations",
    configureServer(server) {
      let annotationsDir: string;
      if (opts?.dir) {
        annotationsDir = opts.dir;
      } else {
        const thisFileDir = fileURLToPath(new URL(".", import.meta.url));
        annotationsDir = join(thisFileDir, "../../.annotations");
      }

      mkdirSync(annotationsDir, { recursive: true });

      const file = join(annotationsDir, "annotations.json");

      const idgen = (): string => {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
          return crypto.randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      };

      server.middlewares.use("/__annotations", (req, res, next) => {
        const method = req.method?.toUpperCase() ?? "GET";
        const pathname = req.url ?? "/";
        const fullPathname = `/__annotations${pathname === "/" ? "" : pathname}`;

        if (method === "POST") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => {
            let body: unknown;
            try {
              body = JSON.parse(Buffer.concat(chunks).toString());
            } catch {
              body = null;
            }
            const result = handleAnnotationRequest(
              file,
              method,
              fullPathname,
              body,
              () => new Date().toISOString(),
              idgen,
            );
            res.writeHead(result.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result.json));
          });
        } else {
          const result = handleAnnotationRequest(
            file,
            method,
            fullPathname,
            null,
            () => new Date().toISOString(),
            idgen,
          );
          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result.json));
        }
      });
    },
  };
}
