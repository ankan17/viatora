export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          confirmation_ref: string | null
          cost_amount: number | null
          cost_currency: string | null
          created_at: string
          ends_at: string | null
          id: string
          kind: Database["public"]["Enums"]["booking_kind"]
          notes: string
          place_id: string | null
          provider_name: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          title: string
          trip_id: string
          updated_at: string
          url: string | null
        }
        Insert: {
          confirmation_ref?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["booking_kind"]
          notes?: string
          place_id?: string | null
          provider_name?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          title: string
          trip_id: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          confirmation_ref?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["booking_kind"]
          notes?: string
          place_id?: string | null
          provider_name?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          title?: string
          trip_id?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      change_batches: {
        Row: {
          actor: Database["public"]["Enums"]["actor_kind"]
          actor_user_id: string | null
          created_at: string
          id: string
          summary: string
          trip_id: string
          undone_at: string | null
        }
        Insert: {
          actor?: Database["public"]["Enums"]["actor_kind"]
          actor_user_id?: string | null
          created_at?: string
          id: string
          summary?: string
          trip_id: string
          undone_at?: string | null
        }
        Update: {
          actor?: Database["public"]["Enums"]["actor_kind"]
          actor_user_id?: string | null
          created_at?: string
          id?: string
          summary?: string
          trip_id?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_batches_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      change_log: {
        Row: {
          after: Json | null
          batch_id: string
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          op: Database["public"]["Enums"]["change_op"]
          trip_id: string
        }
        Insert: {
          after?: Json | null
          batch_id: string
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: never
          op: Database["public"]["Enums"]["change_op"]
          trip_id: string
        }
        Update: {
          after?: Json | null
          batch_id?: string
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: never
          op?: Database["public"]["Enums"]["change_op"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_log_batch_fk"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "change_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_log_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      days: {
        Row: {
          base_city: string | null
          base_place_id: string | null
          created_at: string
          id: string
          notes: string
          number: number
          trip_id: string
          updated_at: string
        }
        Insert: {
          base_city?: string | null
          base_place_id?: string | null
          created_at?: string
          id?: string
          notes?: string
          number: number
          trip_id: string
          updated_at?: string
        }
        Update: {
          base_city?: string | null
          base_place_id?: string | null
          created_at?: string
          id?: string
          notes?: string
          number?: number
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "days_base_place_id_fkey"
            columns: ["base_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "days_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          booking_id: string | null
          cost_amount: number | null
          cost_currency: string | null
          created_at: string
          created_by: string | null
          day_id: string | null
          end_time: string | null
          id: string
          notes: string
          place_id: string | null
          position: number
          slot: Database["public"]["Enums"]["day_slot"] | null
          start_time: string | null
          status: Database["public"]["Enums"]["item_status"]
          title: string
          trip_id: string
          type: Database["public"]["Enums"]["item_type"]
          updated_at: string
          url: string | null
        }
        Insert: {
          booking_id?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string
          created_by?: string | null
          day_id?: string | null
          end_time?: string | null
          id?: string
          notes?: string
          place_id?: string | null
          position?: number
          slot?: Database["public"]["Enums"]["day_slot"] | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          title: string
          trip_id: string
          type?: Database["public"]["Enums"]["item_type"]
          updated_at?: string
          url?: string | null
        }
        Update: {
          booking_id?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string
          created_by?: string | null
          day_id?: string | null
          end_time?: string | null
          id?: string
          notes?: string
          place_id?: string | null
          position?: number
          slot?: Database["public"]["Enums"]["day_slot"] | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          title?: string
          trip_id?: string
          type?: Database["public"]["Enums"]["item_type"]
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_booking_fk"
            columns: ["booking_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "items_day_fk"
            columns: ["day_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string | null
          change_batch_id: string | null
          created_at: string
          id: string
          parts: Json
          role: Database["public"]["Enums"]["message_role"]
          trip_id: string
        }
        Insert: {
          author_id?: string | null
          change_batch_id?: string | null
          created_at?: string
          id?: string
          parts?: Json
          role: Database["public"]["Enums"]["message_role"]
          trip_id: string
        }
        Update: {
          author_id?: string | null
          change_batch_id?: string | null
          created_at?: string
          id?: string
          parts?: Json
          role?: Database["public"]["Enums"]["message_role"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_change_batch_fk"
            columns: ["change_batch_id"]
            isOneToOne: false
            referencedRelation: "change_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          label: string
          packed: boolean
          position: number
          quantity: number
          reason: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          label: string
          packed?: boolean
          position?: number
          quantity?: number
          reason?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          label?: string
          packed?: boolean
          position?: number
          quantity?: number
          reason?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string | null
          provider: string
          provider_place_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string | null
          provider: string
          provider_place_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string | null
          provider?: string
          provider_place_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ruled_out: {
        Row: {
          created_at: string
          id: string
          label: string
          place_id: string | null
          reason: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          place_id?: string | null
          reason?: string
          trip_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          place_id?: string | null
          reason?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruled_out_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruled_out_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["member_role"]
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["member_role"]
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          budget_total: number | null
          conversation_summary: string
          created_at: string
          currency: string
          destination: string | null
          id: string
          name: string
          owner_id: string
          profile: Json
          start_date: string | null
          summary_message_id: string | null
          updated_at: string
        }
        Insert: {
          budget_total?: number | null
          conversation_summary?: string
          created_at?: string
          currency?: string
          destination?: string | null
          id?: string
          name: string
          owner_id?: string
          profile?: Json
          start_date?: string | null
          summary_message_id?: string | null
          updated_at?: string
        }
        Update: {
          budget_total?: number | null
          conversation_summary?: string
          created_at?: string
          currency?: string
          destination?: string | null
          id?: string
          name?: string
          owner_id?: string
          profile?: Json
          start_date?: string | null
          summary_message_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_day: {
        Args: { p_after?: number; p_trip_id: string }
        Returns: string
      }
      can_edit_trip: { Args: { p_trip_id: string }; Returns: boolean }
      can_read_trip: { Args: { p_trip_id: string }; Returns: boolean }
      create_trip: {
        Args: {
          p_currency?: string
          p_day_count?: number
          p_destination?: string
          p_name: string
          p_start_date?: string
        }
        Returns: string
      }
      current_batch: { Args: { p_trip_id: string }; Returns: string }
      ensure_place: {
        Args: {
          p_lat?: number
          p_lng?: number
          p_name?: string
          p_provider: string
          p_provider_place_id: string
        }
        Returns: string
      }
      move_day: { Args: { p_day_id: string; p_to: number }; Returns: undefined }
      remove_day: { Args: { p_day_id: string }; Returns: undefined }
      request_header: { Args: { p_name: string }; Returns: string }
      trip_role: {
        Args: { p_trip_id: string }
        Returns: Database["public"]["Enums"]["member_role"]
      }
      undo_batch: { Args: { p_batch_id: string }; Returns: string }
    }
    Enums: {
      actor_kind: "user" | "agent"
      booking_kind: "stay" | "flight" | "rail" | "activity" | "car" | "other"
      booking_status: "pending" | "confirmed" | "cancelled"
      change_op: "insert" | "update" | "delete"
      day_slot: "morning" | "afternoon" | "evening" | "night"
      item_status: "idea" | "planned" | "booked"
      item_type:
        | "activity"
        | "sight"
        | "food"
        | "stay"
        | "transit"
        | "flight"
        | "rail"
        | "note"
      member_role: "owner" | "editor" | "viewer"
      message_role: "user" | "assistant"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      actor_kind: ["user", "agent"],
      booking_kind: ["stay", "flight", "rail", "activity", "car", "other"],
      booking_status: ["pending", "confirmed", "cancelled"],
      change_op: ["insert", "update", "delete"],
      day_slot: ["morning", "afternoon", "evening", "night"],
      item_status: ["idea", "planned", "booked"],
      item_type: [
        "activity",
        "sight",
        "food",
        "stay",
        "transit",
        "flight",
        "rail",
        "note",
      ],
      member_role: ["owner", "editor", "viewer"],
      message_role: ["user", "assistant"],
    },
  },
} as const

