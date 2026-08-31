// Generated via `generate_typescript_types` against the live Prime-flow
// Supabase project (hodqbuewaivgkgrcjrzi). Regenerate after schema changes
// rather than hand-editing. Convenience aliases used across the app are
// appended at the bottom.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          actor_name: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          order_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_name: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          order_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          is_outsourced: boolean
          password_hash: string
          phone: string | null
          role: Database["public"]["Enums"]["employee_role"]
          username: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          id?: string
          is_outsourced?: boolean
          password_hash: string
          phone?: string | null
          role?: Database["public"]["Enums"]["employee_role"]
          username: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          is_outsourced?: boolean
          password_hash?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["employee_role"]
          username?: string
        }
        Relationships: []
      }
      material_requests: {
        Row: {
          created_at: string
          description: string
          employee_id: string
          id: string
          material_type: Database["public"]["Enums"]["material_type"]
          order_id: string | null
          priority: Database["public"]["Enums"]["material_priority"]
          quantity: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["material_request_status"]
        }
        Insert: {
          created_at?: string
          description: string
          employee_id: string
          id?: string
          material_type: Database["public"]["Enums"]["material_type"]
          order_id?: string | null
          priority?: Database["public"]["Enums"]["material_priority"]
          quantity: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["material_request_status"]
        }
        Update: {
          created_at?: string
          description?: string
          employee_id?: string
          id?: string
          material_type?: Database["public"]["Enums"]["material_type"]
          order_id?: string | null
          priority?: Database["public"]["Enums"]["material_priority"]
          quantity?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["material_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "material_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_statistics: {
        Row: {
          avg_completion_minutes: number | null
          completed_orders: number
          delayed_orders: number
          generated_at: string
          id: string
          month: number
          most_requested_material: string | null
          most_used_paper: string | null
          orders_per_employee: Json
          total_orders: number
          year: number
        }
        Insert: {
          avg_completion_minutes?: number | null
          completed_orders?: number
          delayed_orders?: number
          generated_at?: string
          id?: string
          month: number
          most_requested_material?: string | null
          most_used_paper?: string | null
          orders_per_employee?: Json
          total_orders?: number
          year: number
        }
        Update: {
          avg_completion_minutes?: number | null
          completed_orders?: number
          delayed_orders?: number
          generated_at?: string
          id?: string
          month?: number
          most_requested_material?: string | null
          most_used_paper?: string | null
          orders_per_employee?: Json
          total_orders?: number
          year?: number
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          body: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          delivered_at: string | null
          error: string | null
          failed_reason: string | null
          id: string
          language: Database["public"]["Enums"]["order_language"]
          last_attempted_at: string
          order_id: string | null
          phone: string
          provider_message_id: string | null
          provider_response: Json | null
          read_at: string | null
          receiver_type: Database["public"]["Enums"]["notification_receiver"]
          retry_count: number
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template_name: string
          template_variables: Json | null
        }
        Insert: {
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          failed_reason?: string | null
          id?: string
          language: Database["public"]["Enums"]["order_language"]
          last_attempted_at?: string
          order_id?: string | null
          phone: string
          provider_message_id?: string | null
          provider_response?: Json | null
          read_at?: string | null
          receiver_type: Database["public"]["Enums"]["notification_receiver"]
          retry_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_name: string
          template_variables?: Json | null
        }
        Update: {
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          failed_reason?: string | null
          id?: string
          language?: Database["public"]["Enums"]["order_language"]
          last_attempted_at?: string
          order_id?: string | null
          phone?: string
          provider_message_id?: string | null
          provider_response?: Json | null
          read_at?: string | null
          receiver_type?: Database["public"]["Enums"]["notification_receiver"]
          retry_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_name?: string
          template_variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_assignments: {
        Row: {
          assigned_at: string
          employee_id: string
          handed_off_at: string | null
          id: string
          order_id: string
          sequence: number | null
        }
        Insert: {
          assigned_at?: string
          employee_id: string
          handed_off_at?: string | null
          id?: string
          order_id: string
          sequence?: number | null
        }
        Update: {
          assigned_at?: string
          employee_id?: string
          handed_off_at?: string | null
          id?: string
          order_id?: string
          sequence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_files: {
        Row: {
          created_at: string
          file_name: string
          file_type: Database["public"]["Enums"]["order_file_type"]
          id: string
          order_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_type: Database["public"]["Enums"]["order_file_type"]
          id?: string
          order_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_type?: Database["public"]["Enums"]["order_file_type"]
          id?: string
          order_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          employee_id: string | null
          finishing: string | null
          id: string
          is_ready: boolean
          order_id: string
          paper: string | null
          paper_size: string | null
          product: string
          quantity: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          finishing?: string | null
          id?: string
          is_ready?: boolean
          order_id: string
          paper?: string | null
          paper_size?: string | null
          product: string
          quantity: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          finishing?: string | null
          id?: string
          is_ready?: boolean
          order_id?: string
          paper?: string | null
          paper_size?: string | null
          product?: string
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notes: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          note: string
          order_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          note: string
          order_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          note?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          employee_id: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          employee_id: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          employee_id?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approved: boolean
          archived: boolean
          armada_delivery_code: string | null
          armada_delivery_fee: number | null
          armada_delivery_status: string | null
          armada_driver_name: string | null
          armada_driver_phone: string | null
          armada_tracking_link: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          customer_mobile: string
          customer_name: string
          delivery_address: string | null
          delivery_date: string
          delivery_map_link: string | null
          delivery_provider: Database["public"]["Enums"]["order_delivery_provider"]
          delivery_time: string
          finishing: string | null
          fulfillment_type: Database["public"]["Enums"]["order_fulfillment_type"]
          id: string
          item_ready: boolean
          notes: string | null
          notification_preferences: Json
          order_number: string
          paper: string | null
          paper_size: string | null
          preferred_channel: Database["public"]["Enums"]["notification_channel"]
          preferred_language: Database["public"]["Enums"]["order_language"]
          priority: Database["public"]["Enums"]["order_priority"]
          product: string
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          whatsapp_enabled: boolean
        }
        Insert: {
          approved?: boolean
          archived?: boolean
          armada_delivery_code?: string | null
          armada_delivery_fee?: number | null
          armada_delivery_status?: string | null
          armada_driver_name?: string | null
          armada_driver_phone?: string | null
          armada_tracking_link?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          customer_mobile: string
          customer_name: string
          delivery_address?: string | null
          delivery_date: string
          delivery_map_link?: string | null
          delivery_provider?: Database["public"]["Enums"]["order_delivery_provider"]
          delivery_time: string
          finishing?: string | null
          fulfillment_type?: Database["public"]["Enums"]["order_fulfillment_type"]
          id?: string
          item_ready?: boolean
          notes?: string | null
          notification_preferences?: Json
          order_number?: string
          paper?: string | null
          paper_size?: string | null
          preferred_channel?: Database["public"]["Enums"]["notification_channel"]
          preferred_language?: Database["public"]["Enums"]["order_language"]
          priority?: Database["public"]["Enums"]["order_priority"]
          product: string
          quantity: number
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Update: {
          approved?: boolean
          archived?: boolean
          armada_delivery_code?: string | null
          armada_delivery_fee?: number | null
          armada_delivery_status?: string | null
          armada_driver_name?: string | null
          armada_driver_phone?: string | null
          armada_tracking_link?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          customer_mobile?: string
          customer_name?: string
          delivery_address?: string | null
          delivery_date?: string
          delivery_map_link?: string | null
          delivery_provider?: Database["public"]["Enums"]["order_delivery_provider"]
          delivery_time?: string
          finishing?: string | null
          fulfillment_type?: Database["public"]["Enums"]["order_fulfillment_type"]
          id?: string
          item_ready?: boolean
          notes?: string | null
          notification_preferences?: Json
          order_number?: string
          paper?: string | null
          paper_size?: string | null
          preferred_channel?: Database["public"]["Enums"]["notification_channel"]
          preferred_language?: Database["public"]["Enums"]["order_language"]
          priority?: Database["public"]["Enums"]["order_priority"]
          product?: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      audit_action:
        | "order_created"
        | "order_updated"
        | "order_deleted"
        | "employee_assigned"
        | "employee_unassigned"
        | "status_changed"
        | "material_requested"
        | "material_approved"
        | "material_rejected"
        | "notification_sent"
        | "employee_created"
        | "employee_updated"
        | "employee_password_reset"
        | "armada_delivery_dispatched"
        | "armada_delivery_dispatch_failed"
        | "armada_delivery_canceled"
        | "armada_webhook_status_update"
      employee_role: "admin" | "employee" | "supervisor" | "store" | "delivery"
      material_priority: "low" | "normal" | "urgent"
      material_request_status: "pending" | "approved" | "rejected" | "fulfilled"
      material_type:
        | "paper"
        | "ink"
        | "vinyl"
        | "packaging"
        | "lamination"
        | "other"
      notification_channel: "whatsapp" | "email" | "sms"
      notification_receiver: "customer" | "employee"
      notification_status:
        | "pending"
        | "sent"
        | "failed"
        | "skipped"
        | "delivered"
        | "queued"
        | "accepted"
        | "read"
        | "undelivered"
      order_delivery_provider: "internal" | "armada"
      order_file_type: "product_image" | "design_file"
      order_fulfillment_type: "pickup" | "delivery"
      order_language: "ar" | "en"
      order_priority: "normal" | "urgent"
      order_status:
        | "new"
        | "in_progress"
        | "ready_internal_pickup"
        | "waiting_materials"
        | "ready_pickup"
        | "ready_delivery"
        | "collected"
        | "delivered"
        | "completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_action: [
        "order_created",
        "order_updated",
        "order_deleted",
        "employee_assigned",
        "employee_unassigned",
        "status_changed",
        "material_requested",
        "material_approved",
        "material_rejected",
        "notification_sent",
        "employee_created",
        "employee_updated",
        "employee_password_reset",
        "armada_delivery_dispatched",
        "armada_delivery_dispatch_failed",
        "armada_delivery_canceled",
        "armada_webhook_status_update",
      ],
      employee_role: ["admin", "employee", "supervisor", "store", "delivery"],
      material_priority: ["low", "normal", "urgent"],
      material_request_status: ["pending", "approved", "rejected", "fulfilled"],
      material_type: [
        "paper",
        "ink",
        "vinyl",
        "packaging",
        "lamination",
        "other",
      ],
      notification_channel: ["whatsapp", "email", "sms"],
      notification_receiver: ["customer", "employee"],
      notification_status: [
        "pending",
        "sent",
        "failed",
        "skipped",
        "delivered",
        "queued",
        "accepted",
        "read",
        "undelivered",
      ],
      order_delivery_provider: ["internal", "armada"],
      order_file_type: ["product_image", "design_file"],
      order_fulfillment_type: ["pickup", "delivery"],
      order_language: ["ar", "en"],
      order_priority: ["normal", "urgent"],
      order_status: [
        "new",
        "in_progress",
        "ready_internal_pickup",
        "waiting_materials",
        "ready_pickup",
        "ready_delivery",
        "collected",
        "delivered",
        "completed",
      ],
    },
  },
} as const

// ---------------------------------------------------------------------------
// Convenience aliases used throughout the app
// ---------------------------------------------------------------------------

export type EmployeeRole = Database["public"]["Enums"]["employee_role"]
export type OrderLanguage = Database["public"]["Enums"]["order_language"]
export type OrderPriority = Database["public"]["Enums"]["order_priority"]
export type OrderStatus = Database["public"]["Enums"]["order_status"]
export type OrderFileType = Database["public"]["Enums"]["order_file_type"]
export type OrderFulfillmentType = Database["public"]["Enums"]["order_fulfillment_type"]
export type OrderDeliveryProvider = Database["public"]["Enums"]["order_delivery_provider"]
export type MaterialType = Database["public"]["Enums"]["material_type"]
export type MaterialPriority = Database["public"]["Enums"]["material_priority"]
export type MaterialRequestStatus = Database["public"]["Enums"]["material_request_status"]
export type NotificationReceiver = Database["public"]["Enums"]["notification_receiver"]
export type NotificationStatus = Database["public"]["Enums"]["notification_status"]
export type NotificationChannel = Database["public"]["Enums"]["notification_channel"]
export type AuditAction = Database["public"]["Enums"]["audit_action"]
