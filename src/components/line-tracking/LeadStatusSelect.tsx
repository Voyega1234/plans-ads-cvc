"use client";

import { useRef } from "react";
import { changeLeadStatusAction } from "@/lib/line-tracking/actions";
import { LEAD_STATUS, LEAD_STATUS_LABEL } from "@/lib/line-tracking/enums";

export function LeadStatusSelect({
  projectId,
  leadId,
  status,
}: {
  projectId: string;
  leadId: string;
  status: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={changeLeadStatusAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="leadId" value={leadId} />
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-500"
      >
        {LEAD_STATUS.map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABEL[s]} ({s})
          </option>
        ))}
      </select>
    </form>
  );
}
