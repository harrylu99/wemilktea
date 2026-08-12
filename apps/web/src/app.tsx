import { applicationMetadata } from "@wemilktea/config";
import { Route, Routes } from "react-router-dom";

function WebShell() {
  return (
    <main className="p-6">
      <h1>{applicationMetadata.web.name}</h1>
      <p>Public application foundation</p>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="*" element={<WebShell />} />
    </Routes>
  );
}
