const regions = ["North", "South", "East", "West", "Central"];
const segments = ["Consumer", "Corporate", "Home Office"];
const categories = ["Technology", "Furniture", "Office Supplies", "Services"];
const products = ["Laptop", "Desk", "Chair", "Printer", "Storage Box", "Monitor", "Router", "Notebook"];
const channels = ["Website", "Retail", "Partner", "Marketplace"];
const campaigns = ["Spring Push", "Renewal", "Back to Work", "Clearance", "Launch"];

export const demoCsv = buildDemoCsv();

function buildDemoCsv(): string {
  const headers = [
    "order_date",
    "region",
    "segment",
    "product_category",
    "product",
    "sales",
    "profit",
    "quantity",
    "discount",
    "customer_id",
    "channel",
    "returned",
    "satisfaction_score",
    "campaign_note",
  ];

  const rows = Array.from({ length: 180 }, (_, index) => {
    const date = new Date(2025, index % 12, 1 + ((index * 7) % 26));
    const category = categories[(index + Math.floor(index / 9)) % categories.length];
    const region = regions[(index * 3 + 1) % regions.length];
    const segment = segments[(index * 2) % segments.length];
    const product = products[(index * 5 + 2) % products.length];
    const channel = channels[(index * 7) % channels.length];
    const discountRate = [0, 5, 10, 15, 20][index % 5];
    const quantity = 1 + ((index * 4) % 9);
    const base = 75 + (products.indexOf(product) + 1) * 42 + (categories.indexOf(category) + 1) * 28;
    const seasonal = 1 + (date.getMonth() % 4) * 0.11;
    const sales = Math.round((base * quantity * seasonal * (1 - discountRate / 100) + (index % 6) * 17) * 100) / 100;
    const profit = Math.round((sales * (0.08 + (index % 7) * 0.018) - discountRate * 3.5 - (index % 13 === 0 ? 85 : 0)) * 100) / 100;
    const returned = index % 17 === 0 ? "true" : "false";
    const satisfaction = Math.max(1, Math.min(10, 6.2 + (profit > 0 ? 1.3 : -1.1) + (index % 5) * 0.31));
    const note = `${campaigns[index % campaigns.length]} ${category.toLowerCase()} demand via ${channel.toLowerCase()}`;

    return [
      date.toISOString().slice(0, 10),
      region,
      segment,
      category,
      product,
      sales.toFixed(2),
      profit.toFixed(2),
      quantity,
      `${discountRate}%`,
      `C-${String(1000 + (index * 37) % 89).padStart(4, "0")}`,
      channel,
      returned,
      satisfaction.toFixed(1),
      note,
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
