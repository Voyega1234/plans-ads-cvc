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
  emailUrls: string[];
  thankYouUrls: string[];
  externalLinks: string[];
  videoElements: string[];         // YouTube iframes, <video> src, video links
  chatWidgets: string[];           // Tidio, Intercom, Crisp, Zendesk, Tawk
  socialLinks: { platform: string; url: string }[];
  hasShopify: boolean;
  hasWooCommerce: boolean;
  platform?: string;               // detected CMS/stack (WordPress, Shopify, Wix, ...) for the install guide
  hasLeadForm: boolean;            // Google Ads Lead Form Extension embed
  ecommerceLayer: string[];        // existing datalayer push snippets found
  fbPixelId?: string;              // detected existing Meta Pixel ID
  ttPixelId?: string;              // detected existing TikTok Pixel ID
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

  // ── Existing tracking IDs ──────────────────────────────────────────────────
  const gtmMatch = html.match(/GTM-[A-Z0-9]+/);
  const gtmId = gtmMatch?.[0];
  const hasGtm = !!gtmId;

  const ga4Match = html.match(/G-[A-Z0-9]{8,12}/);
  const gtagMatch = html.match(/gtag\s*\(\s*['"]config['"]\s*,\s*['"]([^'"]+)['"]/);
  const ga4MeasurementId = (gtagMatch?.[1]?.startsWith("G-") ? gtagMatch[1] : null) ?? ga4Match?.[0];
  const hasGa4 = !!ga4MeasurementId;

  const otherPixels: OtherPixel[] = [];
  const fbMatch = html.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/);
  const fbPixelId = fbMatch?.[1];
  if (fbPixelId) otherPixels.push({ name: "Meta Pixel", id: fbPixelId });
  const ttMatch = html.match(/ttq\s*\.?\s*load\s*\(\s*['"]([^'"]+)['"]/);
  const ttPixelId = ttMatch?.[1];
  if (ttPixelId) otherPixels.push({ name: "TikTok Pixel", id: ttPixelId });
  if (html.includes("clarity.ms")) otherPixels.push({ name: "Microsoft Clarity" });
  if (html.includes("hotjar.com")) otherPixels.push({ name: "Hotjar" });
  if (html.includes("snap.licdn.com") || html.includes("linkedin")) otherPixels.push({ name: "LinkedIn Insight" });

  // ── Forms ──────────────────────────────────────────────────────────────────
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

  // ── LINE links ─────────────────────────────────────────────────────────────
  const lineUrls: string[] = [];
  $("a[href*='line.me'], a[href*='lin.ee'], a[href*='line://']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) lineUrls.push(href);
  });

  // ── Phone links ────────────────────────────────────────────────────────────
  const telUrls: string[] = [];
  $("a[href^='tel:']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) telUrls.push(href.replace("tel:", "").trim());
  });

  // ── Email links ────────────────────────────────────────────────────────────
  const emailUrls: string[] = [];
  $("a[href^='mailto:']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) emailUrls.push(href.replace("mailto:", "").split("?")[0].trim());
  });

  // ── Thank-you pages ────────────────────────────────────────────────────────
  const thankYouUrls: string[] = [];
  $("a[href*='thank'], a[href*='success'], a[href*='complete'], a[href*='confirm'], a[href*='order-received']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) thankYouUrls.push(href);
  });
  // Also detect meta-refresh or script redirects to thank-you pages
  const tyMatch = html.match(/(?:window\.location|location\.href)\s*=\s*['"]([^'"]*(?:thank|success|complete|confirm)[^'"]*)['"]/gi);
  if (tyMatch) tyMatch.forEach(m => {
    const u = m.match(/['"]([^'"]+)['"]/)?.[1];
    if (u) thankYouUrls.push(u);
  });

  // ── External links ─────────────────────────────────────────────────────────
  const host = new URL(normalizedUrl).hostname;
  const externalLinks: string[] = [];
  $("a[href^='http']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      if (new URL(href).hostname !== host) externalLinks.push(href);
    } catch { /* skip invalid URLs */ }
  });

  // ── Video elements ─────────────────────────────────────────────────────────
  const videoElements: string[] = [];
  $("iframe[src*='youtube.com'], iframe[src*='youtu.be'], iframe[src*='vimeo.com']").each((_, el) => {
    const src = $(el).attr("src");
    if (src) videoElements.push(src);
  });
  $("video[src], source[src*='.mp4'], source[src*='.webm']").each((_, el) => {
    const src = $(el).attr("src");
    if (src) videoElements.push(src);
  });
  $("a[href*='youtube.com'], a[href*='youtu.be']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) videoElements.push(href);
  });

  // ── Chat widgets ───────────────────────────────────────────────────────────
  const chatWidgets: string[] = [];
  if (html.includes("tidio")) chatWidgets.push("Tidio");
  if (html.includes("intercom")) chatWidgets.push("Intercom");
  if (html.includes("crisp.chat")) chatWidgets.push("Crisp");
  if (html.includes("zopim") || html.includes("zendesk")) chatWidgets.push("Zendesk");
  if (html.includes("tawk.to")) chatWidgets.push("Tawk.to");
  if (html.includes("freshchat") || html.includes("freshworks")) chatWidgets.push("Freshchat");
  if (html.includes("livechat")) chatWidgets.push("LiveChat");
  if (html.includes("drift.com")) chatWidgets.push("Drift");
  // LINE MyShop / LINE OA widget
  if (html.includes("linechat") || html.includes("line-chat-plugin")) chatWidgets.push("LINE Chat Widget");

  // ── Social links ───────────────────────────────────────────────────────────
  const socialLinks: { platform: string; url: string }[] = [];
  const socialPatterns: { platform: string; pattern: RegExp }[] = [
    { platform: "Facebook", pattern: /facebook\.com\/([\w.]+)/i },
    { platform: "Instagram", pattern: /instagram\.com\/([\w.]+)/i },
    { platform: "Twitter/X", pattern: /(?:twitter|x)\.com\/([\w]+)/i },
    { platform: "YouTube", pattern: /youtube\.com\/(?:channel|c|@)(\/[\w-]+)/i },
    { platform: "TikTok", pattern: /tiktok\.com\/@([\w.]+)/i },
    { platform: "LinkedIn", pattern: /linkedin\.com\/(?:company|in)\/([\w-]+)/i },
  ];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    for (const { platform, pattern } of socialPatterns) {
      if (pattern.test(href) && !socialLinks.find(s => s.url === href)) {
        socialLinks.push({ platform, url: href });
      }
    }
  });

  // ── Platform detection ─────────────────────────────────────────────────────
  const hasShopify = html.includes("Shopify.theme") || html.includes("cdn.shopify.com") || html.includes("myshopify.com");

  // Platform / CMS detection — drives the per-platform install guide in Tracking Setup
  const platform =
    hasShopify ? "Shopify"
    : /wp-content|wp-includes|wp-json/.test(html) ? "WordPress"
    : /static\.wixstatic\.com|wix-code|_wixCIDX/.test(html) ? "Wix"
    : /website-files\.com|data-wf-page/i.test(html) ? "Webflow"
    : /__NEXT_DATA__|\/_next\//.test(html) ? "Next.js / React"
    : /makewebeasy|mwe-cdn/i.test(html) ? "MakeWebEasy"
    : /lnwshop|lnw\.me/i.test(html) ? "LnwShop"
    : /readyplanet/i.test(html) ? "ReadyPlanet"
    : undefined;
  const hasWooCommerce = html.includes("woocommerce") || html.includes("wc-cart") || html.includes("add-to-cart");
  const hasLeadForm = html.includes("googleadservices.com/pagead/conversion") ||
                     html.includes("lead-form") || html.includes("leadform") ||
                     html.includes("gform_wrapper"); // Gravity Forms

  // ── Ecommerce dataLayer snippets ───────────────────────────────────────────
  const ecommerceLayer: string[] = [];
  const ecPatterns = ["view_item", "add_to_cart", "begin_checkout", "purchase", "view_item_list", "remove_from_cart"];
  $("script:not([src])").each((_, el) => {
    const content = $(el).html() ?? "";
    if (ecPatterns.some(p => content.includes(p))) {
      ecommerceLayer.push(content.slice(0, 800));
    }
  });

  // ── All clickable elements ─────────────────────────────────────────────────
  const clickElements: ScanElement[] = [];
  $("a, button, [onclick], [data-href]").each((_, el) => {
    const text = $(el).text().trim().slice(0, 80);
    const href = $(el).attr("href") ?? $(el).attr("data-href") ?? "";
    const id = $(el).attr("id");
    const className = ($(el).attr("class") ?? "").split(" ").filter(Boolean).slice(0, 3).join(".");
    const selector = id ? `#${id}` : className ? `.${className.split(".")[0]}` : $(el)[0].tagName;
    if (text || href) clickElements.push({ selector, text, href, id, className });
  });

  // ── Inline scripts with tracking code ─────────────────────────────────────
  const inlineScripts: string[] = [];
  $("script:not([src])").each((_, el) => {
    const content = $(el).html() ?? "";
    if (content.includes("dataLayer") || content.includes("gtag") || content.includes("fbq") || content.includes("ttq")) {
      inlineScripts.push(content.slice(0, 500));
    }
  });

  return {
    url: normalizedUrl, scannedAt, hasGtm, gtmId, hasGa4, ga4MeasurementId: ga4MeasurementId ?? undefined,
    forms, lineButtons: lineUrls.length, phoneLinks: telUrls.length,
    emailLinks: emailUrls.length,
    thankYouPages: Array.from(new Set(thankYouUrls)),
    hasEcommerceDataLayer: html.includes("ecommerce") && html.includes("dataLayer") || ecommerceLayer.length > 0,
    hasPurchaseEvent: html.includes("purchase") && html.includes("dataLayer"),
    duplicateTracking: Array.from(new Set(html.match(/GTM-[A-Z0-9]+/g) ?? [])).length > 1
      ? Array.from(new Set(html.match(/GTM-[A-Z0-9]+/g) ?? [])) : [],
    otherPixels,
    clickElements: clickElements.slice(0, 80),
    formElements: forms,
    lineUrls: Array.from(new Set(lineUrls)),
    telUrls: Array.from(new Set(telUrls)),
    emailUrls: Array.from(new Set(emailUrls)),
    thankYouUrls: Array.from(new Set(thankYouUrls)),
    externalLinks: Array.from(new Set(externalLinks)).slice(0, 30),
    videoElements: Array.from(new Set(videoElements)).slice(0, 10),
    chatWidgets,
    socialLinks,
    hasShopify,
    hasWooCommerce,
    platform,
    hasLeadForm,
    ecommerceLayer: ecommerceLayer.slice(0, 3),
    fbPixelId,
    ttPixelId,
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
    clickElements: [], formElements: [], lineUrls: [], telUrls: [],
    emailUrls: [], thankYouUrls: [], externalLinks: [], videoElements: [],
    chatWidgets: [], socialLinks: [], hasShopify: false, hasWooCommerce: false,
    hasLeadForm: false, ecommerceLayer: [],
    pageTitle: "", inlineScripts: [], hasWordPress: false, hasFacebook: false, hasTiktok: false,
    rawHtmlLength: 0, fetchError,
  };
}
