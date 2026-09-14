// /api/fudo.js
// Proxy hacia la API de FUDO. FUDO_API_KEY y FUDO_API_SECRET viven como variables
// de entorno en Vercel (nunca en el código del cliente) — esa clave tiene control
// total de la cuenta de FUDO, así que jamás debe quedar visible en el navegador.
//
// Solo maneja costos de ingredientes. Los gastos se cargan directo en FUDO
// con su propia función nativa de "Subir foto" (gratis, con IA incluida).

const FUDO_BASE = "https://api.fu.do/v1alpha1";

async function getToken() {
  const apiKey = process.env.FUDO_API_KEY;
  const apiSecret = process.env.FUDO_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error("FUDO_API_KEY / FUDO_API_SECRET no configuradas en Vercel");
  const r = await fetch("https://auth.fu.do/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ apiKey, apiSecret })
  });
  const d = await r.json();
  if (!d.token) throw new Error("No se pudo autenticar con FUDO: " + JSON.stringify(d));
  return d.token;
}

async function fudoFetch(token, path, opts = {}) {
  const r = await fetch(`${FUDO_BASE}${path}`, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  if (!r.ok) throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = await getToken();
    const { action } = req.body || {};

    if (action === "list_ingredients") {
      const data = await fudoFetch(token, "/ingredients?page[size]=500");
      const ingredients = data.data.map(i => ({ id: i.id, name: i.attributes.name, cost: i.attributes.cost }));
      return res.status(200).json({ ingredients });
    }

    if (action === "update_ingredient") {
      const { id, cost } = req.body;
      const data = await fudoFetch(token, `/ingredients/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ data: { type: "Ingredient", id: String(id), attributes: { cost } } })
      });
      return res.status(200).json({ ok: true, data });
    }

    return res.status(400).json({ error: "acción desconocida" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
