import { updateConversionRuleAction } from "@/lib/line-tracking/actions";
import { LEAD_STATUS_LABEL } from "@/lib/line-tracking/enums";
import type { LeadStatus } from "@/lib/line-tracking/enums";
import { PLATFORMS } from "@/lib/line-tracking/platforms";
import type { PlatformsConfig } from "@/lib/line-tracking/platforms";
import { parseJson } from "@/lib/line-tracking/json";
import type { ConversionRule } from "@prisma/client";

export function ConversionRuleRow({
  projectId,
  rule,
}: {
  projectId: string;
  rule: ConversionRule;
}) {
  const platforms = parseJson<PlatformsConfig>(rule.platformsJson, {});

  return (
    <form
      action={updateConversionRuleAction}
      className="grid grid-cols-1 items-start gap-3 rounded-lg border border-slate-100 p-3 md:grid-cols-[130px_1fr_auto]"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="ruleId" value={rule.id} />

      <div>
        <div className="font-semibold text-slate-800">{rule.leadStatus}</div>
        <div className="text-xs text-slate-400">{LEAD_STATUS_LABEL[rule.leadStatus as LeadStatus]}</div>
        <label className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-600">
          <input type="checkbox" name="enabled" defaultChecked={rule.enabled} className="h-4 w-4 rounded" />
          เปิดกฎนี้
        </label>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {PLATFORMS.map((p) => {
          const cfg = platforms[p.id];
          const eventName = cfg?.eventName ?? p.events[rule.leadStatus as LeadStatus];
          if (!eventName) return null; // no event for this status (e.g. LOST)
          return (
            <label key={p.id} className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" name={`p_${p.id}`} defaultChecked={!!cfg?.enabled} className="h-4 w-4 rounded" />
              <input type="hidden" name={`evt_${p.id}`} value={eventName} />
              <span className="font-medium">{p.label}</span>
              <span className="text-slate-400">({eventName})</span>
            </label>
          );
        })}
        <label className="flex items-center gap-1 text-xs text-slate-600">
          Value
          <input
            name="defaultValue"
            type="number"
            defaultValue={rule.defaultValue}
            className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
          />
        </label>
      </div>

      <button type="submit" className="btn-ghost text-xs">Save</button>
    </form>
  );
}
