import * as chrono from "chrono-node";

export const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function parseDateTime(text) {
  if (!text) return null;

  const normalized = text.replace(/(\d{4})(\d{1,2}:\d{2})/g, "$1 $2");

  if (!/\d{4}/.test(normalized)) return null;

  const date = chrono.parseDate(normalized, new Date(), {
    forwardDate: false,
  });

  if (!date || isNaN(date.getTime())) return null;
  return date;
}

export function formatHourAmPm(h) {
  const hour = h % 12 || 12;
  return `${hour} ${h >= 12 ? "PM" : "AM"}`;
}

export function formatMonthDay(ts) {
  const d = new Date(ts);
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
}

export function startOfHour(ts) {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

export function categoryFromType(type) {
  if (type === "Tip") return "tips";
  if (type === "Bundle" || type === "PPV") return "messages";
  if (type === "Post") return "posts";
  if (type === "Sub" || type === "Resub") return "subs";
  return null;
}

function classifyTransaction(desc, isGrossInteger) {
  const t = desc.toLowerCase();

  if (["tip", "sugerencia"].some((k) => t.includes(k))) {
    return { type: "Tip", isPpv: false };
  }

  if (["payment for message", "pago por mensaje"].some((k) => t.includes(k))) {
    return { type: "Bundle", isPpv: !isGrossInteger };
  }

  if (["post", "publicación"].some((k) => t.includes(k))) {
    return { type: "Post", isPpv: true };
  }

  if (["recurring subscription", "suscripción recurrente"].some((k) => t.includes(k))) {
    return { type: "Resub", isPpv: true };
  }

  if (["subscription", "suscripción de"].some((k) => t.includes(k))) {
    return { type: "Sub", isPpv: true };
  }

  throw new Error(`Unclassified transaction description: ${desc}`);
}

function parseRow(line) {
  const cells = line.split("\t").map((c) => c.trim());
  const moneyIndexes = cells.map((c, i) => (c.startsWith("$") ? i : null)).filter((i) => i !== null);

  if (moneyIndexes.length < 3) return null;

  const dt = parseDateTime(cells.slice(0, moneyIndexes[0]).join(" "));
  if (!dt) return null;

  const gross = Number(cells[moneyIndexes[0]].replace("$", ""));
  const fee = Number(cells[moneyIndexes[1]].replace("$", ""));
  const net = Number(cells[moneyIndexes[2]].replace("$", ""));

  if (Number((gross - fee).toFixed(2)) !== net) return null;

  // FIX: Capture the description text
  const desc = cells.slice(moneyIndexes[2] + 1).join(" ");
  const classified = classifyTransaction(desc, Number.isInteger(gross));

  if (!classified) return null;

  return {
    timestamp: dt.getTime(),
    gross,
    net,
    type: classified.type,
    isPpv: classified.isPpv,
    text: desc, // <--- ADDED THIS
  };
}

export function parseTransactions(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const parsed = [];
  let hasError = false;

  for (let i = 0; i < lines.length; i++) {
    try {
      let row = null;

      if (lines[i].includes("\t")) {
        row = parseRow(lines[i]);
      } else if (parseDateTime(lines[i]) && lines[i + 1]?.startsWith("$") && lines[i + 2]?.startsWith("$") && lines[i + 3]?.startsWith("$")) {
        const combined = [lines[i], lines[i + 1], lines[i + 2], lines[i + 3], lines[i + 4] || ""].join("\t");

        row = parseRow(combined);
        i += 4;
      }

      if (!row) {
        throw new Error("Row parsing failed");
      }

      parsed.push(row);
    } catch {
      hasError = true;
    }
  }

  return { parsed, hasError };
}
