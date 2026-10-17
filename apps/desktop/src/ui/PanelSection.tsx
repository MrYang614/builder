import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/** Native disclosures keep field drafts mounted while giving keyboard users a compact inspector. */
export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="property-group" open>
      <summary>
        <ChevronRight aria-hidden="true" />
        <span>{title}</span>
      </summary>
      <div className="property-group-content">{children}</div>
    </details>
  );
}
