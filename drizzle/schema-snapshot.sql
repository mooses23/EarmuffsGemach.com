-- AUTO-GENERATED schema snapshot. Do not edit by hand.
-- Source: pg_dump --schema-only --no-owner --no-privileges --no-comments
-- Regenerate with: node scripts/schema-snapshot.mjs --write
-- Verify with:    node scripts/schema-snapshot.mjs --check
-- See scripts/schema-snapshot.mjs (Task #177) for what this captures.

-- PostgreSQL database dump

-- Name: public; Type: SCHEMA; Schema: -; Owner: -

CREATE SCHEMA public;

-- Name: application_status_changes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.application_status_changes (
    id integer NOT NULL,
    application_id integer NOT NULL,
    previous_status text NOT NULL,
    new_status text NOT NULL,
    source text NOT NULL,
    changed_by_user_id integer,
    changed_by_username text,
    changed_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: application_status_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.application_status_changes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: application_status_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.application_status_changes_id_seq OWNED BY public.application_status_changes.id;

-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    actor_user_id integer,
    actor_type text DEFAULT 'user'::text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id integer NOT NULL,
    before_json text,
    after_json text,
    metadata text,
    ip_address text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;

-- Name: city_categories; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.city_categories (
    id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    region_id integer NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_popular boolean DEFAULT false,
    description text,
    state_code text,
    name_he text,
    description_he text,
    district_code text
);

-- Name: city_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.city_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: city_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.city_categories_id_seq OWNED BY public.city_categories.id;

-- Name: contacts; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.contacts (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    submitted_at timestamp without time zone DEFAULT now() NOT NULL,
    is_read boolean DEFAULT false,
    is_archived boolean DEFAULT false NOT NULL,
    is_spam boolean DEFAULT false NOT NULL
);

-- Name: contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.contacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.contacts_id_seq OWNED BY public.contacts.id;

-- Name: disputes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.disputes (
    id integer NOT NULL,
    location_id integer,
    transaction_id integer,
    stripe_dispute_id text NOT NULL,
    stripe_charge_id text NOT NULL,
    stripe_payment_intent_id text,
    amount_cents integer NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    status text NOT NULL,
    reason text NOT NULL,
    evidence_due_by timestamp without time zone,
    raw_payload_json text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: disputes_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.disputes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: disputes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.disputes_id_seq OWNED BY public.disputes.id;

-- Name: faq_entries; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.faq_entries (
    id integer NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: faq_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.faq_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: faq_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.faq_entries_id_seq OWNED BY public.faq_entries.id;

-- Name: gemach_applications; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.gemach_applications (
    id integer NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    street_address text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    zip_code text NOT NULL,
    country text NOT NULL,
    community text,
    message text,
    status text DEFAULT 'pending'::text NOT NULL,
    submitted_at timestamp without time zone DEFAULT now() NOT NULL,
    confirmation_email_sent_at timestamp without time zone,
    submitted_lang text,
    suggested_region_id integer,
    suggested_city_category_id integer
);

-- Name: gemach_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.gemach_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: gemach_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.gemach_applications_id_seq OWNED BY public.gemach_applications.id;

-- Name: global_settings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.global_settings (
    id integer NOT NULL,
    key text NOT NULL,
    value text,
    is_enabled boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT now()
);

-- Name: global_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.global_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: global_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.global_settings_id_seq OWNED BY public.global_settings.id;

-- Name: inventory; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.inventory (
    id integer NOT NULL,
    location_id integer NOT NULL,
    color text NOT NULL,
    quantity integer DEFAULT 0 NOT NULL
);

-- Name: inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.inventory_id_seq OWNED BY public.inventory.id;

-- Name: invite_codes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.invite_codes (
    id integer NOT NULL,
    code text NOT NULL,
    location_id integer NOT NULL,
    application_id integer,
    is_used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    used_at timestamp without time zone,
    used_by_user_id integer
);

-- Name: invite_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.invite_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: invite_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.invite_codes_id_seq OWNED BY public.invite_codes.id;

-- Name: kb_embeddings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.kb_embeddings (
    id integer NOT NULL,
    source_kind text NOT NULL,
    source_id integer NOT NULL,
    chunk_idx integer DEFAULT 0 NOT NULL,
    content text NOT NULL,
    embedding jsonb NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: kb_embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.kb_embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: kb_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.kb_embeddings_id_seq OWNED BY public.kb_embeddings.id;

-- Name: knowledge_docs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.knowledge_docs (
    id integer NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: knowledge_docs_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.knowledge_docs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: knowledge_docs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.knowledge_docs_id_seq OWNED BY public.knowledge_docs.id;

-- Name: locations; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.locations (
    id integer NOT NULL,
    name text NOT NULL,
    location_code text NOT NULL,
    contact_person text NOT NULL,
    address text NOT NULL,
    zip_code text,
    phone text NOT NULL,
    email text NOT NULL,
    region_id integer NOT NULL,
    city_category_id integer,
    is_active boolean DEFAULT true,
    cash_only boolean DEFAULT false,
    deposit_amount integer DEFAULT 20,
    payment_methods text[] DEFAULT '{cash}'::text[],
    processing_fee_percent integer DEFAULT 300,
    operator_pin text,
    name_he text,
    contact_person_he text,
    address_he text,
    claim_token text,
    claim_token_created_at timestamp without time zone,
    welcome_sent_at timestamp without time zone,
    welcome_sms_status text,
    welcome_sms_error text,
    welcome_sms_sent_at timestamp without time zone,
    welcome_whatsapp_status text,
    welcome_whatsapp_error text,
    welcome_whatsapp_sent_at timestamp without time zone,
    default_welcome_channel text,
    contact_preference text,
    contact_preference_set_at timestamp without time zone,
    onboarded_at timestamp without time zone,
    welcome_sms_sid text,
    welcome_sms_delivered_at timestamp without time zone,
    welcome_whatsapp_sid text,
    welcome_whatsapp_delivered_at timestamp without time zone,
    processing_fee_fixed integer DEFAULT 30,
    welcome_email_status text,
    welcome_email_error text,
    welcome_email_sent_at timestamp without time zone,
    latitude double precision,
    longitude double precision,
    geocoded_at timestamp without time zone
);

-- Name: locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.locations_id_seq OWNED BY public.locations.id;

-- Name: message_send_logs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.message_send_logs (
    id integer NOT NULL,
    location_id integer,
    location_name text NOT NULL,
    location_code text NOT NULL,
    channel text NOT NULL,
    status text NOT NULL,
    error text,
    sent_at timestamp without time zone DEFAULT now() NOT NULL,
    sent_by_user_id integer,
    batch_id text,
    twilio_sid text,
    delivery_status text,
    delivery_error text
);

-- Name: message_send_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.message_send_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: message_send_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.message_send_logs_id_seq OWNED BY public.message_send_logs.id;

-- Name: payments; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.payments (
    id integer NOT NULL,
    transaction_id integer NOT NULL,
    payment_method text NOT NULL,
    payment_provider text,
    external_payment_id text,
    deposit_amount integer NOT NULL,
    processing_fee integer DEFAULT 0,
    total_amount integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_data text,
    created_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    retry_attempts integer DEFAULT 0
);

-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;

-- Name: playbook_facts; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.playbook_facts (
    id integer NOT NULL,
    fact_key text NOT NULL,
    fact_value text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: playbook_facts_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.playbook_facts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: playbook_facts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.playbook_facts_id_seq OWNED BY public.playbook_facts.id;

-- Name: regions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.regions (
    id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    name_he text,
    description text,
    description_he text
);

-- Name: regions_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.regions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: regions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.regions_id_seq OWNED BY public.regions.id;

-- Name: reply_examples; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.reply_examples (
    id integer NOT NULL,
    source_type text NOT NULL,
    source_ref text,
    sender_email text,
    sender_name text,
    incoming_subject text NOT NULL,
    incoming_body text NOT NULL,
    sent_reply text NOT NULL,
    classification text,
    language text DEFAULT 'en'::text NOT NULL,
    matched_location_id integer,
    was_edited boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: reply_examples_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.reply_examples_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: reply_examples_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.reply_examples_id_seq OWNED BY public.reply_examples.id;

-- Name: restock_code_requests; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.restock_code_requests (
    id integer NOT NULL,
    location_id integer NOT NULL,
    requested_at timestamp without time zone DEFAULT now() NOT NULL,
    claimed_email_id text,
    resolved_at timestamp without time zone,
    expires_at timestamp without time zone NOT NULL
);

-- Name: restock_code_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.restock_code_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: restock_code_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.restock_code_requests_id_seq OWNED BY public.restock_code_requests.id;

-- Name: restock_shipments; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.restock_shipments (
    id integer NOT NULL,
    location_id integer NOT NULL,
    ordered_at timestamp without time zone NOT NULL,
    detected_at timestamp without time zone,
    tracking_number text,
    carrier text,
    estimated_delivery text,
    raw_email_snippet text,
    dismissed boolean DEFAULT false NOT NULL
);

-- Name: restock_shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.restock_shipments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: restock_shipments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.restock_shipments_id_seq OWNED BY public.restock_shipments.id;

-- Name: return_reminder_events; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.return_reminder_events (
    id integer NOT NULL,
    transaction_id integer NOT NULL,
    sent_at timestamp without time zone DEFAULT now() NOT NULL,
    sent_by_user_id integer,
    channel text DEFAULT 'email'::text NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    twilio_sid text,
    delivery_status text,
    delivery_status_updated_at timestamp without time zone,
    delivery_error_code text
);

-- Name: return_reminder_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.return_reminder_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: return_reminder_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.return_reminder_events_id_seq OWNED BY public.return_reminder_events.id;

-- Name: sms_conversations; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.sms_conversations (
    id integer NOT NULL,
    phone text NOT NULL,
    channel text NOT NULL,
    location_id integer,
    display_name text,
    last_message_at timestamp without time zone DEFAULT now() NOT NULL,
    last_message_preview text,
    last_direction text,
    unread_count integer DEFAULT 0 NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    is_opted_out boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: sms_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.sms_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: sms_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.sms_conversations_id_seq OWNED BY public.sms_conversations.id;

-- Name: sms_messages; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.sms_messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    direction text NOT NULL,
    body text NOT NULL,
    twilio_sid text,
    sent_at timestamp without time zone DEFAULT now() NOT NULL,
    delivery_status text,
    error_message text,
    sent_by_user_id integer
);

-- Name: sms_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.sms_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: sms_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.sms_messages_id_seq OWNED BY public.sms_messages.id;

-- Name: transactions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.transactions (
    id integer NOT NULL,
    location_id integer NOT NULL,
    borrower_name text NOT NULL,
    borrower_email text,
    borrower_phone text,
    headband_color text,
    deposit_amount double precision DEFAULT 20 NOT NULL,
    deposit_payment_method text DEFAULT 'cash'::text,
    refund_amount double precision,
    is_returned boolean DEFAULT false,
    borrow_date timestamp without time zone DEFAULT now() NOT NULL,
    expected_return_date timestamp without time zone,
    actual_return_date timestamp without time zone,
    notes text,
    pay_later_status text,
    stripe_customer_id text,
    stripe_setup_intent_id text,
    stripe_payment_method_id text,
    stripe_payment_intent_id text,
    amount_planned_cents integer,
    currency text DEFAULT 'usd'::text,
    magic_token text,
    magic_token_expires_at timestamp without time zone,
    charge_error_code text,
    charge_error_message text,
    last_return_reminder_at timestamp without time zone,
    return_reminder_count integer DEFAULT 0 NOT NULL,
    consent_text text,
    consent_accepted_at timestamp without time zone,
    consent_max_charge_cents integer,
    card_saved_at timestamp without time zone,
    charge_notification_sent_at timestamp without time zone,
    charge_notification_channel text,
    deposit_fee_cents integer,
    charged_at timestamp without time zone,
    stripe_refund_id text,
    refund_attempted_at timestamp without time zone
);

-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;

-- Name: translation_cache; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.translation_cache (
    id integer NOT NULL,
    source_text text NOT NULL,
    source_lang text NOT NULL,
    target_lang text NOT NULL,
    translated_text text NOT NULL,
    is_admin_corrected boolean DEFAULT false NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: translation_cache_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.translation_cache_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: translation_cache_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.translation_cache_id_seq OWNED BY public.translation_cache.id;

-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_sessions (
    sid text NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp with time zone NOT NULL
);

-- Name: users; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    email text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    role text DEFAULT 'operator'::text NOT NULL,
    is_admin boolean DEFAULT false,
    location_id integer,
    first_name_he text,
    last_name_he text,
    phone text
);

-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.webhook_events (
    id integer NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    processed_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: webhook_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.webhook_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: webhook_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.webhook_events_id_seq OWNED BY public.webhook_events.id;

-- Name: application_status_changes id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.application_status_changes ALTER COLUMN id SET DEFAULT nextval('public.application_status_changes_id_seq'::regclass);

-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);

-- Name: city_categories id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.city_categories ALTER COLUMN id SET DEFAULT nextval('public.city_categories_id_seq'::regclass);

-- Name: contacts id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.contacts ALTER COLUMN id SET DEFAULT nextval('public.contacts_id_seq'::regclass);

-- Name: disputes id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.disputes ALTER COLUMN id SET DEFAULT nextval('public.disputes_id_seq'::regclass);

-- Name: faq_entries id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.faq_entries ALTER COLUMN id SET DEFAULT nextval('public.faq_entries_id_seq'::regclass);

-- Name: gemach_applications id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.gemach_applications ALTER COLUMN id SET DEFAULT nextval('public.gemach_applications_id_seq'::regclass);

-- Name: global_settings id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.global_settings ALTER COLUMN id SET DEFAULT nextval('public.global_settings_id_seq'::regclass);

-- Name: inventory id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.inventory ALTER COLUMN id SET DEFAULT nextval('public.inventory_id_seq'::regclass);

-- Name: invite_codes id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.invite_codes ALTER COLUMN id SET DEFAULT nextval('public.invite_codes_id_seq'::regclass);

-- Name: kb_embeddings id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.kb_embeddings ALTER COLUMN id SET DEFAULT nextval('public.kb_embeddings_id_seq'::regclass);

-- Name: knowledge_docs id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.knowledge_docs ALTER COLUMN id SET DEFAULT nextval('public.knowledge_docs_id_seq'::regclass);

-- Name: locations id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.locations ALTER COLUMN id SET DEFAULT nextval('public.locations_id_seq'::regclass);

-- Name: message_send_logs id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.message_send_logs ALTER COLUMN id SET DEFAULT nextval('public.message_send_logs_id_seq'::regclass);

-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);

-- Name: playbook_facts id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.playbook_facts ALTER COLUMN id SET DEFAULT nextval('public.playbook_facts_id_seq'::regclass);

-- Name: regions id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.regions ALTER COLUMN id SET DEFAULT nextval('public.regions_id_seq'::regclass);

-- Name: reply_examples id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.reply_examples ALTER COLUMN id SET DEFAULT nextval('public.reply_examples_id_seq'::regclass);

-- Name: restock_code_requests id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.restock_code_requests ALTER COLUMN id SET DEFAULT nextval('public.restock_code_requests_id_seq'::regclass);

-- Name: restock_shipments id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.restock_shipments ALTER COLUMN id SET DEFAULT nextval('public.restock_shipments_id_seq'::regclass);

-- Name: return_reminder_events id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.return_reminder_events ALTER COLUMN id SET DEFAULT nextval('public.return_reminder_events_id_seq'::regclass);

-- Name: sms_conversations id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.sms_conversations ALTER COLUMN id SET DEFAULT nextval('public.sms_conversations_id_seq'::regclass);

-- Name: sms_messages id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.sms_messages ALTER COLUMN id SET DEFAULT nextval('public.sms_messages_id_seq'::regclass);

-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);

-- Name: translation_cache id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.translation_cache ALTER COLUMN id SET DEFAULT nextval('public.translation_cache_id_seq'::regclass);

-- Name: users id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

-- Name: webhook_events id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.webhook_events ALTER COLUMN id SET DEFAULT nextval('public.webhook_events_id_seq'::regclass);

-- Name: application_status_changes application_status_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.application_status_changes
    ADD CONSTRAINT application_status_changes_pkey PRIMARY KEY (id);

-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

-- Name: city_categories city_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.city_categories
    ADD CONSTRAINT city_categories_pkey PRIMARY KEY (id);

-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);

-- Name: disputes disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_pkey PRIMARY KEY (id);

-- Name: disputes disputes_stripe_dispute_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_stripe_dispute_id_key UNIQUE (stripe_dispute_id);

-- Name: faq_entries faq_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.faq_entries
    ADD CONSTRAINT faq_entries_pkey PRIMARY KEY (id);

-- Name: gemach_applications gemach_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.gemach_applications
    ADD CONSTRAINT gemach_applications_pkey PRIMARY KEY (id);

-- Name: global_settings global_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.global_settings
    ADD CONSTRAINT global_settings_key_unique UNIQUE (key);

-- Name: global_settings global_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.global_settings
    ADD CONSTRAINT global_settings_pkey PRIMARY KEY (id);

-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);

-- Name: invite_codes invite_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_code_unique UNIQUE (code);

-- Name: invite_codes invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (id);

-- Name: kb_embeddings kb_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.kb_embeddings
    ADD CONSTRAINT kb_embeddings_pkey PRIMARY KEY (id);

-- Name: knowledge_docs knowledge_docs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.knowledge_docs
    ADD CONSTRAINT knowledge_docs_pkey PRIMARY KEY (id);

-- Name: locations locations_location_code_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_location_code_unique UNIQUE (location_code);

-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);

-- Name: message_send_logs message_send_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.message_send_logs
    ADD CONSTRAINT message_send_logs_pkey PRIMARY KEY (id);

-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

-- Name: playbook_facts playbook_facts_fact_key_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.playbook_facts
    ADD CONSTRAINT playbook_facts_fact_key_key UNIQUE (fact_key);

-- Name: playbook_facts playbook_facts_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.playbook_facts
    ADD CONSTRAINT playbook_facts_pkey PRIMARY KEY (id);

-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (id);

-- Name: regions regions_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_slug_unique UNIQUE (slug);

-- Name: reply_examples reply_examples_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.reply_examples
    ADD CONSTRAINT reply_examples_pkey PRIMARY KEY (id);

-- Name: restock_code_requests restock_code_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.restock_code_requests
    ADD CONSTRAINT restock_code_requests_pkey PRIMARY KEY (id);

-- Name: restock_shipments restock_shipments_location_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.restock_shipments
    ADD CONSTRAINT restock_shipments_location_id_key UNIQUE (location_id);

-- Name: restock_shipments restock_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.restock_shipments
    ADD CONSTRAINT restock_shipments_pkey PRIMARY KEY (id);

-- Name: return_reminder_events return_reminder_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.return_reminder_events
    ADD CONSTRAINT return_reminder_events_pkey PRIMARY KEY (id);

-- Name: user_sessions session_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);

-- Name: sms_conversations sms_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sms_conversations
    ADD CONSTRAINT sms_conversations_pkey PRIMARY KEY (id);

-- Name: sms_messages sms_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_pkey PRIMARY KEY (id);

-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);

-- Name: translation_cache translation_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.translation_cache
    ADD CONSTRAINT translation_cache_pkey PRIMARY KEY (id);

-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);

-- Name: webhook_events webhook_events_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_event_id_unique UNIQUE (event_id);

-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);

-- Name: application_status_changes_application_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX application_status_changes_application_id_idx ON public.application_status_changes USING btree (application_id);

-- Name: disputes_charge_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX disputes_charge_idx ON public.disputes USING btree (stripe_charge_id);

-- Name: disputes_location_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX disputes_location_created_idx ON public.disputes USING btree (location_id, created_at DESC);

-- Name: kb_embeddings_source_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX kb_embeddings_source_idx ON public.kb_embeddings USING btree (source_kind, source_id, chunk_idx);

-- Name: locations_claim_token_uq; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX locations_claim_token_uq ON public.locations USING btree (claim_token) WHERE (claim_token IS NOT NULL);

-- Name: locations_welcome_sms_sid_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX locations_welcome_sms_sid_idx ON public.locations USING btree (welcome_sms_sid);

-- Name: locations_welcome_whatsapp_sid_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX locations_welcome_whatsapp_sid_idx ON public.locations USING btree (welcome_whatsapp_sid);

-- Name: message_send_logs_twilio_sid_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX message_send_logs_twilio_sid_idx ON public.message_send_logs USING btree (twilio_sid) WHERE (twilio_sid IS NOT NULL);

-- Name: restock_code_requests_claimed_email_uq; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX restock_code_requests_claimed_email_uq ON public.restock_code_requests USING btree (claimed_email_id) WHERE (claimed_email_id IS NOT NULL);

-- Name: restock_code_requests_location_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX restock_code_requests_location_idx ON public.restock_code_requests USING btree (location_id, requested_at DESC);

-- Name: return_reminder_events_tx_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX return_reminder_events_tx_idx ON public.return_reminder_events USING btree (transaction_id, sent_at DESC);

-- Name: sms_conversations_last_message_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX sms_conversations_last_message_idx ON public.sms_conversations USING btree (last_message_at DESC);

-- Name: sms_conversations_phone_channel_uq; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX sms_conversations_phone_channel_uq ON public.sms_conversations USING btree (phone, channel);

-- Name: sms_messages_conversation_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX sms_messages_conversation_idx ON public.sms_messages USING btree (conversation_id, sent_at);

-- Name: sms_messages_twilio_sid_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX sms_messages_twilio_sid_idx ON public.sms_messages USING btree (twilio_sid) WHERE (twilio_sid IS NOT NULL);

-- Name: transactions_charged_at_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX transactions_charged_at_idx ON public.transactions USING btree (charged_at) WHERE (charged_at IS NOT NULL);

-- Name: translation_cache_lookup_idx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX translation_cache_lookup_idx ON public.translation_cache USING btree (source_text, source_lang, target_lang);

-- PostgreSQL database dump complete
