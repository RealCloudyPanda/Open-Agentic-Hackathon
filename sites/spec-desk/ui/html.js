export const esc = (s) => (s != null && typeof s !== "object" ? String(s) : "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };
const STAMP = { "127.0.0.1:5173": "var(--desk)", "localhost:5174": "var(--planner)", "[::1]:5175": "var(--radar)" };
export const stamp = (origin, extra = "") => `<span class="stamp" style="--stamp:${STAMP[origin] || "var(--ink-2)"}">${esc(origin)}${extra}</span>`;
