import { EventsView } from "./events-view";

export const metadata = {
  title: "Session events — QNTM internal",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * A read-only view of the events this browser session has emitted. It exists so
 * the funnel can be verified end to end without wiring a vendor first — not as
 * an analytics product.
 */
export default function EventsPage() {
  return <EventsView />;
}
