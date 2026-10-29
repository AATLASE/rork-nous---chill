// Generated from the database schema: do not edit. Regenerate with `npm run gen:types`
// (local Supabase running, see supabase/seed.sql). lib/types.ts holds the app-level types.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "app_settings": {
                  Row: {
                    "key": string,"updated_at": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": string
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"created_at": string,"id": string,"metadata": Json | null,"space_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"id"?: string,"metadata"?: Json | null,"space_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"id"?: string,"metadata"?: Json | null,"space_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_logs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comment_reactions": {
                  Row: {
                    "comment_id": string,"created_at": string,"emoji": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment_id": string,"created_at"?: string,"emoji": string,"user_id": string
                  }
                  Update: {
                    "comment_id"?: string,"created_at"?: string,"emoji"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comment_reactions_comment_id_fkey"
      columns: ["comment_id"]
isOneToOne: false
      referencedRelation: "episode_comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comment_reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_prompt_log": {
                  Row: {
                    "created_at": string,"prompt_date": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"prompt_date": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"prompt_date"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"episode_comments": {
                  Row: {
                    "author_id": string,"author_name": string,"body": string,"created_at": string,"episode_id": string,"id": string,"mentions": (string)[],"parent_id": string | null,"space_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"author_name": string,"body": string,"created_at"?: string,"episode_id": string,"id"?: string,"mentions"?: (string)[],"parent_id"?: string | null,"space_id": string
                  }
                  Update: {
                    "author_id"?: string,"author_name"?: string,"body"?: string,"created_at"?: string,"episode_id"?: string,"id"?: string,"mentions"?: (string)[],"parent_id"?: string | null,"space_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "episode_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "episode_comments_episode_id_fkey"
      columns: ["episode_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "episode_comments_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "episode_comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "episode_comments_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"episode_likes": {
                  Row: {
                    "created_at": string,"episode_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"episode_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"episode_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "episode_likes_episode_id_fkey"
      columns: ["episode_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "episode_likes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"episode_media": {
                  Row: {
                    "content_type": string | null,"created_at": string,"episode_id": string,"filename": string,"id": string,"size": number | null,"space_id": string,"type": string,"uploaded_by": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_type"?: string | null,"created_at"?: string,"episode_id": string,"filename": string,"id"?: string,"size"?: number | null,"space_id": string,"type": string,"uploaded_by": string,"url": string
                  }
                  Update: {
                    "content_type"?: string | null,"created_at"?: string,"episode_id"?: string,"filename"?: string,"id"?: string,"size"?: number | null,"space_id"?: string,"type"?: string,"uploaded_by"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "episode_media_episode_id_fkey"
      columns: ["episode_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "episode_media_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "episode_media_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"episodes": {
                  Row: {
                    "cover_url": string | null,"created_at": string,"created_by": string,"date": string,"duration": string | null,"id": string,"music_url": string | null,"notes": string | null,"number": number,"place": string,"reviews_revealed_at": string | null,"space_id": string,"tags": (string)[] | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cover_url"?: string | null,"created_at"?: string,"created_by": string,"date": string,"duration"?: string | null,"id"?: string,"music_url"?: string | null,"notes"?: string | null,"number": number,"place": string,"reviews_revealed_at"?: string | null,"space_id": string,"tags"?: (string)[] | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "cover_url"?: string | null,"created_at"?: string,"created_by"?: string,"date"?: string,"duration"?: string | null,"id"?: string,"music_url"?: string | null,"notes"?: string | null,"number"?: number,"place"?: string,"reviews_revealed_at"?: string | null,"space_id"?: string,"tags"?: (string)[] | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "episodes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "episodes_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"idea_votes": {
                  Row: {
                    "idea_id": string,"kind": string,"user_id": string,"voted_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "idea_id": string,"kind": string,"user_id": string,"voted_at"?: string
                  }
                  Update: {
                    "idea_id"?: string,"kind"?: string,"user_id"?: string,"voted_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "idea_votes_idea_id_fkey"
      columns: ["idea_id"]
isOneToOne: false
      referencedRelation: "ideas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "idea_votes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ideas": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"proposed_by": string,"space_id": string,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"proposed_by": string,"space_id": string,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"proposed_by"?: string,"space_id"?: string,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ideas_proposed_by_fkey"
      columns: ["proposed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ideas_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"invite_codes": {
                  Row: {
                    "code": string,"created_at": string,"created_by": string,"expires_at": string | null,"id": string,"max_uses": number | null,"role": string,"space_id": string,"use_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"created_by": string,"expires_at"?: string | null,"id"?: string,"max_uses"?: number | null,"role": string,"space_id": string,"use_count"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"created_by"?: string,"expires_at"?: string | null,"id"?: string,"max_uses"?: number | null,"role"?: string,"space_id"?: string,"use_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invite_codes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invite_codes_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"read_at": string | null,"space_id": string | null,"title": string,"url": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"read_at"?: string | null,"space_id"?: string | null,"title": string,"url"?: string | null,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"read_at"?: string | null,"space_id"?: string | null,"title"?: string,"url"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"created_at": string,"daily_prompt_enabled": boolean,"id": string,"invite_code": string | null,"name": string,"role": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"daily_prompt_enabled"?: boolean,"id": string,"invite_code"?: string | null,"name": string,"role"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"daily_prompt_enabled"?: boolean,"id"?: string,"invite_code"?: string | null,"name"?: string,"role"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"review_reminder_log": {
                  Row: {
                    "episode_id": string,"reminder_no": number,"sent_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "episode_id": string,"reminder_no": number,"sent_at"?: string,"user_id": string
                  }
                  Update: {
                    "episode_id"?: string,"reminder_no"?: number,"sent_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_reminder_log_episode_id_fkey"
      columns: ["episode_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "author_id": string,"author_name": string,"awkward_moment": string | null,"created_at": string,"episode_id": string,"favorite_moment": string | null,"funny_quote": string | null,"id": string,"rating": number,"song": string | null,"space_id": string,"summary": string | null,"updated_at": string,"would_redo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"author_name": string,"awkward_moment"?: string | null,"created_at"?: string,"episode_id": string,"favorite_moment"?: string | null,"funny_quote"?: string | null,"id"?: string,"rating": number,"song"?: string | null,"space_id": string,"summary"?: string | null,"updated_at"?: string,"would_redo"?: string | null
                  }
                  Update: {
                    "author_id"?: string,"author_name"?: string,"awkward_moment"?: string | null,"created_at"?: string,"episode_id"?: string,"favorite_moment"?: string | null,"funny_quote"?: string | null,"id"?: string,"rating"?: number,"song"?: string | null,"space_id"?: string,"summary"?: string | null,"updated_at"?: string,"would_redo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_episode_id_fkey"
      columns: ["episode_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"space_members": {
                  Row: {
                    "can_create_episodes": boolean,"invited_by": string | null,"joined_at": string,"role": string,"space_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_create_episodes"?: boolean,"invited_by"?: string | null,"joined_at"?: string,"role": string,"space_id": string,"user_id": string
                  }
                  Update: {
                    "can_create_episodes"?: boolean,"invited_by"?: string | null,"joined_at"?: string,"role"?: string,"space_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "space_members_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "space_members_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "space_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"spaces": {
                  Row: {
                    "cover_url": string | null,"created_at": string,"created_by": string,"description": string | null,"id": string,"name": string,"season_end": string | null,"season_start": string | null,"season_unlocked": boolean,"slug": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cover_url"?: string | null,"created_at"?: string,"created_by": string,"description"?: string | null,"id"?: string,"name": string,"season_end"?: string | null,"season_start"?: string | null,"season_unlocked"?: boolean,"slug": string,"type"?: string,"updated_at"?: string
                  }
                  Update: {
                    "cover_url"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string | null,"id"?: string,"name"?: string,"season_end"?: string | null,"season_start"?: string | null,"season_unlocked"?: boolean,"slug"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "spaces_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"synthese": {
                  Row: {
                    "avg_rating": number | null,"best_episode_id": string | null,"body_md": string | null,"generated_at": string | null,"id": string,"space_id": string,"video_generated_at": string | null,"video_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_rating"?: number | null,"best_episode_id"?: string | null,"body_md"?: string | null,"generated_at"?: string | null,"id"?: string,"space_id": string,"video_generated_at"?: string | null,"video_url"?: string | null
                  }
                  Update: {
                    "avg_rating"?: number | null,"best_episode_id"?: string | null,"body_md"?: string | null,"generated_at"?: string | null,"id"?: string,"space_id"?: string,"video_generated_at"?: string | null,"video_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "synthese_best_episode_id_fkey"
      columns: ["best_episode_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "synthese_space_id_fkey"
      columns: ["space_id"]
isOneToOne: true
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"vote_ballots": {
                  Row: {
                    "question_id": string,"voted_at": string,"voter_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "question_id": string,"voted_at"?: string,"voter_id": string
                  }
                  Update: {
                    "question_id"?: string,"voted_at"?: string,"voter_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vote_ballots_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "vote_questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vote_ballots_voter_id_fkey"
      columns: ["voter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"vote_questions": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string,"id": string,"options": NonNullable<Json>,"question": string,"space_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by": string,"id"?: string,"options"?: NonNullable<Json>,"question": string,"space_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string,"id"?: string,"options"?: NonNullable<Json>,"question"?: string,"space_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vote_questions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vote_questions_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"vote_results": {
                  Row: {
                    "count": number,"id": string,"option": string,"question_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"id"?: string,"option": string,"question_id": string
                  }
                  Update: {
                    "count"?: number,"id"?: string,"option"?: string,"question_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vote_results_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "vote_questions"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "app_setting":
{ Args: { "p_key": string }; Returns: string
                           },
"app_setting_int":
{ Args: { "p_default": number,"p_key": string,"p_max": number,"p_min": number }; Returns: number
                           },
"become_aventurier":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"can_review_in_space":
{ Args: { "p_space_id": string }; Returns: boolean
                           },
"cast_vote":
{ Args: { "p_option": string,"p_question_id": string }; Returns: undefined
                           },
"create_space":
{ Args: { "p_cover_url"?: string,"p_description"?: string,"p_name": string,"p_season_end"?: string,"p_season_start"?: string,"p_type"?: string }; Returns: string
                           },
"display_name":
{ Args: { "p_user_id": string }; Returns: string
                           },
"episode_is_revealed":
{ Args: { "p_episode_id": string }; Returns: boolean
                           },
"episode_review_authors":
{ Args: { "p_episode_id": string }; Returns: {
              "author_id": string,"submitted_at": string
            }[]
                           },
"episode_reviews_visible":
{ Args: { "p_episode_id": string }; Returns: boolean
                           },
"episode_space_id":
{ Args: { "p_episode_id": string }; Returns: string
                           },
"is_space_member":
{ Args: { "p_space_id": string }; Returns: boolean
                           },
"is_space_owner":
{ Args: { "p_space_id": string }; Returns: boolean
                           },
"join_space":
{ Args: { "p_code": string }; Returns: Json
                           },
"join_space_with_code":
{ Args: { "p_code": string }; Returns: {
              "already_member": boolean,"role": string,"space_id": string
            }[]
                           },
"log_event":
{ Args: { "p_action": string,"p_metadata"?: Json,"p_space_id"?: string }; Returns: undefined
                           },
"mcp_execute_sql":
{ Args: { "query_params": Json,"query_text": string }; Returns: Json
                           },
"my_can_create_episodes":
{ Args: { "p_space_id": string }; Returns: boolean
                           },
"my_is_contributor":
{ Args: { "p_space_id": string }; Returns: boolean
                           },
"my_space_role":
{ Args: { "p_space_id": string }; Returns: string
                           },
"notification_timezone":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"notify_space":
{ Args: { "p_body"?: string,"p_space_id": string,"p_title": string,"p_url"?: string }; Returns: undefined
                           },
"notify_user":
{ Args: { "p_body": string,"p_space_id": string,"p_title": string,"p_url": string,"p_user_id": string }; Returns: undefined
                           },
"owns_space_media_path":
{ Args: { "p_name": string }; Returns: boolean
                           },
"random_invite_code":
{ Args: { "p_length"?: number }; Returns: string
                           },
"register_push_subscription":
{ Args: { "p_auth": string,"p_endpoint": string,"p_p256dh": string }; Returns: undefined
                           },
"reveal_episode_now":
{ Args: { "p_episode_id": string }; Returns: undefined
                           },
"reveal_episode_reviews_if_complete":
{ Args: { "p_episode_id": string }; Returns: undefined
                           },
"send_daily_story_prompt":
{ Args: { "p_force"?: boolean }; Returns: number
                           },
"send_review_reminders":
{ Args: { "p_force"?: boolean }; Returns: number
                           },
"set_member_episode_permission":
{ Args: { "p_can_create": boolean,"p_space_id": string,"p_user_id": string }; Returns: undefined
                           },
"space_observer_ids":
{ Args: { "p_space_id": string }; Returns: string[]
                           },
"space_participant_ids":
{ Args: { "p_space_id": string }; Returns: string[]
                           },
"use_invite_code":
{ Args: { "p_code": string }; Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
