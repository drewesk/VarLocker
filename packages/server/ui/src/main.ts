import { setToken, handshake, apiFetch } from "./api.ts";

const $ = <T extends Element>(id: string) => document.getElementById(id) as T;

let currentSlug = "";

async function loadProjects(): Promise<void> {
  const rows = await apiFetch<{ slug: string; name: string }[]>("/api/projects");
  const list = $<HTMLUListElement>("project-list");
  list.innerHTML = "";
  for (const p of rows) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${p.name} <small>(${p.slug})</small></span>`;
    const btn = document.createElement("button");
    btn.textContent = "open";
    btn.onclick = () => openProject(p.slug, p.name);
    li.appendChild(btn);
    list.appendChild(li);
  }
}

async function openProject(slug: string, name: string): Promise<void> {
  currentSlug = slug;
  $("secrets-heading").textContent = name;
  $("projects-panel").setAttribute("hidden", "");
  $("secrets-panel").removeAttribute("hidden");
  await loadSecrets();
}

async function loadSecrets(): Promise<void> {
  const rows = await apiFetch<{ key: string }[]>(`/api/projects/${currentSlug}/secrets`);
  const list = $<HTMLUListElement>("secret-list");
  list.innerHTML = "";
  for (const s of rows) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${s.key}</span>`;
    const del = document.createElement("button");
    del.textContent = "delete";
    del.onclick = async () => {
      await apiFetch(`/api/projects/${currentSlug}/secrets/${s.key}`, { method: "DELETE" });
      await loadSecrets();
    };
    li.appendChild(del);
    list.appendChild(li);
  }
}

$("btn-connect").addEventListener("click", async () => {
  const token = $<HTMLInputElement>("input-token").value.trim();
  if (!token) return;
  try {
    setToken(token);
    await handshake();
    await apiFetch("/api/projects"); // verify token works
    $("token-form").setAttribute("hidden", "");
    $("app").removeAttribute("hidden");
    $("auth-status").textContent = "connected";
    await loadProjects();
  } catch (e) {
    $("connect-error").textContent = (e as Error).message;
  }
});

$<HTMLFormElement>("new-project-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>("new-project-name").value.trim();
  const slug = $<HTMLInputElement>("new-project-slug").value.trim();
  await apiFetch("/api/projects", { method: "POST", body: JSON.stringify({ name, slug }) });
  await loadProjects();
});

$<HTMLFormElement>("new-secret-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = $<HTMLInputElement>("new-secret-key").value.trim();
  const value = $<HTMLInputElement>("new-secret-value").value;
  await apiFetch(`/api/projects/${currentSlug}/secrets/${key}`, { method: "PUT", body: JSON.stringify({ value }) });
  $<HTMLInputElement>("new-secret-key").value = "";
  $<HTMLInputElement>("new-secret-value").value = "";
  await loadSecrets();
});

$("btn-back").addEventListener("click", () => {
  $("secrets-panel").setAttribute("hidden", "");
  $("projects-panel").removeAttribute("hidden");
});
