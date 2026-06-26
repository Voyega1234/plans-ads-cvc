import * as cheerio from "cheerio";
import type { UrlScanResult, FormElement, OtherPixel } from "@/lib/tracking-types";

interface ScanElement {
  selector: string;
  text?: string;
  href?: string;
  id?: string;
  className?: string;
}

export interface RichScanResult extends UrlScanResult {
  clickElements: ScanElement[];
  formElements: Array<FormElement & { id?: string; className?: string; submitSelector?: string }>;
  lineUrls: string[];
  telUrls: string[];
  thankYouUrls: string[];
  pageTitle: string;
  metaDescription?: string;
  inlineScripts: string[];
  hasWordPress: boolean;
  hasFacebook: boolean;
  hasTiktok: boolean;
  existingGtmId?: string;
  existingGa4Id?: string;
  rawHtmlLength: number;
  fetchError?: string;
}

export async function scanUrl(url: string): Promise<RichScanResult> {
  const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;
  const scannedAt = new Date().toISOString();

  let html = "";
  let fetchError: string | undefined;

  try {
    const res = await fetch(normalizedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MercyBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "th,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      fetchError = `HTTP ${res.status} ${res.statusText}`;
    } else {
      html = await res.text();
    }
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "Fetch failed";
  }

  if (!html) return emptyResult(normalizedUrl, scannedAt, fetchError);

  const $ = cheerio.load(html);

  const gtmMatch = html.match(/GTM-[A-Z0-9]+/);
  const gtmId = gtmMatch?.[0];
  const hasGtm = !!gtmId;

  const ga4Match = html.match(/G-[A-Z0-9]{8,12}/);
  const gtagMatch = html.match(/gtag\s*\(\s*['"]config['"]\s*,\s*['"]([^'"]+)['"]/);
  const ga4MeasurementId = (gtagMatch?.[1]?.startsWith("G-") ? gtagMatch[1] : null) ?? ga4Match?.[0];
  const hasGa4 = !!ga4MeasurementId;

  const otherPixels: OtherPixel[] = [];
  const fbMatch = html.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/);
  if (fbMatch) otherPixels.push({ name: "Meta Pixel", id: fbMatch[1] });
  const ttMatch = html.match(/ttq\s*\.?\s*load\s*\(\s*['"]([^'"]+)['"]/);
  if (ttMatch) otherPixels.push({ name: "TikTok Pixel", id: ttMatch[1] });
  if (html.includes("clarity.ms")) otherPixels.push({ name: "Microsoft Clarity" });

  const forms: RichScanResult["formElements"] = [];
  $("form").each((_, el) => {
    const $form = $(el);
    const fields: string[] = [];
    $form.find("input, textarea, select").each((__, inp) => {
      const name = $(inp).attr("name") || $(inp).attr("id") || $(inp).attr("placeholder") || $(inp).attr("type") || "";
      if (name && name !== "submit" && name !== "button") fields.push(name);
    });
    const id = $form.attr("id");
    const className = $form.attr("class")?.split(" ").filter(Boolean).join(".") ?? "";
    const selector = id ? `#${id}` : className ? `.${className.split(" ")[0]}` : "form";
    const submitBtn = $form.find("[type=submit], button").first();
    const submitSelector = submitBtn.attr("id") ? `#${submitBtn.attr("id")}` :
                           submitBtn.attr("class") ? `.${submitBtn.attr("class")?.split(" ")[0]}` : undefined;
    forms.push({ selector, action: $form.attr("action"), fields, id, className, submitSelector });
  });

  const lineUrls: string[] = [];
  $("a[href*='line.me'], a[href*='lin.ee']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) lineUrls.push(href);
  });

  const telUrls: string[] = [];
  $("a[href^='tel:']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) telUrls.push(href.replace("tel:", ""));
  });

  const thankYouUrls: string[] = [];
  $("a[href*='thank'], a[href*='success'], a[href*='complete'], a[href*='confirm']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) thankYouUrls.push(href);
  });

  const clickElements: ScanElement[] = [];
  $("a, button").each((_, el) => {
    const text = $(el).text().trim().slice(0, 80);
    const href = $(el).attr("href") ?? "";
    const id = $(el).attr("id");
    const className = ($(el).attr("class") ?? "").split(" ").filter(Boolean).slice(0, 3).join(".");
    const selector = id ? `#${id}` : className ? `.${className.split(".")[0]}` : $(el)[0].tagName;
    if (text || href) clickElements.push({ selector, text, href, id, className });
  });

  const inlineScripts: string[] = [];
  $("script:not([src])").each((_, el) => {
    const content = $(el).html() ?? "";
    if (content.includes("dataLayer") || content.includes("gtag") || content.includes("fbq")) {
      inlineScripts.push(content.slice(0, 500));
    }
  });

  return {
    url: normalizedUrl, scannedAt, hasGtm, gtmId, hasGa4, ga4MeasurementId: ga4MeasurementId ?? undefined,
    forms, lineButtons: lineUrls.length, phoneLinks: telUrls.length,
    emailLinks: $("a[href^='mailto:']").length,
    thankYouPages: Array.from(new Set(thankYouUrls)),
    hasEcommerceDataLayer: html.includes("ecommerce") && html.includes("dataLayer"),
    hasPurchaseEvent: html.includes("purchase") && html.includes("dataLayer"),
    duplicateTracking: Array.from(new Set(html.match(/GTM-[A-Z0-9]+/g) ?? [])).length > 1
      ? Array.from(new Set(html.match(/GTM-[A-Z0-9]+/g) ?? [])) : [],
    otherPixels,
    clickElements: clickElements.slice(0, 50),
    formElements: forms,
    lineUrls: Array.from(new Set(lineUrls)),
    telUrls: Array.from(new Set(telUrls)),
    thankYouUrls: Array.from(new Set(thankYouUrls)),
    pageTitle: $("title").text().trim(),
    metaDescription: $('meta[name="description"]').attr("content"),
    inlineScripts,
    hasWordPress: html.includes("wp-content") || html.includes("wp-includes"),
    hasFacebook: otherPixels.some((p) => p.name === "Meta Pixel"),
    hasTiktok: otherPixels.some((p) => p.name === "TikTok Pixel"),
    existingGtmId: gtmId,
    existingGa4Id: ga4MeasurementId ?? undefined,
    rawHtmlLength: html.length,
    fetchError,
  };
}

function emptyResult(url: string, scannedAt: string, fetchError?: string): RichScanResult {
  return {
    url, scannedAt, hasGtm: false, hasGa4: false,
    forms: [], lineButtons: 0, phoneLinks: 0, emailLinks: 0,
    thankYouPages: [], hasEcommerceDataLayer: false, hasPurchaseEvent: false,
    duplicateTracking: [], otherPixels: [],
    clickElements: [], formElements: [], lineUrls: [], telUrls: [], thankYouUrls: [],
    pageTitle: "", inlineScripts: [], hasWordPress: false, hasFacebook: false, hasTiktok: false,
    rawHtmlLength: 0, fetchError,
  };
}
