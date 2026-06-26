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
