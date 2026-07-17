// Hand-written to match supabase/migrations/0001_init.sql. Regenerate with
// `generate_typescript_types` once the live project is provisioned — this
// file's shape mirrors what the Supabase CLI would output.

export type EmployeeRole = "admin" | "employee" | "supervisor" | "store" | "delivery";
export type OrderLanguage = "ar" | "en";
export type OrderPriority = "normal" | "urgent";
export type OrderStatus =
  | "new"
  | "in_progress"
  | "waiting_materials"
  | "ready_pickup"
  | "ready_delivery"
  | "collected"
  | "delivered"
  | "completed";
export type OrderFileType = "product_image" | "design_file";
export type MaterialType = "paper" | "ink" | "vinyl" | "packaging" | "lamination" | "other";
export type MaterialPriority = "low" | "normal" | "urgent";
export type MaterialRequestStatus = "pending" | "approved" | "rejected" | "fulfilled";
export type NotificationReceiver = "customer" | "employee";
export type NotificationStatus = "pending" | "sent" | "failed" | "skipped" | "delivered";

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string;
          username: string;
          password_hash: string;
          full_name: string;
          role: EmployeeRole;
          phone: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          password_hash: string;
          full_name: string;
          role?: EmployeeRole;
          phone?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          customer_name: string;
          customer_mobile: string;
          preferred_language: OrderLanguage;
          whatsapp_enabled: boolean;
          product: string;
          paper: string | null;
          paper_size: string | null;
          quantity: number;
          finishing: string | null;
          priority: OrderPriority;
          delivery_date: string;
          delivery_time: string;
          notes: string | null;
          status: OrderStatus;
          archived: boolean;
          created_by: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number?: string;
          customer_name: string;
          customer_mobile: string;
          preferred_language?: OrderLanguage;
          whatsapp_enabled?: boolean;
          product: string;
          paper?: string | null;
          paper_size?: string | null;
          quantity: number;
          finishing?: string | null;
          priority?: OrderPriority;
          delivery_date: string;
          delivery_time: string;
          notes?: string | null;
          status?: OrderStatus;
          archived?: boolean;
          created_by: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
        Relationships: [];
      };
      order_assignments: {
        Row: {
          id: string;
          order_id: string;
          employee_id: string;
          assigned_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          employee_id: string;
          assigned_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_assignments"]["Insert"]>;
        Relationships: [];
      };
      order_files: {
        Row: {
          id: string;
          order_id: string;
          file_type: OrderFileType;
          storage_path: string;
          file_name: string;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          file_type: OrderFileType;
          storage_path: string;
          file_name: string;
          uploaded_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_files"]["Insert"]>;
        Relationships: [];
      };
      order_notes: {
        Row: {
          id: string;
          order_id: string;
          employee_id: string;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          employee_id: string;
          note: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_notes"]["Insert"]>;
        Relationships: [];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          from_status: OrderStatus | null;
          to_status: OrderStatus;
          changed_by: string;
          changed_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          from_status?: OrderStatus | null;
          to_status: OrderStatus;
          changed_by: string;
          changed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_status_history"]["Insert"]>;
        Relationships: [];
      };
      material_requests: {
        Row: {
          id: string;
          order_id: string | null;
          employee_id: string;
          material_type: MaterialType;
          description: string;
          quantity: string;
          priority: MaterialPriority;
          status: MaterialRequestStatus;
          created_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          employee_id: string;
          material_type: MaterialType;
          description: string;
          quantity: string;
          priority?: MaterialPriority;
          status?: MaterialRequestStatus;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["material_requests"]["Insert"]>;
        Relationships: [];
      };
      notification_logs: {
        Row: {
          id: string;
          order_id: string | null;
          phone: string;
          receiver_type: NotificationReceiver;
          template_name: string;
          language: OrderLanguage;
          status: NotificationStatus;
          sent_at: string | null;
          retry_count: number;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          phone: string;
          receiver_type: NotificationReceiver;
          template_name: string;
          language: OrderLanguage;
          status?: NotificationStatus;
          sent_at?: string | null;
          retry_count?: number;
          error?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_logs"]["Insert"]>;
        Relationships: [];
      };
      monthly_statistics: {
        Row: {
          id: string;
          year: number;
          month: number;
          total_orders: number;
          completed_orders: number;
          delayed_orders: number;
          orders_per_employee: Record<string, number>;
          avg_completion_minutes: number | null;
          most_used_paper: string | null;
          most_requested_material: string | null;
          generated_at: string;
        };
        Insert: {
          id?: string;
          year: number;
          month: number;
          total_orders?: number;
          completed_orders?: number;
          delayed_orders?: number;
          orders_per_employee?: Record<string, number>;
          avg_completion_minutes?: number | null;
          most_used_paper?: string | null;
          most_requested_material?: string | null;
          generated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["monthly_statistics"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      employee_role: EmployeeRole;
      order_language: OrderLanguage;
      order_priority: OrderPriority;
      order_status: OrderStatus;
      order_file_type: OrderFileType;
      material_type: MaterialType;
      material_priority: MaterialPriority;
      material_request_status: MaterialRequestStatus;
      notification_receiver: NotificationReceiver;
      notification_status: NotificationStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
