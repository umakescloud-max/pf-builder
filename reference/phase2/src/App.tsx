import { Route, Routes } from "react-router-dom";
import { Story } from "./screens/Story";
import { Tracker } from "./screens/Tracker";
import { Case } from "./screens/Case";
import { Denials } from "./screens/Denials";
import { Appeals } from "./screens/Appeals";
import { Architecture } from "./screens/Architecture";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Story />} />
      <Route path="/tracker" element={<Tracker />} />
      <Route path="/case" element={<Case />} />
      <Route path="/denials" element={<Denials />} />
      <Route path="/appeals" element={<Appeals />} />
      <Route path="/architecture" element={<Architecture />} />
    </Routes>
  );
}
