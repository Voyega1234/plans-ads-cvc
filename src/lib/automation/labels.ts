/**
 * Automation rule labels — แปล condition/action JSON เป็นภาษาไทยที่ทีมอ่านรู้เรื่อง
 * ใช้ร่วมกันระหว่างหน้า Automation และฟอร์มสร้าง rule
 */

export const METRIC_LABELS: Record<string, string> = {
  ctr:                    'CTR',
  cpc:                    'CPC',
  cpa:                    'CPA',
  roas:                   'ROAS',
  impressions:            'Impressions',
  clicks:                 'Clicks',
  conversions:            'Conversions',
  cost:                   'ค่าใช้จ่าย',
  conv_rate:              'Conversion Rate',
  impression_share:       'Impression Share',
  quality_score:          'Quality Score',
  search_lost_is_budget:  'Lost IS จากงบ',
  search_lost_is_rank:    'Lost IS จากอันดับ',
}

// หน่วยของ metric — ต่อท้ายตัวเลขให้อ่านเป็นธรรมชาติ
export const METRIC_UNITS: Record<string, string> = {
  ctr: '%', cpc: ' บาท', cpa: ' บาท', roas: 'x', cost: ' บาท',
  conv_rate: '%', impression_share: '%', quality_score: '',
  search_lost_is_budget: '%', search_lost_is_rank: '%',
  impressions: '', clicks: '', conversions: '',
}

export const OPERATOR_LABELS: Record<string, string> = {
  '>': 'มากกว่า', '<': 'น้อยกว่า', '>=': 'อย่างน้อย', '<=': 'ไม่เกิน',
}

export const WINDOW_LABELS: Record<string, string> = {
  '1d': '1 วันล่าสุด', '3d': '3 วันล่าสุด', '7d': '7 วันล่าสุด', '14d': '14 วันล่าสุด', '30d': '30 วันล่าสุด',
}

export const ACTION_LABELS: Record<string, string> = {
  send_alert:                'แจ้งเตือนทีมใน Dashboard',
  send_email_alert:          'ส่ง Email แจ้งเตือนทีม',
  pause_keyword:             'หยุด keyword นั้น (Pause)',
  enable_keyword:            'เปิด keyword กลับมา (Enable)',
  reduce_bid_10pct:          'ลด bid ของ keyword ลง 10%',
  reduce_bid_20pct:          'ลด bid ของ keyword ลง 20%',
  reduce_bid_50pct:          'ลด bid ของ keyword ลง 50%',
  increase_bid_10pct:        'เพิ่ม bid ของ keyword ขึ้น 10%',
  increase_bid_20pct:        'เพิ่ม bid ของ keyword ขึ้น 20%',
  increase_budget_10pct:     'เพิ่มงบแคมเปญ 10%',
  increase_budget_20pct:     'เพิ่มงบแคมเปญ 20%',
  increase_budget_30pct:     'เพิ่มงบแคมเปญ 30%',
  decrease_budget_10pct:     'ลดงบแคมเปญ 10%',
  decrease_budget_20pct:     'ลดงบแคมเปญ 20%',
  decrease_budget_30pct:     'ลดงบแคมเปญ 30%',
  reduce_target_cpa_10pct:   'ลด Target CPA ลง 10%',
  reduce_target_cpa_20pct:   'ลด Target CPA ลง 20%',
  increase_target_cpa_10pct: 'เพิ่ม Target CPA ขึ้น 10%',
  increase_target_roas_10pct:'เพิ่ม Target ROAS ขึ้น 10%',
  reduce_target_roas_10pct:  'ลด Target ROAS ลง 10%',
  pause_campaign:            'หยุดแคมเปญ (Pause)',
  enable_campaign:           'เปิดแคมเปญ (Enable)',
  add_label_review:          'ติด label "ต้องตรวจสอบ"',
  add_label_top_performer:   'ติด label "Top Performer"',
  add_label_low_quality:     'ติด label "Low Quality"',
}

// action → ประเภทกฎ (ผู้ใช้ไม่ต้องเลือก type เอง — ระบบรู้จาก action)
export const ACTION_TO_TYPE: Record<string, string> = {
  send_alert: 'alert', send_email_alert: 'alert',
  pause_keyword: 'keyword_pause', enable_keyword: 'keyword_pause',
  reduce_bid_10pct: 'keyword_pause', reduce_bid_20pct: 'keyword_pause', reduce_bid_50pct: 'keyword_pause',
  increase_bid_10pct: 'keyword_pause', increase_bid_20pct: 'keyword_pause',
  increase_budget_10pct: 'budget_adjust', increase_budget_20pct: 'budget_adjust', increase_budget_30pct: 'budget_adjust',
  decrease_budget_10pct: 'budget_adjust', decrease_budget_20pct: 'budget_adjust', decrease_budget_30pct: 'budget_adjust',
  reduce_target_cpa_10pct: 'bid_adjust', reduce_target_cpa_20pct: 'bid_adjust', increase_target_cpa_10pct: 'bid_adjust',
  increase_target_roas_10pct: 'bid_adjust', reduce_target_roas_10pct: 'bid_adjust',
  pause_campaign: 'campaign_pause', enable_campaign: 'campaign_pause',
  add_label_review: 'label', add_label_top_performer: 'label', add_label_low_quality: 'label',
}

// กลุ่ม action สำหรับ dropdown แบบ optgroup
export const ACTION_GROUPS: Array<{ group: string; actions: string[] }> = [
  { group: '🔔 แจ้งเตือน (ปลอดภัย — ไม่แก้อะไรจริง)', actions: ['send_alert', 'send_email_alert'] },
  { group: '🏷 ติด Label (ปลอดภัย)', actions: ['add_label_review', 'add_label_top_performer', 'add_label_low_quality'] },
  { group: '💰 ปรับงบแคมเปญ (แก้ค่าจริง)', actions: ['increase_budget_10pct', 'increase_budget_20pct', 'increase_budget_30pct', 'decrease_budget_10pct', 'decrease_budget_20pct', 'decrease_budget_30pct'] },
  { group: '⏸ จัดการ Keyword (แก้ค่าจริง)', actions: ['pause_keyword', 'enable_keyword', 'reduce_bid_10pct', 'reduce_bid_20pct', 'reduce_bid_50pct', 'increase_bid_10pct', 'increase_bid_20pct'] },
  { group: '🎯 ปรับ Target CPA/ROAS (แก้ค่าจริง)', actions: ['reduce_target_cpa_10pct', 'reduce_target_cpa_20pct', 'increase_target_cpa_10pct', 'increase_target_roas_10pct', 'reduce_target_roas_10pct'] },
  { group: '🛑 เปิด/ปิดแคมเปญ (แก้ค่าจริง)', actions: ['pause_campaign', 'enable_campaign'] },
]

export const HIGH_IMPACT_TYPES = ['budget_adjust', 'campaign_pause', 'bid_adjust', 'keyword_pause']

const fmtNum = (v: number) => v >= 1000 ? v.toLocaleString('th-TH') : String(v)

// แปลง condition JSON → ประโยคไทย "CPA มากกว่า 1,500 บาท ในช่วง 7 วันล่าสุด"
export function conditionSentence(conditionJson: string): string {
  try {
    const c = JSON.parse(conditionJson) as { metric: string; operator: string; value: number; window: string }
    const metric = METRIC_LABELS[c.metric] ?? c.metric
    const op = OPERATOR_LABELS[c.operator] ?? c.operator
    const unit = METRIC_UNITS[c.metric] ?? ''
    const win = WINDOW_LABELS[c.window] ?? c.window
    return `${metric} ${op} ${fmtNum(c.value)}${unit} ในช่วง ${win}`
  } catch { return conditionJson }
}

// แปลง action JSON → ประโยคไทย
export function actionSentence(actionJson: string): string {
  try {
    const a = JSON.parse(actionJson) as { action: string }
    return ACTION_LABELS[a.action] ?? a.action.replace(/_/g, ' ')
  } catch { return actionJson }
}

// ตั้งชื่อกฎอัตโนมัติจากค่าที่เลือก
export function autoRuleName(metric: string, operator: string, value: number, window: string, action: string): string {
  const m = METRIC_LABELS[metric] ?? metric
  const unit = METRIC_UNITS[metric] ?? ''
  const act = ACTION_LABELS[action] ?? action
  return `${act} เมื่อ ${m} ${OPERATOR_LABELS[operator] ?? operator} ${fmtNum(value)}${unit} (${WINDOW_LABELS[window] ?? window})`.slice(0, 90)
}
