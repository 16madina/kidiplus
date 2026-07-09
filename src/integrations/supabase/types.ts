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
      live_bids: {
        Row: {
          amount: number
          bidder_id: string
          bidder_name: string
          created_at: string
          id: string
          live_id: string
          product_id: string
        }
        Insert: {
          amount: number
          bidder_id: string
          bidder_name: string
          created_at?: string
          id?: string
          live_id: string
          product_id: string
        }
        Update: {
          amount?: number
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
          created_at: string
          final_price: number | null
          id: string
          image_url: string | null
          live_id: string
          mode: string
          name: string
          position: number
          price: number
          sold_to_identity: string | null
          start_price: number
          status: string
          stock: number
          timer_seconds: number
          updated_at: string
        }
        Insert: {
          auction_deadline_at?: string | null
          created_at?: string
          final_price?: number | null
          id?: string
          image_url?: string | null
          live_id: string
          mode: string
          name: string
          position?: number
          price?: number
          sold_to_identity?: string | null
          start_price?: number
          status?: string
          stock?: number
          timer_seconds?: number
          updated_at?: string
        }
        Update: {
          auction_deadline_at?: string | null
          created_at?: string
          final_price?: number | null
          id?: string
          image_url?: string | null
          live_id?: string
          mode?: string
          name?: string
          position?: number
          price?: number
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
          category: string | null
          cover_url: string | null
          currency: string
          ended_at: string | null
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
          category?: string | null
          cover_url?: string | null
          currency?: string
          ended_at?: string | null
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
          category?: string | null
          cover_url?: string | null
          currency?: string
          ended_at?: string | null
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
          bio: string | null
          country: string | null
          created_at: string
          currency: string
          display_name: string
          email: string
          handle: string
          id: string
          is_admin: boolean
          is_seller: boolean
          language: string
          moderation_status: string
          terms_accepted_at: string | null
          terms_version: string | null
        }
        Insert: {
          age_confirmed_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          display_name: string
          email: string
          handle: string
          id: string
          is_admin?: boolean
          is_seller?: boolean
          language?: string
          moderation_status?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
        }
        Update: {
          age_confirmed_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          display_name?: string
          email?: string
          handle?: string
          id?: string
          is_admin?: boolean
          is_seller?: boolean
          language?: string
          moderation_status?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
        }
        Relationships: []
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
          id: string
          order_id: string
          seller_id: string
          status: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          order_id: string
          seller_id: string
          status?: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          order_id?: string
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
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
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
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
      admin_refund_order: {
        Args: { _note?: string; _order_id: string }
        Returns: Json
      }
      admin_release_escrow: {
        Args: { _note?: string; _order_id: string }
        Returns: Json
      }
      admin_resolve_report: {
        Args: { _note?: string; _report_id: string; _status: string }
        Returns: Json
      }
      admin_revoke_sanction: { Args: { _sanction_id: string }; Returns: Json }
      admin_send_message: {
        Args: { _body: string; _title: string; _user_id: string }
        Returns: Json
      }
      admin_user_detail: { Args: { _user_id: string }; Returns: Json }
      anonymize_my_account: { Args: never; Returns: Json }
      assert_user_active: { Args: never; Returns: undefined }
      block_user: { Args: { _blocked_id: string }; Returns: Json }
      confirm_order_delivered: { Args: { _order_id: string }; Returns: Json }
      credit_seller_earning: { Args: { _order_id: string }; Returns: Json }
      credit_wallet_topup: {
        Args: { _amount: number; _payment_intent_id: string; _user_id: string }
        Returns: Json
      }
      current_moderation_status: { Args: { _user_id: string }; Returns: string }
      dispute_order: {
        Args: { _note?: string; _order_id: string; _reason?: string }
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
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_live_moderator: {
        Args: { _live_id: string; _user_id: string }
        Returns: boolean
      }
      list_my_admin_messages: { Args: { _limit?: number }; Returns: Json }
      list_my_blocks: { Args: never; Returns: Json }
      list_my_notifications: { Args: { _limit?: number }; Returns: Json }
      mark_admin_message_read: { Args: { _id: string }; Returns: Json }
      mark_all_notifications_read: { Args: never; Returns: Json }
      mark_notification_read: { Args: { _id: string }; Returns: Json }
      mark_order_shipped: { Args: { _order_id: string }; Returns: Json }
      my_moderation_state: { Args: never; Returns: Json }
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
          created_at: string
          final_price: number | null
          id: string
          image_url: string | null
          live_id: string
          mode: string
          name: string
          position: number
          price: number
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
      release_overdue_escrow: { Args: never; Returns: Json }
      request_payout: {
        Args: { _amount: number; _destination: Json; _method: string }
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
      unblock_user: { Args: { _blocked_id: string }; Returns: Json }
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
