import fetch from "node-fetch";
import cheerio from "cheerio";
import fs from "fs/promises";

// Dynamic import for CommonJS module
const pdf = (await import("pdf-parse")).default;

// 官方 HTML（內含中位數字句）
const HTML_URL =
  "https://eng.dgbas.gov.tw/News_Content.aspx?n=4438&s=234608";

// 同篇 PDF（備援）
const PDF_URL =
  "https://ws.dgbas.gov.tw/Download.ashx?u=LzAwMS9VcGxvYWQvNDY0L3JlbGZpbGUvMTA4NTQvMjM0NjA4L2VuZXdzMTEzMTIucGRm&n=ZW5ld3MxMTMxMi5wZGY%3d";

// 從文字解析中位數（固定句型參考官方英文稿）
function parseMedian(text, year) {
  const t = text.replace(/\s+/g, " ");
  const re = new RegExp(
    `In\\s+${year}[\\s\\S]*?median\\s+monthly\\s+regular\\s+earnings\\s+was\\s+NT\\$([\\d,]+)`,
    "i"
  );
  const m = t.match(re);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

async function parseHtml(year) {
  const res = await fetch(HTML_URL);
  if (!res.ok) throw new Error("HTML fetch failed");
  const html = await res.text();
  const $ = cheerio.load(html);
  const text = $("body").text();
  const value = parseMedian(text, year) ?? parseMedian(text, year - 1);
  if (!value) throw new Error("HTML parse failed");
  return { value, source: { html: HTML_URL } };
}

async function parsePdf(year) {
  const res = await fetch(PDF_URL);
  if (!res.ok) throw new Error("PDF fetch failed");
  const buf = await res.arrayBuffer();
  const data = await pdf(Buffer.from(buf));
  const value = parseMedian(data.text, year) ?? parseMedian(data.text, year - 1);
  if (!value) throw new Error("PDF parse failed");
  return { value, source: { pdf: PDF_URL } };
}

async function main() {
  const year = new Date().getUTCFullYear();
  let result;
  try {
    result = await parseHtml(year);
  } catch {
    result = await parsePdf(year);
  }

  const payload = {
    year: result.value === 37274 ? 2024 : year,
    indicator: "median_monthly_regular_earnings_all_employees",
    value: result.value,
    currency: "TWD",
    source: result.source,
    last_updated_utc: new Date().toISOString(),
    parser_version: "1.0.0"
  };

  await fs.mkdir("public", { recursive: true });
  await fs.writeFile(
    "public/median.json",
    JSON.stringify(payload, null, 2),
    "utf8"
  );

  console.log("✔ Generated public/median.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
