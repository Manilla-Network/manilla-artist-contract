export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      application_audit: {
        Row: {
          actor: string | null
          application_id: string | null
          contract_id: string | null
          created_at: string
          event: string
          id: string
          ip_hash: string | null
          metadata: Json
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          actor?: string | null
          application_id?: string | null
          contract_id?: string | null
          created_at?: string
          event: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          actor?: string | null
          application_id?: string | null
          contract_id?: string | null
          created_at?: string
          event?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_audit_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "signed_contracts"
            referencedColumns: ["id"]
          }
        ]
      }
      email_test_log: {
        Row: {
          created_at: string
          error_message: string | null
          from_address: string | null
          id: string
          metadata: Json | null
          provider_message_id: string | null
          purpose: string
          recipient: string
          run_id: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          from_address?: string | null
          id?: string
          metadata?: Json | null
          provider_message_id?: string | null
          purpose: string
          recipient: string
          run_id: string
          status: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          from_address?: string | null
          id?: string
          metadata?: Json | null
          provider_message_id?: string | null
          purpose?: string
          recipient?: string
          run_id?: string
          status?: string
        }
        Relationships: []
      }
      signed_contracts: {
        Row: {
          accepted_revenue_split: boolean
          accepted_terms: boolean
          address: string
          admin_email_sent_at: string | null
          agreement_version: string
          apple_music_url: string | null
          application_id: string | null
          artist_photo_url: string | null
          audiomack_url: string | null
          bio: string | null
          boomplay_url: string | null
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          email_sent_at: string | null
          genre: string | null
          id: string
          instagram_url: string | null
          ip_address: string | null
          ip_hash: string | null
          legal_name: string
          locale: string | null
          nationality: string
          phone: string | null
          press_kit_url: string | null
          referrer: string | null
          screen_resolution: string | null
          signature_data_url: string | null
          signature_name: string
          signed_at: string
          spotify_url: string | null
          stage_name: string
          state: string | null
          status: string
          submission_origin: string | null
          tiktok_url: string | null
          timezone: string | null
          user_agent: string | null
          user_id: string
          website_url: string | null
          years_active: number | null
          youtube_url: string | null
        }
        Insert: {
          accepted_revenue_split?: boolean
          accepted_terms?: boolean
          address: string
          admin_email_sent_at?: string | null
          agreement_version?: string
          apple_music_url?: string | null
          application_id?: string | null
          artist_photo_url?: string | null
          audiomack_url?: string | null
          bio?: string | null
          boomplay_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email: string
          email_sent_at?: string | null
          genre?: string | null
          id?: string
          instagram_url?: string | null
          ip_address?: string | null
          ip_hash?: string | null
          legal_name: string
          locale?: string | null
          nationality: string
          phone?: string | null
          press_kit_url?: string | null
          referrer?: string | null
          screen_resolution?: string | null
          signature_data_url?: string | null
          signature_name: string
          signed_at?: string
          spotify_url?: string | null
          stage_name: string
          state?: string | null
          status?: string
          submission_origin?: string | null
          tiktok_url?: string | null
          timezone?: string | null
          user_agent?: string | null
          user_id: string
          website_url?: string | null
          years_active?: number | null
          youtube_url?: string | null
        }
        Update: {
          accepted_revenue_split?: boolean
          accepted_terms?: boolean
          address?: string
          admin_email_sent_at?: string | null
          agreement_version?: string
          apple_music_url?: string | null
          application_id?: string | null
          artist_photo_url?: string | null
          audiomack_url?: string | null
          bio?: string | null
          boomplay_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          email_sent_at?: string | null
          genre?: string | null
          id?: string
          instagram_url?: string | null
          ip_address?: string | null
          ip_hash?: string | null
          legal_name?: string
          locale?: string | null
          nationality?: string
          phone?: string | null
          press_kit_url?: string | null
          referrer?: string | null
          screen_resolution?: string | null
          signature_data_url?: string | null
          signature_name?: string
          signed_at?: string
          spotify_url?: string | null
          stage_name?: string
          state?: string | null
          status?: string
          submission_origin?: string | null
          tiktok_url?: string | null
          timezone?: string | null
          user_agent?: string | null
          user_id?: string
          website_url?: string | null
          years_active?: number | null
          youtube_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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

export const Constants = {
  public: {
    Enums: {},
  },
} as const
