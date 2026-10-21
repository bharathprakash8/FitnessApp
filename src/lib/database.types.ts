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
    PostgrestVersion: "14.18"
  }
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
      activity_daily: {
        Row: {
          active_calories: number | null
          activity_date: string
          client_id: string
          resting_calories: number | null
          sleep_minutes: number | null
          source: string
          steps: number | null
          updated_at: string
          worn_hours: number[] | null
        }
        Insert: {
          active_calories?: number | null
          activity_date: string
          client_id: string
          resting_calories?: number | null
          sleep_minutes?: number | null
          source: string
          steps?: number | null
          updated_at?: string
          worn_hours?: number[] | null
        }
        Update: {
          active_calories?: number | null
          activity_date?: string
          client_id?: string
          resting_calories?: number | null
          sleep_minutes?: number | null
          source?: string
          steps?: number | null
          updated_at?: string
          worn_hours?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_token_usage: {
        Row: {
          calls: number
          day: string
          feature: string
          input_tokens: number
          model: string
          output_tokens: number
          total_tokens: number
        }
        Insert: {
          calls?: number
          day: string
          feature: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          total_tokens?: number
        }
        Update: {
          calls?: number
          day?: string
          feature?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          total_tokens?: number
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          count: number
          feature: string
          id: string
          used_on: string
          user_id: string
        }
        Insert: {
          count?: number
          feature: string
          id?: string
          used_on: string
          user_id: string
        }
        Update: {
          count?: number
          feature?: string
          id?: string
          used_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      custom_reminders: {
        Row: {
          body: string | null
          client_can_mute: boolean
          client_id: string
          created_at: string
          created_by: string | null
          days: number[]
          id: string
          is_active: boolean
          kind: string
          muted: boolean
          remind_at: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          client_can_mute?: boolean
          client_id: string
          created_at?: string
          created_by?: string | null
          days?: number[]
          id?: string
          is_active?: boolean
          kind?: string
          muted?: boolean
          remind_at: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          client_can_mute?: boolean
          client_id?: string
          created_at?: string
          created_by?: string | null
          days?: number[]
          id?: string
          is_active?: boolean
          kind?: string
          muted?: boolean
          remind_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          created_at: string
          cues: string | null
          demo_url: string | null
          equipment: string | null
          id: string
          is_archived: boolean
          log_type: string
          muscle_group: string | null
          name: string
          trainer_id: string | null
        }
        Insert: {
          created_at?: string
          cues?: string | null
          demo_url?: string | null
          equipment?: string | null
          id?: string
          is_archived?: boolean
          log_type?: string
          muscle_group?: string | null
          name: string
          trainer_id?: string | null
        }
        Update: {
          created_at?: string
          cues?: string | null
          demo_url?: string | null
          equipment?: string | null
          id?: string
          is_archived?: boolean
          log_type?: string
          muscle_group?: string | null
          name?: string
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      habits_daily: {
        Row: {
          client_id: string
          habit_date: string
          updated_at: string
          water_ml: number
        }
        Insert: {
          client_id: string
          habit_date: string
          updated_at?: string
          water_ml?: number
        }
        Update: {
          client_id?: string
          habit_date?: string
          updated_at?: string
          water_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "habits_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_tokens: {
        Row: {
          google_email: string | null
          id: string
          owner_id: string
          provider: string
          refresh_token_encrypted: string
          scope: string | null
          updated_at: string
        }
        Insert: {
          google_email?: string | null
          id?: string
          owner_id: string
          provider: string
          refresh_token_encrypted: string
          scope?: string | null
          updated_at?: string
        }
        Update: {
          google_email?: string | null
          id?: string
          owner_id?: string
          provider?: string
          refresh_token_encrypted?: string
          scope?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_tokens_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_logs: {
        Row: {
          carbs_g: number
          client_id: string
          created_at: string
          eaten_at: string
          eaten_on: string
          edited: boolean
          fat_g: number
          id: string
          input_text: string | null
          items: Json
          meal_type: string
          photo_deleted: boolean
          photo_path: string | null
          protein_g: number
          source: string
          total_calories: number
        }
        Insert: {
          carbs_g?: number
          client_id: string
          created_at?: string
          eaten_at?: string
          eaten_on?: string
          edited?: boolean
          fat_g?: number
          id?: string
          input_text?: string | null
          items?: Json
          meal_type: string
          photo_deleted?: boolean
          photo_path?: string | null
          protein_g?: number
          source: string
          total_calories?: number
        }
        Update: {
          carbs_g?: number
          client_id?: string
          created_at?: string
          eaten_at?: string
          eaten_on?: string
          edited?: boolean
          fat_g?: number
          id?: string
          input_text?: string | null
          items?: Json
          meal_type?: string
          photo_deleted?: boolean
          photo_path?: string | null
          protein_g?: number
          source?: string
          total_calories?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          client_id: string
          created_at: string
          days: Json
          edited: boolean
          id: string
          model: string | null
          note: string | null
          shared_at: string | null
          starts_on: string
          status: string
          target_kcal: number | null
          target_protein_g: number | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          days?: Json
          edited?: boolean
          id?: string
          model?: string | null
          note?: string | null
          shared_at?: string | null
          starts_on: string
          status?: string
          target_kcal?: number | null
          target_protein_g?: number | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          days?: Json
          edited?: boolean
          id?: string
          model?: string | null
          note?: string | null
          shared_at?: string | null
          starts_on?: string
          status?: string
          target_kcal?: number | null
          target_protein_g?: number | null
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      measurements: {
        Row: {
          client_id: string
          created_at: string
          id: string
          measured_on: string
          notes: string | null
          photo_paths: string[]
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          measured_on?: string
          notes?: string | null
          photo_paths?: string[]
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          measured_on?: string
          notes?: string | null
          photo_paths?: string[]
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "measurements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          id: string
          kind: string
          ref_date: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          kind: string
          ref_date: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          ref_date?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_assignments: {
        Row: {
          assigned_by: string | null
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          plan_id: string
          start_date: string
        }
        Insert: {
          assigned_by?: string | null
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          plan_id: string
          start_date?: string
        }
        Update: {
          assigned_by?: string | null
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          plan_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_assignments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_days: {
        Row: {
          created_at: string
          day_index: number
          id: string
          plan_id: string
          title: string
        }
        Insert: {
          created_at?: string
          day_index: number
          id?: string
          plan_id: string
          title: string
        }
        Update: {
          created_at?: string
          day_index?: number
          id?: string
          plan_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_days_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          plan_day_id: string
          reps: string | null
          rest_seconds: number
          sets: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          plan_day_id: string
          reps?: string | null
          rest_seconds?: number
          sets?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          plan_day_id?: string
          reps?: string | null
          rest_seconds?: number
          sets?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_exercises_plan_day_id_fkey"
            columns: ["plan_day_id"]
            isOneToOne: false
            referencedRelation: "plan_days"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          consent_at: string | null
          consent_version: string | null
          created_at: string
          date_of_birth: string | null
          diet_preference: string | null
          email: string
          foods_to_avoid: string | null
          full_name: string | null
          goal: string | null
          goal_other: string | null
          health_sync_token_hash: string | null
          height_cm: number | null
          id: string
          injuries: string | null
          is_active: boolean
          onboarded_at: string | null
          phone: string | null
          role: string
          sex: string | null
          timezone: string
        }
        Insert: {
          consent_at?: string | null
          consent_version?: string | null
          created_at?: string
          date_of_birth?: string | null
          diet_preference?: string | null
          email: string
          foods_to_avoid?: string | null
          full_name?: string | null
          goal?: string | null
          goal_other?: string | null
          health_sync_token_hash?: string | null
          height_cm?: number | null
          id: string
          injuries?: string | null
          is_active?: boolean
          onboarded_at?: string | null
          phone?: string | null
          role?: string
          sex?: string | null
          timezone?: string
        }
        Update: {
          consent_at?: string | null
          consent_version?: string | null
          created_at?: string
          date_of_birth?: string | null
          diet_preference?: string | null
          email?: string
          foods_to_avoid?: string | null
          full_name?: string | null
          goal?: string | null
          goal_other?: string | null
          health_sync_token_hash?: string | null
          height_cm?: number | null
          id?: string
          injuries?: string | null
          is_active?: boolean
          onboarded_at?: string | null
          phone?: string | null
          role?: string
          sex?: string | null
          timezone?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_settings: {
        Row: {
          breakfast_on: boolean
          breakfast_time: string
          client_id: string
          dinner_on: boolean
          dinner_time: string
          enabled: boolean
          lunch_on: boolean
          lunch_time: string
          meal_times_locked: boolean
          snack_on: boolean
          snack_time: string
          updated_at: string
          updated_by: string | null
          workout_reminder_time: string | null
        }
        Insert: {
          breakfast_on?: boolean
          breakfast_time?: string
          client_id: string
          dinner_on?: boolean
          dinner_time?: string
          enabled?: boolean
          lunch_on?: boolean
          lunch_time?: string
          meal_times_locked?: boolean
          snack_on?: boolean
          snack_time?: string
          updated_at?: string
          updated_by?: string | null
          workout_reminder_time?: string | null
        }
        Update: {
          breakfast_on?: boolean
          breakfast_time?: string
          client_id?: string
          dinner_on?: boolean
          dinner_time?: string
          enabled?: boolean
          lunch_on?: boolean
          lunch_time?: string
          meal_times_locked?: boolean
          snack_on?: boolean
          snack_time?: string
          updated_at?: string
          updated_by?: string | null
          workout_reminder_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminder_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      self_workout_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          reps: string | null
          rest_seconds: number
          self_workout_id: string
          sets: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          reps?: string | null
          rest_seconds?: number
          self_workout_id: string
          sets?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          reps?: string | null
          rest_seconds?: number
          self_workout_id?: string
          sets?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "self_workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_workout_exercises_self_workout_id_fkey"
            columns: ["self_workout_id"]
            isOneToOne: false
            referencedRelation: "self_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      self_workouts: {
        Row: {
          client_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          client_id?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "self_workouts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_attendees: {
        Row: {
          client_id: string
          session_id: string
          status: string
        }
        Insert: {
          client_id: string
          session_id: string
          status?: string
        }
        Update: {
          client_id?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_attendees_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendees_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_series: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          duration_min: number
          ends_after: number | null
          ends_on: string | null
          id: string
          location: string | null
          meet_url: string | null
          notes: string | null
          repeat: string
          send_invite: boolean
          start_date: string
          start_time: string
          time_zone: string
          title: string
          trainer_id: string
          type: string
          weekdays: number[]
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          duration_min: number
          ends_after?: number | null
          ends_on?: string | null
          id?: string
          location?: string | null
          meet_url?: string | null
          notes?: string | null
          repeat: string
          send_invite?: boolean
          start_date: string
          start_time: string
          time_zone?: string
          title: string
          trainer_id: string
          type: string
          weekdays?: number[]
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          duration_min?: number
          ends_after?: number | null
          ends_on?: string | null
          id?: string
          location?: string | null
          meet_url?: string | null
          notes?: string | null
          repeat?: string
          send_invite?: boolean
          start_date?: string
          start_time?: string
          time_zone?: string
          title?: string
          trainer_id?: string
          type?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "session_series_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          duration_min: number
          id: string
          location: string | null
          meet_url: string | null
          notes: string | null
          send_invite: boolean
          series_id: string | null
          starts_at: string
          status: string
          time_zone: string
          title: string
          trainer_id: string
          type: string
          updated_at: string
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          duration_min: number
          id?: string
          location?: string | null
          meet_url?: string | null
          notes?: string | null
          send_invite?: boolean
          series_id?: string | null
          starts_at: string
          status?: string
          time_zone?: string
          title: string
          trainer_id: string
          type: string
          updated_at?: string
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          duration_min?: number
          id?: string
          location?: string | null
          meet_url?: string | null
          notes?: string | null
          send_invite?: boolean
          series_id?: string | null
          starts_at?: string
          status?: string
          time_zone?: string
          title?: string
          trainer_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "session_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stats_insights: {
        Row: {
          client_id: string
          created_at: string
          focus: string
          id: string
          insights: Json
          made_on: string
          model: string | null
          period_days: number
        }
        Insert: {
          client_id: string
          created_at?: string
          focus?: string
          id?: string
          insights?: Json
          made_on: string
          model?: string | null
          period_days?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          focus?: string
          id?: string
          insights?: Json
          made_on?: string
          model?: string | null
          period_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "stats_insights_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      targets: {
        Row: {
          calories: number
          carbs_g: number
          client_id: string
          created_at: string
          effective_from: string
          fat_g: number
          id: string
          protein_g: number
          set_by: string | null
          water_ml: number | null
        }
        Insert: {
          calories: number
          carbs_g: number
          client_id: string
          created_at?: string
          effective_from?: string
          fat_g: number
          id?: string
          protein_g: number
          set_by?: string | null
          water_ml?: number | null
        }
        Update: {
          calories?: number
          carbs_g?: number
          client_id?: string
          created_at?: string
          effective_from?: string
          fat_g?: number
          id?: string
          protein_g?: number
          set_by?: string | null
          water_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "targets_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_clients: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          client_id: string
          trainer_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          client_id: string
          trainer_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          client_id?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_clients_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_clients_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_summaries: {
        Row: {
          client_id: string
          created_at: string
          edited: boolean
          id: string
          period_end: string
          period_start: string
          shared_at: string | null
          stats: Json
          status: string
          summary_text: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          edited?: boolean
          id?: string
          period_end: string
          period_start: string
          shared_at?: string | null
          stats?: Json
          status?: string
          summary_text?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          edited?: boolean
          id?: string
          period_end?: string
          period_start?: string
          shared_at?: string | null
          stats?: Json
          status?: string
          summary_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_summaries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          client_id: string
          created_at: string
          duration_min: number | null
          exercise_id: string
          id: string
          logged_by: string | null
          machine_kcal: number | null
          performed_at: string | null
          performed_on: string
          plan_day_id: string | null
          reps: number | null
          self_workout_id: string | null
          set_number: number
          source: string
          weight_kg: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          duration_min?: number | null
          exercise_id: string
          id?: string
          logged_by?: string | null
          machine_kcal?: number | null
          performed_at?: string | null
          performed_on?: string
          plan_day_id?: string | null
          reps?: number | null
          self_workout_id?: string | null
          set_number: number
          source?: string
          weight_kg?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          duration_min?: number | null
          exercise_id?: string
          id?: string
          logged_by?: string | null
          machine_kcal?: number | null
          performed_at?: string | null
          performed_on?: string
          plan_day_id?: string | null
          reps?: number | null
          self_workout_id?: string | null
          set_number?: number
          source?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_plan_day_id_fkey"
            columns: ["plan_day_id"]
            isOneToOne: false
            referencedRelation: "plan_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_self_workout_id_fkey"
            columns: ["self_workout_id"]
            isOneToOne: false
            referencedRelation: "self_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_plans_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_app_health: { Args: never; Returns: Json }
      app_role: { Args: never; Returns: string }
      bump_ai_usage: {
        Args: { day: string; feat: string; uid: string }
        Returns: number
      }
      call_cron_function: { Args: { body?: Json; fn: string }; Returns: number }
      can_edit_plan: { Args: { plan: string }; Returns: boolean }
      can_read_plan: { Args: { plan: string }; Returns: boolean }
      claim_push_token: { Args: { p: string; t: string }; Returns: undefined }
      exercise_used_by_me: { Args: { ex: string }; Returns: boolean }
      has_push_device: { Args: { client: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_session_attendee: { Args: { s: string }; Returns: boolean }
      is_trainer_of: { Args: { client: string }; Returns: boolean }
      my_google_connection: { Args: never; Returns: string }
      my_trainer: { Args: never; Returns: string }
      old_meal_photos: {
        Args: { cutoff: string }
        Returns: {
          name: string
        }[]
      }
      ping: { Args: never; Returns: string }
      plan_of_day: { Args: { day: string }; Returns: string }
      plan_owner: { Args: { plan: string }; Returns: string }
      record_ai_tokens: {
        Args: {
          feat: string
          input_t: number
          model_name: string
          output_t: number
          total_t: number
        }
        Returns: undefined
      }
      self_workout_owner: { Args: { w: string }; Returns: string }
      session_owner: { Args: { s: string }; Returns: string }
      set_foods_to_avoid: {
        Args: { foods: string; person: string }
        Returns: undefined
      }
      tracks_self: { Args: never; Returns: boolean }
      trainer_dashboard: {
        Args: never
        Returns: {
          avg_kcal_3d: number
          client_id: string
          last_meal_on: string
          last_session_missed: boolean
          last_workout_on: string
          plan_since: string
          summary_ready: boolean
          target_kcal: number
          today: string
        }[]
      }
      try_uuid: { Args: { t: string }; Returns: string }
      user_has_data: { Args: { uid: string }; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {},
  },
} as const
