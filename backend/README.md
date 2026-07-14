# Verve Platform Backend

Node.js + Express backend for Verve — GHL Integration.

---

## Project Structure (MVC)

```
verve-backend/
├── server.js                   # Entry point
├── .env.example                # Environment variable template
├── config/
│   └── ghl.js                  # GHL webhook URLs + API config
├── middleware/
│   ├── auth.js                 # JWT authentication
│   └── errorHandler.js         # Global error handler
├── models/
│   ├── ghlService.js           # GHL webhook + API calls
│   └── referenceGenerator.js  # Booking reference + timestamp generator
├── controllers/
│   ├── authController.js       # JWT login
│   ├── bookingController.js    # New booking (Webhook #1)
│   ├── cancellationController.js # Cancellation (Webhook #2)
│   ├── guestController.js      # Guest registration (Webhook #3)
│   ├── walkinController.js     # Walk-in log (Webhook #4)
│   ├── checkinController.js    # Check-in validation + (Webhook #5)
│   └── chatbotController.js    # GHL Live Chat proxy
└── routes/
    ├── auth.js
    ├── booking.js
    ├── cancellation.js
    ├── guest.js
    ├── walkin.js
    ├── checkin.js
    └── chatbot.js
```

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Fill in your `.env`:
- `JWT_SECRET` — any long random string
- `GHL_WEBHOOK_*` — copy each webhook URL from GHL workflow triggers
- `GHL_API_KEY` — from GHL Settings → API Keys
- `GHL_LOCATION_ID` — from GHL Settings
- `ALLOWED_ORIGIN` — your frontend domain

### 3. Run
```bash
# Development
npm run dev

# Production
npm start
```

---

## API Endpoints

All endpoints except `/health` and `/api/auth/login` require:
```
Authorization: Bearer <JWT_TOKEN>
```

| Method | Endpoint | Description | GHL Workflow |
|--------|----------|-------------|--------------|
| GET | `/health` | Health check | — |
| POST | `/api/auth/login` | Get JWT token | — |
| POST | `/api/booking` | New portal booking | FORM-01 |
| POST | `/api/cancellation` | Cancel booking | FORM-02 |
| POST | `/api/guest-registration` | Register guest | FORM-03 |
| POST | `/api/walkin` | Log walk-in | STAFF-01 |
| POST | `/api/checkin` | Validate + check in | SHARED-07 |
| GET | `/api/chatbot/session` | Get chat widget config | CHAT-01 |
| POST | `/api/chatbot/message` | Send chat message | CHAT-01 |
| GET | `/api/chatbot/messages/:id` | Get conversation messages | — |

---

## Example Requests

### Login
```json
POST /api/auth/login
{
  "membership_number": "MEM001",
  "password": "your_password"
}
```

### New Booking
```json
POST /api/booking
Authorization: Bearer <token>
{
  "email": "member@email.com",
  "phone": "+6591234567",
  "name": "John Doe",
  "membership_number": "MEM001",
  "facility_or_venue": "tennis",
  "slot_date": "2026-04-05",
  "slot_start_time": "10:00",
  "slot_end_time": "11:00",
  "outlet_pax": "2",
  "booking_type": "advance"
}
```

### Cancellation
```json
POST /api/cancellation
Authorization: Bearer <token>
{
  "email": "member@email.com",
  "booking_reference": "BK-20260405-001"
}
```

### Guest Registration
```json
POST /api/guest-registration
Authorization: Bearer <token>
{
  "email": "member@email.com",
  "guest_name": "Jane Doe",
  "guest_email": "guest@email.com",
  "guest_phone": "+6591234568",
  "inviting_member_id": "MEM001",
  "slot_date": "2026-04-05",
  "facility_or_venue": "tennis"
}
```

### Walk-In
```json
POST /api/walkin
Authorization: Bearer <token>
{
  "name": "John Doe",
  "phone": "+6591234567",
  "facility": "tennis",
  "pax": "2",
  "staff_id": "STAFF01"
}
```

### Check-In
```json
POST /api/checkin
Authorization: Bearer <token>
{
  "booking_reference": "BK-20260405-001",
  "checked_in_by": "STAFF01"
}
```

---

## Check-In Response

### Valid ✅
```json
{
  "success": true,
  "valid": true,
  "message": "Check-in confirmed.",
  "contact": {
    "name": "John Doe",
    "email": "member@email.com",
    "booking_reference": "BK-20260405-001",
    "facility_or_venue": "tennis",
    "slot_date": "2026-04-05"
  }
}
```

### Invalid ❌
```json
{
  "success": false,
  "valid": false,
  "reason": "ALREADY_CHECKED_IN",
  "message": "Member has already checked in."
}
```

Possible `reason` values:
- `INVALID_REFERENCE` — reference not found
- `ALREADY_CHECKED_IN` — already checked in
- `INVALID_STATUS` — cancelled or no-show
- `WRONG_DATE` — booking is not for today

---

## Frontend Integration (GHL Live Chat Widget)

Add this to your HTML to embed the GHL Live Chat widget:
```html
<!-- GHL Live Chat Widget -->
<script>
  window.GHL_CHAT_CONFIG = {
    locationId: 'YOUR_LOCATION_ID'
  };
</script>
<script src="https://widgets.leadconnectorhq.com/loader.js"
        data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js">
</script>
```

Replace `YOUR_LOCATION_ID` with the value from `/api/chatbot/session`.
