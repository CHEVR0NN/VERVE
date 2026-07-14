// models/ghlService.js
// Handles all communication with GHL (webhooks + API reads)

const axios = require('axios');
const ghlConfig = require('../config/ghl');
const {
  FACILITY_VENUE_FIELD_ID,
  SLOT_DATE_FIELD_ID,
  SLOT_START_TIME_FIELD_ID,
  PAX_FIELD_ID,
  SPECIAL_REQUEST_FIELD_ID,
  BOOKING_SHIFT_FIELD_ID,
} = require('../config/ghlFields');

// ─── Helper: POST to a GHL inbound webhook ───────────────────────────────────
const postToWebhook = async (url, payload) => {
  if (!url) throw new Error('GHL webhook URL is not configured in .env');

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  return response.data;
};

// ─── Helper: GHL API GET request ─────────────────────────────────────────────
const ghlApiGet = async (endpoint, params = {}) => {
  const response = await axios.get(`${ghlConfig.api.baseUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${ghlConfig.api.key}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
    params,
    timeout: 10000,
  });

  return response.data;
};

// ─── Helper: GHL API POST request ────────────────────────────────────────────
const ghlApiPost = async (endpoint, payload = {}) => {
  const response = await axios.post(`${ghlConfig.api.baseUrl}${endpoint}`, payload, {
    headers: {
      Authorization: `Bearer ${ghlConfig.api.key}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
    timeout: 10000,
  });

  return response.data;
};

// ─── Helper: GHL API PUT request ─────────────────────────────────────────────
const ghlApiPut = async (endpoint, payload = {}) => {
  const response = await axios.put(`${ghlConfig.api.baseUrl}${endpoint}`, payload, {
    headers: {
      Authorization: `Bearer ${ghlConfig.api.key}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
    timeout: 10000,
  });

  return response.data;
};

// ─── Helper: GHL API DELETE request ──────────────────────────────────────────
const ghlApiDelete = async (endpoint) => {
  const response = await axios.delete(`${ghlConfig.api.baseUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${ghlConfig.api.key}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
    timeout: 10000,
  });

  return response.data;
};

// ─── Webhook #1: New Booking (FORM-01) ───────────────────────────────────────
const sendBooking = async (data) => {
  const payload = {
    email:                      data.email,
    phone:                      data.phone,
    name:                       data.name,
    membership_number:          data.membership_number,
    // facility_or_venue custom field
    facility_or_venue:          data.facility_or_venue,
    facility_field_id:          FACILITY_VENUE_FIELD_ID,
    // calendar (matched per facility)
    calendar_id:                data.calendar_id || '',
    slot_date:                  data.slot_date,
    slot_date_field_id:         SLOT_DATE_FIELD_ID,
    // full ISO datetimes for calendar appointment
    slot_start_time:            data.slot_start_time,
    slot_end_time:              data.slot_end_time,
    // plain HH:MM time for contact.slot_start_time custom field
    slot_time:                  data.slot_time || '',
    slot_start_time_field_id:   SLOT_START_TIME_FIELD_ID,
    // pax for contact.outlet_pax custom field
    outlet_pax:                 data.outlet_pax,
    pax_field_id:               PAX_FIELD_ID,
    booking_reference:          data.booking_reference,
    booking_status:             'Confirmed',
    booking_type:               data.booking_type || 'advance',
    booking_shift:              data.booking_shift || '',
    booking_shift_field_id:     BOOKING_SHIFT_FIELD_ID,
    special_request:            data.special_request || '',
    special_request_field_id:   SPECIAL_REQUEST_FIELD_ID,
    cancellation_deadline:      data.cancellation_deadline,
    overdue_check_at:           data.overdue_check_at,
    no_show_check_at:           data.no_show_check_at,
    feedback_send_at:           data.feedback_send_at,
  };

  return postToWebhook(ghlConfig.webhooks.booking, payload);
};

// ─── Webhook #2: Cancellation (FORM-02) ──────────────────────────────────────
const sendCancellation = async (data) => {
  const payload = {
    email:                  data.email,
    booking_reference:      data.booking_reference,
    is_late_cancellation:   !!data.is_late_cancellation,
    cancellation_type:      data.is_late_cancellation ? 'late' : 'normal',
  };

  return postToWebhook(ghlConfig.webhooks.cancellation, payload);
};

// ─── Webhook #3: Guest Registration (FORM-03) ────────────────────────────────
const sendGuestRegistration = async (data) => {
  const payload = {
    email:              data.email,
    guest_name:         data.guest_name,
    guest_email:        data.guest_email,
    guest_phone:        data.guest_phone || '',
    inviting_member_id: data.inviting_member_id,
    slot_date:          data.slot_date,
    facility_or_venue:  data.facility_or_venue,
    booking_shift:      data.booking_shift || '',
    booking_reference:  data.booking_reference || '',
  };

  return postToWebhook(ghlConfig.webhooks.guestRegistration, payload);
};

// ─── Webhook #4: Walk-In (STAFF-01) ──────────────────────────────────────────
const sendWalkin = async (data) => {
  const payload = {
    name:              data.name,
    phone:             data.phone || '',
    facility:          data.facility,
    pax:               data.pax,
    staff_id:          data.staff_id,
    booking_reference: data.booking_reference,
    slot_date:         data.slot_date,
    slot_start_time:   data.slot_start_time,
  };

  return postToWebhook(ghlConfig.webhooks.walkin, payload);
};

// ─── Webhook #5: Check-In (SHARED-07) ────────────────────────────────────────
const sendCheckin = async (data) => {
  const payload = {
    email:             data.email,
    booking_reference: data.booking_reference,
    checked_in_by:     data.checked_in_by,
  };

  return postToWebhook(ghlConfig.webhooks.checkin, payload);
};

// ─── GHL API: Find contact by booking_reference (for check-in validation) ────
const findContactByReference = async (booking_reference) => {
  const data = await ghlApiGet('/contacts/search', {
    locationId: ghlConfig.api.locationId,
    query:      booking_reference,
  });

  // Return first matching contact
  const contacts = data.contacts || [];
  return contacts.find(
    (c) => c.customFields?.find(
      (f) => f.fieldKey === 'contact.booking_reference' && f.value === booking_reference
    )
  ) || null;
};

// ─── GHL API: Get free slots from a GHL calendar ─────────────────────────────
const getCalendarFreeSlots = async (calendarId, startDate, endDate) => {
  // GHL expects Unix timestamps in milliseconds
  const toMs = (dateStr) => new Date(dateStr).getTime();

  const data = await ghlApiGet(`/calendars/${calendarId}/free-slots`, {
    startDate: toMs(startDate),
    endDate:   toMs(endDate),
    timezone:  'Asia/Singapore',
  });

  return data;
};

// ─── GHL API: Find a contact by email ────────────────────────────────────────
const findContactByEmail = async (email) => {
  const data = await ghlApiGet('/contacts/search', {
    locationId: ghlConfig.api.locationId,
    query:      email,
  });

  const contacts = data.contacts || [];
  return contacts.find((c) => c.email === email) || null;
};

// ─── GHL API: Create a calendar appointment ──────────────────────────────────
const createAppointment = async ({ calendarId, contactId, startTime, endTime, title, status = 'confirmed' }) => {
  return ghlApiPost('/calendars/events/appointments', {
    calendarId,
    locationId:        ghlConfig.api.locationId,
    contactId,
    startTime,
    endTime,
    title,
    appointmentStatus: status,
  });
};

// ─── GHL API: List all pipelines for this location ───────────────────────────
const getPipelines = async () => {
  const data = await ghlApiGet('/opportunities/pipelines', {
    locationId: ghlConfig.api.locationId,
  });
  return data.pipelines || [];
};

// ─── GHL API: Search opportunities (optionally filter by pipeline/stage) ─────
const getOpportunities = async ({ pipelineId, stageId, status, limit = 20, startAfter } = {}) => {
  const params = {
    location_id: ghlConfig.api.locationId,
  };
  if (pipelineId)  params.pipeline_id       = pipelineId;
  if (stageId)     params.pipeline_stage_id  = stageId;
  if (status)      params.status             = status;
  if (limit)       params.limit              = limit;
  if (startAfter)  params.startAfter         = startAfter;

  const data = await ghlApiGet('/opportunities/search', params);
  return {
    opportunities: data.opportunities || [],
    meta:          data.meta          || {},
  };
};

// ─── GHL API: Create a new opportunity ───────────────────────────────────────
const createOpportunity = async ({ pipelineId, pipelineStageId, contactId, name, status = 'open', monetaryValue }) => {
  const payload = {
    pipelineId,
    locationId:      ghlConfig.api.locationId,
    name,
    pipelineStageId,
    status,
    contactId,
  };
  if (monetaryValue !== undefined) payload.monetaryValue = monetaryValue;

  return ghlApiPost('/opportunities/', payload);
};

// ─── GHL API: Move opportunity to a different pipeline stage ─────────────────
// GHL's PUT /opportunities/:id requires pipelineId + name (in addition to the
// fields you actually want to change). If the caller doesn't supply them, fetch
// the existing opportunity and reuse its values so the update doesn't 422.
const updateOpportunityStage = async (opportunityId, { pipelineId, pipelineStageId, name, status }) => {
  let resolvedPipelineId = pipelineId;
  let resolvedName       = name;

  if (!resolvedPipelineId || !resolvedName) {
    const existing = await ghlApiGet(`/opportunities/${opportunityId}`);
    const opp      = existing.opportunity || {};
    resolvedPipelineId = resolvedPipelineId || opp.pipelineId;
    resolvedName       = resolvedName       || opp.name;
  }

  const payload = {
    pipelineId:      resolvedPipelineId,
    name:            resolvedName,
    pipelineStageId,
  };
  if (status) payload.status = status;

  return ghlApiPut(`/opportunities/${opportunityId}`, payload);
};

// ─── VRV BOOKINGS pipeline cache ─────────────────────────────────────────────
// Stage IDs don't change often; cache them to avoid an extra GHL call per
// request. Pass { refresh: true } to bypass the cache — used when a stage
// lookup misses, since that usually means a new stage was added in GHL after
// the cache was populated.
let _srcBookingsCache = null;

const getSrcBookingsPipeline = async ({ refresh = false } = {}) => {
  if (_srcBookingsCache && !refresh) return _srcBookingsCache;

  const pipelines = await getPipelines();
  const pipeline  = pipelines.find((p) => /src\s*bookings/i.test(p.name));
  if (!pipeline) {
    throw new Error('VRV BOOKINGS pipeline not found in GHL');
  }

  const stageIds = {};
  for (const stage of pipeline.stages || []) {
    const key = String(stage.name).toLowerCase().replace(/[^a-z0-9]/g, '');
    stageIds[key] = stage.id;
  }

  _srcBookingsCache = { pipelineId: pipeline.id, stageIds };
  return _srcBookingsCache;
};

// Status name (from Mongo / staff portal) → normalized stage key in VRV BOOKINGS.
// Keys must match the normalized stage names actually present in the GHL pipeline
// (lowercased, non-alphanumerics stripped). Current VRV BOOKINGS stages:
//   CONFIRMED, CHECKED IN, COMPLETED, CANCELLED, NO SHOW, LATE CANCELLATION, LATE FEE PAID
const STATUS_TO_STAGE_KEY = {
  'Confirmed':         'confirmed',
  'Checked In':        'checkedin',
  'Completed':         'completed',
  'Cancelled':         'cancelled',
  'No Show':           'noshow',
  'Late Cancellation': 'latecancellation',
  'late_fee_paid':     'latefeepaid',
};

// GHL opportunity status ∈ {open, won, lost, abandoned}
const STATUS_TO_OPP_STATUS = {
  'Cancelled':         'lost',
  'Late Cancellation': 'lost',
  'No Show':           'lost',
  'Completed':         'won',
  'late_fee_paid':     'won',
};

// ─── GHL API: Find an opportunity in VRV BOOKINGS by booking_reference ───────
// FORM-01 creates the opportunity with a human-readable name
// (e.g. "Jane — Tennis — May 28, 2026"), not the booking reference. So we
// can't match by name. Instead: find the contact whose booking_reference
// custom field equals the reference, then take that contact's most recent
// opportunity in VRV BOOKINGS. (The custom field always points to the
// contact's latest booking, which is the one we want to update.)
const findOpportunityByReference = async (booking_reference) => {
  const { pipelineId } = await getSrcBookingsPipeline();

  // Quick path: name starts with the booking reference. GHL workflows
  // (FORM-01, SHARED-05, SHARED-07, SHARED-04) all name opps as
  // "{{booking_reference}} — {{name}} — {{venue}} — {{date}}", so the
  // reference is the unambiguous prefix.
  const byName = await ghlApiGet('/opportunities/search', {
    location_id: ghlConfig.api.locationId,
    pipeline_id: pipelineId,
    q:           booking_reference,
    limit:       100,
  });
  const nameMatch = (byName.opportunities || []).find(
    (o) => typeof o.name === 'string' && o.name.startsWith(booking_reference)
  );
  if (nameMatch) return nameMatch;

  // Fallback: look up the contact, then their opportunities in this pipeline.
  const contact = await findContactByReference(booking_reference);
  if (!contact) {
    console.warn(`[GHL] findOpportunityByReference: no contact with booking_reference="${booking_reference}"`);
    return null;
  }

  // GHL's /opportunities/search rejects the contact_id query param with a
  // 400 ("Contact with id search not found"), so fetch open opps in the
  // pipeline and filter by contactId client-side instead.
  const byPipeline = await ghlApiGet('/opportunities/search', {
    location_id: ghlConfig.api.locationId,
    pipeline_id: pipelineId,
    status:      'open',
    limit:       100,
  });

  const opps = (byPipeline.opportunities || []).filter((o) => o.contactId === contact.id);
  if (opps.length === 0) {
    console.warn(`[GHL] findOpportunityByReference: contact ${contact.id} has no open opps in VRV BOOKINGS (scanned ${byPipeline.opportunities?.length || 0} opps)`);
    return null;
  }

  // Newest first — the contact's current booking_reference points to its
  // latest booking, so the newest opp on this contact corresponds to it.
  opps.sort((a, b) => {
    const aTime = new Date(a.createdAt || a.dateAdded || 0).getTime();
    const bTime = new Date(b.createdAt || b.dateAdded || 0).getTime();
    return bTime - aTime;
  });
  return opps[0];
};

// ─── GHL API: Move an opportunity to the stage matching a Mongo status ───────
// This is what staff "Override Status" should call to keep the pipeline in sync.
const moveOpportunityToStatus = async (booking_reference, new_status) => {
  const stageKey = STATUS_TO_STAGE_KEY[new_status];
  if (!stageKey) {
    throw new Error(`No VRV BOOKINGS stage mapping for status "${new_status}". Allowed: ${Object.keys(STATUS_TO_STAGE_KEY).join(', ')}`);
  }

  let { pipelineId, stageIds } = await getSrcBookingsPipeline();
  let pipelineStageId = stageIds[stageKey];

  // Cache miss usually means a new stage was added in GHL after the cache
  // was populated — refetch once before giving up.
  if (!pipelineStageId) {
    console.warn(`[GHL] stage "${stageKey}" not in cache (have: ${Object.keys(stageIds).join(', ')}). Refreshing pipeline...`);
    ({ pipelineId, stageIds } = await getSrcBookingsPipeline({ refresh: true }));
    pipelineStageId = stageIds[stageKey];
  }

  if (!pipelineStageId) {
    throw new Error(`VRV BOOKINGS pipeline has no stage matching "${stageKey}". Available stage keys: ${Object.keys(stageIds).join(', ')}`);
  }

  const opp = await findOpportunityByReference(booking_reference);
  if (!opp) {
    throw new Error(`Opportunity named "${booking_reference}" not found in VRV BOOKINGS. Verify FORM-01's Create Opportunity step uses Name = {{trigger.booking_reference}}.`);
  }

  console.log(`[GHL] Moving opp ${opp.id} ("${opp.name}") → stage "${stageKey}" (${pipelineStageId}), status: ${STATUS_TO_OPP_STATUS[new_status] || 'open'}`);

  return updateOpportunityStage(opp.id, {
    pipelineId,
    name:            opp.name,
    pipelineStageId,
    status:          STATUS_TO_OPP_STATUS[new_status] || 'open',
  });
};

// ─── GHL API: Find contacts by membership_number custom field ─────────────────
const findContactsByMember = async (membership_number) => {
  const data = await ghlApiGet('/contacts/search', {
    locationId: ghlConfig.api.locationId,
    query:      membership_number,
  });

  const contacts = data.contacts || [];
  return contacts.filter(
    (c) => c.customFields?.find(
      (f) => f.fieldKey === 'contact.membership_number' && f.value === String(membership_number)
    )
  );
};

// ─── GHL API: Get a single contact by ID ─────────────────────────────────────
const getContactById = async (contactId) => {
  const data = await ghlApiGet(`/contacts/${contactId}`);
  return data.contact || null;
};

// ─── GHL API: Get all appointments for a contact ──────────────────────────────
const getContactAppointments = async (contactId) => {
  const data = await ghlApiGet(`/contacts/${contactId}/appointments`);
  return data.events || [];
};

// ─── GHL API: Update a contact's custom fields ───────────────────────────────
const updateContactCustomFields = async (contactId, customFields) => {
  return ghlApiPut(`/contacts/${contactId}`, { customFields });
};

// ─── GHL API: Add a note to a contact ────────────────────────────────────────
const addContactNote = async (contactId, body) => {
  return ghlApiPost(`/contacts/${contactId}/notes`, { body });
};

// ─── GHL API: Add/remove tags on a contact ───────────────────────────────────
const addContactTags = async (contactId, tags) => {
  return ghlApiPost(`/contacts/${contactId}/tags`, { tags });
};

module.exports = {
  sendBooking,
  sendCancellation,
  sendGuestRegistration,
  sendWalkin,
  sendCheckin,
  findContactByReference,
  findContactByEmail,
  createAppointment,
  getPipelines,
  getOpportunities,
  createOpportunity,
  updateOpportunityStage,
  findOpportunityByReference,
  moveOpportunityToStatus,
  findContactsByMember,
  getContactById,
  getContactAppointments,
  getCalendarFreeSlots,
  updateContactCustomFields,
  addContactNote,
  addContactTags,
  ghlApiPost,
  ghlApiGet,
  ghlApiPut,
  ghlApiDelete,
};
