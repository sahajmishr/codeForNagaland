/**
 * MORUNGGIG (SKILLBRIDGE NL) — SINGLE DECLARATIVE DOMAIN CONFIGURATION
 * Implements NFR-MAINT-01 & DR-NAG-01 through DR-NAG-15
 */

const NAGALAND_CONFIG = {
  // DR-NAG-01 & DR-NAG-02 & DR-NAG-11: Fair-Rate Matrix + Prestige Titles + YouthNet EDC Skill Pillars
  TRACKS: {
    COMMERCE_OPS: {
      code: 'COMMERCE_OPS',
      name: 'Commerce, Stock Audit & Excel Billing',
      shortName: 'Commerce & Stock Audit',
      portfolioTitle: 'Retail Inventory & Digital Ledger Micro-Audit Fellowship',
      edcPillar: 'YouthNet EDC Pillar I: MSME Financial & Operations Management',
      streamEligibility: 'B.Com / B.A. / BBA / All Streams',
      minFloorInr: 400,
      recommendedMinInr: 500,
      recommendedMaxInr: 1500,
      typicalDuration: '3 – 6 Hours',
      nonTechFriendly: true
    },
    CONTENT_REELS: {
      code: 'CONTENT_REELS',
      name: 'Cafe/Brand Reels & Product Photography',
      shortName: 'Content & Brand Reels',
      portfolioTitle: 'Brand Short-Form Visual Production & Digital Storytelling',
      edcPillar: 'YouthNet EDC Pillar II: Made-in-Nagaland Brand Media & Marketing',
      streamEligibility: 'All Streams (B.A. / B.Sc / B.Com / BCA)',
      minFloorInr: 500,
      recommendedMinInr: 700,
      recommendedMaxInr: 2000,
      typicalDuration: '3 – 8 Hours',
      nonTechFriendly: true
    },
    EVENTS_STALLS: {
      code: 'EVENTS_STALLS',
      name: 'Expo, Wedding, Fest & Stall Operations',
      shortName: 'Events & Stall Ops',
      portfolioTitle: 'Event Operations, POS Tally & Guest Relations Fellowship',
      edcPillar: 'YouthNet EDC Pillar III: Hospitality, Tourism & Event Logistics',
      streamEligibility: 'All Streams (B.A. / B.Com / B.Sc)',
      minFloorInr: 500,
      recommendedMinInr: 600,
      recommendedMaxInr: 1200,
      typicalDuration: '1 – 2 Days (Daylight Shift)',
      nonTechFriendly: true
    },
    LANGUAGE_TUTOR: {
      code: 'LANGUAGE_TUTOR',
      name: 'Naga Dialect Translation, Typing & NBSE Tutoring',
      shortName: 'Language & NBSE Tutoring',
      portfolioTitle: 'Indigenous Language Archival & Academic Mentorship Fellowship',
      edcPillar: 'YouthNet EDC Pillar IV: Cultural Documentation & Education Services',
      streamEligibility: 'B.A. / B.Sc / M.A. / All Streams',
      minFloorInr: 300,
      recommendedMinInr: 400,
      recommendedMaxInr: 1200,
      typicalDuration: '2 – 5 Hours',
      nonTechFriendly: true
    },
    DIGITAL_TECH: {
      code: 'DIGITAL_TECH',
      name: 'Canva Design, Google Maps Setup & Web/IT Support',
      shortName: 'Digital, Canva & Web Ops',
      portfolioTitle: 'Digital Storefront Architecture & Technical Systems Audit',
      edcPillar: 'YouthNet EDC Pillar V: Digital Transformation & E-Commerce Readiness',
      streamEligibility: 'BCA / B.Tech / B.Sc / All Streams',
      minFloorInr: 500,
      recommendedMinInr: 600,
      recommendedMaxInr: 3000,
      typicalDuration: '4 – 24 Hours',
      nonTechFriendly: false
    }
  },

  // DR-NAG-03: Campus Clusters & Colleges
  CORRIDORS: {
    SOVIMA_6MILE: {
      code: 'SOVIMA_6MILE',
      label: 'Sovima / 6th Mile Corridor',
      district: 'CHUMOUKEDIMA_DIMAPUR',
      colleges: ['ICFAI University Nagaland, Sovima', 'Tetso College, Sovima / 6th Mile'],
      hubs: ['ICFAI Sovima Gate Hub', '6th Mile Junction Commercial Hub', 'Yes Coffee Sovima']
    },
    CHUMOUKEDIMA: {
      code: 'CHUMOUKEDIMA',
      label: 'Chümoukedima / 4th Mile / Patkai',
      district: 'CHUMOUKEDIMA_DIMAPUR',
      colleges: ['NIT Nagaland, Chümoukedima', 'St. Joseph University, Ikishe', 'Patkai Christian College, Chümoukedima'],
      hubs: ['Agri Expo 4th Mile Grounds', 'Chümoukedima Town Plaza', '3rd Mile Trade Hub']
    },
    DIMAPUR_TOWN: {
      code: 'DIMAPUR_TOWN',
      label: 'Dimapur Town (HK Market / Circular Rd)',
      district: 'CHUMOUKEDIMA_DIMAPUR',
      colleges: ['Dimapur Govt. College (DGC)', 'Pranab Vidyapith College, Dimapur', 'Public College of Commerce'],
      hubs: ['Hong Kong Market Commercial Complex', 'Circular Road Business Hub', 'City Tower Junction']
    },
    KOHIMA_TOWN: {
      code: 'KOHIMA_TOWN',
      label: 'Kohima Town (BOC / Razhu Pt / High School)',
      district: 'KOHIMA',
      colleges: ['Kohima College', 'Baptist College, Kohima', 'Alder College, Kohima'],
      hubs: ['Razhu Point Commercial Hub', 'BOC Market Complex', 'YouthNet HQ Kohima']
    },
    JOTSOMA_MERIEMA: {
      code: 'JOTSOMA_MERIEMA',
      label: 'Jotsoma / Meriema Campus Belt (Kohima)',
      district: 'KOHIMA',
      colleges: ['Kohima Science College (Autonomous), Jotsoma', 'Nagaland University, Meriema Campus'],
      hubs: ['KSC Jotsoma Academic Hub', 'NU Meriema Innovation Centre', 'High School Junction Hub']
    }
  },

  // DR-NAG-03: Shared-Auto / Bus Round-Trip Fare Matrix (in INR)
  // null indicates Inter-District (74 km via NH-29 between Dimapur/Chumoukedima belt and Kohima belt)
  CORRIDOR_FARE_MATRIX: {
    SOVIMA_6MILE: {
      SOVIMA_6MILE: 30,
      CHUMOUKEDIMA: 50,
      DIMAPUR_TOWN: 100,
      KOHIMA_TOWN: null,
      JOTSOMA_MERIEMA: null
    },
    CHUMOUKEDIMA: {
      SOVIMA_6MILE: 50,
      CHUMOUKEDIMA: 30,
      DIMAPUR_TOWN: 120,
      KOHIMA_TOWN: null,
      JOTSOMA_MERIEMA: null
    },
    DIMAPUR_TOWN: {
      SOVIMA_6MILE: 100,
      CHUMOUKEDIMA: 120,
      DIMAPUR_TOWN: 30,
      KOHIMA_TOWN: null,
      JOTSOMA_MERIEMA: null
    },
    KOHIMA_TOWN: {
      SOVIMA_6MILE: null,
      CHUMOUKEDIMA: null,
      DIMAPUR_TOWN: null,
      KOHIMA_TOWN: 30,
      JOTSOMA_MERIEMA: 70
    },
    JOTSOMA_MERIEMA: {
      SOVIMA_6MILE: null,
      CHUMOUKEDIMA: null,
      DIMAPUR_TOWN: null,
      KOHIMA_TOWN: 70,
      JOTSOMA_MERIEMA: 30
    }
  },

  // Free Timetable Slots
  SLOTS: {
    WEEKDAY_AFTER_3PM: {
      code: 'WEEKDAY_AFTER_3PM',
      label: 'After 3:00 PM Weekdays',
      description: 'Post-lecture window (3:00 PM – 4:30 PM offline / evening digital)'
    },
    SATURDAY_ALL_DAY: {
      code: 'SATURDAY_ALL_DAY',
      label: 'Saturday Full Day',
      description: '09:00 AM – 04:00 PM daylight window (before hostel curfew)'
    },
    ANYTIME_DIGITAL: {
      code: 'ANYTIME_DIGITAL',
      label: 'Digital / Flexible Anytime',
      description: 'Remote hostel/campus execution via Watermarked Vault'
    }
  },

  // DR-NAG-07: 18 Supported Naga Languages & Dialects
  NAGA_LANGUAGES: [
    'English / Nagamese',
    'Nagamese Creole',
    'Tenyidie (Angami)',
    'Ao (Chungli / Mongsen)',
    'Sumi (Sema)',
    'Lotha',
    'Konyak',
    'Chakhesang (Chokri / Khezha)',
    'Chang',
    'Phom',
    'Rengma',
    'Sangtam',
    'Yimkhiung',
    'Zeme',
    'Liangmai',
    'Khiamniungan',
    'Pochury',
    'Kuki / Kachari'
  ],

  // DR-NAG-12: Student Union & Colony Safety Dispatch Directory
  SAFETY_DISPATCH_UNITS: {
    SOVIMA_6MILE: {
      union: 'ANCSU / Sovima Village Youth Organization & ICFAI Proctor Cell',
      helpline: '+91-8794-00-1102',
      wardenDesk: 'Sovima Campus Hostel Control Room'
    },
    CHUMOUKEDIMA: {
      union: 'Chümoukedima Town Students Union (CTSU) & DNSU Welfare Cell',
      helpline: '+91-8794-00-1104',
      wardenDesk: '4th Mile / Patkai Student Welfare Desk'
    },
    DIMAPUR_TOWN: {
      union: 'Dimapur Naga Students Union (DNSU) & JCF Colony Vigilance',
      helpline: '+91-8794-00-1108',
      wardenDesk: 'DGC Campus Security & Women Cell'
    },
    KOHIMA_TOWN: {
      union: 'Angami Students Union (ASU) & ANCSU Central Executive Kohima',
      helpline: '+91-8794-00-1112',
      wardenDesk: 'Kohima College / Razhu Point Student Patrol'
    },
    JOTSOMA_MERIEMA: {
      union: 'KSC Students Union (KSCSU) & NU Meriema Campus Welfare Cell',
      helpline: '+91-8794-00-1115',
      wardenDesk: 'Jotsoma / Meriema Hostel Warden Control'
    }
  },

  // FR-GIG-01: 6 One-Tap Naga Task Preset Templates
  ONE_TAP_PRESETS: [
    {
      id: 'PRESET_REELS',
      badge: 'Content & Reels',
      label: '3 Cafe Reels',
      payout_inr: 900,
      title: 'Shoot & Edit 3 Vertical Cafe Reels',
      track_category: 'CONTENT_REELS',
      execution_mode: 'DIGITAL',
      corridor_cluster: 'SOVIMA_6MILE',
      venue_label: 'Yes Coffee Corner, Sovima / Digital Vault Delivery',
      duration_label: '48 Hours Turnaround (3–5 hrs work)',
      required_slot: 'WEEKDAY_AFTER_3PM',
      language_tag: 'English / Nagamese',
      allow_morung_squad: true,
      is_public_venue: true,
      requires_nda: false,
      criteria_1: '3 vertical 9:16 videos (30-45 sec each) showcasing signature cold brew & cafe ambience',
      criteria_2: 'Edited with clean text captions, beat-synced audio, and natural color grading',
      criteria_3: 'Uploaded to MorungGig Watermarked Vault in 1080p MP4 format within 48 hours'
    },
    {
      id: 'PRESET_EXCEL',
      badge: 'Commerce & Stock',
      label: 'Shop Stock Excel',
      payout_inr: 700,
      title: 'Retail Pharmacy & Store Monthly Stock Excel Audit',
      track_category: 'COMMERCE_OPS',
      execution_mode: 'DIGITAL',
      corridor_cluster: 'DIMAPUR_TOWN',
      venue_label: 'Circular Road Retail Store / Digital Sheet Reconciliation',
      duration_label: 'Saturday Shift (4 Hours)',
      required_slot: 'SATURDAY_ALL_DAY',
      language_tag: 'English / Nagamese',
      allow_morung_squad: true,
      is_public_venue: true,
      requires_nda: true,
      criteria_1: 'Digitize 180 SKU invoice rows into standardized GST-ready Excel inventory template',
      criteria_2: 'Highlight items expiring within 90 days and compute reorder quantities accurately',
      criteria_3: 'Upload reconciled .xlsx workbook to Watermarked Vault with zero formula errors'
    },
    {
      id: 'PRESET_EXPO',
      badge: 'Events & Stalls',
      label: 'Event Booth Crew',
      payout_inr: 600,
      title: 'Agri Expo Craft & Bakery Stall Operations Crew',
      track_category: 'EVENTS_STALLS',
      execution_mode: 'OFFLINE',
      corridor_cluster: 'CHUMOUKEDIMA',
      venue_label: 'Agri Expo Grounds, 4th Mile, Chümoukedima (Stall B-14)',
      duration_label: 'Saturday Shift (10:00 AM - 04:00 PM)',
      required_slot: 'SATURDAY_ALL_DAY',
      language_tag: 'Nagamese Creole',
      allow_morung_squad: true,
      is_public_venue: true,
      requires_nda: false,
      criteria_1: 'Arrive at Agri Expo Stall B-14 by 10:00 AM and verify 4-digit START_PIN',
      criteria_2: 'Manage customer product sampling, UPI QR payment tally, and restock display trays',
      criteria_3: 'Complete closing stock count by 04:00 PM (before sunset curfew) and verify COMPLETE_PIN'
    },
    {
      id: 'PRESET_TRANSLATE',
      badge: 'Language & Archival',
      label: 'Tenyidie/Ao Translation',
      payout_inr: 500,
      title: 'Tenyidie & Ao Folk Oral History Transcription & English Subtitling',
      track_category: 'LANGUAGE_TUTOR',
      execution_mode: 'DIGITAL',
      corridor_cluster: 'KOHIMA_TOWN',
      venue_label: 'Remote Digital Archival (Morung Cultural Heritage Project)',
      duration_label: '3 Days Flexible (3 Hours Total)',
      required_slot: 'ANYTIME_DIGITAL',
      language_tag: 'Tenyidie (Angami)',
      allow_morung_squad: false,
      is_public_venue: true,
      requires_nda: false,
      criteria_1: 'Transcribe 12-minute audio interview accurately with speaker timestamps',
      criteria_2: 'Provide parallel English translation preserving indigenous idiom notes',
      criteria_3: 'Submit bilingual document & SRT subtitle file to Watermarked Vault'
    },
    {
      id: 'PRESET_TUTOR',
      badge: 'Academic Tutoring',
      label: 'NBSE Class 10 Tutor',
      payout_inr: 500,
      title: 'NBSE Class 10 Mathematics & Science Exam Prep Mentorship',
      track_category: 'LANGUAGE_TUTOR',
      execution_mode: 'OFFLINE',
      corridor_cluster: 'SOVIMA_6MILE',
      venue_label: '6th Mile Community Library Study Hall (Public Hub)',
      duration_label: '2 Sessions × 1.5 Hours (3:00 PM - 4:30 PM)',
      required_slot: 'WEEKDAY_AFTER_3PM',
      language_tag: 'English / Nagamese',
      allow_morung_squad: true,
      is_public_venue: true,
      requires_nda: false,
      criteria_1: 'Check in at 6th Mile Community Library at 03:00 PM using 4-digit START_PIN',
      criteria_2: 'Cover Trigonometry & Quadratic Equations from last 5 years NBSE question banks',
      criteria_3: 'Review 15-question practice worksheet by 04:30 PM and verify COMPLETE_PIN'
    },
    {
      id: 'PRESET_CANVA',
      badge: 'Digital & Tech',
      label: 'Canva Catalog & Maps',
      payout_inr: 800,
      title: 'WhatsApp Product Catalog Design & Google Maps Storefront Verification',
      track_category: 'DIGITAL_TECH',
      execution_mode: 'DIGITAL',
      corridor_cluster: 'JOTSOMA_MERIEMA',
      venue_label: 'Digital Delivery for Local Handloom Collective',
      duration_label: '24 Hours Turnaround',
      required_slot: 'ANYTIME_DIGITAL',
      language_tag: 'English / Nagamese',
      allow_morung_squad: true,
      is_public_venue: true,
      requires_nda: false,
      criteria_1: 'Design 10-page clean Canva PDF & WhatsApp catalog with pricing for 20 handloom items',
      criteria_2: 'Format high-resolution product cards with clear Naga motif provenance labels',
      criteria_3: 'Upload master PDF & editable link to Watermarked Vault for review'
    }
  ],

  // FR-GIG-02: Nagamese & English Voice-to-Task Utterance Samples
  VOICE_UTTERANCE_PRESETS: [
    {
      label: 'Nagamese: Bakery Stall @ Agri Expo ₹600',
      utterance: 'Ami laga bakery stall nimite Saturday din duita college student lage Agri Expo 4th Mile te 600 dibo'
    },
    {
      label: 'Nagamese: Shop Stock Excel @ Sovima ₹700',
      utterance: 'Ami laga dukan nimite Saturday din 3 ghanta stock count aru Excel entry lage Sovima te 700 dibo'
    },
    {
      label: 'Nagamese/Eng: 3 Cafe Reels @ Kohima ₹900',
      utterance: 'Mora cafe nimite 3ta vertical Instagram reel shoot aru edit koribo lage Kohima BOC te 900 dibo'
    },
    {
      label: 'English: NBSE Class 10 Maths Tutor ₹500',
      utterance: 'Need a verified college student tutor after 3 PM at 6th Mile public study hub for NBSE Class 10 Maths revision paying 500'
    }
  ],

  // DR-NAG-15: Primary Validation Survey & Nagaland Socio-Economic Evidence
  SURVEY_EVIDENCE: {
    macroBenchmarks: [
      { metric: 'Registered Unemployed Youth', value: '71,034', source: 'Nagaland Employment Survey 2025/2026 (DES)' },
      { metric: 'Youth Unemployment Rate (15–29 yrs)', value: '27.4%', source: '40.7% Graduates • 45.2% Postgraduates' },
      { metric: 'Youth Lacking Practical Work Proof', value: '92.0%', source: 'Directorate of Economics & Statistics, GoN' },
      { metric: 'Waiting >3 Years in Exam Paralysis', value: '55.0%', source: 'The Morung Express Empirical Report (Mar 2026)' }
    ],
    sovimaFieldValidation: {
      sampleSize: '28 Respondents (21 Students across ICFAI Sovima, Tetso & KSC + 7 Local MSMEs/Cafes)',
      conductedAt: 'ICFAI University Campus, Sovima & 6th Mile Corridor (Oct 15, 2026)',
      findings: [
        { question: 'Students who avoided gig work due to fear of unpaid deliverables or registration scams', pct: 86 },
        { question: 'Non-CS (B.A./B.Com/B.Sc) students wanting 3–6 hr timetable-safe tasks with upfront auto-fare clarity', pct: 91 },
        { question: '1st-Year students preferring a 2-Person Morung Squad (Senior + Junior 70/30) over solo first gig', pct: 84 },
        { question: 'Local shopkeepers/cafes preferring 1-Tap Template or Nagamese voice note over typing job portals', pct: 100 }
      ]
    }
  },

  // Section 3.7: System Error Code Catalogue
  ERRORS: {
    'ERR-MG-1001': {
      code: 'ERR-MG-1001',
      status: 409,
      title: 'Duplicate Student KYC Identity Hash',
      detail: 'This College Roll Number is already linked to a verified student account (Sybil Multi-Account Guard).'
    },
    'ERR-MG-1004': {
      code: 'ERR-MG-1004',
      status: 403,
      title: 'Public Venue & Squad Safety Guardrail Violation',
      detail: 'For student safety, first-time household posters (<2 completed gigs) must select a Public/Campus Venue OR enable a 2-Person Morung Squad.'
    },
    'ERR-MG-1005': {
      code: 'ERR-MG-1005',
      status: 422,
      title: 'Anti-Scam Fee Solicitation Blocked',
      detail: 'Security Block: Asking students for registration fees, training fees, ID card charges, or security deposits is strictly prohibited on MorungGig.'
    },
    'ERR-MG-2001': {
      code: 'ERR-MG-2001',
      status: 422,
      title: 'Nagaland Fair-Rate Floor Violation',
      detail: 'Fair-Rate Guardrail: Student payout is below the mandatory Nagaland category floor.'
    },
    'ERR-MG-2002': {
      code: 'ERR-MG-2002',
      status: 422,
      title: 'Mandatory 3-Checkbox Scope Lock Incomplete',
      detail: 'Scope Lock Required: Please specify all 3 Acceptance Checkboxes (10–200 chars each) so expectations and arbitration rules are 100% clear.'
    },
    'ERR-MG-2003': {
      code: 'ERR-MG-2003',
      status: 422,
      title: 'Curfew & Sunday Schedule Guardrail Violation',
      detail: 'Curfew/Sunday Guardrail: Offline student tasks must finish by 4:30 PM / 17:00 IST (Mon–Sat) to respect Nagaland winter sunset & hostel curfews.'
    },
    'ERR-MG-3001': {
      code: 'ERR-MG-3001',
      status: 400,
      title: 'Invalid Finite State Machine Transition',
      detail: 'The requested contract state transition violates the deterministic FSM guard table.'
    },
    'ERR-MG-4001': {
      code: 'ERR-MG-4001',
      status: 401,
      title: 'Invalid Cryptographic Handshake PIN',
      detail: 'Incorrect 4-digit Handshake PIN. Please verify the START_PIN or COMPLETE_PIN shown on the counterparty screen.'
    },
    'ERR-MG-4002': {
      code: 'ERR-MG-4002',
      status: 403,
      title: 'Hard Revision Cap Reached (2 of 2 Used)',
      detail: 'Revision Limit Reached (2 of 2 used). Please Approve & Release Escrow, lock a ₹150 Extra-Scope Top-Up, or escalate to the 60s EDC Arbitrator.'
    },
    'ERR-MG-4003': {
      code: 'ERR-MG-4003',
      status: 403,
      title: 'Anti-Theft Watermarked Vault Lock Active',
      detail: 'Access Denied: Clean master file download is cryptographically locked until Nodal UPI Escrow transitions to SETTLED or AUTO_RELEASED.'
    }
  }
};

module.exports = { NAGALAND_CONFIG };
