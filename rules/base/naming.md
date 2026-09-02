# Naming

- **No `Interface` suffix** on any interface/type name (`CreateUserRequest`, not `CreateUserRequestInterface`).
- **No filler words** (`Data`, `Info`, etc.) when the rest of the name already conveys the meaning (`IncidentHistoryEntry`, not `IncidentHistoryEntryData`). `Request`/`Response` are not filler — they designate direction (what's sent vs. what comes back) and stay meaningful; the entity name itself shouldn't be replaced by them.
- **Field ordering:** required fields first, optional (`field?: T`) last, in interfaces, types, and DTO/class field declarations. No exceptions.
- **Non-null assertion (`!`) is forbidden** everywhere except the one narrow, documented exception for framework-validated DTO fields (see `rules/nestjs/dto.md`) — use explicit guards or narrowed types instead.
- **A pass-through payload parameter is named `payload`, not `request`.** When a method accepts a single already-assembled object and simply forwards it (an outbound HTTP call, an event publish), `payload` reads as "the thing I'm sending," while `request` collides with the inbound-request meaning used elsewhere in the same codebase.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `CreateUserRequestInterface`, `UserData` | Drop the `Interface` suffix and the filler word: `CreateUserRequest`, `User` |
| Optional fields mixed in before required ones | Required first, optional last — reorder |
