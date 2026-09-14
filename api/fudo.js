// /api/fudo.js
// Proxy hacia la API de FUDO. FUDO_API_KEY y FUDO_API_SECRET viven como variables
// de entorno en Vercel (nunca en el código del cliente) — esa clave tiene control
// total de la cuenta de FUDO, así que jamás debe quedar visible en el navegador.

const FUDO_BASE = "https://api.fu.do/v1alpha1";

// Mapeo de rubro (usado en el panel) -> nombre de categoría de gasto en FUDO.
// Si el nombre no existe todavía en FUDO, esta función lo crea solo.
const RUBRO_TO_CATEGORIA = {
  "Carnes vacunas y achuras": "Carniceria",
  "Cerdo, chacinados y fiambres": "Carniceria",
  "Aves y huevos": "Carniceria",
  "Pescados y mariscos": "Pescaderia",
  "Frutas, verduras y hierbas": "Verduleria",
  "Lácteos y quesos": "Lacteos",
  "Almacén, secos y conservas": "Almacen",
  "Panadería y pastelería": "Panaderia",
  "Bodega, bebidas y hielo": "Bebidas alcoholicas",
  "Descartables y packaging": "Descartables no asociados",
  "Químicos y limpieza": "Limpieza y descartables no asociados"
};
const MEDIO_DE_PAGO_DEFAULT = "Cta. Cte.";

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

async function findOrCreate(token, path, type, name) {
  const list = await fudoFetch(token, `${path}?page[size]=500`);
  const norm = s => String(s || "").trim().toLowerCase();
  let found = (list.data || []).find(x => norm(x.attributes.name) === norm(name));
  if (found) return found;
  const created = await fudoFetch(token, path, {
    method: "POST",
    body: JSON.stringify({ data: { type, attributes: { name } } })
  });
  return created.data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = await getToken();
    const { action } = req.body || {};

    // ---------- Ingredientes (para actualizar costos) ----------
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

    // ---------- Gastos ----------
    if (action === "create_expense") {
      const { fecha, proveedorNombre, importe, rubro } = req.body;
      if (!fecha || !proveedorNombre || importe == null) {
        return res.status(400).json({ error: "Faltan fecha, proveedorNombre o importe" });
      }

      const provider = await findOrCreate(token, "/providers", "Provider", proveedorNombre);

      let expenseCategoryId = null;
      const categoriaNombre = RUBRO_TO_CATEGORIA[rubro];
      if (categoriaNombre) {
        const cat = await findOrCreate(token, "/expense-categories", "ExpenseCategory", categoriaNombre);
        expenseCategoryId = cat.id;
      }

      const paymentMethods = await fudoFetch(token, "/payment-methods?page[size]=50");
      const norm = s => String(s || "").trim().toLowerCase();
      const ctaCte = (paymentMethods.data || []).find(pm => norm(pm.attributes.name).includes("cta"));

      const relationships = {
        provider: { data: { id: String(provider.id), type: "Provider" } }
      };
      if (expenseCategoryId) {
        relationships.expenseCategory = { data: { id: String(expenseCategoryId), type: "ExpenseCategory" } };
      }
      if (ctaCte) {
        relationships.paymentMethod = { data: { id: String(ctaCte.id), type: "PaymentMethod" } };
      }

      const created = await fudoFetch(token, "/expenses", {
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "Expense",
            attributes: { amount: importe, date: fecha },
            relationships
          }
        })
      });

      return res.status(200).json({ ok: true, expenseId: created.data.id });
    }

    return res.status(400).json({ error: "acción desconocida" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
