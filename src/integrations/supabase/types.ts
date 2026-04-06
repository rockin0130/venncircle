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
      ai_conversations: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_meal_suggestions: {
        Row: {
          calories: number | null
          carbs: number | null
          created_at: string
          fat: number | null
          fiber: number | null
          group_id: string | null
          id: string
          ingredients: Json | null
          meal_type: string
          prep_steps: Json | null
          protein: number
          suggestion_date: string
          tags: Json | null
          title: string
          user_id: string
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          created_at?: string
          fat?: number | null
          fiber?: number | null
          group_id?: string | null
          id?: string
          ingredients?: Json | null
          meal_type?: string
          prep_steps?: Json | null
          protein?: number
          suggestion_date?: string
          tags?: Json | null
          title: string
          user_id: string
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          created_at?: string
          fat?: number | null
          fiber?: number | null
          group_id?: string | null
          id?: string
          ingredients?: Json | null
          meal_type?: string
          prep_steps?: Json | null
          protein?: number
          suggestion_date?: string
          tags?: Json | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_meal_suggestions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          image_url: string | null
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          metadata?: Json | null
          role?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_context_visibility: {
        Row: {
          calendar_id: string
          context_id: string
          created_at: string
          id: string
          is_visible: boolean
          user_id: string
          visibility_mode: string
        }
        Insert: {
          calendar_id: string
          context_id: string
          created_at?: string
          id?: string
          is_visible?: boolean
          user_id: string
          visibility_mode?: string
        }
        Update: {
          calendar_id?: string
          context_id?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          user_id?: string
          visibility_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_context_visibility_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_team_dashboard_preferences: {
        Row: {
          column_user_ids: string[]
          context_key: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          column_user_ids?: string[]
          context_key: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          column_user_ids?: string[]
          context_key?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendars: {
        Row: {
          color: string
          created_at: string
          group_id: string | null
          id: string
          is_default: boolean
          is_visible: boolean
          name: string
          provider: string
          provider_account_id: string | null
          provider_calendar_id: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          group_id?: string | null
          id?: string
          is_default?: boolean
          is_visible?: boolean
          name: string
          provider?: string
          provider_account_id?: string | null
          provider_calendar_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          group_id?: string | null
          id?: string
          is_default?: boolean
          is_visible?: boolean
          name?: string
          provider?: string
          provider_account_id?: string | null
          provider_calendar_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendars_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_conversations: {
        Row: {
          context: Json
          created_at: string
          group_id: string
          id: string
          phase: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          group_id: string
          id?: string
          phase?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          group_id?: string
          id?: string
          phase?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          all_day: boolean
          assignee: string
          assignee_user_ids: string[] | null
          calendar_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          day: number
          description: string | null
          done: boolean
          end_day: number | null
          end_month: number | null
          end_time: string
          end_year: number | null
          group_id: string | null
          hidden_from_partner: boolean
          id: string
          location: string | null
          month: number
          notification_minutes: number | null
          repeat_rule: Json | null
          time: string
          title: string
          updated_at: string
          user_id: string
          visibility: string | null
          year: number
        }
        Insert: {
          all_day?: boolean
          assignee?: string
          assignee_user_ids?: string[] | null
          calendar_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          day: number
          description?: string | null
          done?: boolean
          end_day?: number | null
          end_month?: number | null
          end_time?: string
          end_year?: number | null
          group_id?: string | null
          hidden_from_partner?: boolean
          id?: string
          location?: string | null
          month: number
          notification_minutes?: number | null
          repeat_rule?: Json | null
          time?: string
          title: string
          updated_at?: string
          user_id: string
          visibility?: string | null
          year: number
        }
        Update: {
          all_day?: boolean
          assignee?: string
          assignee_user_ids?: string[] | null
          calendar_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          day?: number
          description?: string | null
          done?: boolean
          end_day?: number | null
          end_month?: number | null
          end_time?: string
          end_year?: number | null
          group_id?: string | null
          hidden_from_partner?: boolean
          id?: string
          location?: string | null
          month?: number
          notification_minutes?: number | null
          repeat_rule?: Json | null
          time?: string
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "events_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_logs: {
        Row: {
          completed: boolean
          created_at: string
          exercise_index: number
          exercise_name: string
          id: string
          logged_date: string
          reps: number
          set_number: number
          unit: string
          user_id: string
          weight: number
          workout_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          exercise_index?: number
          exercise_name: string
          id?: string
          logged_date?: string
          reps?: number
          set_number?: number
          unit?: string
          user_id: string
          weight?: number
          workout_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          exercise_index?: number
          exercise_name?: string
          id?: string
          logged_date?: string
          reps?: number
          set_number?: number
          unit?: string
          user_id?: string
          weight?: number
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_logs_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      gcal_event_completions: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          done: boolean
          gcal_event_id: string
          group_id: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          done?: boolean
          gcal_event_id: string
          group_id?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          done?: boolean
          gcal_event_id?: string
          group_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gcal_event_completions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      gcal_event_designations: {
        Row: {
          assignee: string
          assignee_user_ids: string[]
          created_at: string
          gcal_event_id: string
          id: string
          is_deleted: boolean
          override_all_day: boolean | null
          override_description: string | null
          override_end: string | null
          override_location: string | null
          override_start: string | null
          override_timezone: string | null
          override_title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee?: string
          assignee_user_ids?: string[]
          created_at?: string
          gcal_event_id: string
          id?: string
          is_deleted?: boolean
          override_all_day?: boolean | null
          override_description?: string | null
          override_end?: string | null
          override_location?: string | null
          override_start?: string | null
          override_timezone?: string | null
          override_title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee?: string
          assignee_user_ids?: string[]
          created_at?: string
          gcal_event_id?: string
          id?: string
          is_deleted?: boolean
          override_all_day?: boolean | null
          override_description?: string | null
          override_end?: string | null
          override_location?: string | null
          override_start?: string | null
          override_timezone?: string | null
          override_title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          group_id: string | null
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          group_id?: string | null
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          group_id?: string | null
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_tokens_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_feed_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_feed_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      group_feed_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_feed_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      group_feed_posts: {
        Row: {
          comments_count: number
          content: string
          created_at: string
          group_id: string
          id: string
          interest_tag: string | null
          likes_count: number
          photos: string[]
          post_type: string
          stats: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comments_count?: number
          content?: string
          created_at?: string
          group_id: string
          id?: string
          interest_tag?: string | null
          likes_count?: number
          photos?: string[]
          post_type?: string
          stats?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comments_count?: number
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          interest_tag?: string | null
          likes_count?: number
          photos?: string[]
          post_type?: string
          stats?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_feed_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          invited_by: string | null
          joined_at: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          category: string
          cover_image_url: string | null
          created_at: string
          created_by: string
          emoji: string
          id: string
          invite_code: string | null
          name: string
          shared_pages: string[]
          type: string
        }
        Insert: {
          category?: string
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          emoji?: string
          id?: string
          invite_code?: string | null
          name: string
          shared_pages?: string[]
          type?: string
        }
        Update: {
          category?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          emoji?: string
          id?: string
          invite_code?: string | null
          name?: string
          shared_pages?: string[]
          type?: string
        }
        Relationships: []
      }
      habit_completions: {
        Row: {
          completed_date: string
          created_at: string
          habit_id: string
          id: string
          user_id: string
        }
        Insert: {
          completed_date: string
          created_at?: string
          habit_id: string
          id?: string
          user_id: string
        }
        Update: {
          completed_date?: string
          created_at?: string
          habit_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_completions_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_sections: {
        Row: {
          created_at: string
          group_id: string | null
          icon: string
          id: string
          key: string
          label: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          icon?: string
          id?: string
          key: string
          label: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          icon?: string
          id?: string
          key?: string
          label?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_sections_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          category: string
          created_at: string
          group_id: string | null
          hidden_from_partner: boolean
          id: string
          label: string
          shared_group_ids: string[]
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          group_id?: string | null
          hidden_from_partner?: boolean
          id?: string
          label: string
          shared_group_ids?: string[]
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          group_id?: string | null
          hidden_from_partner?: boolean
          id?: string
          label?: string
          shared_group_ids?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habits_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_gcal_events: {
        Row: {
          created_at: string
          gcal_event_id: string
          group_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gcal_event_id: string
          group_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gcal_event_id?: string
          group_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_gcal_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_logs: {
        Row: {
          ai_tags: Json | null
          calories: number | null
          carbs: number | null
          consumed: boolean
          created_at: string
          fat: number | null
          fiber: number | null
          group_id: string | null
          id: string
          ingredients: Json | null
          is_ai_generated: boolean
          meal_date: string
          meal_type: string
          prep_steps: Json | null
          protein: number
          title: string
          user_id: string
        }
        Insert: {
          ai_tags?: Json | null
          calories?: number | null
          carbs?: number | null
          consumed?: boolean
          created_at?: string
          fat?: number | null
          fiber?: number | null
          group_id?: string | null
          id?: string
          ingredients?: Json | null
          is_ai_generated?: boolean
          meal_date?: string
          meal_type?: string
          prep_steps?: Json | null
          protein?: number
          title: string
          user_id: string
        }
        Update: {
          ai_tags?: Json | null
          calories?: number | null
          carbs?: number | null
          consumed?: boolean
          created_at?: string
          fat?: number | null
          fiber?: number | null
          group_id?: string | null
          id?: string
          ingredients?: Json | null
          is_ai_generated?: boolean
          meal_date?: string
          meal_type?: string
          prep_steps?: Json | null
          protein?: number
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_logs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string
          group_id: string
          id: string
          is_ai_coach: boolean
          metadata: Json | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          group_id: string
          id?: string
          is_ai_coach?: boolean
          metadata?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          is_ai_coach?: boolean
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      nudges: {
        Row: {
          created_at: string
          from_user_id: string
          habit_id: string | null
          id: string
          message: string
          seen: boolean
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          habit_id?: string | null
          id?: string
          message?: string
          seen?: boolean
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          habit_id?: string | null
          id?: string
          message?: string
          seen?: boolean
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nudges_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_goals: {
        Row: {
          calorie_goal: number | null
          carbs_goal: number | null
          created_at: string
          enabled_trackers: Json | null
          fat_goal: number | null
          fiber_goal: number | null
          group_id: string | null
          id: string
          protein_goal: number
          show_calories: boolean
          tracker_order: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calorie_goal?: number | null
          carbs_goal?: number | null
          created_at?: string
          enabled_trackers?: Json | null
          fat_goal?: number | null
          fiber_goal?: number | null
          group_id?: string | null
          id?: string
          protein_goal?: number
          show_calories?: boolean
          tracker_order?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calorie_goal?: number | null
          carbs_goal?: number | null
          created_at?: string
          enabled_trackers?: Json | null
          fat_goal?: number | null
          fiber_goal?: number | null
          group_id?: string | null
          id?: string
          protein_goal?: number
          show_calories?: boolean
          tracker_order?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_goals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_preferences: {
        Row: {
          category: string
          created_at: string | null
          id: string
          preferences: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          preferences?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          preferences?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          calendar_token: string | null
          created_at: string
          display_name: string
          email: string | null
          home_quick_access_position: string | null
          id: string
          invite_code: string | null
          join_type: string | null
          onboarding_completed: boolean | null
          partner_id: string | null
          referral_code: string | null
          referred_by: string | null
          selected_interests: string[] | null
          timezone: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          calendar_token?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          home_quick_access_position?: string | null
          id: string
          invite_code?: string | null
          join_type?: string | null
          onboarding_completed?: boolean | null
          partner_id?: string | null
          referral_code?: string | null
          referred_by?: string | null
          selected_interests?: string[] | null
          timezone?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          calendar_token?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          home_quick_access_position?: string | null
          id?: string
          invite_code?: string | null
          join_type?: string | null
          onboarding_completed?: boolean | null
          partner_id?: string | null
          referral_code?: string | null
          referred_by?: string | null
          selected_interests?: string[] | null
          timezone?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string | null
          id: string
          premium_granted: boolean | null
          referred_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          premium_granted?: boolean | null
          referred_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          premium_granted?: boolean | null
          referred_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      shopping_list_items: {
        Row: {
          assignee_user_ids: string[]
          checked: boolean
          created_at: string
          id: string
          list_id: string
          meal_name: string | null
          name: string
          user_id: string
        }
        Insert: {
          assignee_user_ids?: string[]
          checked?: boolean
          created_at?: string
          id?: string
          list_id: string
          meal_name?: string | null
          name: string
          user_id: string
        }
        Update: {
          assignee_user_ids?: string[]
          checked?: boolean
          created_at?: string
          id?: string
          list_id?: string
          meal_name?: string | null
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string
          date_range_end: string | null
          date_range_start: string | null
          group_id: string | null
          id: string
          is_meal_plan: boolean
          label: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          group_id?: string | null
          id?: string
          is_meal_plan?: boolean
          label?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          group_id?: string | null
          id?: string
          is_meal_plan?: boolean
          label?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sobriety_categories: {
        Row: {
          created_at: string
          group_id: string | null
          icon: string
          id: string
          label: string
          money_per_day: number | null
          shared_group_ids: string[]
          start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          icon?: string
          id?: string
          label: string
          money_per_day?: number | null
          shared_group_ids?: string[]
          start_date?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          icon?: string
          id?: string
          label?: string
          money_per_day?: number | null
          shared_group_ids?: string[]
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sobriety_categories_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sobriety_checkins: {
        Row: {
          category_id: string
          check_date: string
          created_at: string
          id: string
          note: string | null
          stayed_on_track: boolean
          user_id: string
        }
        Insert: {
          category_id: string
          check_date: string
          created_at?: string
          id?: string
          note?: string | null
          stayed_on_track?: boolean
          user_id: string
        }
        Update: {
          category_id?: string
          check_date?: string
          created_at?: string
          id?: string
          note?: string | null
          stayed_on_track?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sobriety_checkins_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "sobriety_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      special_days: {
        Row: {
          category: string
          context_group_id: string | null
          count_direction: string
          created_at: string
          display_mode: string
          event_date: string
          event_type: string
          group_id: string | null
          icon: string
          id: string
          inclusive_count: boolean
          is_featured: boolean
          notes: string | null
          photo_url: string | null
          reminder_minutes: number | null
          repeats_yearly: boolean
          shared_group_ids: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          context_group_id?: string | null
          count_direction?: string
          created_at?: string
          display_mode?: string
          event_date: string
          event_type?: string
          group_id?: string | null
          icon?: string
          id?: string
          inclusive_count?: boolean
          is_featured?: boolean
          notes?: string | null
          photo_url?: string | null
          reminder_minutes?: number | null
          repeats_yearly?: boolean
          shared_group_ids?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          context_group_id?: string | null
          count_direction?: string
          created_at?: string
          display_mode?: string
          event_date?: string
          event_type?: string
          group_id?: string | null
          icon?: string
          id?: string
          inclusive_count?: boolean
          is_featured?: boolean
          notes?: string | null
          photo_url?: string | null
          reminder_minutes?: number | null
          repeats_yearly?: boolean
          shared_group_ids?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_days_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          created_at: string
          duration_seconds: number
          ended_at: string | null
          group_id: string | null
          id: string
          is_active: boolean
          started_at: string
          subject: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          ended_at?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          started_at?: string
          subject?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          ended_at?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          started_at?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          done: boolean
          due_date: string | null
          group_id: string | null
          hidden_from_partner: boolean
          id: string
          prior_notice_days: number
          scheduled_day: number | null
          scheduled_month: number | null
          scheduled_year: number | null
          tag: string
          time: string
          title: string
          updated_at: string
          user_id: string
          visibility: string | null
        }
        Insert: {
          assignee?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          done?: boolean
          due_date?: string | null
          group_id?: string | null
          hidden_from_partner?: boolean
          id?: string
          prior_notice_days?: number
          scheduled_day?: number | null
          scheduled_month?: number | null
          scheduled_year?: number | null
          tag?: string
          time?: string
          title: string
          updated_at?: string
          user_id: string
          visibility?: string | null
        }
        Update: {
          assignee?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          done?: boolean
          due_date?: string | null
          group_id?: string | null
          hidden_from_partner?: boolean
          id?: string
          prior_notice_days?: number
          scheduled_day?: number | null
          scheduled_month?: number | null
          scheduled_year?: number | null
          tag?: string
          time?: string
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      water_tracking: {
        Row: {
          date: string
          goal: number
          id: string
          intake: number
          user_id: string
        }
        Insert: {
          date?: string
          goal?: number
          id?: string
          intake?: number
          user_id: string
        }
        Update: {
          date?: string
          goal?: number
          id?: string
          intake?: number
          user_id?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          cadence_avg: number | null
          cal: number
          completed_date: string | null
          completion_photo_url: string | null
          completion_source: string | null
          created_at: string
          distance: number
          distance_unit: string
          done: boolean
          duration: string
          elevation_gain: number | null
          emoji: string
          end_time: string | null
          exercises: Json | null
          external_id: string | null
          group_id: string | null
          heart_rate_avg: number | null
          hidden_from_partner: boolean
          id: string
          imported_at: string | null
          linked_workout_id: string | null
          matched_planned_workout_id: string | null
          needs_review: boolean
          normalized_type: string | null
          origin_type: string
          pace_avg: string | null
          route_data: Json | null
          scheduled_date: string | null
          source_app: string | null
          source_device: string | null
          speed_avg: number | null
          start_time: string | null
          tag: string
          title: string
          user_id: string
        }
        Insert: {
          cadence_avg?: number | null
          cal?: number
          completed_date?: string | null
          completion_photo_url?: string | null
          completion_source?: string | null
          created_at?: string
          distance?: number
          distance_unit?: string
          done?: boolean
          duration?: string
          elevation_gain?: number | null
          emoji?: string
          end_time?: string | null
          exercises?: Json | null
          external_id?: string | null
          group_id?: string | null
          heart_rate_avg?: number | null
          hidden_from_partner?: boolean
          id?: string
          imported_at?: string | null
          linked_workout_id?: string | null
          matched_planned_workout_id?: string | null
          needs_review?: boolean
          normalized_type?: string | null
          origin_type?: string
          pace_avg?: string | null
          route_data?: Json | null
          scheduled_date?: string | null
          source_app?: string | null
          source_device?: string | null
          speed_avg?: number | null
          start_time?: string | null
          tag?: string
          title: string
          user_id: string
        }
        Update: {
          cadence_avg?: number | null
          cal?: number
          completed_date?: string | null
          completion_photo_url?: string | null
          completion_source?: string | null
          created_at?: string
          distance?: number
          distance_unit?: string
          done?: boolean
          duration?: string
          elevation_gain?: number | null
          emoji?: string
          end_time?: string | null
          exercises?: Json | null
          external_id?: string | null
          group_id?: string | null
          heart_rate_avg?: number | null
          hidden_from_partner?: boolean
          id?: string
          imported_at?: string | null
          linked_workout_id?: string | null
          matched_planned_workout_id?: string | null
          needs_review?: boolean
          normalized_type?: string | null
          origin_type?: string
          pace_avg?: string | null
          route_data?: Json | null
          scheduled_date?: string | null
          source_app?: string | null
          source_device?: string | null
          speed_avg?: number | null
          start_time?: string | null
          tag?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_group_invite: { Args: { _group_id: string }; Returns: Json }
      can_user_toggle_assigned_item: {
        Args: { _assignee: string; _group_id: string; _owner_user_id: string }
        Returns: boolean
      }
      check_username_available: {
        Args: { _username: string }
        Returns: boolean
      }
      connect_partner: { Args: { code: string }; Returns: Json }
      create_group:
        | {
            Args: { _emoji?: string; _name: string; _type?: string }
            Returns: Json
          }
        | {
            Args: {
              _emoji?: string
              _name: string
              _shared_pages?: string[]
              _type?: string
            }
            Returns: Json
          }
        | {
            Args: {
              _category?: string
              _emoji?: string
              _name: string
              _shared_pages?: string[]
              _type?: string
            }
            Returns: Json
          }
      create_shared_habit: {
        Args: { _category: string; _label: string }
        Returns: Json
      }
      create_shared_section: {
        Args: {
          _group_id?: string
          _icon?: string
          _key: string
          _label: string
        }
        Returns: Json
      }
      decline_group_invite: { Args: { _group_id: string }; Returns: Json }
      delete_group: { Args: { _group_id: string }; Returns: Json }
      disconnect_partner: { Args: never; Returns: Json }
      get_partner_id: { Args: { _user_id: string }; Returns: string }
      get_profiles_by_ids: {
        Args: { _user_ids: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          email: string
          id: string
          invite_code: string
          username: string
        }[]
      }
      invite_to_group: {
        Args: { _group_id: string; _user_id: string }
        Returns: Json
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_member_raw: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_pending_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      join_group: { Args: { _code: string }; Returns: Json }
      leave_group: { Args: { _group_id: string }; Returns: Json }
      migrate_group_items: {
        Args: {
          _copy_events?: boolean
          _copy_habits?: boolean
          _copy_tasks?: boolean
          _copy_workouts?: boolean
          _source_group_id: string
          _target_group_id: string
        }
        Returns: Json
      }
      search_users_by_identifier: {
        Args: { _identifier: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          invite_code: string
        }[]
      }
      set_member_role: {
        Args: { _group_id: string; _new_role: string; _target_user_id: string }
        Returns: Json
      }
      toggle_event_completion: {
        Args: { _completed: boolean; _event_id: string }
        Returns: {
          all_day: boolean
          assignee: string
          assignee_user_ids: string[] | null
          calendar_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          day: number
          description: string | null
          done: boolean
          end_day: number | null
          end_month: number | null
          end_time: string
          end_year: number | null
          group_id: string | null
          hidden_from_partner: boolean
          id: string
          location: string | null
          month: number
          notification_minutes: number | null
          repeat_rule: Json | null
          time: string
          title: string
          updated_at: string
          user_id: string
          visibility: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      toggle_task_completion: {
        Args: { _completed: boolean; _task_id: string }
        Returns: {
          assignee: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          done: boolean
          due_date: string | null
          group_id: string | null
          hidden_from_partner: boolean
          id: string
          prior_notice_days: number
          scheduled_day: number | null
          scheduled_month: number | null
          scheduled_year: number | null
          tag: string
          time: string
          title: string
          updated_at: string
          user_id: string
          visibility: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transfer_group_admin: {
        Args: { _group_id: string; _new_admin_user_id: string }
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
    Enums: {},
  },
} as const
