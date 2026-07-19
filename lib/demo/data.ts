import {
  addDays,
  addHours,
  addMinutes,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
  subHours,
  subMinutes,
  subMonths,
} from "date-fns";

import type {
  CompletedOrderFilters,
  CustomerSuggestion,
  DashboardStats,
  OrderDetail,
  OrderFilters,
  OrderListItem,
  OrderListResult,
} from "@/lib/actions/orders";
import { DEFAULT_ORDERS_PAGE_SIZE } from "@/lib/orders/constants";
import type { EmployeeListItem } from "@/lib/actions/employees";
import type { MaterialRequestListItem } from "@/lib/actions/material-requests";
import type { NotificationLogItem } from "@/lib/actions/notifications";
import type { ArchivedOrderItem } from "@/lib/actions/archive";
import type { EmployeeJobItem } from "@/lib/actions/employee-jobs";
import type { TvBoardData, TvDaySummary, TvOrderCardData } from "@/lib/actions/tv";
import type { CurrentMonthStats, MonthlyStatisticItem } from "@/lib/actions/reports";
import type { TimelineEntry } from "@/lib/actions/timeline";
import type { ActivityEntry } from "@/lib/actions/activity";
import type { OperationsKpis } from "@/lib/actions/operations";
import type { EmployeeWorkload } from "@/lib/actions/workload";
import type { CalendarOrder } from "@/lib/actions/calendar";
import type { SearchResult } from "@/lib/actions/search";
import type { DiagnosticsSnapshot } from "@/lib/actions/diagnostics";
import { describeAuditEntry } from "@/lib/timeline/describe";
import { DELAYABLE_STATUSES, EMPLOYEE_ACTIVE_STATUSES, type TvColumnKey } from "@/types/domain";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/constants";
import type { MaterialType, OrderFulfillmentType, OrderStatus } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Demo employees
// ---------------------------------------------------------------------------

const DEMO_EMPLOYEES: EmployeeListItem[] = [
  { id: "demo-admin", username: "admin", fullName: "Rana Al-Fadhli", role: "admin", phone: "+96550001111", active: true, isOutsourced: false, createdAt: "2026-01-05T08:00:00Z" },
  { id: "demo-emp-1", username: "hassan", fullName: "Hassan Youssef", role: "employee", phone: "+96550002222", active: true, isOutsourced: false, createdAt: "2026-01-10T08:00:00Z" },
  { id: "demo-emp-2", username: "mariam", fullName: "Mariam Khalid", role: "employee", phone: "+96550003333", active: true, isOutsourced: false, createdAt: "2026-01-10T08:00:00Z" },
  { id: "demo-emp-3", username: "youssef", fullName: "Youssef Ahmad", role: "employee", phone: "+96550004444", active: true, isOutsourced: false, createdAt: "2026-02-01T08:00:00Z" },
  { id: "demo-emp-4", username: "sara", fullName: "Sara Taqi", role: "employee", phone: "+96550005555", active: true, isOutsourced: false, createdAt: "2026-02-14T08:00:00Z" },
  { id: "demo-emp-5", username: "omar", fullName: "Omar Nasser", role: "employee", phone: "+96550006666", active: false, isOutsourced: false, createdAt: "2026-03-01T08:00:00Z" },
];

const EMPLOYEE_BY_ID = new Map(DEMO_EMPLOYEES.map((e) => [e.id, { id: e.id, fullName: e.fullName }]));

function emp(...ids: string[]) {
  return ids.map((id) => EMPLOYEE_BY_ID.get(id)!).filter(Boolean);
}

export function getDemoEmployees(): EmployeeListItem[] {
  return DEMO_EMPLOYEES;
}

export function getDemoAssignableEmployees(): { id: string; fullName: string; role: EmployeeListItem["role"] }[] {
  return DEMO_EMPLOYEES.filter((e) => e.active).map((e) => ({ id: e.id, fullName: e.fullName, role: e.role }));
}

// ---------------------------------------------------------------------------
// Demo orders — delivery times computed relative to "now" so countdown
// colors (green/yellow/orange/red) are always demonstrated realistically.
// ---------------------------------------------------------------------------

interface DemoOrderItemSeed {
  id: string;
  product: string;
  paper: string;
  paperSize: string;
  quantity: number;
  finishing: string;
  isReady: boolean;
}

interface DemoOrderSeed {
  id: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
  product: string;
  paper: string;
  paperSize: string;
  quantity: number;
  finishing: string;
  priority: "normal" | "urgent";
  status: OrderStatus;
  offsetMinutes: number; // relative to now — negative = overdue
  assignedTo: string[];
  assignedHoursAgo: number;
  pendingMaterials: MaterialType[];
  whatsappEnabled: boolean;
  preferredLanguage: "ar" | "en";
  notes: string;
  completedDaysAgo?: number;
  /** Item 1 (this seed's own product/paper/etc.) readiness — defaults false. Items 2+ live in `items`. */
  itemReady?: boolean;
  items?: DemoOrderItemSeed[];
}

/** Demo seeds don't carry an explicit fulfillment type — infer a plausible
 * one from status so ready_delivery/delivered rows read as delivery orders
 * and everything else defaults to pickup. */
function deriveFulfillmentType(status: OrderStatus): OrderFulfillmentType {
  return status === "ready_delivery" || status === "delivered" ? "delivery" : "pickup";
}

const ORDER_SEEDS: DemoOrderSeed[] = [
  { id: "demo-order-1", orderNumber: "#1042", customerName: "Ahmed Al-Sayed", customerMobile: "+96555011111", product: "Business Cards", paper: "350gsm Matte", paperSize: "9x5cm", quantity: 500, finishing: "Lamination, rounded corners", priority: "normal", status: "new", offsetMinutes: 6 * 60, assignedTo: [], assignedHoursAgo: 1, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "ar", notes: "" },
  { id: "demo-order-2", orderNumber: "#1043", customerName: "Fatima Noor", customerMobile: "+96555022222", product: "Wedding Invitations", paper: "250gsm Pearl", paperSize: "A5", quantity: 200, finishing: "Gold foil edges", priority: "urgent", status: "new", offsetMinutes: 90, assignedTo: ["demo-emp-2"], assignedHoursAgo: 3, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "ar", notes: "Customer wants a proof approved before final run." },
  { id: "demo-order-3", orderNumber: "#1044", customerName: "TechHub Kuwait", customerMobile: "+96555033333", product: "Trade Show Banners", paper: "Vinyl 13oz", paperSize: "200x90cm", quantity: 4, finishing: "Grommets", priority: "normal", status: "in_progress", offsetMinutes: 45, assignedTo: ["demo-emp-1"], assignedHoursAgo: 5, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "en", notes: "" },
  { id: "demo-order-4", orderNumber: "#1045", customerName: "Layla Hassan", customerMobile: "+96555044444", product: "Product Packaging Boxes", paper: "400gsm Card", paperSize: "15x15x8cm", quantity: 1000, finishing: "Matte lamination, die-cut", priority: "urgent", status: "in_progress", offsetMinutes: -20, assignedTo: ["demo-emp-1", "demo-emp-3"], assignedHoursAgo: 4, pendingMaterials: ["paper"], whatsappEnabled: true, preferredLanguage: "en", notes: "Rush order — client picking up in person.", itemReady: true, items: [
    { id: "demo-order-4-item-2", product: "Thank You Cards", paper: "300gsm Silk", paperSize: "9x5cm", quantity: 1000, finishing: "Matte lamination", isReady: true },
    { id: "demo-order-4-item-3", product: "Shipping Labels", paper: "Sticker Vinyl", paperSize: "10x7cm", quantity: 1000, finishing: "", isReady: false },
  ] },
  { id: "demo-order-5", orderNumber: "#1046", customerName: "Al-Salam Bakery", customerMobile: "+96555055555", product: "Menu Cards", paper: "300gsm Silk", paperSize: "A4", quantity: 150, finishing: "Lamination", priority: "normal", status: "waiting_materials", offsetMinutes: 3 * 60, assignedTo: ["demo-emp-2"], assignedHoursAgo: 6, pendingMaterials: ["paper", "ink"], whatsappEnabled: true, preferredLanguage: "ar", notes: "" },
  { id: "demo-order-6", orderNumber: "#1047", customerName: "Noura Al-Ajmi", customerMobile: "+96555066666", product: "Birthday Party Flyers", paper: "170gsm Gloss", paperSize: "A6", quantity: 300, finishing: "", priority: "normal", status: "ready_pickup", offsetMinutes: 110, assignedTo: ["demo-emp-4"], assignedHoursAgo: 8, pendingMaterials: [], whatsappEnabled: false, preferredLanguage: "ar", notes: "" },
  { id: "demo-order-7", orderNumber: "#1048", customerName: "Gulf Marketing Co.", customerMobile: "+96555077777", product: "A-Frame Signs", paper: "5mm Foamboard", paperSize: "60x90cm", quantity: 6, finishing: "UV print", priority: "urgent", status: "ready_delivery", offsetMinutes: 30, assignedTo: ["demo-emp-3"], assignedHoursAgo: 7, pendingMaterials: ["ink"], whatsappEnabled: true, preferredLanguage: "en", notes: "" },
  { id: "demo-order-8", orderNumber: "#1049", customerName: "Yousef Al-Kandari", customerMobile: "+96555088888", product: "Business Cards", paper: "350gsm Matte", paperSize: "9x5cm", quantity: 250, finishing: "Spot UV", priority: "normal", status: "collected", offsetMinutes: -180, assignedTo: ["demo-emp-2"], assignedHoursAgo: 20, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "ar", notes: "" },
  { id: "demo-order-9", orderNumber: "#1050", customerName: "Deema Fashion", customerMobile: "+96555099999", product: "Clothing Tags", paper: "250gsm Card", paperSize: "5x8cm", quantity: 2000, finishing: "Hole punch, string", priority: "normal", status: "delivered", offsetMinutes: -600, assignedTo: ["demo-emp-1"], assignedHoursAgo: 30, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "en", notes: "" },
  { id: "demo-order-10", orderNumber: "#1035", customerName: "Al-Rashid Clinic", customerMobile: "+96555010101", product: "Appointment Cards", paper: "300gsm Matte", paperSize: "9x5cm", quantity: 400, finishing: "", priority: "normal", status: "completed", offsetMinutes: -4000, assignedTo: ["demo-emp-4"], assignedHoursAgo: 90, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "ar", notes: "", completedDaysAgo: 3 },
  { id: "demo-order-11", orderNumber: "#1031", customerName: "Bayt Al-Ward Flowers", customerMobile: "+96555020202", product: "Gift Tags", paper: "270gsm Pearl", paperSize: "6x9cm", quantity: 600, finishing: "Ribbon hole", priority: "normal", status: "completed", offsetMinutes: -6000, assignedTo: ["demo-emp-2", "demo-emp-4"], assignedHoursAgo: 170, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "ar", notes: "", completedDaysAgo: 7 },
  { id: "demo-order-12", orderNumber: "#0998", customerName: "Kuwait Sports Club", customerMobile: "+96555030303", product: "Event Banners", paper: "Vinyl 13oz", paperSize: "300x100cm", quantity: 3, finishing: "Grommets", priority: "urgent", status: "completed", offsetMinutes: -9000, assignedTo: ["demo-emp-1"], assignedHoursAgo: 840, pendingMaterials: [], whatsappEnabled: false, preferredLanguage: "en", notes: "", completedDaysAgo: 35 },
  { id: "demo-order-13", orderNumber: "#1051", customerName: "Al-Noor School", customerMobile: "+96555040404", product: "Certificates", paper: "300gsm Card", paperSize: "A4", quantity: 100, finishing: "Gold foil", priority: "urgent", status: "new", offsetMinutes: 5 * 60, assignedTo: ["demo-emp-1"], assignedHoursAgo: 2, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "ar", notes: "Please double check the spelling list before printing." },
  { id: "demo-order-14", orderNumber: "#1052", customerName: "Fitness First Gym", customerMobile: "+96555050505", product: "Membership Cards", paper: "300gsm PVC-look Card", paperSize: "8.5x5.5cm", quantity: 500, finishing: "Lamination", priority: "normal", status: "new", offsetMinutes: 2 * 60, assignedTo: ["demo-emp-1"], assignedHoursAgo: 5, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "en", notes: "" },
];

function buildOrder(seed: DemoOrderSeed, now: Date): OrderListItem & { completedAt: Date | null; assignedAt: Date } {
  const deliveryAt = addMinutes(now, seed.offsetMinutes);
  const completedAt = seed.completedDaysAgo != null ? subDays(now, seed.completedDaysAgo) : null;

  return {
    id: seed.id,
    orderNumber: seed.orderNumber,
    customerName: seed.customerName,
    customerMobile: seed.customerMobile,
    product: seed.product,
    paper: seed.paper,
    paperSize: seed.paperSize,
    quantity: seed.quantity,
    finishing: seed.finishing || null,
    priority: seed.priority,
    deliveryDate: format(deliveryAt, "yyyy-MM-dd"),
    deliveryTime: format(deliveryAt, "HH:mm:ss"),
    status: seed.status,
    fulfillmentType: deriveFulfillmentType(seed.status),
    notes: seed.notes || null,
    whatsappEnabled: seed.whatsappEnabled,
    preferredLanguage: seed.preferredLanguage,
    assignedEmployees: emp(...seed.assignedTo),
    thumbnailUrl: null,
    pendingMaterialTypes: seed.pendingMaterials,
    itemCount: seed.items?.length ?? 0,
    completedAt,
    assignedAt: subHours(now, seed.assignedHoursAgo),
  };
}

function getAllDemoOrders(now: Date = new Date()) {
  return ORDER_SEEDS.map((seed) => buildOrder(seed, now));
}

/** Mirrors DASHBOARD_COMPLETED_STATUSES in lib/actions/orders.ts. */
const DASHBOARD_COMPLETED_STATUSES: OrderStatus[] = ["collected", "delivered", "completed"];

export function getDemoOrders(filters: OrderFilters = {}): OrderListResult {
  const now = new Date();
  let orders = getAllDemoOrders(now);

  if (filters.status && filters.status !== "all") {
    orders = orders.filter((o) => o.status === filters.status);
  } else {
    // Default board view — finished jobs live under Reports > Completed
    // Orders instead (see getDemoCompletedOrders below).
    orders = orders.filter((o) => !DASHBOARD_COMPLETED_STATUSES.includes(o.status));
  }
  if (filters.priority && filters.priority !== "all") {
    orders = orders.filter((o) => o.priority === filters.priority);
  }
  if (filters.deliveryDate) {
    orders = orders.filter((o) => o.deliveryDate === filters.deliveryDate);
  }
  if (filters.employeeId && filters.employeeId !== "all") {
    orders = orders.filter((o) => o.assignedEmployees.some((e) => e.id === filters.employeeId));
  }
  if (filters.search?.trim()) {
    const term = filters.search.trim().toLowerCase();
    orders = orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(term) ||
        o.customerName.toLowerCase().includes(term) ||
        o.customerMobile.toLowerCase().includes(term) ||
        o.product.toLowerCase().includes(term)
    );
  }

  const sorted = orders
    .sort((a, b) => `${a.deliveryDate}${a.deliveryTime}`.localeCompare(`${b.deliveryDate}${b.deliveryTime}`))
    .map((order) => {
      const { completedAt, assignedAt, ...listItem } = order;
      void completedAt;
      void assignedAt;
      return listItem;
    });

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(Math.max(1, Math.floor(filters.pageSize ?? DEFAULT_ORDERS_PAGE_SIZE)), 100);
  const from = (page - 1) * pageSize;

  return { items: sorted.slice(from, from + pageSize), totalCount: sorted.length, page, pageSize };
}

export function getDemoCompletedOrders(filters: CompletedOrderFilters = {}): OrderListResult {
  const now = new Date();
  let orders = getAllDemoOrders(now).filter((o) => DASHBOARD_COMPLETED_STATUSES.includes(o.status));

  if (filters.search?.trim()) {
    const term = filters.search.trim().toLowerCase();
    orders = orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(term) ||
        o.customerName.toLowerCase().includes(term) ||
        o.customerMobile.toLowerCase().includes(term) ||
        o.product.toLowerCase().includes(term)
    );
  }

  const sorted = orders
    .sort((a, b) => `${b.deliveryDate}${b.deliveryTime}`.localeCompare(`${a.deliveryDate}${a.deliveryTime}`))
    .map((order) => {
      const { completedAt, assignedAt, ...listItem } = order;
      void completedAt;
      void assignedAt;
      return listItem;
    });

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(Math.max(1, Math.floor(filters.pageSize ?? DEFAULT_ORDERS_PAGE_SIZE)), 100);
  const from = (page - 1) * pageSize;

  return { items: sorted.slice(from, from + pageSize), totalCount: sorted.length, page, pageSize };
}

export function getDemoCustomerSuggestions(term: string): CustomerSuggestion[] {
  const lower = term.toLowerCase();
  const seen = new Set<string>();
  const suggestions: CustomerSuggestion[] = [];
  for (const seed of ORDER_SEEDS) {
    if (!seed.customerName.toLowerCase().includes(lower)) continue;
    if (seen.has(seed.customerMobile)) continue;
    seen.add(seed.customerMobile);
    suggestions.push({
      customerName: seed.customerName,
      customerMobile: seed.customerMobile,
      preferredLanguage: seed.preferredLanguage,
      whatsappEnabled: seed.whatsappEnabled,
      preferredChannel: "whatsapp",
    });
    if (suggestions.length >= 8) break;
  }
  return suggestions;
}

function isCurrentMonth(date: Date, now: Date) {
  return date >= startOfMonth(now);
}

export function getDemoDashboardStats(): DashboardStats {
  const now = new Date();
  const orders = getAllDemoOrders(now);

  const stats: DashboardStats = {
    new: 0,
    inProgress: 0,
    waitingMaterials: 0,
    readyPickup: 0,
    readyDelivery: 0,
    completedThisMonth: 0,
    delayed: 0,
  };

  for (const order of orders) {
    switch (order.status) {
      case "new":
        stats.new++;
        break;
      case "in_progress":
        stats.inProgress++;
        break;
      case "waiting_materials":
        stats.waitingMaterials++;
        break;
      case "ready_pickup":
        stats.readyPickup++;
        break;
      case "ready_delivery":
        stats.readyDelivery++;
        break;
      case "completed":
        if (order.completedAt && isCurrentMonth(order.completedAt, now)) stats.completedThisMonth++;
        break;
    }
    const deliveryAt = new Date(`${order.deliveryDate}T${order.deliveryTime}`);
    if (DELAYABLE_STATUSES.includes(order.status) && deliveryAt < now) {
      stats.delayed++;
    }
  }

  return stats;
}

export function getDemoOrderDetail(orderId: string): OrderDetail {
  const now = new Date();
  const seed = ORDER_SEEDS.find((s) => s.id === orderId);
  if (!seed) throw new Error("Order not found");

  const order = buildOrder(seed, now);
  const deliveryAt = new Date(`${order.deliveryDate}T${order.deliveryTime}`);
  const createdAt = subDays(deliveryAt, 4).toISOString();

  const statusFlow: OrderStatus[] = ["new", "in_progress", "waiting_materials", "ready_pickup", "ready_delivery", "collected", "delivered", "completed"];
  const currentIndex = statusFlow.indexOf(seed.status);
  const statusHistory = statusFlow.slice(0, currentIndex + 1).map((status, index) => ({
    id: `${orderId}-history-${index}`,
    fromStatus: index === 0 ? null : statusFlow[index - 1],
    toStatus: status,
    employeeName: order.assignedEmployees[0]?.fullName ?? "Rana Al-Fadhli",
    changedAt: addHours(subDays(deliveryAt, 3), index * 5).toISOString(),
  }));

  const materialRequests = seed.pendingMaterials.map((materialType, index) => ({
    id: `${orderId}-mr-${index + 1}`,
    materialType,
    description:
      materialType === "paper"
        ? `Extra ${seed.paper} needed to finish the run`
        : `Running low on ${materialType} for this job`,
    quantity: materialType === "paper" ? "1 ream" : "2 units",
    priority: seed.priority === "urgent" ? ("urgent" as const) : ("normal" as const),
    status: "pending" as const,
    employeeName: order.assignedEmployees[0]?.fullName ?? "Hassan Youssef",
    createdAt: subHours(now, 2 + index).toISOString(),
  }));

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerMobile: order.customerMobile,
    preferredLanguage: order.preferredLanguage,
    whatsappEnabled: order.whatsappEnabled,
    preferredChannel: "whatsapp",
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    product: order.product,
    paper: order.paper,
    paperSize: order.paperSize,
    quantity: order.quantity,
    finishing: order.finishing,
    priority: order.priority,
    deliveryDate: order.deliveryDate,
    deliveryTime: order.deliveryTime,
    deliveryAddress: null,
    notes: order.notes,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    createdAt,
    updatedAt: new Date().toISOString(),
    assignedEmployees: order.assignedEmployees,
    items: [],
    productImages: [],
    designFiles: [],
    orderNotes:
      seed.notes && seed.notes.length > 0
        ? [
            {
              id: `${orderId}-note-1`,
              note: seed.notes,
              employeeName: order.assignedEmployees[0]?.fullName ?? "Rana Al-Fadhli",
              createdAt: subHours(now, 5).toISOString(),
            },
          ]
        : [],
    statusHistory,
    materialRequests,
  };
}

export function getDemoOrderTimeline(orderId: string): TimelineEntry[] {
  const now = new Date();
  const seed = ORDER_SEEDS.find((s) => s.id === orderId);
  if (!seed) return [];

  const order = buildOrder(seed, now);
  const createdAt = subDays(new Date(`${order.deliveryDate}T${order.deliveryTime}`), 4);

  const events: { minutesAgo: number; actorName: string; action: TimelineEntry["action"]; oldValue: unknown; newValue: unknown }[] = [
    { minutesAgo: differenceInMinutesFromNow(createdAt, now), actorName: "Rana Al-Fadhli", action: "order_created", oldValue: null, newValue: { orderNumber: order.orderNumber } },
  ];

  seed.assignedTo.forEach((employeeId, i) => {
    events.push({
      minutesAgo: differenceInMinutesFromNow(createdAt, now) - 10 * (i + 1),
      actorName: "Rana Al-Fadhli",
      action: "employee_assigned",
      oldValue: null,
      newValue: { employeeId },
    });
  });

  const statusFlow: OrderStatus[] = ["new", "in_progress", "waiting_materials", "ready_pickup", "ready_delivery", "collected", "delivered", "completed"];
  const currentIndex = statusFlow.indexOf(seed.status);
  const actorName = order.assignedEmployees[0]?.fullName ?? "Hassan Youssef";
  for (let i = 1; i <= currentIndex; i++) {
    events.push({
      minutesAgo: seed.assignedHoursAgo * 60 - i * 40,
      actorName,
      action: "status_changed",
      oldValue: { status: statusFlow[i - 1] },
      newValue: { status: statusFlow[i] },
    });
  }

  seed.pendingMaterials.forEach((materialType, i) => {
    events.push({
      minutesAgo: 60 + i * 15,
      actorName,
      action: "material_requested",
      oldValue: null,
      newValue: { materialType },
    });
  });

  if (seed.whatsappEnabled) {
    events.push({
      minutesAgo: differenceInMinutesFromNow(createdAt, now) - 2,
      actorName: "System",
      action: "notification_sent",
      oldValue: null,
      newValue: { templateName: "order_received", status: "sent" },
    });
  }

  const sorted = events
    .filter((e) => e.minutesAgo >= 0)
    .sort((a, b) => b.minutesAgo - a.minutesAgo);

  let previousTimestamp: Date | null = null;
  return sorted.map((event, i) => {
    const timestamp = subMinutes(now, event.minutesAgo);
    const minutesSincePrevious = previousTimestamp
      ? Math.round((timestamp.getTime() - previousTimestamp.getTime()) / 60_000)
      : null;
    previousTimestamp = timestamp;
    return {
      id: `${orderId}-timeline-${i}`,
      timestamp: timestamp.toISOString(),
      actorName: event.actorName,
      action: event.action,
      label: describeAuditEntry(event.action, event.oldValue, event.newValue),
      minutesSincePrevious,
    };
  });
}

function differenceInMinutesFromNow(date: Date, now: Date): number {
  return Math.round((now.getTime() - date.getTime()) / 60_000);
}

export function getDemoDiagnostics(): DiagnosticsSnapshot {
  return {
    databaseConnected: true,
    supabaseLatencyMs: 84,
    notificationQueuePending: 0,
    notificationQueueFailed: 1,
    twilioConfigured: false,
    activeUsersApprox: 2,
    timestamp: new Date().toISOString(),
  };
}

export function getDemoGlobalSearch(term: string): SearchResult[] {
  const now = new Date();
  const needle = term.toLowerCase();
  const orders = getAllDemoOrders(now).filter(
    (o) =>
      o.orderNumber.toLowerCase().includes(needle) ||
      o.customerName.toLowerCase().includes(needle) ||
      o.customerMobile.toLowerCase().includes(needle) ||
      o.product.toLowerCase().includes(needle) ||
      (o.notes ?? "").toLowerCase().includes(needle)
  );
  const employees = DEMO_EMPLOYEES.filter(
    (e) => e.fullName.toLowerCase().includes(needle) || (e.phone ?? "").toLowerCase().includes(needle)
  );

  return [
    ...orders.slice(0, 8).map((o) => ({
      type: "order" as const,
      id: o.id,
      title: `${o.orderNumber} — ${o.customerName}`,
      subtitle: o.product,
      href: `/dashboard?order=${o.id}`,
    })),
    ...employees.slice(0, 8).map((e) => ({
      type: "employee" as const,
      id: e.id,
      title: e.fullName,
      subtitle: e.phone ?? "No phone on file",
      href: "/employees",
    })),
  ];
}

export function getDemoCalendarOrders(startDate: string, endDate: string): CalendarOrder[] {
  const now = new Date();
  return getAllDemoOrders(now)
    .filter((o) => o.deliveryDate >= startDate && o.deliveryDate <= endDate)
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      product: o.product,
      deliveryDate: o.deliveryDate,
      deliveryTime: o.deliveryTime,
      status: o.status,
      priority: o.priority,
      isOverdue: DELAYABLE_STATUSES.includes(o.status) && new Date(`${o.deliveryDate}T${o.deliveryTime}`) < now,
    }));
}

const DEMO_AVG_COMPLETION_BY_EMPLOYEE: Record<string, number> = {
  "demo-emp-1": 330,
  "demo-emp-2": 365,
  "demo-emp-3": 310,
  "demo-emp-4": 395,
};

export function getDemoEmployeeWorkload(): EmployeeWorkload[] {
  const now = new Date();
  const employeeSeeds = DEMO_EMPLOYEES.filter((e) => e.role === "employee" && e.active);

  return employeeSeeds
    .map((emp) => {
      const mySeeds = ORDER_SEEDS.filter((s) => s.assignedTo.includes(emp.id));
      const myOrders = mySeeds.map((s) => buildOrder(s, now));

      return {
        employeeId: emp.id,
        employeeName: emp.fullName,
        activeJobs: myOrders.filter((o) => EMPLOYEE_ACTIVE_STATUSES.includes(o.status)).length,
        queuedJobs: myOrders.filter((o) => o.status === "new").length,
        completedToday: myOrders.filter((o) => o.status === "collected" || o.status === "delivered").length,
        avgCompletionMinutes: DEMO_AVG_COMPLETION_BY_EMPLOYEE[emp.id] ?? 350,
        waitingMaterials: myOrders.filter((o) => o.status === "waiting_materials").length,
        delayedJobs: myOrders.filter(
          (o) => DELAYABLE_STATUSES.includes(o.status) && new Date(`${o.deliveryDate}T${o.deliveryTime}`) < now
        ).length,
      };
    })
    .sort((a, b) => b.activeJobs - a.activeJobs);
}

export function getDemoOperationsKpis(): OperationsKpis {
  const now = new Date();
  const orders = getAllDemoOrders(now);
  const active = orders.filter((o) => o.status !== "completed");

  return {
    ordersInProduction: active.filter((o) => o.status === "in_progress").length,
    ordersDelayed: active.filter(
      (o) => DELAYABLE_STATUSES.includes(o.status) && new Date(`${o.deliveryDate}T${o.deliveryTime}`) < now
    ).length,
    avgProductionMinutes: 342,
    pendingMaterialRequests: getDemoMaterialRequests().filter((r) => r.status === "pending").length,
    employeeUtilizationPercent: 80,
    completionRatePercent: 87,
    todaysDeliveries: active.filter(
      (o) => o.deliveryDate === format(now, "yyyy-MM-dd") && (o.status === "ready_delivery" || o.status === "delivered")
    ).length,
    todaysPickups: active.filter(
      (o) => o.deliveryDate === format(now, "yyyy-MM-dd") && (o.status === "ready_pickup" || o.status === "collected")
    ).length,
  };
}

export function getDemoActivityFeed(limit: number): ActivityEntry[] {
  const all = ORDER_SEEDS.flatMap((seed) =>
    getDemoOrderTimeline(seed.id).map((entry) => ({ ...entry, orderNumber: seed.orderNumber }))
  );
  return all
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Demo employee jobs
// ---------------------------------------------------------------------------

export function getDemoMyJobs(employeeId: string): {
  active: EmployeeJobItem[];
  queue: EmployeeJobItem[];
  completedToday: number;
  isOutsourced: boolean;
} {
  const now = new Date();
  const mySeeds = ORDER_SEEDS.filter((s) => s.assignedTo.includes(employeeId));

  const jobs: EmployeeJobItem[] = mySeeds
    .filter((s) => !["collected", "delivered", "completed"].includes(s.status))
    .map((seed) => {
      const order = buildOrder(seed, now);
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        product: order.product,
        paper: order.paper,
        paperSize: order.paperSize,
        quantity: order.quantity,
        finishing: order.finishing,
        priority: order.priority,
        deliveryDate: order.deliveryDate,
        deliveryTime: order.deliveryTime,
        deliveryAddress: null,
        status: order.status,
        fulfillmentType: order.fulfillmentType,
        managerNotes: order.notes,
        productImages: [],
        designFiles: [],
        pendingMaterialTypes: order.pendingMaterialTypes,
        assignedAt: order.assignedAt.toISOString(),
        canHandOff: false,
        nextEmployeeName: null,
        itemReady: seed.itemReady ?? false,
        additionalItems: (seed.items ?? []).map((item) => ({
          id: item.id,
          product: item.product,
          paper: item.paper || null,
          paperSize: item.paperSize || null,
          quantity: item.quantity,
          finishing: item.finishing || null,
          isReady: item.isReady,
        })),
        itemCount: seed.items?.length ?? 0,
      };
    });

  const active = jobs
    .filter((j) => EMPLOYEE_ACTIVE_STATUSES.includes(j.status))
    .sort(byPriorityThenDelivery);
  const queue = jobs
    .filter((j) => j.status === "new")
    .sort((a, b) => byPriorityThenDelivery(a, b) || a.assignedAt.localeCompare(b.assignedAt));

  const completedToday = mySeeds.filter((s) => s.status === "collected" || s.status === "delivered").length;

  return { active, queue, completedToday, isOutsourced: false };
}

function byPriorityThenDelivery(a: EmployeeJobItem, b: EmployeeJobItem): number {
  const priorityWeight = { urgent: 0, normal: 1 } as const;
  const diff = priorityWeight[a.priority] - priorityWeight[b.priority];
  if (diff !== 0) return diff;
  return `${a.deliveryDate}${a.deliveryTime}`.localeCompare(`${b.deliveryDate}${b.deliveryTime}`);
}

// ---------------------------------------------------------------------------
// Demo material requests
// ---------------------------------------------------------------------------

export function getDemoMaterialRequests(): MaterialRequestListItem[] {
  const now = new Date();
  return [
    {
      id: "demo-mr-1",
      orderId: "demo-order-5",
      orderNumber: "#1046",
      employeeName: "Mariam Khalid",
      materialType: "paper",
      description: "Extra 300gsm Silk needed to finish the menu run",
      quantity: "1 ream",
      priority: "normal",
      status: "pending",
      createdAt: subHours(now, 2).toISOString(),
    },
    {
      id: "demo-mr-2",
      orderId: "demo-order-7",
      orderNumber: "#1048",
      employeeName: "Youssef Ahmad",
      materialType: "ink",
      description: "Cyan running low on the UV printer",
      quantity: "2 cartridges",
      priority: "urgent",
      status: "pending",
      createdAt: subHours(now, 1).toISOString(),
    },
    {
      id: "demo-mr-3",
      orderId: "demo-order-4",
      orderNumber: "#1045",
      employeeName: "Hassan Youssef",
      materialType: "packaging",
      description: "More die-cut boxes for the packaging run",
      quantity: "500 units",
      priority: "normal",
      status: "approved",
      createdAt: subHours(now, 26).toISOString(),
    },
    {
      id: "demo-mr-4",
      orderId: null,
      orderNumber: null,
      employeeName: "Sara Taqi",
      materialType: "lamination",
      description: "Matte lamination film — general stock is low",
      quantity: "3 rolls",
      priority: "low",
      status: "fulfilled",
      createdAt: subDays(now, 2).toISOString(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Demo notification logs
// ---------------------------------------------------------------------------

export function getDemoNotificationLogs(): NotificationLogItem[] {
  const now = new Date();
  return [
    {
      id: "demo-notif-1",
      orderId: "demo-order-6",
      orderNumber: "#1047",
      recipientName: "Noura Al-Ajmi",
      phone: "+96555066666",
      receiverType: "customer",
      channel: "whatsapp",
      templateName: "order_ready_for_pickup",
      body: "أخبار سارة! طلبكم #1047 (Birthday Party Flyers) جاهز للاستلام من Prime Printing Co. — Shuwaikh Industrial, Kuwait.",
      language: "ar",
      status: "sent",
      retryCount: 0,
      error: null,
      providerResponse: { sid: "SMdemo000000000000000000000001", status: "sent" },
      sentAt: subHours(now, 1).toISOString(),
      createdAt: subHours(now, 1).toISOString(),
    },
    {
      id: "demo-notif-2",
      orderId: "demo-order-2",
      orderNumber: "#1043",
      recipientName: "Mariam Khalid",
      phone: "+96550003333",
      receiverType: "employee",
      channel: "whatsapp",
      templateName: "high_priority_job_assigned",
      body: "URGENT job assigned: #1043 (Wedding Invitations), due 2026-07-18 10:30. Please prioritize.",
      language: "en",
      status: "sent",
      retryCount: 0,
      error: null,
      providerResponse: { sid: "SMdemo000000000000000000000002", status: "sent" },
      sentAt: subHours(now, 3).toISOString(),
      createdAt: subHours(now, 3).toISOString(),
    },
    {
      id: "demo-notif-3",
      orderId: "demo-order-4",
      orderNumber: "#1045",
      recipientName: "Layla Hassan",
      phone: "+96555044444",
      receiverType: "customer",
      channel: "whatsapp",
      templateName: "order_in_production",
      body: "Your order #1045 (Product Packaging Boxes) is now in production at Prime Printing Co.",
      language: "en",
      status: "skipped",
      retryCount: 0,
      error: "Twilio credentials not configured",
      providerResponse: null,
      sentAt: null,
      createdAt: subMinutes(now, 20).toISOString(),
    },
    {
      id: "demo-notif-4",
      orderId: "demo-order-7",
      orderNumber: "#1048",
      recipientName: "Gulf Marketing Co.",
      phone: "+96555077777",
      receiverType: "customer",
      channel: "whatsapp",
      templateName: "order_out_for_delivery",
      body: "Order #1048 (A-Frame Signs) is out for delivery, expected 2026-07-18 09:29.",
      language: "en",
      status: "failed",
      retryCount: 3,
      error: "Invalid WhatsApp number format",
      providerResponse: { code: 21211, moreInfo: "https://www.twilio.com/docs/errors/21211" },
      sentAt: null,
      createdAt: subDays(now, 1).toISOString(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Demo archive
// ---------------------------------------------------------------------------

export function getDemoArchivedOrders(): ArchivedOrderItem[] {
  const now = new Date();
  const lastMonth = subMonths(now, 1);
  return [
    { id: "demo-archive-1", orderNumber: "#0912", customerName: "Al-Bahar Restaurant", product: "Menu Booklets", status: "completed", completedAt: addDays(lastMonth, 3).toISOString(), deliveryDate: format(addDays(lastMonth, 2), "yyyy-MM-dd") },
    { id: "demo-archive-2", orderNumber: "#0905", customerName: "Desert Rose Events", product: "Table Numbers", status: "completed", completedAt: addDays(lastMonth, 10).toISOString(), deliveryDate: format(addDays(lastMonth, 9), "yyyy-MM-dd") },
    { id: "demo-archive-3", orderNumber: "#0888", customerName: "Marina Mall Kiosk", product: "Vinyl Decals", status: "completed", completedAt: addDays(lastMonth, 18).toISOString(), deliveryDate: format(addDays(lastMonth, 17), "yyyy-MM-dd") },
  ];
}

// ---------------------------------------------------------------------------
// Demo TV board
// ---------------------------------------------------------------------------

const TV_COLUMN_KEYS: TvColumnKey[] = ["in_progress", "waiting_materials", "ready_pickup", "ready_delivery"];
const TERMINAL_STATUSES: OrderStatus[] = ["completed", "delivered", "collected"];
/** Baseline order counts Sun..Sat for days other than today, just to give the weekly strip believable shape. */
const WEEK_BASELINE_COUNTS = [4, 6, 7, 8, 5, 6, 3];

export function getDemoTvBoard(): TvBoardData {
  const now = new Date();
  const orders = getAllDemoOrders(now);
  const activeRows = orders.filter((o) => o.status !== "completed");

  const workingEmployeeIds = new Set<string>();
  for (const o of activeRows) {
    if (EMPLOYEE_ACTIVE_STATUSES.includes(o.status)) {
      o.assignedEmployees.forEach((e) => workingEmployeeIds.add(e.id));
    }
  }

  const delayedOrders = activeRows.filter(
    (o) => DELAYABLE_STATUSES.includes(o.status) && new Date(`${o.deliveryDate}T${o.deliveryTime}`) < now
  ).length;

  const toCard = (o: OrderListItem): TvOrderCardData => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    product: o.product,
    assignedEmployees: o.assignedEmployees.map((e) => e.fullName),
    deliveryDate: o.deliveryDate,
    deliveryTime: o.deliveryTime,
    priority: o.priority,
    status: o.status,
    thumbnailUrl: null,
  });

  const columns = Object.fromEntries(
    TV_COLUMN_KEYS.map((key) => [
      key,
      activeRows
        .filter((o) => o.status === key)
        .map(toCard)
        .sort((a, b) => `${a.deliveryDate}${a.deliveryTime}`.localeCompare(`${b.deliveryDate}${b.deliveryTime}`)),
    ])
  ) as Record<TvColumnKey, TvOrderCardData[]>;

  const weekStart = startOfWeek(now);
  const todayIndex = now.getDay();
  const week: TvDaySummary[] = Array.from({ length: 7 }).map((_, i) => {
    const date = addDays(weekStart, i);
    const isoDate = format(date, "yyyy-MM-dd");
    const label = format(date, "EEEE");

    if (i === todayIndex) {
      const todaysOrders = orders.filter((o) => o.deliveryDate === isoDate);
      return {
        dayIndex: i,
        label,
        date: isoDate,
        totalOrders: todaysOrders.length,
        completedOrders: todaysOrders.filter((o) => TERMINAL_STATUSES.includes(o.status)).length,
        pendingOrders: todaysOrders.filter((o) => !TERMINAL_STATUSES.includes(o.status)).length,
        orders: todaysOrders
          .sort((a, b) => a.deliveryTime.localeCompare(b.deliveryTime))
          .map((o) => ({
            orderNumber: o.orderNumber,
            customerName: o.customerName,
            deliveryTime: o.deliveryTime,
            status: o.status,
          })),
      };
    }

    const total = WEEK_BASELINE_COUNTS[i];
    const completed = i < todayIndex ? total : 0;
    return {
      dayIndex: i,
      label,
      date: isoDate,
      totalOrders: total,
      completedOrders: completed,
      pendingOrders: total - completed,
      orders: [],
    };
  });

  return {
    activeOrders: activeRows.length,
    delayedOrders,
    employeesWorking: workingEmployeeIds.size,
    columns,
    week,
    generatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Demo reports
// ---------------------------------------------------------------------------

const REPORT_EMPLOYEE_NAMES = new Map(DEMO_EMPLOYEES.map((e) => [e.id, e.fullName]));

/** Six months of believable, gently-trending history — most-recent first. */
const MONTHLY_STATS_SEEDS = [
  { monthsAgo: 1, totalOrders: 142, completedOrders: 128, delayedOrders: 11, avgCompletionMinutes: 385, mostUsedPaper: "300gsm Matte", mostRequestedMaterial: "paper" as MaterialType, perEmployee: { "demo-emp-1": 38, "demo-emp-2": 34, "demo-emp-3": 29, "demo-emp-4": 27 } },
  { monthsAgo: 2, totalOrders: 131, completedOrders: 121, delayedOrders: 8, avgCompletionMinutes: 362, mostUsedPaper: "350gsm Matte", mostRequestedMaterial: "ink" as MaterialType, perEmployee: { "demo-emp-1": 33, "demo-emp-2": 35, "demo-emp-3": 28, "demo-emp-4": 25 } },
  { monthsAgo: 3, totalOrders: 156, completedOrders: 139, delayedOrders: 17, avgCompletionMinutes: 410, mostUsedPaper: "300gsm Matte", mostRequestedMaterial: "paper" as MaterialType, perEmployee: { "demo-emp-1": 41, "demo-emp-2": 39, "demo-emp-3": 36, "demo-emp-4": 30 } },
  { monthsAgo: 4, totalOrders: 119, completedOrders: 112, delayedOrders: 7, avgCompletionMinutes: 350, mostUsedPaper: "170gsm Gloss", mostRequestedMaterial: "vinyl" as MaterialType, perEmployee: { "demo-emp-1": 29, "demo-emp-2": 31, "demo-emp-3": 27, "demo-emp-4": 22 } },
  { monthsAgo: 5, totalOrders: 125, completedOrders: 118, delayedOrders: 9, avgCompletionMinutes: 368, mostUsedPaper: "300gsm Matte", mostRequestedMaterial: "paper" as MaterialType, perEmployee: { "demo-emp-1": 32, "demo-emp-2": 30, "demo-emp-3": 30, "demo-emp-4": 24 } },
  { monthsAgo: 6, totalOrders: 108, completedOrders: 99, delayedOrders: 12, avgCompletionMinutes: 395, mostUsedPaper: "350gsm Matte", mostRequestedMaterial: "ink" as MaterialType, perEmployee: { "demo-emp-1": 27, "demo-emp-2": 26, "demo-emp-3": 25, "demo-emp-4": 22 } },
];

function toEmployeeCounts(perEmployee: Record<string, number>) {
  return Object.entries(perEmployee)
    .map(([employeeId, count]) => ({ employeeId, employeeName: REPORT_EMPLOYEE_NAMES.get(employeeId) ?? "Unknown", count }))
    .sort((a, b) => b.count - a.count);
}

export function getDemoMonthlyStatistics(): MonthlyStatisticItem[] {
  const now = new Date();
  return MONTHLY_STATS_SEEDS.map((seed) => {
    const monthStart = startOfMonth(subMonths(now, seed.monthsAgo));
    return {
      year: monthStart.getFullYear(),
      month: monthStart.getMonth() + 1,
      label: format(monthStart, "MMMM yyyy"),
      totalOrders: seed.totalOrders,
      completedOrders: seed.completedOrders,
      delayedOrders: seed.delayedOrders,
      ordersPerEmployee: toEmployeeCounts(seed.perEmployee),
      avgCompletionMinutes: seed.avgCompletionMinutes,
      mostUsedPaper: seed.mostUsedPaper,
      mostRequestedMaterial: MATERIAL_TYPE_DEMO_LABELS[seed.mostRequestedMaterial],
      generatedAt: addDays(startOfMonth(subMonths(now, seed.monthsAgo - 1)), 0).toISOString(),
    };
  });
}

const MATERIAL_TYPE_DEMO_LABELS: Record<MaterialType, string> = {
  paper: "Paper",
  ink: "Ink",
  vinyl: "Vinyl",
  packaging: "Packaging",
  lamination: "Lamination",
  other: "Other",
};

export function getDemoCurrentMonthStats(): CurrentMonthStats {
  const now = new Date();
  const orders = getAllDemoOrders(now).filter((o) => new Date(o.deliveryDate) >= startOfMonth(now));
  const completed = orders.filter((o) => o.status === "completed" || o.status === "delivered" || o.status === "collected");

  return {
    label: format(now, "MMMM yyyy"),
    totalOrders: orders.length,
    completedOrders: completed.length,
    delayedOrders: orders.filter((o) => DELAYABLE_STATUSES.includes(o.status) && new Date(`${o.deliveryDate}T${o.deliveryTime}`) < now).length,
    ordersPerEmployee: toEmployeeCounts({ "demo-emp-1": 5, "demo-emp-2": 4, "demo-emp-3": 3, "demo-emp-4": 2 }),
    avgCompletionMinutes: 340,
    mostUsedPaper: "300gsm Matte",
    mostRequestedMaterial: "Paper",
  };
}
