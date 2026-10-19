import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "En attente", className: "bg-amber-100 text-amber-800 border-amber-200" },
  PENDING_FIRST_MEETING: { label: "1re rencontre", className: "bg-violet-100 text-violet-800 border-violet-200" },
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  PAUSED: { label: "En pause", className: "bg-gray-100 text-gray-600 border-gray-200" },
  CLOSED: { label: "Terminée", className: "bg-gray-100 text-gray-500 border-gray-200" },
  PROPOSED: { label: "Proposée", className: "bg-amber-100 text-amber-800 border-amber-200" },
  CONFIRMED: { label: "Confirmée", className: "bg-blue-100 text-blue-800 border-blue-200" },
  CANCELLED: { label: "Annulée", className: "bg-gray-100 text-gray-500 border-gray-200" },
  DONE: { label: "Réalisée", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  COMPLETED_PENDING_FEEDBACK: { label: "Feedback requis", className: "bg-orange-100 text-orange-800 border-orange-200" },
  COMPLETED: { label: "Terminée", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  SENIOR: { label: "Senior", className: "bg-violet-100 text-violet-800 border-violet-200" },
  JUNIOR: { label: "Jeune", className: "bg-sky-100 text-sky-800 border-sky-200" },
  ADMIN: { label: "Admin", className: "bg-rose-100 text-rose-800 border-rose-200" },
};

export default function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const config = STATUS_CONFIG[status] || { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <Badge
      variant="outline"
      className={`text-xs font-medium ${config.className} ${className}`}
      data-testid={`badge-status-${status.toLowerCase()}`}
    >
      {config.label}
    </Badge>
  );
}
