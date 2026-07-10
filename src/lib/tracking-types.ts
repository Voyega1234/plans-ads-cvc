// Tracking-related types (ported from JAWIS MEDIA)

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ApprovalStatus = "DRAFT" | "AI_READY" | "WAITING_APPROVAL" | "APPROVED" | "REJECTED" | "PUBLISHED";
export type TrackingType = "WEB_LEAD" | "WEB_CONVERSION" | "ECOMMERCE" | "LINE_CONVERSION" | "BOOKING" | "PHONE_CALL";
export type EventDestination = "GA4" | "GOOGLE_ADS" | "BOTH";
export type ConversionPriority = "PRIMARY" | "SECONDARY";

export interface Client {
  id: string;
  name: string;
  slug: string;
  goal?: string;
  businessType?: string;
  website?: string;
  trackingType: TrackingType;
  riskLevel: RiskLevel;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FormElement {
  selector: string;
  action?: string;
  fields: string[];
}

export interface OtherPixel {
  name: string;
  id?: string;
}

export interface UrlScanResult {
  url: string;
  scannedAt: string;
  hasGtm: boolean;
  gtmId?: string;
  hasGa4: boolean;
  ga4MeasurementId?: string;
  forms: FormElement[];
  lineButtons: number;
  phoneLinks: number;
  emailLinks: number;
  thankYouPages: string[];
  hasEcommerceDataLayer: boolean;
  hasPurchaseEvent: boolean;
  duplicateTracking: string[];
  otherPixels: OtherPixel[];
}

export interface TrackingEvent {
  id: string;
  clientId: string;
  trackingPlanId?: string;
  eventName: string;
  triggerType: "click" | "form_submit" | "page_view" | "custom_event" | "timer";
  triggerRule?: string;
  destination: EventDestination;
  priority: ConversionPriority;
  ga4Parameters?: Record<string, string>;
  googleAdsConversionId?: string;
  isKeyEvent: boolean;
  status: ApprovalStatus;
  lastTestResult?: "pass" | "fail" | "warning";
  riskLevel: RiskLevel;
  notes?: string;
  platforms?: string[];
  createdAt: string;
  approvedAt?: string;
}

export interface TrackingPlan {
  id: string;
  clientId: string;
  name: string;
  trackingType: TrackingType;
  urlScanned?: string;
  scanResults?: UrlScanResult;
  status: ApprovalStatus;
  riskLevel: RiskLevel;
  qaCheckResults?: QaCheckResult[];
  events: TrackingEvent[];
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface GtmTag {
  id: string;
  name: string;
  type: "GA4_CONFIG" | "GA4_EVENT" | "AW_CONVERSION" | "AW_LINKER" | "CUSTOM_HTML";
  parameters?: Record<string, unknown>;
  triggers: string[];
  status: ApprovalStatus;
}

export interface GtmTrigger {
  id: string;
  name: string;
  type: "PAGEVIEW" | "CLICK" | "FORM" | "CUSTOM_EVENT" | "TIMER";
  conditions?: Array<{ variable: string; operator: string; value: string }>;
  status: ApprovalStatus;
}

export interface GtmVariable {
  id: string;
  name: string;
  type: "DL" | "JS" | "CONST" | "URL" | "ELEMENT";
  parameters?: Record<string, unknown>;
  status: ApprovalStatus;
}

export interface GtmWorkspace {
  id: string;
  clientId: string;
  containerId?: string;
  workspaceName: string;
  workspaceId?: string;
  description?: string;
  status: ApprovalStatus;
  tags: GtmTag[];
  triggers: GtmTrigger[];
  variables: GtmVariable[];
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface QaCheckResult {
  checkType: string;
  checkName: string;
  result: "pass" | "fail" | "warning" | "skip";
  severity?: "info" | "warning" | "error" | "critical";
  message?: string;
  recommendedFix?: string;
  approvalReady: boolean;
}

export type AutoTrackingStep =
  | "input"
  | "url_scan"
  | "tracking_plan"
  | "gtm_workspace"
  | "gtm_tags"
  | "ga4_connect"
  | "google_ads_connect"
  | "qa_test"
  | "human_approve"
  | "publish";

// ── Extended scan output types ────────────────────────────────
export interface DetectedTag {
  platform: "GTM" | "GA4" | "Google Ads" | "Meta Pixel" | "TikTok Pixel" | "Consent Mode" | "CMP" | "Ecommerce DL" | "Duplicate Risk" | "Hardcoded Tags";
  status: "found" | "missing" | "partial" | "warning" | "manual_check";
  evidence: string;
  recommendation: string;
  priority: "high" | "medium" | "low";
  detectedId?: string;
}

export interface DetectedElement {
  elementType: "button" | "link" | "form" | "ecommerce" | "booking" | "media" | "download" | "chat" | "social";
  label: string;
  selector: string;
  href?: string;
  pageUrl?: string;
  recommendedEvent: string;
  confidence: number;   // 0–100
  notes: string;
  priority: "high" | "medium" | "low";
}

export interface ScanWarning {
  code: string;
  message: string;
  severity: "critical" | "warning" | "info";
  fix: string;
}

export interface TrackingHealthScore {
  total: number;          // 0–100
  breakdown: Record<string, number>;
  status: "excellent" | "good" | "partial" | "weak" | "missing";
  criticalIssues: string[];
  quickWins: string[];
}

export interface RecommendedEventMapping {
  eventKey: string;
  displayName: string;
  ga4EventName: string;
  googleAdsCategory: string;
  metaEventName: string;
  tiktokEventName: string;
  priority: "high" | "medium" | "low";
  conversionRole: "primary" | "secondary" | "remarketing" | "diagnostic";
  funnelStage: string;
  requiredParameters: string[];
  dataLayerExample: Record<string, unknown>;
  triggerLogic: string;
  gtmTasks: string[];
  qaChecklist: string[];
  warnings: string[];
  duplicateRisk: "high" | "medium" | "low";
}

export type LeadFormPattern = "thank_you_page" | "ajax_inline" | "unknown";

export interface LeadFunnelStep {
  step: string;
  event: string;
  pattern: "gtm_auto" | "developer_required" | "optional";
  description: string;
  gtmMethod?: string;
  developerCode?: string;
  warning?: string;
}

export interface LeadFunnelAnalysis {
  pattern: LeadFormPattern;
  patternLabel: string;
  patternDescription: string;
  canGtmDoItAlone: boolean;
  thankYouUrls: string[];
  formCount: number;
  steps: LeadFunnelStep[];
  developerTasks: string[];
  gtmOnlyTasks: string[];
}

export interface ScanReport {
  url: string;
  scanDate: string;
  websiteTypes: string[];
  healthScore: TrackingHealthScore;
  detectedTags: DetectedTag[];
  detectedElements: DetectedElement[];
  warnings: ScanWarning[];
  recommendedEvents: RecommendedEventMapping[];
  leadFunnelAnalysis?: LeadFunnelAnalysis;
}
