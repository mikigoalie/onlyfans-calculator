export const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function parseDateTime(text) {
  const normalized = text.replace(/(\d{4})(\d{1,2}:\d{2})/g, "$1 $2");

  const match = normalized.match(
    /([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4}),?\s*(\d{1,2}):(\d{2})\s*(am|pm)/i
  );
  if (!match) return null;

  let [, mon, day, year, hour, min, period] = match;

  hour = Number(hour);
  if (period.toLowerCase() === "pm" && hour !== 12) hour += 12;
  if (period.toLowerCase() === "am" && hour === 12) hour = 0;

  const d = new Date(`${mon} ${day}, ${year} ${hour}:${min}`);
  return isNaN(d.getTime()) ? null : d;
}

export function formatHourAmPm(h) {
  const hour = h % 12 || 12;
  return `${hour} ${h >= 12 ? "PM" : "AM"}`;
}

export function formatMonthDay(ts) {
  const d = new Date(ts);
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
}

const TYPE_RULES = [
  { type: "Tip", keys: ["tip", "sugerenc"] },
  { type: "Post", keys: ["post", "publica"] },
  { type: "Stream", keys: ["stream"] },
  { type: "Resub", keys: ["recurring", "resub"] },
  { type: "Sub", keys: ["sub"] },
  { type: "Payment", keys: ["payment", "pago"] },
];

export function classify(desc, gross) {
  if (!desc) return null;

  const t = desc.toLowerCase();
  const rule = TYPE_RULES.find(r => r.keys.some(k => t.includes(k)));
  if (!rule) return null;

  if (rule.type === "Payment") {
    return Math.round((gross % 1) * 100) !== 0 ? "PPV" : "Bundle";
  }

  return rule.type;
}

export function categoryFromType(type) {
  if (type === "Tip") return "tips";
  if (type === "Post") return "posts";
  if (type === "Sub" || type === "Resub") return "subs";
  if (type === "PPV" || type === "Bundle") return "messages";
  return null;
}

function parseRow(line) {
  const cells = line.split("\t").map(c => c.trim());
  const money = cells.map((c, i) => (c.startsWith("$") ? i : null)).filter(i => i !== null);
  if (money.length < 3) return null;

  const dt = parseDateTime(cells.slice(0, money[0]).join(" "));
  if (!dt) return null;

  const gross = Number(cells[money[0]].replace("$", ""));
  const fee = Number(cells[money[1]].replace("$", ""));
  const net = Number(cells[money[2]].replace("$", ""));

  if (Number((gross - fee).toFixed(2)) !== net) return null;

  const desc = cells.slice(money[2] + 1).join(" ");
  const type = classify(desc, gross);
  if (!type) return null;

  return {
    timestamp: dt.getTime(),
    net,
    gross,
    type,
    isPpv: type === "PPV",
  };
}

export function parseTransactions(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsed = [];
  let hasError = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("\t")) {
      const row = parseRow(lines[i]);
      row ? parsed.push(row) : (hasError = true);
      continue;
    }

    if (
      parseDateTime(lines[i]) &&
      lines[i + 1]?.startsWith("$") &&
      lines[i + 2]?.startsWith("$") &&
      lines[i + 3]?.startsWith("$")
    ) {
      const combined = [
        lines[i],
        lines[i + 1],
        lines[i + 2],
        lines[i + 3],
        lines[i + 4] || "",
      ].join("\t");

      const row = parseRow(combined);
      row ? parsed.push(row) : (hasError = true);
      i += 4;
      continue;
    }

    hasError = true;
  }

  return { parsed, hasError };
}
