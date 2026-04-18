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

## Admin System

`/grant`, `/lockchat`, and `/unlock` are restricted to users in the in-memory `authorizedAdmins` set.  
The set is seeded on startup with `OWNER_ID` from `.env`. Use `/grant` to add more admins at runtime.  
**Note:** `authorizedAdmins` resets on bot restart — only `OWNER_ID` persists between restarts.

## Grant Storage

- Granted user IDs are saved to `granted-users.json` in the project root.
- `/claim` allows access if the user is in `granted-users.json` **or** currently has `PRO_ROLE_ID`.
- Keep a backup of `granted-users.json` if you rely on saved grants between restarts.
