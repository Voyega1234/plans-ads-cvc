'use client'

import { useState } from 'react'
import { X, Plus, Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TrackingEvent } from '@/lib/tracking-types'

// ── Event Library ─────────────────────────────────────────────────────────────

interface LibraryEvent {
  eventName: string
  label: string
  triggerType: TrackingEvent['triggerType']
  triggerRule: string
  destination: TrackingEvent['destination']
  priority: TrackingEvent['priority']
  isKeyEvent: boolean
  ga4Parameters: Record<string, string>
  notes: string
  funnel: 'awareness' | 'consideration' | 'intent' | 'conversion'
  category: 'general' | 'lead_form' | 'ecommerce' | 'engagement'
}

const LIBRARY: LibraryEvent[] = [
  // ── Awareness ─────────────────────────────────────────────────
  {
    eventName: 'page_view', label: 'Page View (All Pages)',
    triggerType: 'page_view', triggerRule: 'All pages',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { page_title: '{{Page Title}}', page_location: '{{Page URL}}', page_referrer: '{{Referrer}}' },
    notes: 'selector: body | element: All pages | why: base audience for remarketing | test: เปิดทุกหน้า เช็ค GA4 DebugView',
    funnel: 'awareness', category: 'general',
  },
  {
    eventName: 'scroll_depth_50', label: 'Scroll Depth 50%',
    triggerType: 'custom_event', triggerRule: 'Scroll depth 50%',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { scroll_percent: '50', page_location: '{{Page URL}}' },
    notes: 'selector: window | element: Page scroll | why: engaged visitor signal | test: scroll ลงครึ่งหน้า เช็ค GA4',
    funnel: 'awareness', category: 'engagement',
  },
  {
    eventName: 'scroll_depth_90', label: 'Scroll Depth 90%',
    triggerType: 'custom_event', triggerRule: 'Scroll depth 90%',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { scroll_percent: '90', page_location: '{{Page URL}}' },
    notes: 'selector: window | element: Page scroll | why: high-intent reader | test: scroll จนสุดหน้า เช็ค GA4',
    funnel: 'awareness', category: 'engagement',
  },
  {
    eventName: 'time_on_site_30s', label: 'Time on Site 30s',
    triggerType: 'timer', triggerRule: 'Timer: 30,000ms after page load',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { engagement_time_msec: '30000', page_location: '{{Page URL}}' },
    notes: 'selector: window | element: Timer | why: engaged visitor for remarketing | test: อยู่หน้าเว็บ 30 วินาที',
    funnel: 'awareness', category: 'engagement',
  },
  {
    eventName: 'video_start', label: 'Video Play',
    triggerType: 'click', triggerRule: 'Click on video play button',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { video_title: '{{Video Title}}', video_url: '{{Video URL}}' },
    notes: 'selector: video, .video-wrapper, iframe[src*="youtube"] | element: Video | why: video engagement | test: กดเล่น video',
    funnel: 'awareness', category: 'engagement',
  },

  // ── Consideration ────────────────────────────────────────────
  {
    eventName: 'view_service', label: 'View Service / Product Page',
    triggerType: 'page_view', triggerRule: 'URL contains /service/ or /product/ or /บริการ/',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { page_title: '{{Page Title}}', content_type: 'service', page_location: '{{Page URL}}' },
    notes: 'selector: body | element: Service page | why: product interest audience | test: เปิดหน้าบริการ',
    funnel: 'consideration', category: 'general',
  },
  {
    eventName: 'view_pricing', label: 'View Pricing Page',
    triggerType: 'page_view', triggerRule: 'URL contains /price/ or /pricing/ or /ราคา/',
    destination: 'BOTH', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { page_title: '{{Page Title}}', content_type: 'pricing', page_location: '{{Page URL}}' },
    notes: 'selector: body | element: Pricing page | why: purchase intent audience | test: เปิดหน้าราคา',
    funnel: 'consideration', category: 'general',
  },
  {
    eventName: 'click_cta', label: 'CTA Button Click',
    triggerType: 'click', triggerRule: 'Click on main CTA buttons',
    destination: 'BOTH', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { event_category: 'engagement', event_label: '{{Click Text}}', link_url: '{{Click URL}}' },
    notes: 'selector: .cta, .btn-primary, a[href*="contact"] | element: CTA button | why: high-intent click | test: คลิกปุ่ม CTA หลัก',
    funnel: 'consideration', category: 'general',
  },
  {
    eventName: 'click_external_link', label: 'External Link Click',
    triggerType: 'click', triggerRule: 'Click link with href not matching site domain',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { event_category: 'outbound', event_label: '{{Click URL}}', link_url: '{{Click URL}}' },
    notes: 'selector: a[href^="http"] | element: External links | why: track where users go | test: คลิก link ออกนอกเว็บ',
    funnel: 'consideration', category: 'engagement',
  },

  // ── Intent ─────────────────────────────────────────────────────
  {
    eventName: 'phone_click', label: 'Phone Number Click',
    triggerType: 'click', triggerRule: 'Click on tel: links',
    destination: 'BOTH', priority: 'PRIMARY', isKeyEvent: true,
    ga4Parameters: { event_category: 'contact', event_label: '{{Click URL}}', link_url: '{{Click URL}}' },
    notes: 'selector: a[href^="tel:"] | element: Phone link | why: phone click = high intent lead | test: คลิกเบอร์โทรบนมือถือ',
    funnel: 'intent', category: 'general',
  },
  {
    eventName: 'line_click', label: 'LINE OA Click',
    triggerType: 'click', triggerRule: 'Click URL contains line.me or lin.ee',
    destination: 'BOTH', priority: 'PRIMARY', isKeyEvent: true,
    ga4Parameters: { event_category: 'contact', event_label: 'line_oa', link_url: '{{Click URL}}' },
    notes: 'selector: a[href*="line.me"], a[href*="lin.ee"] | element: LINE button | why: LINE click = high intent | test: คลิกปุ่ม LINE',
    funnel: 'intent', category: 'general',
  },
  {
    eventName: 'email_click', label: 'Email Link Click',
    triggerType: 'click', triggerRule: 'Click on mailto: links',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { event_category: 'contact', event_label: '{{Click URL}}', link_url: '{{Click URL}}' },
    notes: 'selector: a[href^="mailto:"] | element: Email link | why: contact intent | test: คลิก email link',
    funnel: 'intent', category: 'general',
  },
  {
    eventName: 'map_direction_click', label: 'Get Directions (Map)',
    triggerType: 'click', triggerRule: 'Click URL contains google.com/maps or maps.apple.com',
    destination: 'BOTH', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { event_category: 'contact', event_label: 'get_directions', link_url: '{{Click URL}}' },
    notes: 'selector: a[href*="google.com/maps"], a[href*="maps.apple.com"] | element: Map link | why: local intent | test: คลิก get directions',
    funnel: 'intent', category: 'general',
  },
  {
    eventName: 'chat_widget_open', label: 'Chat Widget Open',
    triggerType: 'click', triggerRule: 'Click on chat widget button',
    destination: 'BOTH', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { event_category: 'engagement', event_label: 'chat_open' },
    notes: 'selector: .chat-widget, #intercom-button, .crisp-client, [data-id*="chat"] | element: Chat widget | why: support/sales intent | test: คลิกเปิด chat',
    funnel: 'intent', category: 'general',
  },

  // ── Lead Form ─────────────────────────────────────────────────
  {
    eventName: 'form_start', label: 'Form Start (First Interaction)',
    triggerType: 'click', triggerRule: 'Click on first form field',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { form_id: '{{Form ID}}', form_name: '{{Form Name}}', event_category: 'lead_form' },
    notes: 'selector: form input:first-child, form textarea:first-child | element: Form first field | why: form engagement funnel | test: คลิก field แรกของฟอร์ม',
    funnel: 'intent', category: 'lead_form',
  },
  {
    eventName: 'form_submit', label: 'Form Submit (Lead Conversion)',
    triggerType: 'form_submit', triggerRule: 'Form submission success',
    destination: 'BOTH', priority: 'PRIMARY', isKeyEvent: true,
    ga4Parameters: { form_id: '{{Form ID}}', form_name: '{{Form Name}}', event_category: 'lead', event_label: 'contact_form', lead_source: '{{Page Path}}' },
    notes: 'selector: form | element: Contact form | why: main lead conversion | test: กรอกและส่งฟอร์ม ดู GA4 DebugView',
    funnel: 'conversion', category: 'lead_form',
  },
  {
    eventName: 'form_error', label: 'Form Validation Error',
    triggerType: 'custom_event', triggerRule: 'Form validation fails',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { form_id: '{{Form ID}}', error_message: '{{Error Text}}', event_category: 'lead_form' },
    notes: 'selector: .form-error, [aria-invalid] | element: Form error state | why: UX insight | test: ส่งฟอร์มโดยไม่กรอกข้อมูล',
    funnel: 'intent', category: 'lead_form',
  },
  {
    eventName: 'thank_you_page', label: 'Thank You Page View',
    triggerType: 'page_view', triggerRule: 'URL contains /thank-you/ or /thank_you/ or /ขอบคุณ/',
    destination: 'BOTH', priority: 'PRIMARY', isKeyEvent: true,
    ga4Parameters: { event_category: 'conversion', event_label: 'thank_you', page_location: '{{Page URL}}', conversion_value: '1' },
    notes: 'selector: body | element: Thank you page | why: strongest conversion signal | test: submit form แล้วดูว่า redirect ไป thank-you',
    funnel: 'conversion', category: 'lead_form',
  },

  // ── E-commerce ────────────────────────────────────────────────
  {
    eventName: 'view_item_list', label: 'View Product List',
    triggerType: 'page_view', triggerRule: 'URL matches category or collection page',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { item_list_name: '{{Category Name}}', item_list_id: '{{Category ID}}' },
    notes: 'selector: .product-list, .category-page | element: Product listing | why: browse intent | test: เปิดหน้าสินค้า',
    funnel: 'awareness', category: 'ecommerce',
  },
  {
    eventName: 'view_item', label: 'View Product Detail',
    triggerType: 'page_view', triggerRule: 'URL matches product detail page',
    destination: 'BOTH', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { item_id: '{{Product ID}}', item_name: '{{Product Name}}', item_category: '{{Category}}', price: '{{Price}}', currency: 'THB' },
    notes: 'selector: .product-detail, .pdp | element: Product detail page | why: product interest for remarketing | test: เปิดหน้าสินค้า',
    funnel: 'consideration', category: 'ecommerce',
  },
  {
    eventName: 'add_to_cart', label: 'Add to Cart',
    triggerType: 'click', triggerRule: 'Click on Add to Cart button',
    destination: 'BOTH', priority: 'PRIMARY', isKeyEvent: true,
    ga4Parameters: { item_id: '{{Product ID}}', item_name: '{{Product Name}}', price: '{{Price}}', quantity: '{{Qty}}', currency: 'THB', value: '{{Price}}' },
    notes: 'selector: .add-to-cart, [data-action="add-to-cart"], #add-to-cart | element: Add to Cart button | why: strong purchase intent | test: กดปุ่ม add to cart',
    funnel: 'intent', category: 'ecommerce',
  },
  {
    eventName: 'view_cart', label: 'View Cart',
    triggerType: 'page_view', triggerRule: 'URL matches /cart/ or /ตะกร้า/',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { value: '{{Cart Value}}', currency: 'THB' },
    notes: 'selector: body | element: Cart page | why: cart abandonment tracking | test: เปิดหน้าตะกร้า',
    funnel: 'intent', category: 'ecommerce',
  },
  {
    eventName: 'begin_checkout', label: 'Begin Checkout',
    triggerType: 'page_view', triggerRule: 'URL matches /checkout/ or /ชำระเงิน/',
    destination: 'BOTH', priority: 'PRIMARY', isKeyEvent: true,
    ga4Parameters: { value: '{{Cart Value}}', currency: 'THB', coupon: '{{Coupon}}' },
    notes: 'selector: body | element: Checkout page | why: strong purchase intent | test: เริ่ม checkout',
    funnel: 'intent', category: 'ecommerce',
  },
  {
    eventName: 'add_payment_info', label: 'Add Payment Info',
    triggerType: 'click', triggerRule: 'Select payment method',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { payment_type: '{{Payment Method}}', value: '{{Cart Value}}', currency: 'THB' },
    notes: 'selector: .payment-method, input[name*="payment"] | element: Payment selection | why: checkout progress | test: เลือกวิธีชำระเงิน',
    funnel: 'intent', category: 'ecommerce',
  },
  {
    eventName: 'purchase', label: 'Purchase (Order Complete)',
    triggerType: 'page_view', triggerRule: 'URL matches /order-complete/ or /ขอบคุณ/ or /success/',
    destination: 'BOTH', priority: 'PRIMARY', isKeyEvent: true,
    ga4Parameters: {
      transaction_id: '{{Order ID}}', value: '{{Order Value}}', currency: 'THB',
      tax: '{{Tax}}', shipping: '{{Shipping}}',
      items: '[{"item_id": "{{Product ID}}", "item_name": "{{Product Name}}", "price": "{{Price}}", "quantity": "{{Qty}}"}]',
    },
    notes: 'selector: body | element: Order complete page | why: revenue tracking หลัก | test: ทำ test purchase ดู transaction_id ใน GA4',
    funnel: 'conversion', category: 'ecommerce',
  },
  {
    eventName: 'refund', label: 'Refund',
    triggerType: 'custom_event', triggerRule: 'Order refund event from backend',
    destination: 'GA4', priority: 'SECONDARY', isKeyEvent: false,
    ga4Parameters: { transaction_id: '{{Order ID}}', value: '{{Refund Value}}', currency: 'THB' },
    notes: 'selector: dataLayer push | element: Refund | why: revenue accuracy | test: push dataLayer refund event',
    funnel: 'conversion', category: 'ecommerce',
  },
]

const FUNNEL_LABELS: Record<string, { label: string; color: string }> = {
  awareness:     { label: 'Awareness',     color: 'bg-blue-50 border-blue-200 text-blue-700'  },
  consideration: { label: 'Consideration', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  intent:        { label: 'Intent',        color: 'bg-amber-50 border-amber-200 text-amber-700' },
  conversion:    { label: 'Conversion',    color: 'bg-green-50 border-green-200 text-green-700' },
}

const CATEGORY_LABELS: Record<string, string> = {
  general:     'ทั่วไป',
  lead_form:   'Lead Form',
  ecommerce:   'E-commerce',
  engagement:  'Engagement',
}

interface Props {
  clientId: string
  existingEventNames: Set<string>
  onAdd: (event: TrackingEvent) => void
  onClose: () => void
}

export default function EventLibraryModal({ clientId, existingEventNames, onAdd, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedFunnel, setSelectedFunnel] = useState<string>('all')
  const [added, setAdded] = useState<Set<string>>(new Set())

  const categories = ['all', 'general', 'lead_form', 'ecommerce', 'engagement']
  const funnels = ['all', 'awareness', 'consideration', 'intent', 'conversion']

  const filtered = LIBRARY.filter((e) => {
    if (selectedCategory !== 'all' && e.category !== selectedCategory) return false
    if (selectedFunnel !== 'all' && e.funnel !== selectedFunnel) return false
    if (search && !e.eventName.includes(search.toLowerCase()) && !e.label.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function handleAdd(libEvent: LibraryEvent) {
    const newEv: TrackingEvent = {
      id: `evt_lib_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      clientId,
      eventName: libEvent.eventName,
      triggerType: libEvent.triggerType,
      triggerRule: libEvent.triggerRule,
      destination: libEvent.destination,
      priority: libEvent.priority,
      ga4Parameters: libEvent.ga4Parameters,
      isKeyEvent: libEvent.isKeyEvent,
      status: 'WAITING_APPROVAL',
      riskLevel: 'LOW',
      notes: libEvent.notes,
      createdAt: new Date().toISOString(),
    }
    onAdd(newEv)
    setAdded((prev) => { const next = new Set(Array.from(prev)); next.add(libEvent.eventName); return next })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Tracking Event Library</h2>
            <p className="text-xs text-slate-500 mt-0.5">เลือก events ตาม funnel ที่ต้องการ — ครบทั้ง Lead Form และ E-commerce</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-slate-100 space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา event..."
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {funnels.map((f) => (
              <button key={f} onClick={() => setSelectedFunnel(f)}
                className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                  selectedFunnel === f
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                )}>
                {f === 'all' ? 'ทุก Funnel' : FUNNEL_LABELS[f]?.label ?? f}
              </button>
            ))}
            <span className="text-slate-200 mx-1">|</span>
            {categories.map((c) => (
              <button key={c} onClick={() => setSelectedCategory(c)}
                className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                  selectedCategory === c
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300'
                )}>
                {c === 'all' ? 'ทุกประเภท' : CATEGORY_LABELS[c] ?? c}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">ไม่พบ event ที่ตรงกัน</div>
          )}
          {filtered.map((ev) => {
            const alreadyExists = existingEventNames.has(ev.eventName)
            const justAdded = added.has(ev.eventName)
            const funnelMeta = FUNNEL_LABELS[ev.funnel]

            return (
              <div key={ev.eventName}
                className={cn('flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                  alreadyExists || justAdded ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 hover:border-blue-200'
                )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <code className="text-xs font-mono font-semibold text-slate-900">{ev.eventName}</code>
                    {ev.isKeyEvent && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">KEY EVENT</span>
                    )}
                    <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] font-medium', funnelMeta?.color)}>
                      {funnelMeta?.label}
                    </span>
                    <span className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[9px] text-slate-500">
                      {CATEGORY_LABELS[ev.category] ?? ev.category}
                    </span>
                    <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px]',
                      ev.destination === 'BOTH' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-blue-50 border-blue-200 text-blue-700'
                    )}>
                      → {ev.destination}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{ev.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    GA4 params: {Object.keys(ev.ga4Parameters).join(', ')}
                  </p>
                </div>
                <button
                  onClick={() => !alreadyExists && !justAdded && handleAdd(ev)}
                  disabled={alreadyExists || justAdded}
                  className={cn('flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold shrink-0 transition-colors',
                    alreadyExists
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : justAdded
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white hover:border-blue-600'
                  )}>
                  {alreadyExists ? (
                    <><Check className="h-3 w-3" />มีแล้ว</>
                  ) : justAdded ? (
                    <><Check className="h-3 w-3" />เพิ่มแล้ว</>
                  ) : (
                    <><Plus className="h-3 w-3" />เพิ่ม</>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-400">{filtered.length} events จากทั้งหมด {LIBRARY.length}</p>
          <button onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors">
            เสร็จ
          </button>
        </div>
      </div>
    </div>
  )
}
