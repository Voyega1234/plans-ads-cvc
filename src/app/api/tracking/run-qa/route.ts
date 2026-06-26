import { NextRequest, NextResponse } from "next/server";
import { scanUrl } from "@/lib/url-scanner";
import type { TrackingPlan, GtmWorkspace, QaCheckResult } from "@/lib/tracking-types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      clientName: string;
      trackingPlan: TrackingPlan;
      workspace?: GtmWorkspace;
      scanUrl?: string;
      gtmContainerId?: string;
    };
    const { clientName, trackingPlan, workspace, scanUrl: urlToScan, gtmContainerId } = body;

    if (!clientName || !trackingPlan) {
      return NextResponse.json({ success: false, error: "clientName and trackingPlan are required" }, { status: 400 });
    }

    const results: QaCheckResult[] = [];

    // ── 1. Re-scan URL to verify GTM is installed ──────────────
    let liveGtmId: string | undefined;
    if (urlToScan) {
      try {
        const fresh = await scanUrl(urlToScan);
        liveGtmId = fresh.gtmId;

        if (fresh.hasGtm) {
          // Check if GTM ID matches what was configured
          if (gtmContainerId && fresh.gtmId && fresh.gtmId !== gtmContainerId) {
            results.push({
              checkType: "gtm_id_mismatch",
              checkName: "GTM Container ID matches",
              result: "fail",
              severity: "critical",
              message: `Found ${fresh.gtmId} on page but expected ${gtmContainerId}`,
              recommendedFix: "ตรวจสอบว่า snippet ถูก container ที่ติดตั้ง",
              approvalReady: false,
            });
          } else {
            results.push({
              checkType: "gtm_installed",
              checkName: "GTM installed on page",
              result: "pass",
              severity: "info",
              message: `GTM ${fresh.gtmId ?? ""} detected`,
              approvalReady: true,
            });
          }
        } else {
          results.push({
            checkType: "gtm_installed",
            checkName: "GTM installed on page",
            result: fresh.fetchError ? "skip" : "fail",
            severity: fresh.fetchError ? "warning" : "critical",
            message: fresh.fetchError
              ? `ไม่สามารถ scan ได้: ${fresh.fetchError}`
              : "ไม่พบ GTM บนหน้าเว็บ — ตรวจสอบว่าติด snippet แล้ว",
            recommendedFix: "ติด GTM snippet ใน <head> และ <body> ของทุกหน้า",
            approvalReady: false,
          });
        }

        // GA4 check
        if (fresh.hasGa4) {
          results.push({
            checkType: "ga4_installed",
            checkName: "GA4 detected on page",
            result: "pass",
            severity: "info",
            message: `GA4 ${fresh.ga4MeasurementId ?? ""} found`,
            approvalReady: true,
          });
        } else if (!fresh.fetchError) {
          results.push({
            checkType: "ga4_installed",
            checkName: "GA4 detected on page",
            result: "warning",
            severity: "warning",
            message: "ไม่พบ GA4 โดยตรง — อาจโหลดผ่าน GTM (ตรวจสอบใน Network tab)",
            approvalReady: true,
          });
        }
      } catch {
        results.push({
          checkType: "url_rescan",
          checkName: "URL re-scan",
          result: "skip",
          severity: "warning",
          message: "ไม่สามารถ re-scan URL ได้",
          approvalReady: true,
        });
      }
    }

    // ── 2. Events coverage ─────────────────────────────────────
    const keyEvents = trackingPlan.events.filter((e) => e.isKeyEvent);
    const workspaceTags = workspace?.tags ?? [];
    const coveredEventNames = workspaceTags.map((t) =>
      (t.parameters as Record<string, string>)?.eventName ?? t.name.replace("GA4 - ", "").replace("AW - ", "")
    );

    const missingKeyEvents = keyEvents.filter((e) =>
      !coveredEventNames.some((n) => n.toLowerCase().includes(e.eventName.toLowerCase()))
    );

    results.push({
      checkType: "key_events_covered",
      checkName: `Key Events coverage (${keyEvents.length - missingKeyEvents.length}/${keyEvents.length})`,
      result: missingKeyEvents.length === 0 ? "pass" : "fail",
      severity: missingKeyEvents.length === 0 ? "info" : "error",
      message: missingKeyEvents.length > 0
        ? `Missing: ${missingKeyEvents.map((e) => e.eventName).join(", ")}`
        : "ทุก Key Event มี GTM tag",
      approvalReady: missingKeyEvents.length === 0,
    });

    // ── 3. No duplicate tracking ───────────────────────────────
    const eventNames = trackingPlan.events.map((e) => e.eventName);
    const dupes = eventNames.filter((name, i) => eventNames.indexOf(name) !== i);
    results.push({
      checkType: "no_duplicate",
      checkName: "No duplicate events",
      result: dupes.length === 0 ? "pass" : "warning",
      severity: dupes.length === 0 ? "info" : "warning",
      message: dupes.length > 0 ? `Duplicates: ${Array.from(new Set(dupes)).join(", ")}` : undefined,
      approvalReady: true,
    });

    // ── 4. GA4 parameters valid ────────────────────────────────
    const badParams = trackingPlan.events.filter((e) => {
      const params = e.ga4Parameters ?? {};
      return Object.keys(params).some((k) => k.length > 40 || /[^a-z0-9_]/.test(k));
    });
    results.push({
      checkType: "parameter_valid",
      checkName: "GA4 parameter names valid",
      result: badParams.length === 0 ? "pass" : "warning",
      severity: badParams.length === 0 ? "info" : "warning",
      message: badParams.length > 0
        ? `Parameter issues in: ${badParams.map((e) => e.eventName).join(", ")}`
        : undefined,
      approvalReady: true,
    });

    // ── 5. Workspace has AW Conversion Linker ─────────────────
    const hasLinker = workspaceTags.some((t) => t.type === "AW_LINKER");
    results.push({
      checkType: "aw_linker",
      checkName: "Google Ads Conversion Linker tag",
      result: hasLinker ? "pass" : "warning",
      severity: hasLinker ? "info" : "warning",
      message: hasLinker ? undefined : "ไม่พบ Conversion Linker — เพิ่ม AW_LINKER tag",
      recommendedFix: hasLinker ? undefined : "เพิ่ม Google Ads Conversion Linker tag ใน GTM",
      approvalReady: true,
    });

    // ── 6. Consent Mode ────────────────────────────────────────
    const hasConsentTag = workspaceTags.some((t) =>
      t.name.toLowerCase().includes("consent") || t.type === "CUSTOM_HTML"
    );
    const liveGtmHasConsent = liveGtmId !== undefined; // conservative — only flag if we re-scanned
    void liveGtmHasConsent;

    results.push({
      checkType: "consent_mode",
      checkName: "Consent Mode v2",
      result: hasConsentTag ? "pass" : "warning",
      severity: "warning",
      message: hasConsentTag ? undefined : "Consent Mode v2 ไม่ถูกตั้งค่า — ควรเพิ่มก่อน launch",
      recommendedFix: "เพิ่ม Consent Mode v2 initialization ใน Custom HTML tag ที่ยิงก่อน GTM",
      approvalReady: true,
    });

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "QA failed" },
      { status: 500 }
    );
  }
}
