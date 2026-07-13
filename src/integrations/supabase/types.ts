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
      addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          details: string | null
          full_name: string
          id: string
          is_default: boolean
          label: string
          phone: string
          street_address: string | null
          updated_at: string
          user_id: string
          zone_or_commune: string | null
        }
        Insert: {
          city?: string
          country?: string
          created_at?: string
          details?: string | null
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string
          phone: string
          street_address?: string | null
          updated_at?: string
          user_id: string
          zone_or_commune?: string | null
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          details?: string | null
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string
          phone?: string
          street_address?: string | null
          updated_at?: string
          user_id?: string
          zone_or_commune?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          sent_by: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          sent_by: string
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sent_by?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          followed_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_bids: {
        Row: {
          amount: number
          auction_round: number
          bidder_id: string
          bidder_name: string
          created_at: string
          id: string
          live_id: string
          product_id: string
        }
        Insert: {
          amount: number
          auction_round?: number
          bidder_id: string
          bidder_name: string
          created_at?: string
          id?: string
          live_id: string
          product_id: string
        }
        Update: {
          amount?: number
          auction_round?: number
          bidder_id?: string
          bidder_name?: string
          created_at?: string
          id?: string
          live_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_bids_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_bids_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_bids_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "live_products"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chat_mutes: {
        Row: {
          created_at: string
          live_id: string
          muted_by: string
          user_id: string
        }
        Insert: {
          created_at?: string
          live_id: string
          muted_by: string
          user_id: string
        }
        Update: {
          created_at?: string
          live_id?: string
          muted_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_chat_mutes_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
        ]
      }
      live_gifts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          debit_amount: number | null
          debit_currency: string | null
          gift_key: string
          id: string
          live_id: string
          platform_fee: number
          seller_id: string
          seller_net: number
          sender_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          debit_amount?: number | null
          debit_currency?: string | null
          gift_key: string
          id?: string
          live_id: string
          platform_fee?: number
          seller_id: string
          seller_net?: number
          sender_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          debit_amount?: number | null
          debit_currency?: string | null
          gift_key?: string
          id?: string
          live_id?: string
          platform_fee?: number
          seller_id?: string
          seller_net?: number
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_gifts_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_gifts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_gifts_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_interactions: {
        Row: {
          category: string | null
          created_at: string
          id: string
          kind: string
          live_id: string | null
          seller_id: string | null
          user_id: string
          weight: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          kind: string
          live_id?: string | null
          seller_id?: string | null
          user_id: string
          weight?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          kind?: string
          live_id?: string | null
          seller_id?: string | null
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_interactions_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
        ]
      }
      live_moderators: {
        Row: {
          added_by: string
          created_at: string
          live_id: string
          user_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          live_id: string
          user_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          live_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_moderators_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_moderators_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_moderators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_products: {
        Row: {
          auction_deadline_at: string | null
          auction_round: number
          created_at: string
          final_price: number | null
          id: string
          image_url: string | null
          live_id: string
          mode: string
          name: string
          position: number
          price: number
          shop_product_id: string | null
          sold_to_identity: string | null
          start_price: number
          status: string
          stock: number
          timer_seconds: number
          updated_at: string
        }
        Insert: {
          auction_deadline_at?: string | null
          auction_round?: number
          created_at?: string
          final_price?: number | null
          id?: string
          image_url?: string | null
          live_id: string
          mode: string
          name: string
          position?: number
          price?: number
          shop_product_id?: string | null
          sold_to_identity?: string | null
          start_price?: number
          status?: string
          stock?: number
          timer_seconds?: number
          updated_at?: string
        }
        Update: {
          auction_deadline_at?: string | null
          auction_round?: number
          created_at?: string
          final_price?: number | null
          id?: string
          image_url?: string | null
          live_id?: string
          mode?: string
          name?: string
          position?: number
          price?: number
          shop_product_id?: string | null
          sold_to_identity?: string | null
          start_price?: number
          status?: string
          stock?: number
          timer_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_products_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_products_shop_product_id_fkey"
            columns: ["shop_product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      live_reminders: {
        Row: {
          created_at: string
          live_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          live_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          live_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_reminders_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
        ]
      }
      lives: {
        Row: {
          abandon_push_sent_at: string | null
          category: string | null
          cover_url: string | null
          currency: string
          ended_at: string | null
          host_last_seen_at: string | null
          id: string
          room_name: string
          scheduled_at: string | null
          seller_id: string
          started_at: string | null
          status: string
          title: string
          viewer_count: number
        }
        Insert: {
          abandon_push_sent_at?: string | null
          category?: string | null
          cover_url?: string | null
          currency?: string
          ended_at?: string | null
          host_last_seen_at?: string | null
          id?: string
          room_name: string
          scheduled_at?: string | null
          seller_id: string
          started_at?: string | null
          status?: string
          title: string
          viewer_count?: number
        }
        Update: {
          abandon_push_sent_at?: string | null
          category?: string | null
          cover_url?: string | null
          currency?: string
          ended_at?: string | null
          host_last_seen_at?: string | null
          id?: string
          room_name?: string
          scheduled_at?: string | null
          seller_id?: string
          started_at?: string | null
          status?: string
          title?: string
          viewer_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "lives_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          kind: string
          order_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          kind: string
          order_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          kind?: string
          order_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          id: string
          meta: Json | null
          order_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          id?: string
          meta?: Json | null
          order_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          id?: string
          meta?: Json | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          address_snapshot: Json | null
          amount: number
          auction_round: number | null
          buyer_id: string
          cancelled_reason: string | null
          created_at: string
          currency: string
          delivered_confirmed_at: string | null
          delivery_fee: number
          delivery_mode: string | null
          delivery_zone: string | null
          fulfillment_status: string
          id: string
          item_image: string | null
          item_name: string
          kind: string
          live_id: string | null
          paid_at: string | null
          payment_deadline: string | null
          payment_method: string
          platform_fee: number
          processing_fee: number
          product_id: string | null
          refund_status: string | null
          seller_id: string
          seller_net: number
          shipped_at: string | null
          status: string
          stripe_payment_intent_id: string | null
          total: number
        }
        Insert: {
          address_id?: string | null
          address_snapshot?: Json | null
          amount: number
          auction_round?: number | null
          buyer_id: string
          cancelled_reason?: string | null
          created_at?: string
          currency?: string
          delivered_confirmed_at?: string | null
          delivery_fee?: number
          delivery_mode?: string | null
          delivery_zone?: string | null
          fulfillment_status?: string
          id?: string
          item_image?: string | null
          item_name: string
          kind: string
          live_id?: string | null
          paid_at?: string | null
          payment_deadline?: string | null
          payment_method?: string
          platform_fee?: number
          processing_fee?: number
          product_id?: string | null
          refund_status?: string | null
          seller_id: string
          seller_net?: number
          shipped_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          total: number
        }
        Update: {
          address_id?: string | null
          address_snapshot?: Json | null
          amount?: number
          auction_round?: number | null
          buyer_id?: string
          cancelled_reason?: string | null
          created_at?: string
          currency?: string
          delivered_confirmed_at?: string | null
          delivery_fee?: number
          delivery_mode?: string | null
          delivery_zone?: string | null
          fulfillment_status?: string
          id?: string
          item_image?: string | null
          item_name?: string
          kind?: string
          live_id?: string | null
          paid_at?: string | null
          payment_deadline?: string | null
          payment_method?: string
          platform_fee?: number
          processing_fee?: number
          product_id?: string | null
          refund_status?: string | null
          seller_id?: string
          seller_net?: number
          shipped_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "live_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          admin_note: string | null
          amount: number
          currency: string
          destination: Json
          id: string
          method: string
          note: string | null
          processed_at: string | null
          processed_by: string | null
          proof_url: string | null
          requested_at: string
          seller_id: string
          source: string
          status: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          currency: string
          destination: Json
          id?: string
          method: string
          note?: string | null
          processed_at?: string | null
          processed_by?: string | null
          proof_url?: string | null
          requested_at?: string
          seller_id: string
          source?: string
          status?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          currency?: string
          destination?: Json
          id?: string
          method?: string
          note?: string | null
          processed_at?: string | null
          processed_by?: string | null
          proof_url?: string | null
          requested_at?: string
          seller_id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_confirmed_at: string | null
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          currency: string
          display_name: string
          email: string
          followers_count: number
          following_count: number
          handle: string
          id: string
          is_admin: boolean
          is_referred: boolean
          is_seller: boolean
          is_verified: boolean
          language: string
          moderation_status: string
          rating_avg: number
          rating_count: number
          terms_accepted_at: string | null
          terms_version: string | null
          welcome_email_sent: boolean
        }
        Insert: {
          age_confirmed_at?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          display_name: string
          email: string
          followers_count?: number
          following_count?: number
          handle: string
          id: string
          is_admin?: boolean
          is_referred?: boolean
          is_seller?: boolean
          is_verified?: boolean
          language?: string
          moderation_status?: string
          rating_avg?: number
          rating_count?: number
          terms_accepted_at?: string | null
          terms_version?: string | null
          welcome_email_sent?: boolean
        }
        Update: {
          age_confirmed_at?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          display_name?: string
          email?: string
          followers_count?: number
          following_count?: number
          handle?: string
          id?: string
          is_admin?: boolean
          is_referred?: boolean
          is_seller?: boolean
          is_verified?: boolean
          language?: string
          moderation_status?: string
          rating_avg?: number
          rating_count?: number
          terms_accepted_at?: string | null
          terms_version?: string | null
          welcome_email_sent?: boolean
        }
        Relationships: []
      }
      promo_code_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          created_promo_code_id: string | null
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          created_promo_code_id?: string | null
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          created_promo_code_id?: string | null
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_requests_created_promo_code_id_fkey"
            columns: ["created_promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          active: boolean
          claim_token: string | null
          claimed_at: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          owner_id: string | null
          reward_quota: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          claim_token?: string | null
          claimed_at?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          owner_id?: string | null
          reward_quota?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          claim_token?: string | null
          claimed_at?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          owner_id?: string | null
          reward_quota?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_debug_logs: {
        Row: {
          created_at: string
          id: string
          message: string | null
          ok: boolean
          platform: string
          step: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          ok: boolean
          platform: string
          step: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          ok?: boolean
          platform?: string
          step?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_balances: {
        Row: {
          available: number
          currency: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          available?: number
          currency?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          available?: number
          currency?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_balances_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_earnings: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          order_id: string
          owner_id: string | null
          referred_user_id: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          id?: string
          order_id: string
          owner_id?: string | null
          referred_user_id: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          owner_id?: string | null
          referred_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          credits_remaining: number
          id: string
          owner_id: string | null
          promo_code_id: string
          referred_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_remaining?: number
          id?: string
          owner_id?: string | null
          promo_code_id: string
          referred_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_remaining?: number
          id?: string
          owner_id?: string | null
          promo_code_id?: string
          referred_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          id: string
          note: string | null
          reason: string
          reporter_id: string
          resolution_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          reason: string
          reporter_id: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          reason?: string
          reporter_id?: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_balances: {
        Row: {
          available: number
          currency: string
          pending: number
          seller_id: string
          updated_at: string
        }
        Insert: {
          available?: number
          currency?: string
          pending?: number
          seller_id: string
          updated_at?: string
        }
        Update: {
          available?: number
          currency?: string
          pending?: number
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_balances_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_delivery_settings: {
        Row: {
          flat_fee: number
          mode: string
          seller_id: string
          updated_at: string
          zones: Json
        }
        Insert: {
          flat_fee?: number
          mode?: string
          seller_id: string
          updated_at?: string
          zones?: Json
        }
        Update: {
          flat_fee?: number
          mode?: string
          seller_id?: string
          updated_at?: string
          zones?: Json
        }
        Relationships: [
          {
            foreignKeyName: "seller_delivery_settings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_earnings: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          gift_key: string | null
          id: string
          live_id: string | null
          order_id: string | null
          seller_id: string
          source: string
          status: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          gift_key?: string | null
          id?: string
          live_id?: string | null
          order_id?: string | null
          seller_id: string
          source?: string
          status?: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          gift_key?: string | null
          id?: string
          live_id?: string | null
          order_id?: string | null
          seller_id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_earnings_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_earnings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string
          rating: number
          reviewer_id: string
          seller_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          rating: number
          reviewer_id: string
          seller_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          rating?: number
          reviewer_id?: string
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_reviews_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_products: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          images: Json
          name: string
          price: number
          seller_id: string
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: Json
          name: string
          price: number
          seller_id: string
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: Json
          name?: string
          price?: number
          seller_id?: string
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_sanctions: {
        Row: {
          admin_note: string | null
          created_at: string
          expires_at: string | null
          id: string
          issued_by: string
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          type: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_by: string
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
          type: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_by?: string
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sanctions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          meta: Json | null
          order_id: string | null
          status: string
          stripe_payment_intent_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          meta?: Json | null
          order_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          meta?: Json | null
          order_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          currency: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          currency?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          currency?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      _assert_admin: { Args: never; Returns: undefined }
      _claim_and_backfill: {
        Args: { _owner: string; _promo_id: string }
        Returns: Json
      }
      _ensure_referral_balance: {
        Args: { _currency: string; _user: string }
        Returns: {
          available: number
          currency: string
          owner_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "referral_balances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _ensure_seller_balance: {
        Args: { _currency: string; _user_id: string }
        Returns: {
          available: number
          currency: string
          pending: number
          seller_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "seller_balances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _gen_claim_token: { Args: never; Returns: string }
      _gift_price: {
        Args: { _currency: string; _key: string }
        Returns: number
      }
      _log_order_event: {
        Args: {
          _actor: string
          _event: string
          _meta?: Json
          _order_id: string
        }
        Returns: undefined
      }
      _push_notification: {
        Args: {
          _body: string
          _data?: Json
          _kind: string
          _order_id?: string
          _title: string
          _user_id: string
        }
        Returns: undefined
      }
      _release_order_escrow: {
        Args: { _confirm: boolean; _order_id: string }
        Returns: Json
      }
      account_deletion_check: { Args: never; Returns: Json }
      admin_assign_promo_code: {
        Args: { _id: string; _owner_id: string }
        Returns: Json
      }
      admin_create_promo_code: {
        Args: { _code: string; _owner_id?: string; _reward_quota?: number }
        Returns: Json
      }
      admin_delete_promo_code: { Args: { _id: string }; Returns: Json }
      admin_end_live: { Args: { _live_id: string }; Returns: Json }
      admin_issue_sanction: {
        Args: {
          _expires_at?: string
          _note?: string
          _reason: string
          _type: string
          _user_id: string
        }
        Returns: Json
      }
      admin_list_lives: {
        Args: { _limit?: number; _status?: string }
        Returns: Json
      }
      admin_list_orders: {
        Args: { _limit?: number; _offset?: number; _status?: string }
        Returns: Json
      }
      admin_list_payouts: {
        Args: { _limit?: number; _status?: string }
        Returns: Json
      }
      admin_list_promo_code_requests: {
        Args: { _status?: string }
        Returns: Json
      }
      admin_list_promo_codes: { Args: never; Returns: Json }
      admin_list_reports: {
        Args: { _limit?: number; _status?: string }
        Returns: Json
      }
      admin_list_sanctions: { Args: { _user_id: string }; Returns: Json }
      admin_list_users: {
        Args: { _limit?: number; _offset?: number; _search?: string }
        Returns: Json
      }
      admin_overview_stats: { Args: never; Returns: Json }
      admin_process_payout: {
        Args: {
          _action: string
          _admin_note?: string
          _note?: string
          _payout_id: string
          _proof_url?: string
        }
        Returns: Json
      }
      admin_referral_code_details: {
        Args: { _promo_code_id: string }
        Returns: Json
      }
      admin_referral_reconciliation: { Args: never; Returns: Json }
      admin_refund_order: {
        Args: { _note?: string; _order_id: string }
        Returns: Json
      }
      admin_release_escrow: {
        Args: { _note?: string; _order_id: string }
        Returns: Json
      }
      admin_renew_promo_credits: {
        Args: { _amount?: number; _promo_code_id: string }
        Returns: Json
      }
      admin_resolve_report: {
        Args: { _note?: string; _report_id: string; _status: string }
        Returns: Json
      }
      admin_review_promo_code_request: {
        Args: {
          _action: string
          _code?: string
          _id: string
          _note?: string
          _reward_quota?: number
        }
        Returns: Json
      }
      admin_review_verification: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: Json
      }
      admin_revoke_sanction: { Args: { _sanction_id: string }; Returns: Json }
      admin_search_users_by_handle: {
        Args: { _limit?: number; _q: string }
        Returns: Json
      }
      admin_send_message: {
        Args: { _body: string; _title: string; _user_id: string }
        Returns: Json
      }
      admin_set_promo_code_active: {
        Args: { _active: boolean; _id: string }
        Returns: Json
      }
      admin_set_verified: {
        Args: { _user: string; _verified: boolean }
        Returns: Json
      }
      admin_user_detail: { Args: { _user_id: string }; Returns: Json }
      anonymize_my_account: { Args: never; Returns: Json }
      apply_promo_code: { Args: { _code: string }; Returns: Json }
      assert_user_active: { Args: never; Returns: undefined }
      block_user: { Args: { _blocked_id: string }; Returns: Json }
      claim_promo_code: { Args: { _token: string }; Returns: Json }
      confirm_order_delivered: { Args: { _order_id: string }; Returns: Json }
      convert_money: {
        Args: { _amount: number; _from: string; _to: string }
        Returns: number
      }
      credit_referral_for_order: { Args: { _order_id: string }; Returns: Json }
      credit_seller_earning: { Args: { _order_id: string }; Returns: Json }
      credit_wallet_topup: {
        Args: { _amount: number; _payment_intent_id: string; _user_id: string }
        Returns: Json
      }
      current_moderation_status: { Args: { _user_id: string }; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dispute_order: {
        Args: { _note?: string; _order_id: string; _reason?: string }
        Returns: Json
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_abandoned_lives: {
        Args: { _max_age_minutes?: number; _seller_id?: string }
        Returns: Json
      }
      expire_overdue_orders: { Args: never; Returns: Json }
      finalize_auction_winner: {
        Args: {
          _final_price: number
          _live_id: string
          _product_id: string
          _winner_id: string
          _winner_name: string
        }
        Returns: Json
      }
      fx_rate: { Args: { _from: string; _to: string }; Returns: number }
      get_my_email: { Args: never; Returns: string }
      get_seller_delivery_settings: {
        Args: { _seller_id: string }
        Returns: {
          flat_fee: number
          mode: string
          seller_id: string
          updated_at: string
          zones: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "seller_delivery_settings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_live_moderator: {
        Args: { _live_id: string; _user_id: string }
        Returns: boolean
      }
      leave_review: {
        Args: { _comment?: string; _order_id: string; _rating: number }
        Returns: Json
      }
      list_my_admin_messages: { Args: { _limit?: number }; Returns: Json }
      list_my_blocks: { Args: never; Returns: Json }
      list_my_notifications: { Args: { _limit?: number }; Returns: Json }
      mark_admin_message_read: { Args: { _id: string }; Returns: Json }
      mark_all_notifications_read: { Args: never; Returns: Json }
      mark_notification_read: { Args: { _id: string }; Returns: Json }
      mark_order_shipped: { Args: { _order_id: string }; Returns: Json }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_moderation_state: { Args: never; Returns: Json }
      my_promo_code_request: { Args: never; Returns: Json }
      my_promo_codes: { Args: never; Returns: Json }
      my_referral_earnings: { Args: { _limit?: number }; Returns: Json }
      notify_absent_host_lives: {
        Args: { _max_age_minutes?: number; _warn_after_minutes?: number }
        Returns: Json
      }
      notify_live_reminders: { Args: { _live_id: string }; Returns: number }
      pay_order_with_wallet: { Args: { _order_id: string }; Returns: Json }
      place_live_bid: {
        Args: {
          _amount?: number
          _bidder_name: string
          _live_id: string
          _product_id: string
        }
        Returns: Json
      }
      purchase_fixed_price: {
        Args: { _buyer_identity: string; _product_id: string }
        Returns: {
          auction_deadline_at: string | null
          auction_round: number
          created_at: string
          final_price: number | null
          id: string
          image_url: string | null
          live_id: string
          mode: string
          name: string
          position: number
          price: number
          shop_product_id: string | null
          sold_to_identity: string | null
          start_price: number
          status: string
          stock: number
          timer_seconds: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "live_products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      relaunch_unsold_product: { Args: { _product_id: string }; Returns: Json }
      release_overdue_escrow: { Args: never; Returns: Json }
      request_payout: {
        Args: {
          _amount: number
          _destination: Json
          _method: string
          _source?: string
        }
        Returns: Json
      }
      request_promo_code: { Args: { _message?: string }; Returns: Json }
      request_verification: { Args: { _message?: string }; Returns: Json }
      reverse_referral_for_order: { Args: { _order_id: string }; Returns: Json }
      send_gift: {
        Args: { _gift_key: string; _live_id: string }
        Returns: Json
      }
      start_auction: { Args: { _product_id: string }; Returns: Json }
      submit_report: {
        Args: {
          _note?: string
          _reason: string
          _target_id: string
          _target_type: string
        }
        Returns: Json
      }
      sync_my_wallet_currency: { Args: never; Returns: Json }
      touch_live_host: { Args: { _live_id: string }; Returns: Json }
      unblock_user: { Args: { _blocked_id: string }; Returns: Json }
      validate_promo_code: { Args: { _code: string }; Returns: Json }
      verification_eligibility: { Args: { _user: string }; Returns: Json }
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
