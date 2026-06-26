"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import AppShell from "@/components/layout/AppShell";
import { useSession } from "next-auth/react";
import {
  Globe, ChartColumn, Target, CheckCircle2, Bot,
  AlertTriangle, Loader2, Zap, ChevronRight, Shield, Send,
  FileText, Tag, Settings2, RefreshCw, Plus, Pencil, Check,
  X, ImagePlus, MessageSquarePlus, Phone, ExternalLink,
  ChevronDown, ChevronUp, Eye, Copy, RotateCcw, Download, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutoTrackingStep, TrackingPlan, GtmWorkspace, QaCheckResult, TrackingEvent } from "@/lib/tracking-types";
import type { RichScanResult } from "@/lib/url-scanner";
import EventLibraryModal from "@/components/tracking/EventLibraryModal";

const TRACKING_TYPE_LABELS: Record<string, string> = {
  WEB_LEAD: "Web Lead",
  WEB_CONVERSION: "Web Conversion",
  ECOMMERCE: "E-commerce",
  LINE_CONVERSION: "LINE Conversion",
  BOOKING: "Booking",
  PHONE_CALL: "Phone Call",
};

const STEPS: { id: AutoTrackingStep; label: string; icon: typeof Globe }[] = [
  { id: "input",              label: "Client Setup",    icon: Settings2 },
  { id: "url_scan",           label: "URL Scan",        icon: Globe },
  { id: "tracking_plan",      label: "Tracking Plan",   icon: FileText },
  { id: "gtm_workspace",      label: "GTM Workspace",   icon: Tag },
  { id: "gtm_tags",           label: "GTM Tags",        icon: Settings2 },
  { id: "ga4_connect",        label: "GA4 Setup",       icon: ChartColumn },
  { id: "google_ads_connect", label: "Google Ads Conv", icon: Target },
  { id: "qa_test",            label: "AI QA",           icon: Shield },
  { id: "human_approve",      label: "Team Approval",   icon: CheckCircle2 },
  { id: "publish",            label: "Publish",         icon: Send },
];

interface Ga4Property { propertyId: string; displayName: string; measurementId?: string; }
interface GtmContainer { containerId: string; containerName: string; publicId: string; accountId: string; domainName?: string; }

function parseNotes(notes?: string) {
  const parts = (notes ?? "").split(" | ");
  return {
    selector:  parts.find((p) => p.startsWith("selector:"))?.replace("selector: ", "") ?? "",
    element:   parts.find((p) => p.startsWith("element:"))?.replace("element: ", "") ?? "",
    why:       parts.find((p) => p.startsWith("why:"))?.replace("why: ", "") ?? "",
    howToTest: parts.find((p) => p.startsWith("test:"))?.replace("test: ", "") ?? "",
  };
}

const PLATFORMS = [
  { id: "GA4",        emoji: "📊", label: "GA4",          bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200"   },
  { id: "GOOGLE_ADS", emoji: "🎯", label: "Google Ads",   bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200"  },
  { id: "FACEBOOK",   emoji: "📘", label: "Facebook Ads", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  { id: "TIKTOK",     emoji: "🎵", label: "TikTok Ads",   bg: "bg-pink-50",   text: "text-pink-700",   border: "border-pink-200"   },
] as const;

function destToPlatforms(dest: string): string[] {
  if (dest === "BOTH") return ["GA4", "GOOGLE_ADS"];
  if (dest === "GA4") return ["GA4"];
  if (dest === "GOOGLE_ADS") return ["GOOGLE_ADS"];
  return ["GA4"];
}

// ── Code Copy Helper ───────────────────────────────────────────
function CodeBlock({ label, code, badge = "JS" }: { label: string; code: string; badge?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between bg-slate-50 border-b border-slate-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700">{badge}</span>
          <p className="text-xs font-semibold text-slate-700">{label}</p>
        </div>
        <button onClick={copy} className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all border", copied ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700")}>
          {copied ? <><Check className="h-3 w-3"/>Copied!</> : <><Copy className="h-3 w-3"/>Copy</>}
        </button>
      </div>
      <pre className="p-3 text-[11px] font-mono text-slate-700 overflow-x-auto bg-white leading-relaxed whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

// ── GTM Code Modal ─────────────────────────────────────────────
function CodeModal({ event, platforms, onClose, fbPixelId, ttPixelId }: {
  event: { eventName: string }; platforms: string[]; onClose: () => void; fbPixelId?: string; ttPixelId?: string;
}) {
  const actualFbId = fbPixelId?.trim() || "YOUR_FB_PIXEL_ID";
  const actualTtId = ttPixelId?.trim() || "YOUR_TT_PIXEL_ID";
  const ga4Code = `{"tagName":"GA4 Event - ${event.eventName}","type":"googtag","parameter":[{"type":"template","key":"measurementId","value":"{{GA4 Measurement ID}}"},{"type":"template","key":"eventName","value":"${event.eventName}"}],"trigger":"กำหนด CSS selector"}`;
  const fbBase = `<!-- Meta Pixel Base Code -->\n<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');\nfbq('init','${actualFbId}');fbq('track','PageView');\n</script>`;
  const fbEvent = `<script>fbq('trackCustom','${event.eventName}');</script>`;
  const ttBase = `<!-- TikTok Pixel -->\n<script>!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.load('${actualTtId}');ttq.page();}(window,document,'ttq');</script>`;
  const ttEvent = `<script>ttq.track('${event.eventName}');</script>`;
  const snippets = [
    ...(platforms.includes("GA4")      ? [{ key:"ga4",     label:"GA4 Event Tag (GTM JSON)",          code:ga4Code, badge:"JSON" }] : []),
    ...(platforms.includes("FACEBOOK") ? [{ key:"fb_base", label:"Meta Pixel Base (All Pages)",        code:fbBase,  badge:"HTML" }, { key:"fb_event", label:`Meta Pixel Event — ${event.eventName}`, code:fbEvent, badge:"HTML" }] : []),
    ...(platforms.includes("TIKTOK")   ? [{ key:"tt_base", label:"TikTok Pixel Base (All Pages)",      code:ttBase,  badge:"HTML" }, { key:"tt_event", label:`TikTok Event — ${event.eventName}`,      code:ttEvent, badge:"HTML" }] : []),
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800">GTM Code — <code className="font-mono text-blue-600">{event.eventName}</code></h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">
          {snippets.length === 0 && <p className="text-sm text-slate-400 text-center py-8">เลือก platform อย่างน้อย 1 ตัวก่อนดู code</p>}
          {snippets.map((s) => (
            <CodeBlock key={s.key} label={s.label} code={s.code} badge={s.badge} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Event Card ─────────────────────────────────────────────────
function EventCard({ event, onRename, onDelete, onPlatformChange, index, fbPixelId, ttPixelId }: {
  event: TrackingEvent; onRename: (id: string, name: string) => void; onDelete: (id: string) => void;
  onPlatformChange: (id: string, platforms: string[]) => void; index: number; fbPixelId?: string; ttPixelId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(event.eventName);
  const [expanded, setExpanded] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>(() =>
    event.platforms?.length ? event.platforms : destToPlatforms(event.destination)
  );
  const info = parseNotes(event.notes);

  function togglePlatform(id: string) {
    const next = platforms.includes(id) ? platforms.filter((p) => p !== id) : [...platforms, id];
    setPlatforms(next);
    onPlatformChange(event.id, next);
  }

  const prioColor = event.priority === "PRIMARY" ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-50 text-slate-500 border-slate-200";

  return (
    <div className={cn("rounded-xl border transition-all", event.isKeyEvent ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-white")}>
      <div className="flex items-start gap-3 p-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0 mt-0.5">{index + 1}</span>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5 mb-1">
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { onRename(event.id, draft); setEditing(false); } if (e.key === "Escape") { setDraft(event.eventName); setEditing(false); } }}
                className="flex-1 rounded-lg border border-blue-300 px-2 py-0.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <button onClick={() => { onRename(event.id, draft); setEditing(false); }} className="rounded-md bg-green-500 p-1 text-white hover:bg-green-600"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={() => { setDraft(event.eventName); setEditing(false); }} className="rounded-md bg-slate-200 p-1 text-slate-600 hover:bg-slate-300"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mb-1">
              <code className="text-sm font-mono font-semibold text-slate-900">{event.eventName}</code>
              {event.isKeyEvent && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">KEY EVENT</span>}
              <button onClick={() => setEditing(true)} className="ml-1 rounded-md p-0.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50"><Pencil className="h-3 w-3" /></button>
              <button onClick={() => onDelete(event.id)} className="rounded-md p-0.5 text-slate-300 hover:text-red-500 hover:bg-red-50"><X className="h-3 w-3" /></button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1 mb-1.5">
            {platforms.map((pid) => { const p = PLATFORMS.find((x) => x.id === pid); return p ? <span key={pid} className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-medium", p.bg, p.text, p.border)}>{p.emoji} {p.label}</span> : null; })}
            <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-medium", prioColor)}>{event.priority}</span>
            <span className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[9px] text-slate-500">{event.triggerType}</span>
          </div>
          {info.element && <p className="text-xs text-slate-600 mb-1">{info.element}</p>}
          {info.selector && <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 font-mono">{info.selector}</code>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setShowCode(true)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors"><Copy className="h-3 w-3" />Code</button>
          <button onClick={() => setExpanded(!expanded)} className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">ส่งไปยัง Platform</p>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button key={p.id} onClick={() => togglePlatform(p.id)} className={cn("flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition-all", platforms.includes(p.id) ? cn(p.bg, p.text, p.border) : "bg-white text-slate-400 border-slate-200 hover:border-slate-300")}>
                  {p.emoji} {p.label}{platforms.includes(p.id) && <Check className="h-2.5 w-2.5 ml-0.5" />}
                </button>
              ))}
            </div>
          </div>
          {event.ga4Parameters && Object.keys(event.ga4Parameters).length > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
              <p className="text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-widest">GA4 Parameters</p>
              <div className="space-y-1">
                {Object.entries(event.ga4Parameters).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-1.5">
                    <code className="text-[10px] font-mono text-violet-700 bg-violet-50 px-1 py-0.5 rounded shrink-0">{k}</code>
                    <span className="text-[10px] text-slate-500 break-all">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {info.why && <div className="rounded-lg bg-blue-50 border border-blue-100 p-2.5"><p className="text-[10px] font-semibold text-blue-600 mb-0.5">ทำไมต้องติด</p><p className="text-xs text-blue-800">{info.why}</p></div>}
          {info.howToTest && <div className="rounded-lg bg-green-50 border border-green-100 p-2.5"><p className="text-[10px] font-semibold text-green-600 mb-0.5">วิธีทดสอบ</p><p className="text-xs text-green-800">{info.howToTest}</p></div>}
        </div>
      )}
      {showCode && <CodeModal event={event} platforms={platforms} fbPixelId={fbPixelId} ttPixelId={ttPixelId} onClose={() => setShowCode(false)} />}
    </div>
  );
}

// ── Refine Panel ───────────────────────────────────────────────
function RefinePanel({ onSubmit, loading }: { onSubmit: (text: string, imgBase64?: string, imgType?: string) => void; loading: boolean }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [imgBase64, setImgBase64] = useState<string | undefined>();
  const [imgType, setImgType] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImgBase64(result.split(",")[1]);
      setImgType(file.type);
      setPreview(result);
    };
    reader.readAsDataURL(file);
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (item) { const f = item.getAsFile(); if (f) handleFile(f); }
  };
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2"><MessageSquarePlus className="h-4 w-4 text-blue-600" /><p className="text-sm font-semibold text-blue-800">เพิ่ม / แก้ไข Context</p></div>
      <p className="text-xs text-slate-500">พิมพ์บอก AI ว่าอยากติด element ไหนเพิ่ม หรือ Paste / อัพโหลด screenshot</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} onPaste={handlePaste}
        placeholder={"เช่น:\n- ให้ติดตาม ปุ่ม 'นัดหมาย' ที่มี class .btn-booking\n- เพิ่ม phone_click สำหรับ tel: links ทุกตัว"}
        rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white resize-none" />
      <div onClick={() => fileRef.current?.click()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }} onDragOver={(e) => e.preventDefault()}
        className={cn("flex items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer transition-colors", preview ? "border-blue-300 bg-white" : "border-slate-200 hover:border-blue-300 hover:bg-blue-50")}>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {preview ? (
          <div className="flex items-center gap-3 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="screenshot" className="h-16 w-24 object-cover rounded-lg border border-slate-200" />
            <div className="flex-1"><p className="text-xs font-medium text-slate-700">Screenshot อัพโหลดแล้ว</p><p className="text-xs text-slate-400">Claude จะวิเคราะห์รูปและระบุ element</p></div>
            <button onClick={(e) => { e.stopPropagation(); setPreview(null); setImgBase64(undefined); setImgType(undefined); }} className="rounded-lg p-1 text-slate-400 hover:text-red-500 hover:bg-red-50"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <><ImagePlus className="h-4 w-4 text-slate-400" /><p className="text-xs text-slate-500">วาง Screenshot (Ctrl+V) หรือ คลิกเพื่ออัพโหลด</p></>
        )}
      </div>
      <button onClick={() => { if (text.trim() || imgBase64) { onSubmit(text, imgBase64, imgType); setText(""); setPreview(null); setImgBase64(undefined); } }}
        disabled={loading || (!text.trim() && !imgBase64)}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}ให้ AI เพิ่ม Events
      </button>
    </div>
  );
}

// ── Build GTM export JSON client-side ─────────────────────────
function buildGtmExportJson(workspace: GtmWorkspace, gtmPublicId: string, ga4MeasurementId: string, googleAdsConversionId: string): string {
  const now = new Date().toISOString();
  let tagIdx = 1;
  let triggerIdx = 1;
  let variableIdx = 1;

  const triggers = (workspace.triggers ?? []).map((tr) => {
    const idx = triggerIdx++;
    const base: Record<string, unknown> = {
      accountId: "0",
      containerId: "0",
      triggerId: String(idx),
      name: tr.name,
    };
    if (tr.type === "PAGEVIEW") {
      base.type = "PAGEVIEW";
    } else if (tr.type === "FORM") {
      base.type = "FORM_SUBMISSION";
      base.filter = [{ type: "CONTAINS", parameter: [
        { type: "TEMPLATE", key: "arg0", value: "{{Page URL}}" },
        { type: "TEMPLATE", key: "arg1", value: "" },
      ]}];
    } else if (tr.type === "CLICK") {
      base.type = "LINK_CLICK";
    } else if (tr.type === "CUSTOM_EVENT") {
      base.type = "CUSTOM_EVENT";
      base.customEventFilter = [{ type: "EQUALS", parameter: [
        { type: "TEMPLATE", key: "arg0", value: "{{_event}}" },
        { type: "TEMPLATE", key: "arg1", value: tr.name },
      ]}];
    } else {
      base.type = tr.type;
    }
    return { ...base, _triggerId: String(idx) };
  });

  // build a name→id map for triggers
  const triggerNameToId: Record<string, string> = {};
  workspace.triggers?.forEach((tr, i) => { triggerNameToId[tr.name] = String(i + 1); });

  const tags = (workspace.tags ?? []).map((tag) => {
    const idx = tagIdx++;
    const base: Record<string, unknown> = {
      accountId: "0",
      containerId: "0",
      tagId: String(idx),
      name: tag.name,
      firingTriggerId: tag.triggers.map((t) => triggerNameToId[t] ?? "1").filter(Boolean),
    };
    if (tag.type === "GA4_CONFIG") {
      base.type = "googtag";
      base.parameter = [
        { type: "template", key: "measurementId", value: ga4MeasurementId || "G-XXXXXXXXXX" },
      ];
    } else if (tag.type === "GA4_EVENT") {
      const evtName = (tag.parameters as Record<string, string>)?.eventName ?? tag.name.replace("GA4 - ", "");
      base.type = "googtag";
      base.parameter = [
        { type: "template", key: "measurementId", value: ga4MeasurementId || "G-XXXXXXXXXX" },
        { type: "template", key: "eventName", value: evtName },
      ];
    } else if (tag.type === "AW_LINKER") {
      base.type = "awct";
      base.parameter = [
        { type: "boolean", key: "enableCrossDomainLinker", value: "true" },
      ];
    } else if (tag.type === "AW_CONVERSION") {
      const parts = googleAdsConversionId.split("/");
      base.type = "awct";
      base.parameter = [
        { type: "template", key: "conversionId", value: parts[0] || "AW-XXXXXXXXX" },
        { type: "template", key: "conversionLabel", value: parts[1] || "XXXXX" },
      ];
    } else {
      base.type = "html";
      base.parameter = [{ type: "template", key: "html", value: "" }];
    }
    return base;
  });

  const variables = (workspace.variables ?? []).map((v) => {
    const idx = variableIdx++;
    const base: Record<string, unknown> = {
      accountId: "0",
      containerId: "0",
      variableId: String(idx),
      name: v.name,
    };
    if (v.type === "DL") {
      base.type = "v";
      base.parameter = [
        { type: "integer", key: "dataLayerVersion", value: "2" },
        { type: "boolean", key: "setDefaultValue", value: "false" },
        { type: "template", key: "name", value: (v.parameters as Record<string, string>)?.name ?? v.name },
      ];
    } else {
      base.type = "jsm";
      base.parameter = [{ type: "template", key: "javascript", value: "function() { return undefined; }" }];
    }
    return base;
  });

  const exportObj = {
    exportFormatVersion: 2,
    exportTime: now,
    containerVersion: {
      path: "accounts/0/containers/0/versions/0",
      accountId: "0",
      containerId: "0",
      containerVersionId: "0",
      container: {
        path: "accounts/0/containers/0",
        accountId: "0",
        containerId: "0",
        name: workspace.workspaceName,
        publicId: gtmPublicId || "GTM-XXXXXXX",
        usageContext: ["WEB"],
      },
      tag: tags,
      trigger: triggers.map(({ _triggerId: _, ...rest }) => rest),
      variable: variables,
    },
  };

  return JSON.stringify(exportObj, null, 2);
}

// ── Step 5 GTM Tags Panel ─────────────────────────────────────
function GtmTagsPanel({ workspace, gtmId, events }: { workspace: GtmWorkspace; gtmId: string; events: TrackingEvent[] }) {
  const [tab, setTab] = useState<"snippet" | "events" | "gtag">("snippet");
  const gtmPublicId = gtmId || workspace.containerId || "GTM-XXXXXXX";

  const headSnippet = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmPublicId}');</script>
<!-- End Google Tag Manager -->`;

  const bodySnippet = `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtmPublicId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;

  const tabs = [
    { id: "snippet" as const, label: "GTM Snippet" },
    { id: "events" as const, label: "Event Code" },
    { id: "gtag" as const, label: "Google Tag (no GTM)" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors", tab === t.id ? "bg-blue-50 text-blue-700 border-b-2 border-blue-500" : "text-gray-500 hover:text-gray-700")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "snippet" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">ติดตั้ง snippet ด้านล่างนี้ในทุกหน้าของเว็บ — <code className="bg-gray-100 px-1 rounded">&lt;head&gt;</code> และ เปิด <code className="bg-gray-100 px-1 rounded">&lt;body&gt;</code></p>
          <CodeBlock label="วางใน <head> ก่อน </head>" code={headSnippet} badge="HTML" />
          <CodeBlock label="วางใน <body> หลังเปิด tag" code={bodySnippet} badge="HTML" />
        </div>
      )}

      {tab === "events" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">dataLayer push snippets — fire เหล่านี้ตามแต่ละ event ที่ detect ได้</p>
          {events.map((ev) => {
            const info = parseNotes(ev.notes);
            const params = ev.ga4Parameters ?? {};
            const paramLines = Object.entries(params).length > 0
              ? Object.entries(params).map(([k, v]) => `    ${k}: ${v.startsWith('{{') ? `'${v}'` : JSON.stringify(v)}`).join(",\n")
              : "    // เพิ่ม parameters ตามต้องการ";
            let code = "";
            if (ev.triggerType === "form_submit") {
              const sel = info.selector || "form";
              code = `// ${ev.eventName} — fire on ${sel}\ndocument.querySelector('${sel}')?.addEventListener('submit', function(e) {\n  dataLayer.push({\n    event: '${ev.eventName}',\n${paramLines}\n  });\n});`;
            } else if (ev.triggerType === "click") {
              const sel = info.selector || "a";
              code = `// ${ev.eventName} — fire on click of ${sel}\ndocument.querySelectorAll('${sel}').forEach(function(el) {\n  el.addEventListener('click', function() {\n    dataLayer.push({\n      event: '${ev.eventName}',\n${paramLines.replace(/^/gm, '  ')}\n    });\n  });\n});`;
            } else if (ev.triggerType === "page_view") {
              code = `// ${ev.eventName} — fires via GTM Pageview trigger\ndataLayer.push({\n  event: '${ev.eventName}',\n${paramLines}\n});`;
            } else {
              code = `// ${ev.eventName}\ndataLayer.push({\n  event: '${ev.eventName}',\n${paramLines}\n});`;
            }
            return (
              <div key={ev.id}>
                <CodeBlock label={`${ev.eventName}${info.element ? ` — ${info.element}` : ""}`} code={code} badge="JS" />
              </div>
            );
          })}
        </div>
      )}

      {tab === "gtag" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">ถ้าไม่ใช้ GTM ให้ติด Google Tag (gtag.js) โดยตรง</p>
          <CodeBlock
            label="Google Tag — ติดใน <head>"
            badge="HTML"
            code={`<!-- Google tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=${gtmPublicId}"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', '${gtmPublicId}');\n</script>`}
          />
        </div>
      )}
    </div>
  );
}

// ── Step 6 GA4 Setup Panel ────────────────────────────────────
function Ga4SetupPanel({ ga4MeasurementId, ga4PropertyId }: { ga4MeasurementId: string; ga4PropertyId: string }) {
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const measurementId = ga4MeasurementId || "G-XXXXXXXXXX";
  const propertyId    = ga4PropertyId || "";

  const ga4ConfigCode = `// GA4 Configuration Tag (GTM)\n{\n  "type": "googtag",\n  "name": "GA4 Configuration",\n  "parameter": [\n    { "type": "template", "key": "measurementId", "value": "${measurementId}" }\n  ],\n  "firingTriggerId": ["All Pages trigger"]\n}`;

  async function sendTestHit() {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res  = await fetch("/api/tracking/test-ga4-hit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurementId }),
      });
      const data = await res.json() as { success: boolean; message: string };
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: "Request failed" });
    }
    setTestLoading(false);
  }

  return (
    <div className="space-y-4">
      {/* GA4 config tag */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">GA4 Configuration Tag (GTM JSON)</p>
        <CodeBlock label={`GA4 Config — ${measurementId}`} code={ga4ConfigCode} badge="JSON" />
      </div>

      {/* Property link */}
      {propertyId && (
        <a
          href={`https://analytics.google.com/analytics/web/#/p${propertyId}/reports/dashboard`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">
          <ExternalLink className="h-3 w-3" />เปิด GA4 Property {propertyId}
        </a>
      )}

      {/* DebugView instructions */}
      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-amber-800">วิธีดู DebugView</p>
        <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
          <li>ไปที่ GA4 → Admin → DebugView</li>
          <li>ติดตั้ง Chrome Extension &quot;Google Analytics Debugger&quot;</li>
          <li>เปิดเว็บในเบราว์เซอร์ — events จะปรากฏ realtime</li>
          <li>ตรวจสอบว่า event name ตรงกับ Tracking Plan</li>
        </ol>
      </div>

      {/* Test hit */}
      <div className="rounded-lg border border-gray-200 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-700">Send Test Hit ผ่าน Measurement Protocol</p>
        <p className="text-[11px] text-gray-400">ต้องตั้งค่า <code className="bg-gray-100 px-1 rounded">GOOGLE_ANALYTICS_API_SECRET</code> ใน .env ก่อน — GA4 Admin → Data Streams → Measurement Protocol API secrets</p>
        <div className="flex items-center gap-2">
          <button onClick={sendTestHit} disabled={testLoading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {testLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Send Test Hit → {measurementId}
          </button>
        </div>
        {testResult && (
          <div className={cn("flex items-start gap-2 rounded-lg p-2.5 text-xs", testResult.success ? "bg-green-50 border border-green-100 text-green-700" : "bg-red-50 border border-red-100 text-red-700")}>
            {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 7 Google Ads Conv Panel ──────────────────────────────
function GoogleAdsConvPanel({ events, googleAdsAccount, onDone }: { events: TrackingEvent[]; googleAdsAccount: string; onDone: () => void }) {
  const keyEvents = events.filter((e) => e.destination === "BOTH" || e.destination === "GOOGLE_ADS");
  const customerId = googleAdsAccount || "";
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Record<string, { conversionId: string; status: string }>>({});
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  async function createAllConversions() {
    if (!customerId) return;
    setCreating(true);
    for (const ev of keyEvents) {
      try {
        const category = ev.eventName.includes("purchase") || ev.eventName.includes("checkout") ? "PURCHASE"
          : ev.eventName.includes("phone") || ev.eventName.includes("call") ? "PHONE_CALL_LEADS"
          : ev.eventName.includes("signup") ? "SIGNUP"
          : "LEAD";
        const res = await fetch("/api/tracking/create-conversion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId, name: ev.eventName, category }),
        });
        const data = await res.json() as { success: boolean; conversionId?: string; error?: string };
        if (data.success && data.conversionId) {
          setCreated((p) => ({ ...p, [ev.id]: { conversionId: data.conversionId!, status: "created" } }));
        } else {
          setCreateErrors((p) => ({ ...p, [ev.id]: data.error ?? "failed" }));
        }
      } catch (e) {
        setCreateErrors((p) => ({ ...p, [ev.id]: e instanceof Error ? e.message : "failed" }));
      }
    }
    setCreating(false);
  }

  return (
    <div className="space-y-4">
      {/* Key events list with auto-create */}
      {keyEvents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">Key Events → Google Ads Conversions ({keyEvents.length})</p>
            {customerId && Object.keys(created).length < keyEvents.length && (
              <button
                onClick={createAllConversions}
                disabled={creating}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                {creating ? "กำลังสร้าง..." : "Auto-Create Conversion Actions"}
              </button>
            )}
          </div>
          {keyEvents.map((ev) => {
            const done = created[ev.id];
            const err  = createErrors[ev.id];
            return (
              <div key={ev.id} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs", done ? "border-green-200 bg-green-50" : err ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50")}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{ev.eventName}</p>
                  {done && <p className="text-green-600 text-[11px]">Conversion ID: {done.conversionId}</p>}
                  {err  && <p className="text-red-500 text-[11px]">{err}</p>}
                </div>
                {done
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  : err
                  ? <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  : <span className="text-gray-400">—</span>
                }
              </div>
            );
          })}
        </div>
      )}

      {!customerId && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
          เลือก Google Ads Account ใน Step 1 เพื่อ Auto-Create Conversions ได้
        </div>
      )}

      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
        <p className="text-xs font-semibold text-blue-800 mb-1.5">หรือสร้างเอง:</p>
        {googleAdsAccount && (
          <a href={`https://ads.google.com/aw/conversions?__e=${customerId.replace(/-/g, "")}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline">
            <ExternalLink className="h-3 w-3" />เปิด Google Ads Conversions Manager
          </a>
        )}
      </div>

      <button onClick={onDone}
        className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors">
        <Check className="h-4 w-4" />Conversion Actions Done — Next Step
      </button>
    </div>
  );
}

// ── Step 10 Publish Summary ───────────────────────────────────
function PublishSummary({ formData, events, workspace, qaResults }: {
  formData: { clientName: string; url: string; gtmContainerId: string; ga4MeasurementId: string; googleAdsAccount: string };
  events: TrackingEvent[];
  workspace: GtmWorkspace | null;
  qaResults: QaCheckResult[];
}) {
  const [copied, setCopied] = useState(false);

  function buildMarkdownReport(): string {
    const now = new Date().toLocaleString("th-TH");
    const passed  = qaResults.filter((r) => r.result === "pass").length;
    const total   = qaResults.length;
    const lines = [
      `# Tracking Setup Report — ${formData.clientName}`,
      `**วันที่:** ${now}`,
      `**URL:** ${formData.url}`,
      "",
      "## Installed Tracking",
      formData.gtmContainerId      ? `- GTM: \`${formData.gtmContainerId}\`` : "- GTM: (ไม่ได้ตั้งค่า)",
      formData.ga4MeasurementId    ? `- GA4: \`${formData.ga4MeasurementId}\`` : "- GA4: (ไม่ได้ตั้งค่า)",
      formData.googleAdsAccount    ? `- Google Ads: \`${formData.googleAdsAccount}\`` : "- Google Ads: (ไม่ได้ตั้งค่า)",
      "",
      `## Events (${events.length} total)`,
      ...events.map((e) => `- \`${e.eventName}\` [${e.priority}] → ${e.destination}`),
      "",
      workspace ? `## GTM Workspace: ${workspace.workspaceName}` : "",
      workspace ? `- Tags: ${workspace.tags?.length ?? 0} | Triggers: ${workspace.triggers?.length ?? 0} | Variables: ${workspace.variables?.length ?? 0}` : "",
      "",
      `## QA Results: ${passed}/${total} passed`,
      ...qaResults.map((r) => `- ${r.result === "pass" ? "✅" : r.severity === "critical" ? "❌" : "⚠️"} ${r.checkName}${r.message ? `: ${r.message}` : ""}`),
      "",
      "---",
      "*Generated by Plans Ads Tracking Setup*",
    ].filter((l) => l !== undefined) as string[];
    return lines.join("\n");
  }

  function copyReport() {
    navigator.clipboard.writeText(buildMarkdownReport()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <p className="font-semibold text-green-900">Tracking Setup Complete!</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Client",      value: formData.clientName || "—" },
            { label: "GTM",         value: formData.gtmContainerId || "—" },
            { label: "GA4",         value: formData.ga4MeasurementId || "—" },
            { label: "Google Ads",  value: formData.googleAdsAccount || "—" },
            { label: "Events",      value: String(events.length) },
            { label: "QA",          value: `${qaResults.filter(r => r.result === "pass").length}/${qaResults.length} pass` },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-white border border-green-100 px-3 py-2">
              <p className="text-[10px] text-green-500 font-medium">{item.label}</p>
              <p className="text-xs font-semibold text-green-800 truncate">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Copy report */}
      <button onClick={copyReport}
        className={cn("flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors", copied ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-700")}>
        {copied ? <><Check className="h-4 w-4" />Report Copied!</> : <><Copy className="h-4 w-4" />Copy Summary Report (Markdown)</>}
      </button>

      <p className="text-xs text-gray-400">ส่ง report ให้ลูกค้าหรือทีมได้เลย — รายละเอียดครบทุก event และ QA ผล</p>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function TrackingSetupPage() {
  const { data: session } = useSession();
  const [currentStep, setCurrentStep]       = useState<AutoTrackingStep>("input");
  const [runningStep, setRunningStep]       = useState<AutoTrackingStep | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<AutoTrackingStep>>(new Set());
  const [errorMsg, setErrorMsg]             = useState<string | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [formData, setFormData] = useState({
    clientName: session?.user?.name ?? "",
    url: "",
    trackingType: "WEB_LEAD",
    gtmContainerId: "",
    gtmAccountId: "",
    ga4PropertyId: "",
    ga4MeasurementId: "",
    googleAdsAccount: "",
    fbPixelId: "",
    ttPixelId: "",
  });
  const [ga4List, setGa4List]   = useState<Ga4Property[]>([]);
  const [gtmList, setGtmList]   = useState<GtmContainer[]>([]);
  const [adAccounts, setAdAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  const [scanResult, setScanResult]     = useState<RichScanResult | null>(null);
  const [trackingPlan, setTrackingPlan] = useState<TrackingPlan | null>(null);
  const [events, setEvents]             = useState<TrackingEvent[]>([]);
  const [gtmWorkspace, setGtmWorkspace] = useState<GtmWorkspace | null>(null);
  const [qaResults, setQaResults]       = useState<QaCheckResult[]>([]);
  const [refineLoading, setRefineLoading] = useState(false);
  const [showEventLibrary, setShowEventLibrary] = useState(false);

  const accessToken = (session as unknown as Record<string, unknown>)?.accessToken as string | undefined;

  const loadIntegrations = useCallback(async () => {
    setLoadingIntegrations(true);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers["x-access-token"] = accessToken;
      const [r1, r2, r3] = await Promise.all([
        fetch("/api/integrations/ga4", { headers }),
        fetch("/api/tracking/gtm-containers", { headers }),
        fetch("/api/clients"),
      ]);
      if (r1.ok) { const d = await r1.json() as { data?: Ga4Property[] }; setGa4List(d.data ?? []); }
      if (r2.ok) {
        const d = await r2.json() as { containers?: Array<{ accountId: string; accountName: string; containerId: string; containerName: string; publicId: string }> };
        setGtmList((d.containers ?? []).map((c) => ({
          containerId:   c.containerId,
          containerName: c.containerName,
          publicId:      c.publicId,
          accountId:     c.accountId,
        })));
      }
      if (r3.ok) { const d = await r3.json() as { accounts?: { id: string; name: string }[] }; setAdAccounts(d.accounts ?? []); }
    } catch { /* ignore */ }
    setLoadingIntegrations(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => { loadIntegrations(); }, [loadIntegrations]);

  const markDone = (step: AutoTrackingStep) => {
    setCompletedSteps((prev) => new Set<AutoTrackingStep>([...Array.from(prev), step]));
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx < STEPS.length - 1) setCurrentStep(STEPS[idx + 1].id);
  };

  const getStepStatus = (stepId: AutoTrackingStep) => {
    if (completedSteps.has(stepId)) return "done";
    if (runningStep === stepId) return "running";
    if (stepId === currentStep) return "active";
    if (stepId === "publish" && !completedSteps.has("human_approve")) return "blocked";
    return "pending";
  };

  const runUrlScan = async () => {
    setRunningStep("url_scan"); setErrorMsg(null);
    try {
      const res  = await fetch("/api/tracking/scan-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: formData.url }) });
      const data = await res.json() as { success: boolean; data: RichScanResult; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Scan failed");
      const scan = data.data;
      setScanResult(scan);
      // auto-fill GTM and GA4 from scan results
      setFormData((prev) => ({
        ...prev,
        gtmContainerId: prev.gtmContainerId || scan.gtmId || "",
        ga4MeasurementId: prev.ga4MeasurementId || scan.ga4MeasurementId || "",
      }));
      markDone("url_scan");
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : "URL scan failed"); }
    setRunningStep(null);
  };

  const runTrackingPlan = async () => {
    setRunningStep("tracking_plan"); setErrorMsg(null);
    try {
      const res  = await fetch("/api/tracking/generate-tracking-plan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: formData.clientName, url: formData.url, urlScanResult: scanResult, trackingType: formData.trackingType, goal: "เพิ่ม leads และ conversions" }),
      });
      const data = await res.json() as { success: boolean; data: TrackingPlan; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Plan failed");
      setTrackingPlan(data.data); setEvents(data.data.events ?? []); markDone("tracking_plan");
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : "Tracking plan failed"); }
    setRunningStep(null);
  };

  const handleRefine = async (text: string, imgBase64?: string, imgType?: string) => {
    if (!trackingPlan) return;
    setRefineLoading(true); setErrorMsg(null);
    try {
      const res  = await fetch("/api/tracking/refine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: formData.clientName, trackingPlan: { ...trackingPlan, events }, instruction: text, imageBase64: imgBase64, imageType: imgType }),
      });
      const data = await res.json() as { success: boolean; data: TrackingEvent[]; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Refine failed");
      setEvents((prev) => [...prev, ...(data.data ?? [])]);
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : "Refine failed"); }
    setRefineLoading(false);
  };

  const [gtmPushLog, setGtmPushLog] = useState<string[]>([]);
  const [pushedWorkspaceId, setPushedWorkspaceId] = useState<string | null>(null);

  const runGtmWorkspace = async () => {
    if (!trackingPlan) return;
    setRunningStep("gtm_workspace"); setErrorMsg(null); setGtmPushLog([]);
    try {
      // Step A: generate local workspace struct
      const res = await fetch("/api/tracking/generate-gtm-workspace", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: formData.clientName, trackingPlan: { ...trackingPlan, events }, existingGtmId: formData.gtmContainerId || undefined }),
      });
      const data = await res.json() as { success: boolean; data: GtmWorkspace; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "GTM workspace failed");
      setGtmWorkspace(data.data);

      // Step B: push to real GTM if we have accountId + containerId + accessToken
      if (accessToken && formData.gtmAccountId && formData.gtmContainerId) {
        const pushRes = await fetch("/api/tracking/push-to-gtm", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-access-token": accessToken },
          body: JSON.stringify({
            accountId:    formData.gtmAccountId,
            containerId:  formData.gtmContainerId,
            workspaceId:  '1',  // GTM default workspace — reuse always
            workspace:    data.data,
            ga4MeasurementId:      formData.ga4MeasurementId || undefined,
            googleAdsConversionId: undefined,
          }),
        });
        const pushData = await pushRes.json() as { success: boolean; workspaceId?: string; log?: string[]; error?: string };
        if (pushData.success) {
          setGtmPushLog(pushData.log ?? []);
          setPushedWorkspaceId(pushData.workspaceId ?? null);
        } else {
          setGtmPushLog([`⚠ Push to GTM failed: ${pushData.error ?? 'unknown error'}`]);
        }
      }

      markDone("gtm_workspace");
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : "GTM workspace failed"); }
    setRunningStep(null);
  };

  const runQa = async () => {
    if (!trackingPlan) return;
    setRunningStep("qa_test"); setErrorMsg(null);
    try {
      const res  = await fetch("/api/tracking/run-qa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: formData.clientName,
          trackingPlan: { ...trackingPlan, events },
          workspace: gtmWorkspace ?? undefined,
          scanUrl: formData.url,
          gtmContainerId: formData.gtmContainerId || undefined,
        }),
      });
      const data = await res.json() as { success: boolean; data: QaCheckResult[]; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "QA failed");
      setQaResults(data.data ?? []); markDone("qa_test");
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : "QA failed"); }
    setRunningStep(null);
  };

  const renameEvent    = (id: string, name: string) => setEvents((prev) => prev.map((e) => e.id === id ? { ...e, eventName: name } : e));
  const deleteEvent    = (id: string) => setEvents((prev) => prev.filter((e) => e.id !== id));
  const updatePlatforms = (id: string, p: string[]) => setEvents((prev) => prev.map((e) => e.id === id ? { ...e, platforms: p } : e));

  function resetFromStep(step: AutoTrackingStep) {
    const idx = STEPS.findIndex((s) => s.id === step);
    setCompletedSteps((prev) => { const next = new Set<AutoTrackingStep>(Array.from(prev)); STEPS.slice(idx).forEach((s) => next.delete(s.id)); return next; });
    setCurrentStep(step);
  }

  function downloadGtmJson() {
    if (!gtmWorkspace) return;
    const json = buildGtmExportJson(
      gtmWorkspace,
      formData.gtmContainerId,
      formData.ga4MeasurementId,
      ""  // conversionId filled as placeholder
    );
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `gtm-export-${formData.clientName.replace(/\s+/g, "-").toLowerCase() || "workspace"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canStart = !!formData.clientName.trim() && !!formData.url.trim() && !!formData.gtmContainerId && !!formData.googleAdsAccount;

  return (
    <AppShell>
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tracking Setup</h1>
        <p className="text-sm text-gray-500 mt-0.5">AI สแกนเว็บจริง วิเคราะห์ว่าต้องติด tracking ตรงไหน แล้วสร้าง GTM workspace ให้</p>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{errorMsg}
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-600 text-xs">ปิด</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Progress sidebar */}
        <div className="xl:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sticky top-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Setup Progress</h3>
            <div className="space-y-0.5">
              {STEPS.map((step, idx) => {
                const status = getStepStatus(step.id);
                const Icon = step.icon;
                return (
                  <div key={step.id} className="relative">
                    {idx < STEPS.length - 1 && (
                      <div className={cn("absolute left-3.5 top-8 w-0.5 h-3", completedSteps.has(step.id) ? "bg-blue-300" : "bg-gray-200")} />
                    )}
                    <div className={cn("flex items-center gap-2 rounded-lg px-2 py-2 transition-all", status === "active" || status === "running" ? "bg-blue-50" : status === "done" ? "bg-green-50" : "")}>
                      <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2 shrink-0",
                        status === "done" ? "border-green-500 bg-green-500 text-white" :
                        status === "active" ? "border-blue-500 bg-white" :
                        status === "running" ? "border-blue-500 bg-white" :
                        "border-gray-300 bg-white"
                      )}>
                        {status === "done" ? <CheckCircle2 className="h-3 w-3" /> :
                         status === "running" ? <Loader2 className="h-3 w-3 text-blue-600 animate-spin" /> :
                         <Icon className={cn("h-3 w-3", status === "active" ? "text-blue-600" : "text-gray-400")} />}
                      </div>
                      <p className={cn("text-xs font-medium",
                        status === "done" ? "text-green-700" :
                        status === "active" || status === "running" ? "text-blue-700" : "text-gray-400"
                      )}>{step.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="xl:col-span-3 space-y-4">

          {/* Step 1: Input */}
          <div className={cn("bg-white rounded-xl border shadow-sm", currentStep === "input" ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200")}>
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">Step 1: Client Setup</h3>
              {completedSteps.has("input") && (
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => resetFromStep("input")} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-amber-300 hover:text-amber-600 transition-colors"><RotateCcw className="h-3 w-3" /> แก้ไข</button>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
              )}
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">ชื่อ Client</label>
                  <input type="text" placeholder="เช่น ConvertCake" value={formData.clientName}
                    onChange={(e) => setFormData((p) => ({ ...p, clientName: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Website URL</label>
                  <input type="url" placeholder="https://example.co.th" value={formData.url}
                    onChange={(e) => setFormData((p) => ({ ...p, url: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Tracking Type</label>
                  <select value={formData.trackingType} onChange={(e) => setFormData((p) => ({ ...p, trackingType: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(TRACKING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {/* GTM — dropdown + manual fallback */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                    GTM Container <span className="text-red-500">*</span>
                    {loadingIntegrations
                      ? <Loader2 className="h-3 w-3 animate-spin text-gray-400 ml-1" />
                      : <button type="button" onClick={loadIntegrations} className="ml-1 text-gray-400 hover:text-blue-500" title="Refresh"><RefreshCw className="h-3 w-3" /></button>
                    }
                  </label>
                  {gtmList.length > 0 ? (
                    <select
                      value={formData.gtmContainerId}
                      onChange={(e) => {
                        const c = gtmList.find((x) => x.containerId === e.target.value);
                        setFormData((p) => ({ ...p, gtmContainerId: c?.containerId ?? e.target.value, gtmAccountId: c?.accountId ?? "" }));
                      }}
                      className={cn("w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500", !formData.gtmContainerId ? "border-red-300 bg-red-50" : "border-gray-200")}
                    >
                      <option value="">เลือก GTM Container...</option>
                      {gtmList.map((c) => <option key={c.containerId} value={c.containerId}>{c.publicId} — {c.containerName}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="GTM-XXXXXXX (พิมพ์ ID โดยตรง)"
                      value={formData.gtmContainerId}
                      onChange={(e) => setFormData((p) => ({ ...p, gtmContainerId: e.target.value.trim() }))}
                      className={cn("w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500", !formData.gtmContainerId ? "border-red-300 bg-red-50" : "border-gray-200")}
                    />
                  )}
                  {!formData.gtmContainerId && !loadingIntegrations && <p className="text-xs text-red-500 mt-1">จำเป็นต้องระบุ GTM Container ID</p>}
                </div>

                {/* Google Ads — required, dropdown only */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                    <Target className="h-3 w-3 text-green-600" />Google Ads Account <span className="text-red-500">*</span>
                    {loadingIntegrations
                      ? <Loader2 className="h-3 w-3 animate-spin text-gray-400 ml-1" />
                      : <button type="button" onClick={loadIntegrations} className="ml-1 text-gray-400 hover:text-blue-500" title="Refresh"><RefreshCw className="h-3 w-3" /></button>
                    }
                  </label>
                  <select
                    value={formData.googleAdsAccount}
                    onChange={(e) => setFormData((p) => ({ ...p, googleAdsAccount: e.target.value }))}
                    className={cn("w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500", !formData.googleAdsAccount ? "border-red-300 bg-red-50" : "border-gray-200")}
                  >
                    <option value="">{loadingIntegrations ? "กำลังโหลด..." : adAccounts.length === 0 ? "ไม่พบ accounts (กด Refresh)" : "เลือก Google Ads Account..."}</option>
                    {adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                  </select>
                  {!formData.googleAdsAccount && !loadingIntegrations && <p className="text-xs text-red-500 mt-1">จำเป็นต้องเลือก Google Ads Account</p>}
                </div>

                {/* GA4 — dropdown or manual Measurement ID */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                    GA4 Measurement ID <span className="text-gray-400 text-[10px]">(optional)</span>
                    {loadingIntegrations
                      ? <Loader2 className="h-3 w-3 animate-spin text-gray-400 ml-1" />
                      : <button type="button" onClick={loadIntegrations} className="ml-1 text-gray-400 hover:text-blue-500" title="Refresh"><RefreshCw className="h-3 w-3" /></button>
                    }
                  </label>
                  {ga4List.length > 0 ? (
                    <select
                      value={formData.ga4PropertyId}
                      onChange={(e) => { const p = ga4List.find((x) => x.propertyId === e.target.value); setFormData((f) => ({ ...f, ga4PropertyId: e.target.value, ga4MeasurementId: p?.measurementId ?? "" })); }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">เลือก GA4 Property... (optional)</option>
                      {ga4List.map((p) => <option key={p.propertyId} value={p.propertyId}>{p.displayName}{p.measurementId ? ` (${p.measurementId})` : ""}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="G-XXXXXXXXXX (optional)"
                      value={formData.ga4MeasurementId}
                      onChange={(e) => setFormData((f) => ({ ...f, ga4MeasurementId: e.target.value.trim() }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5"><span className="text-indigo-500">📘</span> Facebook Pixel ID</label>
                  <input placeholder="1234567890123456 (optional)" value={formData.fbPixelId}
                    onChange={(e) => setFormData((p) => ({ ...p, fbPixelId: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5"><span className="text-pink-500">🎵</span> TikTok Pixel ID</label>
                  <input placeholder="ABCDEFGHIJKLMNOP (optional)" value={formData.ttPixelId}
                    onChange={(e) => setFormData((p) => ({ ...p, ttPixelId: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {!completedSteps.has("input") && (
                <button onClick={() => markDone("input")} disabled={!canStart}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <Bot className="h-4 w-4" />Start AI Tracking Setup<ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Step 2: URL Scan */}
          {completedSteps.has("input") && (
            <div className={cn("bg-white rounded-xl border shadow-sm", currentStep === "url_scan" ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200")}>
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-semibold text-gray-900">Step 2: URL Scan จริง</h3></div>
                {completedSteps.has("url_scan") && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => resetFromStep("url_scan")} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-amber-300 hover:text-amber-600 transition-colors"><RotateCcw className="h-3 w-3" /> แก้ไข</button>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                )}
              </div>
              <div className="p-4">
                {runningStep === "url_scan" ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm text-blue-700"><Loader2 className="h-4 w-4 animate-spin" />กำลังดาวน์โหลด HTML จาก {formData.url}...</div>
                    <p className="text-xs text-gray-400">ตรวจหา GTM, GA4, forms, LINE, tel links...</p>
                  </div>
                ) : !completedSteps.has("url_scan") ? (
                  <button onClick={runUrlScan} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                    <Globe className="h-4 w-4" />Scan {formData.url}
                  </button>
                ) : scanResult ? (
                  <div className="space-y-4">
                    {scanResult.fetchError && (
                      <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />ไม่สามารถเข้าถึงเว็บได้: {scanResult.fetchError} — AI จะแนะนำจาก URL และ business type แทน
                      </div>
                    )}
                    {scanResult.pageTitle && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Eye className="h-3.5 w-3.5 text-gray-400" />
                        <span className="font-medium">{scanResult.pageTitle}</span>
                        <a href={formData.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700"><ExternalLink className="h-3 w-3" /></a>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: "GTM",  value: scanResult.gtmId ?? "ไม่พบ",             ok: scanResult.hasGtm },
                        { label: "GA4",  value: scanResult.ga4MeasurementId ?? "ไม่พบ", ok: scanResult.hasGa4 },
                        { label: "WordPress", value: scanResult.hasWordPress ? "ใช่" : "ไม่ใช่", ok: false },
                        { label: "Meta Pixel", value: scanResult.hasFacebook ? "พบ" : "ไม่พบ", ok: false },
                      ].map((item) => (
                        <div key={item.label} className={cn("rounded-lg border p-2.5 text-center", item.ok ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-200")}>
                          <p className={cn("font-semibold text-xs", item.ok ? "text-green-700" : "text-gray-500")}>{item.label}</p>
                          <p className={cn("text-[10px] truncate mt-0.5", item.ok ? "text-green-600 font-mono" : "text-gray-400")}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                    {(scanResult.lineUrls?.length ?? 0) > 0 && (
                      <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                        <p className="text-xs font-semibold text-green-700 mb-2">LINE / Tel</p>
                        {(scanResult.lineUrls ?? []).map((u, i) => (
                          <div key={`line-${i}`} className="flex items-center gap-2 text-xs">
                            <span className="rounded bg-green-600 px-1.5 py-0.5 text-white text-[9px] font-bold">LINE</span>
                            <code className="text-green-800 truncate">{u}</code>
                          </div>
                        ))}
                        {(scanResult.telUrls ?? []).map((u, i) => (
                          <div key={`tel-${i}`} className="flex items-center gap-2 text-xs">
                            <Phone className="h-3 w-3 text-green-600 shrink-0" />
                            <code className="text-green-800">{u}</code>
                          </div>
                        ))}
                      </div>
                    )}
                    {(scanResult.gtmId || scanResult.ga4MeasurementId) && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-xs text-blue-700">
                        Auto-filled: {scanResult.gtmId ? `GTM = ${scanResult.gtmId}` : ""}{scanResult.gtmId && scanResult.ga4MeasurementId ? " · " : ""}{scanResult.ga4MeasurementId ? `GA4 = ${scanResult.ga4MeasurementId}` : ""}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Step 3: Tracking Plan */}
          {completedSteps.has("url_scan") && (
            <div className={cn("bg-white rounded-xl border shadow-sm", currentStep === "tracking_plan" ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200")}>
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Step 3: Tracking Plan</h3>
                  {completedSteps.has("tracking_plan") && (
                    <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold text-blue-600">{events.length} events</span>
                  )}
                </div>
                {completedSteps.has("tracking_plan") && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => resetFromStep("tracking_plan")} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-amber-300 hover:text-amber-600 transition-colors"><RotateCcw className="h-3 w-3" /> แก้ไข</button>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                )}
              </div>
              <div className="p-4 space-y-4">
                {runningStep === "tracking_plan" ? (
                  <div className="flex items-center gap-3 text-sm text-blue-700"><Loader2 className="h-4 w-4 animate-spin" />Claude กำลังวิเคราะห์และสร้าง Tracking Plan...</div>
                ) : !completedSteps.has("tracking_plan") ? (
                  <button onClick={runTrackingPlan} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    <Bot className="h-4 w-4" />Generate Tracking Plan ด้วย Claude AI
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" /><span className="font-medium">{events.length} Events แนะนำ</span></div>
                    <div className="space-y-2">
                      {events.map((ev, i) => (
                        <EventCard key={ev.id} event={ev} index={i} onRename={renameEvent} onDelete={deleteEvent} onPlatformChange={updatePlatforms} fbPixelId={formData.fbPixelId} ttPixelId={formData.ttPixelId} />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowEventLibrary(true)}
                        className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                        <Plus className="h-4 w-4" />เพิ่มจาก Library (Lead / E-commerce)
                      </button>
                      <button onClick={() => {
                        const newEv: TrackingEvent = {
                          id: `evt_manual_${Date.now()}`, clientId: trackingPlan!.clientId, trackingPlanId: trackingPlan!.id,
                          eventName: "new_event", triggerType: "click", triggerRule: "กำหนดเอง",
                          destination: "GA4", priority: "SECONDARY", ga4Parameters: {}, isKeyEvent: false,
                          status: "WAITING_APPROVAL", riskLevel: "LOW", createdAt: new Date().toISOString(),
                          notes: "selector: | element: กำหนดเอง | why: เพิ่มเอง | test: ทดสอบเอง",
                        };
                        setEvents((prev) => [...prev, newEv]);
                      }} className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 px-4 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Plus className="h-4 w-4" />Custom
                      </button>
                    </div>
                    <RefinePanel onSubmit={handleRefine} loading={refineLoading} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: GTM Workspace */}
          {completedSteps.has("tracking_plan") && (
            <div className={cn("bg-white rounded-xl border shadow-sm", currentStep === "gtm_workspace" ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200")}>
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Step 4: GTM Workspace</h3>
                  {completedSteps.has("gtm_workspace") && gtmWorkspace && (
                    <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                      {gtmWorkspace.tags?.length ?? 0} tags · {gtmWorkspace.triggers?.length ?? 0} triggers
                    </span>
                  )}
                </div>
                {completedSteps.has("gtm_workspace") && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => resetFromStep("gtm_workspace")} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-amber-300 hover:text-amber-600 transition-colors"><RotateCcw className="h-3 w-3" /> Re-build</button>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                )}
              </div>
              <div className="p-4">
                {runningStep === "gtm_workspace" ? (
                  <div className="flex items-center gap-3 text-sm text-blue-700"><Loader2 className="h-4 w-4 animate-spin" />Claude กำลังสร้าง GTM Tags, Triggers, Variables...</div>
                ) : !completedSteps.has("gtm_workspace") ? (
                  <div className="space-y-3">
                    {events.length > 0 && (
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
                        จะสร้าง GTM workspace จาก <strong>{events.length} events</strong>{formData.gtmContainerId && ` → container ${formData.gtmContainerId}`}
                      </div>
                    )}
                    <button onClick={runGtmWorkspace} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Bot className="h-4 w-4" />Build GTM Workspace</button>
                  </div>
                ) : gtmWorkspace ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Tags", count: gtmWorkspace.tags?.length ?? 0, bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-700", sub: "text-blue-600" },
                        { label: "Triggers", count: gtmWorkspace.triggers?.length ?? 0, bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-700", sub: "text-purple-600" },
                        { label: "Variables", count: gtmWorkspace.variables?.length ?? 0, bg: "bg-orange-50", border: "border-orange-100", text: "text-orange-700", sub: "text-orange-600" },
                      ].map(({ label, count, bg, border, text, sub }) => (
                        <div key={label} className={cn("rounded-lg border p-3 text-center", bg, border)}>
                          <p className={cn("text-xl font-bold", text)}>{count}</p>
                          <p className={cn("text-xs", sub)}>{label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      {gtmWorkspace.tags?.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                          <Tag className="h-3 w-3 text-gray-400 shrink-0" />
                          <span className="font-medium text-gray-600">{t.name}</span>
                          <span className="text-gray-400">({t.type})</span>
                        </div>
                      ))}
                    </div>
                    {/* Download GTM JSON */}
                    {/* Push status */}
                    {pushedWorkspaceId ? (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
                        <p className="font-semibold mb-1">✓ Pushed to GTM (Workspace ID: {pushedWorkspaceId})</p>
                        {gtmPushLog.map((l, i) => <p key={i} className="text-[11px] opacity-80">{l}</p>)}
                      </div>
                    ) : gtmPushLog.length > 0 ? (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                        {gtmPushLog.map((l, i) => <p key={i}>{l}</p>)}
                      </div>
                    ) : (
                      <>
                        <button onClick={downloadGtmJson}
                          className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                          <Download className="h-4 w-4" />Download GTM JSON (import ใน GTM Admin)
                        </button>
                        <p className="text-[11px] text-gray-400">ไป GTM → Admin → Import Container → เลือกไฟล์ → Merge หรือ Overwrite</p>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Step 5: GTM Tags — real snippets */}
          {completedSteps.has("gtm_workspace") && (
            <div className={cn("bg-white rounded-xl border shadow-sm", currentStep === "gtm_tags" ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200")}>
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-semibold text-gray-900">Step 5: GTM Tags &amp; Install Snippets</h3></div>
                {completedSteps.has("gtm_tags") && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => resetFromStep("gtm_tags")} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-amber-300 hover:text-amber-600 transition-colors"><RotateCcw className="h-3 w-3" /> แก้ไข</button>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                )}
              </div>
              <div className="p-4">
                {completedSteps.has("gtm_tags") ? (
                  <div className="flex items-center gap-2 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" />GTM Tags &amp; Snippets พร้อมแล้ว</div>
                ) : gtmWorkspace ? (
                  <div className="space-y-4">
                    <GtmTagsPanel workspace={gtmWorkspace} gtmId={formData.gtmContainerId} events={events} />
                    <button onClick={() => markDone("gtm_tags")}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                      <Check className="h-4 w-4" />ติด GTM Snippet เรียบร้อย — Next
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Step 6: GA4 Setup */}
          {completedSteps.has("gtm_tags") && (
            <div className={cn("bg-white rounded-xl border shadow-sm", currentStep === "ga4_connect" ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200")}>
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><ChartColumn className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-semibold text-gray-900">Step 6: GA4 Setup</h3></div>
                {completedSteps.has("ga4_connect") && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => resetFromStep("ga4_connect")} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-amber-300 hover:text-amber-600 transition-colors"><RotateCcw className="h-3 w-3" /> แก้ไข</button>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                )}
              </div>
              <div className="p-4">
                {completedSteps.has("ga4_connect") ? (
                  <div className="flex items-center gap-2 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" />GA4 Setup เสร็จสิ้น</div>
                ) : (
                  <div className="space-y-4">
                    <Ga4SetupPanel ga4MeasurementId={formData.ga4MeasurementId} ga4PropertyId={formData.ga4PropertyId} />
                    <button onClick={() => markDone("ga4_connect")}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                      <Check className="h-4 w-4" />GA4 ติดตั้งเรียบร้อย — Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 7: Google Ads Conversion */}
          {completedSteps.has("ga4_connect") && (
            <div className={cn("bg-white rounded-xl border shadow-sm", getStepStatus("google_ads_connect") === "active" ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200")}>
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><Target className="h-4 w-4 text-green-600" /><h3 className="text-sm font-semibold text-gray-900">Step 7: Google Ads Conversion</h3></div>
                {completedSteps.has("google_ads_connect") && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => resetFromStep("google_ads_connect")} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-amber-300 hover:text-amber-600 transition-colors"><RotateCcw className="h-3 w-3" /> แก้ไข</button>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                )}
              </div>
              <div className="p-4 space-y-3">
                {completedSteps.has("google_ads_connect") ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" />Conversion Actions ตั้งค่าเรียบร้อย</div>
                    {events.filter((e) => e.destination === "BOTH" || e.destination === "GOOGLE_ADS").map((ev) => (
                      <div key={ev.id} className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2">
                        <Target className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <code className="text-xs font-mono font-semibold text-green-800 flex-1">{ev.eventName}</code>
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold", ev.priority === "PRIMARY" ? "bg-green-200 text-green-800" : "bg-gray-100 text-gray-500")}>{ev.priority}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <GoogleAdsConvPanel events={events} googleAdsAccount={formData.googleAdsAccount} onDone={() => markDone("google_ads_connect")} />
                )}
              </div>
            </div>
          )}

          {/* Step 8: QA */}
          {completedSteps.has("google_ads_connect") && (
            <div className={cn("bg-white rounded-xl border shadow-sm", currentStep === "qa_test" ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200")}>
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Step 8: AI QA Test</h3>
                  {completedSteps.has("qa_test") && qaResults.length > 0 && (
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", qaResults.every((r) => r.result === "pass") ? "bg-green-50 border-green-200 text-green-600" : "bg-amber-50 border-amber-200 text-amber-600")}>
                      {qaResults.filter((r) => r.result === "pass").length}/{qaResults.length} pass
                    </span>
                  )}
                </div>
                {completedSteps.has("qa_test") && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => resetFromStep("qa_test")} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-amber-300 hover:text-amber-600 transition-colors"><RotateCcw className="h-3 w-3" /> Re-run</button>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                )}
              </div>
              <div className="p-4">
                {runningStep === "qa_test" ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm text-blue-700"><Loader2 className="h-4 w-4 animate-spin" />กำลังตรวจสอบ tracking setup...</div>
                    <p className="text-xs text-gray-400">Re-scanning URL, cross-checking GTM ID, verifying tags...</p>
                  </div>
                ) : !completedSteps.has("qa_test") ? (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700 space-y-1">
                      <p className="font-semibold">QA จะตรวจสอบ:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-blue-600">
                        <li>Re-scan URL ว่า GTM ติดอยู่จริง</li>
                        <li>GTM container ID ตรงกับที่ตั้งค่า</li>
                        <li>Events ครบทุก Key Event</li>
                        <li>ไม่มี duplicate tracking</li>
                        <li>GA4 parameters valid</li>
                        <li>Consent Mode configured</li>
                      </ul>
                    </div>
                    <button onClick={runQa} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Shield className="h-4 w-4" />Run QA Checklist</button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {qaResults.map((check) => (
                      <div key={check.checkName} className="flex items-start gap-2 text-xs py-1 border-b border-gray-100 last:border-0">
                        {check.result === "pass" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" /> : <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", check.severity === "critical" ? "text-red-500" : "text-amber-500")} />}
                        <span className={cn("font-medium", check.result === "pass" ? "text-gray-500" : check.severity === "critical" ? "text-red-700" : "text-amber-700")}>{check.checkName}</span>
                        {check.message && <span className="text-gray-400 ml-auto">{check.message}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 9: Approval */}
          {completedSteps.has("qa_test") && (
            <div className={cn("bg-white rounded-xl border shadow-sm", !completedSteps.has("human_approve") ? "border-amber-300 ring-1 ring-amber-100" : "border-gray-200")}>
              <div className="p-4 border-b border-amber-100 bg-amber-50 rounded-t-xl flex items-center justify-between">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-amber-600" /><h3 className="text-sm font-semibold text-amber-900">Step 9: Team Approval</h3></div>
                {completedSteps.has("human_approve") && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              </div>
              <div className="p-4">
                {!completedSteps.has("human_approve") ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={async () => { await new Promise((r) => setTimeout(r, 500)); markDone("human_approve"); }}
                      className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors">
                      <Check className="h-4 w-4" />Approve
                    </button>
                    <button
                      onClick={() => setErrorMsg("Tracking setup rejected")}
                      className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors">
                      <X className="h-4 w-4" />Reject
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-700 text-sm"><CheckCircle2 className="h-4 w-4" />Approved — Ready to publish!</div>
                )}
              </div>
            </div>
          )}

          {/* Step 10: Publish */}
          {completedSteps.has("human_approve") && (
            <div className={cn("bg-white rounded-xl border shadow-sm", completedSteps.has("publish") ? "border-green-200" : "border-red-300 ring-1 ring-red-100")}>
              <div className="p-4 border-b border-red-100 bg-red-50 rounded-t-xl flex items-center gap-2">
                <Send className="h-4 w-4 text-red-600" />
                <h3 className="text-sm font-semibold text-red-900">Step 10: Publish &amp; Summary</h3>
                <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">LIVE</span>
              </div>
              <div className="p-4 space-y-4">
                {completedSteps.has("publish") ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3 text-green-700">
                      <CheckCircle2 className="h-5 w-5" />
                      <div><p className="font-semibold text-sm">Published Successfully!</p><p className="text-xs text-green-600">Tracking live แล้ว ตรวจสอบใน GA4 Realtime</p></div>
                    </div>
                    <PublishSummary
                      formData={formData}
                      events={events}
                      workspace={gtmWorkspace}
                      qaResults={qaResults}
                    />
                  </div>
                ) : runningStep === "publish" ? (
                  <div className="flex items-center gap-3 text-sm text-blue-700"><Loader2 className="h-4 w-4 animate-spin" />Publishing to GTM...</div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                      จะ publish ไปยัง LIVE GTM container ทันที — มีผลกับเว็บจริง
                    </div>
                    <button onClick={() => setShowPublishConfirm(true)}
                      className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
                      <Send className="h-4 w-4" />Publish to Live GTM Container
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Event Library Modal */}
    {showEventLibrary && trackingPlan && (
      <EventLibraryModal
        clientId={trackingPlan.clientId}
        existingEventNames={new Set(events.map((e) => e.eventName))}
        onAdd={(ev) => setEvents((prev) => [...prev, ev])}
        onClose={() => setShowEventLibrary(false)}
      />
    )}

    {/* Publish Safety Confirm Modal */}
    {showPublishConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
          <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-red-900">ยืนยัน Publish to Live GTM</h2>
              <p className="text-xs text-red-700 mt-0.5">การกระทำนี้จะมีผลกับ GTM container จริงและเว็บไซต์จริง</p>
            </div>
            <button onClick={() => setShowPublishConfirm(false)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1.5">
              <p>• Tags จะถูก publish ใน GTM container: <strong>{formData.gtmContainerId || '(ไม่ระบุ)'}</strong></p>
              <p>• Conversion actions จะถูกสร้างใน Google Ads account: <strong>{formData.googleAdsAccount || '(ไม่ระบุ)'}</strong></p>
              <p>• การเปลี่ยนแปลงจะมีผลกับเว็บไซต์จริงทันที</p>
              <p>• ไม่มี auto-rollback — ต้องลบ tags ด้วยตนเองถ้าต้องการยกเลิก</p>
            </div>
            <p className="text-xs text-gray-500 text-center">ตรวจสอบ QA Test ผ่านและทีมอนุมัติแล้วก่อน Publish</p>
          </div>
          <div className="px-6 pb-5 flex gap-3">
            <button onClick={() => setShowPublishConfirm(false)}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50">
              ยกเลิก
            </button>
            <button onClick={async () => {
              setShowPublishConfirm(false);
              setRunningStep("publish");
              try {
                if (accessToken && formData.gtmAccountId && formData.gtmContainerId && pushedWorkspaceId) {
                  const pubRes = await fetch("/api/tracking/publish-gtm", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-access-token": accessToken },
                    body: JSON.stringify({ accountId: formData.gtmAccountId, containerId: formData.gtmContainerId, workspaceId: pushedWorkspaceId }),
                  });
                  const pubData = await pubRes.json() as { success: boolean; versionId?: string; error?: string };
                  if (!pubData.success) throw new Error(pubData.error ?? "Publish failed");
                }
                markDone("publish");
              } catch (e) { setErrorMsg(e instanceof Error ? e.message : "Publish failed"); }
              setRunningStep(null);
            }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700">
              <Send className="h-4 w-4" />ยืนยัน Publish จริง
            </button>
          </div>
        </div>
      </div>
    )}
    </AppShell>
  );
}
