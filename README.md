# Bot-Khserver

## Slash Commands

- `/pay` - Restarts the payment flow in a ticket channel.
- `/grant user:<user>` - Grants admin permissions to a user (adds them to the in-memory `authorizedAdmins` set). Only existing admins can use this.
- `/removegrant user:<user>` - Removes KaHack Pro claim access (grant-manager role or configured manager user ID).
- `/claim` - Returns the KaHack Pro shortcut link for users with granted access.
- `/lockchat reason:<reason>` - Locks the current ticket channel (admin only).
- `/unlock` - Unlocks the current ticket channel (admin only).

## Environment Variables

- `TOKEN`
- `OWNER_ID` (your Discord user ID; seeds the `authorizedAdmins` set — required to use `/grant`, `/lockchat`, `/unlock`)
- `ADMIN_CHANNEL_ID`
- `GRANT_MANAGER_ROLE_ID` (optional role whose members can use `/removegrant`)
- `GRANT_MANAGER_USER_IDS` (optional comma-separated Discord user IDs that can also use `/removegrant`; if unset, it defaults to `1020796397764747287`; for production, explicitly set this value)
- `PRO_ROLE_ID` (optional, role auto-added/removed when granting)
- `CLAIM_SHORTCUT_LINK` (optional, default is `https://www.icloud.com/shortcuts/324c1e4c47824fbbbc36c48b0f7143f0`)

### XPay order-confirmation integration

- `XPAY_SHARED_SECRET` — **Required.** A long random string shared between this bot and the XPay web app. Requests without a matching secret are rejected with `401 Unauthorized`.
- `XPAY_CHANNEL_ID` — **Required.** The ID of the Discord channel where order confirmation embeds will be posted.
- `XPAY_GUILD_ID` — *Optional.* Your Discord server (guild) ID. Not consumed by the bot directly, but useful for scoping API calls or permissions.

## Admin System

`/grant`, `/lockchat`, and `/unlock` are restricted to users in the in-memory `authorizedAdmins` set.  
The set is seeded on startup with `OWNER_ID` from `.env`. Use `/grant` to add more admins at runtime.  
**Note:** `authorizedAdmins` resets on bot restart — only `OWNER_ID` persists between restarts.

## Grant Storage

- Granted user IDs are saved to `granted-users.json` in the project root.
- `/claim` allows access if the user is in `granted-users.json` **or** currently has `PRO_ROLE_ID`.
- Keep a backup of `granted-users.json` if you rely on saved grants between restarts.

## XPay Order Endpoint

The bot exposes a small HTTP endpoint so the XPay web app (or any trusted system) can push order events and have them appear as Discord embeds.

### `POST /xpay/order`

**Headers** — one of:
```
x-xpay-signature: <XPAY_SHARED_SECRET>
Authorization: Bearer <XPAY_SHARED_SECRET>
```

**JSON body:**
```json
{
  "orderId":       "ORD-001",
  "country":       "DE",
  "currency":      "EUR",
  "items": [
    { "id": "pro", "name": "KaHack Pro", "qty": 1, "unitPrice": 4.00, "lineTotal": 4.00 }
  ],
  "subtotal":      4.00,
  "fee":           0.30,
  "total":         4.30,
  "paymentMethod": "paypal",
  "status":        "confirmed",
  "timestamp":     "2024-01-15T12:00:00Z",
  "customerNote":  "Optional note"
}
```

`status` is one of `pending | confirmed | failed`.  
`paymentMethod` is one of `paypal | amazon_giftcard`.

**curl example (local dev):**
```bash
curl -X POST http://localhost:3000/xpay/order \
  -H "Content-Type: application/json" \
  -H "x-xpay-signature: change_me_to_a_long_random_secret" \
  -d '{
    "orderId": "ORD-001",
    "country": "DE",
    "currency": "EUR",
    "items": [{"id":"pro","name":"KaHack Pro","qty":1,"unitPrice":4.00,"lineTotal":4.00}],
    "subtotal": 4.00,
    "fee": 0.30,
    "total": 4.30,
    "paymentMethod": "paypal",
    "status": "confirmed",
    "timestamp": "2024-01-15T12:00:00Z"
  }'
```

On success the endpoint returns `{ "ok": true, "orderId": "ORD-001" }` and the bot posts a colour-coded embed into `XPAY_CHANNEL_ID`.  
Requests with a missing or incorrect secret receive `401 Unauthorized`.
