# Bot-Khserver

## Slash Commands

- `/pay` - Restarts the payment flow in a ticket channel.
- `/grant user:<user>` - Grants KaHack Pro claim access (grant-manager role or configured manager user ID).
- `/removegrant user:<user>` - Removes KaHack Pro claim access (grant-manager role or configured manager user ID).
- `/claim` - Returns the KaHack Pro shortcut link for users with granted access.

## Environment Variables

- `TOKEN`
- `ADMIN_CHANNEL_ID`
- `GRANT_MANAGER_ROLE_ID` (optional if `GRANT_MANAGER_USER_IDS` is used)
- `GRANT_MANAGER_USER_IDS` (comma-separated Discord user IDs allowed to use `/grant` and `/removegrant`; if unset, it defaults to `1020796397764747287`)
- `PRO_ROLE_ID` (optional, role auto-added/removed when granting)
- `CLAIM_SHORTCUT_LINK` (optional, default is `https://www.icloud.com/shortcuts/324c1e4c47824fbbbc36c48b0f7143f0`)

## Grant Storage

- Granted user IDs are saved to `granted-users.json` in the project root.
- `/claim` allows access if the user is in `granted-users.json` **or** currently has `PRO_ROLE_ID`.
- Keep a backup of `granted-users.json` if you rely on saved grants between restarts.
