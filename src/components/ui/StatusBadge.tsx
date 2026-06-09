import { Badge } from "./primitives";

const MAP: Record<string, Parameters<typeof Badge>[0]["color"]> = {
  // sales
  Pending: "amber",
  Packed: "indigo",
  Delivered: "emerald",
  Cancelled: "rose",
  Returned: "violet",
  // purchase
  Draft: "slate",
  Sent: "blue",
  Partial: "amber",
  Received: "emerald",
  // payment
  Paid: "emerald",
  Unpaid: "rose",
  // channel
  app: "blue",
  phone: "slate",
  whatsapp: "emerald",
  manual: "violet",
  // movement
  in: "emerald",
  out: "rose",
  adjustment: "amber",
  damaged: "rose",
  expired: "rose",
  return: "violet",
};

export function StatusBadge({ value }: { value: string }) {
  return <Badge color={MAP[value] ?? "slate"}>{value}</Badge>;
}
