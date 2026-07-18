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

import type { DashboardStats, OrderDetail, OrderFilters, OrderListItem } from "@/lib/actions/orders";
import type { EmployeeListItem } from "@/lib/actions/employees";
import type { MaterialRequestListItem } from "@/lib/actions/material-requests";
import type { NotificationLogItem } from "@/lib/actions/notifications";
import type { ArchivedOrderItem } from "@/lib/actions/archive";
import type { EmployeeJobItem } from "@/lib/actions/employee-jobs";
import type { TvBoardData, TvDaySummary, TvOrderCardData } from "@/lib/actions/tv";
import { DELAYABLE_STATUSES, EMPLOYEE_ACTIVE_STATUSES, type TvColumnKey } from "@/types/domain";
import type { MaterialType, OrderStatus } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Demo employees
// ---------------------------------------------------------------------------

const DEMO_EMPLOYEES: EmployeeListItem[] = [
  { id: "demo-admin", username: "admin", fullName: "Rana Al-Fadhli", role: "admin", phone: "+96550001111", active: true, createdAt: "2026-01-05T08:00:00Z" },
  { id: "demo-emp-1", username: "hassan", fullName: "Hassan Youssef", role: "employee", phone: "+96550002222", active: true, createdAt: "2026-01-10T08:00:00Z" },
  { id: "demo-emp-2", username: "mariam", fullName: "Mariam Khalid", role: "employee", phone: "+96550003333", active: true, createdAt: "2026-01-10T08:00:00Z" },
  { id: "demo-emp-3", username: "youssef", fullName: "Youssef Ahmad", role: "employee", phone: "+96550004444", active: true, createdAt: "2026-02-01T08:00:00Z" },
  { id: "demo-emp-4", username: "sara", fullName: "Sara Taqi", role: "employee", phone: "+96550005555", active: true, createdAt: "2026-02-14T08:00:00Z" },
  { id: "demo-emp-5", username: "omar", fullName: "Omar Nasser", role: "employee", phone: "+96550006666", active: false, createdAt: "2026-03-01T08:00:00Z" },
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
}

const ORDER_SEEDS: DemoOrderSeed[] = [
  { id: "demo-order-1", orderNumber: "#1042", customerName: "Ahmed Al-Sayed", customerMobile: "+96555011111", product: "Business Cards", paper: "350gsm Matte", paperSize: "9x5cm", quantity: 500, finishing: "Lamination, rounded corners", priority: "normal", status: "new", offsetMinutes: 6 * 60, assignedTo: [], assignedHoursAgo: 1, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "ar", notes: "" },
  { id: "demo-order-2", orderNumber: "#1043", customerName: "Fatima Noor", customerMobile: "+96555022222", product: "Wedding Invitations", paper: "250gsm Pearl", paperSize: "A5", quantity: 200, finishing: "Gold foil edges", priority: "urgent", status: "new", offsetMinutes: 90, assignedTo: ["demo-emp-2"], assignedHoursAgo: 3, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "ar", notes: "Customer wants a proof approved before final run." },
  { id: "demo-order-3", orderNumber: "#1044", customerName: "TechHub Kuwait", customerMobile: "+96555033333", product: "Trade Show Banners", paper: "Vinyl 13oz", paperSize: "200x90cm", quantity: 4, finishing: "Grommets", priority: "normal", status: "in_progress", offsetMinutes: 45, assignedTo: ["demo-emp-1"], assignedHoursAgo: 5, pendingMaterials: [], whatsappEnabled: true, preferredLanguage: "en", notes: "" },
  { id: "demo-order-4", orderNumber: "#1045", customerName: "Layla Hassan", customerMobile: "+96555044444", product: "Product Packaging Boxes", paper: "400gsm Card", paperSize: "15x15x8cm", quantity: 1000, finishing: "Matte lamination, die-cut", priority: "urgent", status: "in_progress", offsetMinutes: -20, assignedTo: ["demo-emp-1", "demo-emp-3"], assignedHoursAgo: 4, pendingMaterials: ["paper"], whatsappEnabled: true, preferredLanguage: "en", notes: "Rush order — client picking up in person." },
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
    notes: seed.notes || null,
    whatsappEnabled: seed.whatsappEnabled,
    preferredLanguage: seed.preferredLanguage,
    assignedEmployees: emp(...seed.assignedTo),
    thumbnailUrl: null,
    pendingMaterialTypes: seed.pendingMaterials,
    completedAt,
    assignedAt: subHours(now, seed.assignedHoursAgo),
  };
}

function getAllDemoOrders(now: Date = new Date()) {
  return ORDER_SEEDS.map((seed) => buildOrder(seed, now));
}

export function getDemoOrders(filters: OrderFilters = {}): OrderListItem[] {
  const now = new Date();
  let orders = getAllDemoOrders(now).filter((o) => o.status !== "completed" || (o.completedAt && isCurrentMonth(o.completedAt, now)));

  if (filters.status && filters.status !== "all") {
    orders = orders.filter((o) => o.status === filters.status);
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

  return orders
    .sort((a, b) => `${a.deliveryDate}${a.deliveryTime}`.localeCompare(`${b.deliveryDate}${b.deliveryTime}`))
    .map((order) => {
      const { completedAt, assignedAt, ...listItem } = order;
      void completedAt;
      void assignedAt;
      return listItem;
    });
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
    product: order.product,
    paper: order.paper,
    paperSize: order.paperSize,
    quantity: order.quantity,
    finishing: order.finishing,
    priority: order.priority,
    deliveryDate: order.deliveryDate,
    deliveryTime: order.deliveryTime,
    notes: order.notes,
    status: order.status,
    createdAt,
    updatedAt: new Date().toISOString(),
    assignedEmployees: order.assignedEmployees,
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

// ---------------------------------------------------------------------------
// Demo employee jobs
// ---------------------------------------------------------------------------

export function getDemoMyJobs(employeeId: string): {
  active: EmployeeJobItem[];
  queue: EmployeeJobItem[];
  completedToday: number;
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
        status: order.status,
        managerNotes: order.notes,
        productImages: [],
        designFiles: [],
        pendingMaterialTypes: order.pendingMaterialTypes,
        assignedAt: order.assignedAt.toISOString(),
      };
    });

  const active = jobs
    .filter((j) => EMPLOYEE_ACTIVE_STATUSES.includes(j.status))
    .sort(byPriorityThenDelivery);
  const queue = jobs
    .filter((j) => j.status === "new")
    .sort((a, b) => byPriorityThenDelivery(a, b) || a.assignedAt.localeCompare(b.assignedAt));

  const completedToday = mySeeds.filter((s) => s.status === "collected" || s.status === "delivered").length;

  return { active, queue, completedToday };
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
      phone: "+96555066666",
      receiverType: "customer",
      templateName: "order_ready_pickup",
      language: "ar",
      status: "sent",
      retryCount: 0,
      error: null,
      sentAt: subHours(now, 1).toISOString(),
      createdAt: subHours(now, 1).toISOString(),
    },
    {
      id: "demo-notif-2",
      orderId: "demo-order-2",
      orderNumber: "#1043",
      phone: "+96550003333",
      receiverType: "employee",
      templateName: "new_job_assigned",
      language: "en",
      status: "sent",
      retryCount: 0,
      error: null,
      sentAt: subHours(now, 3).toISOString(),
      createdAt: subHours(now, 3).toISOString(),
    },
    {
      id: "demo-notif-3",
      orderId: "demo-order-4",
      orderNumber: "#1045",
      phone: "+96555044444",
      receiverType: "customer",
      templateName: "order_delayed",
      language: "en",
      status: "skipped",
      retryCount: 0,
      error: "Twilio credentials not configured",
      sentAt: null,
      createdAt: subMinutes(now, 20).toISOString(),
    },
    {
      id: "demo-notif-4",
      orderId: "demo-order-7",
      orderNumber: "#1048",
      phone: "+96555077777",
      receiverType: "customer",
      templateName: "production_started",
      language: "en",
      status: "failed",
      retryCount: 3,
      error: "Invalid WhatsApp number format",
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
