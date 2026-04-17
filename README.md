# Bot-Khserver

## Slash Commands

- `/pay` - Restarts the payment flow in a ticket channel.
- `/grant user:<user>` - Grants KaHack Pro claim access (manager-role only).
- `/removegrant user:<user>` - Removes KaHack Pro claim access (manager-role only).
- `/claim` - Returns the KaHack Pro shortcut link for users with granted access.

## Environment Variables

- `TOKEN`
- `ADMIN_CHANNEL_ID`
- `GRANT_MANAGER_ROLE_ID` (required for `/grant` and `/removegrant`)
- `PRO_ROLE_ID` (optional, role auto-added/removed when granting)
- `CLAIM_SHORTCUT_LINK` (optional, default is `Available soon`)
