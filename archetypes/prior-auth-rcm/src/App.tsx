/// <reference types="vite/client" />
import type { ComponentType } from "react";
import { Route, Routes } from "react-router-dom";
import { routes } from "./routes.generated";

// One file per screen in ./screens, named exactly as the brief's screen id, default-exporting a component.
const modules = import.meta.glob<{ default: ComponentType }>("./screens/*.tsx", { eager: true });
const screens: Record<string, ComponentType> = {};
for (const [file, mod] of Object.entries(modules)) screens[file.replace(/^.*\/([^/]+)\.tsx$/, "$1")] = mod.default;

export default function App() {
  return (
    <Routes>
      {routes.map(({ id, path }) => {
        const Screen = screens[id];
        return <Route key={id} path={path} element={Screen ? <Screen /> : <div>Screen not built: {id}</div>} />;
      })}
    </Routes>
  );
}
